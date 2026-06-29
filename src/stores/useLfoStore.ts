import { defineStore } from 'pinia'
import { ref, reactive, watch, onUnmounted } from 'vue'
import { useMidiStore } from './useMidiStore'
import { usePresetStore } from './usePresetStore'
import { useUiStore } from './useUiStore'
import { FIELD_TO_CC } from '@/constants/s1-config'

const PARAM_TO_CC = FIELD_TO_CC

export type LfoWaveform = 'sine' | 'triangle' | 'square' | 'saw' | 'sh'
export type LfoMode = 'sync' | 'free'

export const WAVEFORMS: LfoWaveform[] = ['sine', 'triangle', 'square', 'saw', 'sh']

export const SYNC_DIVISIONS = [
  '8/1', '4/1', '2/1',
  '1/1d', '1/1', '1/1t',
  '1/2d', '1/2', '1/2t',
  '1/4d', '1/4', '1/4t',
  '1/8d', '1/8', '1/8t',
  '1/16d', '1/16', '1/16t',
  '1/32d', '1/32', '1/32t',
  '1/64',
] as const

export type SyncDivision = typeof SYNC_DIVISIONS[number]

const SYNC_MULTIPLIERS: Record<string, number> = {
  '8/1': 32, '4/1': 16, '2/1': 8,
  '1/1d': 4 * 1.5, '1/1': 4, '1/1t': 4 * (2 / 3),
  '1/2d': 2 * 1.5, '1/2': 2, '1/2t': 2 * (2 / 3),
  '1/4d': 1 * 1.5, '1/4': 1, '1/4t': 1 * (2 / 3),
  '1/8d': 0.5 * 1.5, '1/8': 0.5, '1/8t': 0.5 * (2 / 3),
  '1/16d': 0.25 * 1.5, '1/16': 0.25, '1/16t': 0.25 * (2 / 3),
  '1/32d': 0.125 * 1.5, '1/32': 0.125, '1/32t': 0.125 * (2 / 3),
  '1/64': 0.0625,
}

export interface LfoState {
  active: boolean
  targetParameter: string
  waveform: LfoWaveform
  mode: LfoMode
  rate: number
  syncDivision: SyncDivision
  depth: number
  offset: number
  lastSentValue: number | null
  /** Runtime-only: stores last S&H value and phase tracking */
  _lastP?: number
  _shValue?: number
}

function createDefaultLfo(): LfoState {
  return {
    active: false,
    targetParameter: 'cutoff',
    waveform: 'sine',
    mode: 'sync',
    rate: 0.5,
    syncDivision: '1/4',
    depth: 30,
    offset: 64,
    lastSentValue: null,
  }
}

export const useLfoStore = defineStore('lfo', () => {
  const midiStore = useMidiStore()
  const presetStore = usePresetStore()
  const uiStore = useUiStore()

  const lfo1 = reactive<LfoState>(createDefaultLfo())
  const lfo2 = reactive<LfoState>(createDefaultLfo())

  let animationFrame: number | null = null
  let lastTime = performance.now()
  const phases: Record<string, number> = { lfo1: 0, lfo2: 0 }

  function startEngine() {
    if (animationFrame) return
    lastTime = performance.now()

    const loop = (currentTime: number) => {
      const deltaTime = (currentTime - lastTime) / 1000
      lastTime = currentTime
      processLfo('lfo1', lfo1, deltaTime)
      processLfo('lfo2', lfo2, deltaTime)
      animationFrame = requestAnimationFrame(loop)
    }
    animationFrame = requestAnimationFrame(loop)
  }

  function stopEngine() {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame)
      animationFrame = null
    }
  }

  function processLfo(id: string, lfo: LfoState, dt: number) {
    if (!lfo.active || !lfo.targetParameter) return

    const cc = (PARAM_TO_CC as Record<string, number>)[lfo.targetParameter]
    if (cc === undefined) return

    let rateHz = lfo.rate
    if (lfo.mode === 'sync') {
      const bpm = midiStore.currentBpm || 120
      const bps = bpm / 60
      const multiplier = SYNC_MULTIPLIERS[lfo.syncDivision] || 1
      rateHz = bps / multiplier
    }

    phases[id] = (phases[id] + rateHz * dt) % 1

    let val = 0
    const p = phases[id]

    switch (lfo.waveform) {
      case 'sine':
        val = Math.sin(p * Math.PI * 2)
        break
      case 'triangle':
        val = p < 0.5 ? (p * 4 - 1) : (3 - p * 4)
        break
      case 'square':
        val = p < 0.5 ? 1 : -1
        break
      case 'saw':
        val = p * 2 - 1
        break
      case 'sh':
        if (lfo._lastP && lfo._lastP > p || lfo._shValue === undefined) {
          lfo._shValue = Math.random() * 2 - 1
        }
        val = lfo._shValue!
        break
    }
    lfo._lastP = p

    const activeVariant = presetStore.useAlternativeEngine
      ? presetStore.lastPreset?.bVariant
      : presetStore.lastPreset?.aVariant
    const baseValue = (activeVariant as any)?.data?.[lfo.targetParameter] ?? lfo.offset ?? 64
    const scaledVal = val * (lfo.depth / 100) * 63.5
    let finalVal = Math.round(baseValue + scaledVal)
    finalVal = Math.max(0, Math.min(127, finalVal))

    if (finalVal !== lfo.lastSentValue) {
      midiStore.sendCC(cc, finalVal)
      lfo.lastSentValue = finalVal
    }
  }

  async function restoreParameterValue(param: string, offsetFallback = 64) {
    const cc = (PARAM_TO_CC as Record<string, number>)[param]
    if (cc === undefined) return

    const activeVariant = presetStore.useAlternativeEngine
      ? presetStore.lastPreset?.bVariant
      : presetStore.lastPreset?.aVariant
    const originalValue = (activeVariant as any)?.data?.[param] ?? offsetFallback

    for (let i = 0; i < 3; i++) {
      midiStore.sendCC(cc, originalValue)
      await new Promise(r => setTimeout(r, 50))
    }
  }

  function restoreParameter(lfo: LfoState) {
    if (lfo.targetParameter) {
      restoreParameterValue(lfo.targetParameter, lfo.offset)
    }
    lfo.lastSentValue = null
  }

  watch(() => lfo1.active, (active) => {
    if (active) {
      const activeVariant = presetStore.useAlternativeEngine
        ? presetStore.lastPreset?.bVariant
        : presetStore.lastPreset?.aVariant
      const val = (activeVariant as any)?.data?.[lfo1.targetParameter]
      if (val !== undefined) lfo1.offset = val
    } else {
      restoreParameter(lfo1)
    }
  })

  watch(() => lfo2.active, (active) => {
    if (active) {
      const activeVariant = presetStore.useAlternativeEngine
        ? presetStore.lastPreset?.bVariant
        : presetStore.lastPreset?.aVariant
      const val = (activeVariant as any)?.data?.[lfo2.targetParameter]
      if (val !== undefined) lfo2.offset = val
    } else {
      restoreParameter(lfo2)
    }
  })

  watch(() => lfo1.targetParameter, (newParam, oldParam) => {
    if (lfo1.active) {
      if (oldParam) restoreParameterValue(oldParam, lfo1.offset)
      const activeVariant = presetStore.useAlternativeEngine
        ? presetStore.lastPreset?.bVariant
        : presetStore.lastPreset?.aVariant
      const val = (activeVariant as any)?.data?.[newParam]
      if (val !== undefined) lfo1.offset = val
    }
  })

  watch(() => lfo2.targetParameter, (newParam, oldParam) => {
    if (lfo2.active) {
      if (oldParam) restoreParameterValue(oldParam, lfo2.offset)
      const activeVariant = presetStore.useAlternativeEngine
        ? presetStore.lastPreset?.bVariant
        : presetStore.lastPreset?.aVariant
      const val = (activeVariant as any)?.data?.[newParam]
      if (val !== undefined) lfo2.offset = val
    }
  })

  startEngine()

  onUnmounted(() => { stopEngine() })

  function toggleLfo(id: 1 | 2) {
    const lfo = id === 1 ? lfo1 : lfo2
    lfo.active = !lfo.active
  }

  return {
    lfo1, lfo2,
    WAVEFORMS,
    SYNC_DIVISIONS,
    startEngine,
    stopEngine,
    init: () => { startEngine() },
    toggleLfo,
  }
})