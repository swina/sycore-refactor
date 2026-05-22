import { defineStore } from 'pinia'
import { ref, reactive, watch, onUnmounted } from 'vue'
import { useMidiStore } from './useMidiStore'
import { usePresetStore } from './usePresetStore'
import { useUiStore } from './useUiStore'
import { FIELD_TO_CC } from '@/constants/s1-config'

// Use the natively exported mapping
const PARAM_TO_CC = FIELD_TO_CC

const WAVEFORMS = ['sine', 'triangle', 'square', 'saw', 'sh']
const SYNC_DIVISIONS = [
  '8/1', '4/1', '2/1',
  '1/1d', '1/1', '1/1t',
  '1/2d', '1/2', '1/2t',
  '1/4d', '1/4', '1/4t',
  '1/8d', '1/8', '1/8t',
  '1/16d', '1/16', '1/16t',
  '1/32d', '1/32', '1/32t',
  '1/64'
]

const SYNC_MULTIPLIERS = {
  '8/1': 32, '4/1': 16, '2/1': 8,
  '1/1d': 4 * 1.5, '1/1': 4, '1/1t': 4 * (2 / 3),
  '1/2d': 2 * 1.5, '1/2': 2, '1/2t': 2 * (2 / 3),
  '1/4d': 1 * 1.5, '1/4': 1, '1/4t': 1 * (2 / 3),
  '1/8d': 0.5 * 1.5, '1/8': 0.5, '1/8t': 0.5 * (2 / 3),
  '1/16d': 0.25 * 1.5, '1/16': 0.25, '1/16t': 0.25 * (2 / 3),
  '1/32d': 0.125 * 1.5, '1/32': 0.125, '1/32t': 0.125 * (2 / 3),
  '1/64': 0.0625
}

const createDefaultLfo = () => ({
  active: false,
  targetParameter: 'cutoff',
  waveform: 'sine',
  mode: 'sync',
  rate: 0.5, // Hz
  syncDivision: '1/4',
  depth: 30,
  offset: 64,
  lastSentValue: null
})

export const useLfoStore = defineStore('lfo', () => {
  const midiStore = useMidiStore()
  const presetStore = usePresetStore()
  const uiStore = useUiStore()

  const lfo1 = reactive(createDefaultLfo())
  const lfo2 = reactive(createDefaultLfo())

  let animationFrame = null
  let lastTime = performance.now()
  const phases = { lfo1: 0, lfo2: 0 }

  // Modulation loop
  function startEngine() {
    if (animationFrame) return
    lastTime = performance.now()

    const loop = (currentTime) => {
      const deltaTime = (currentTime - lastTime) / 1000 // in seconds
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

  function processLfo(id, lfo, dt) {
    if (!lfo.active || !lfo.targetParameter) return

    const cc = PARAM_TO_CC[lfo.targetParameter]
    if (cc === undefined) return

    // Calculate Rate in Hz
    let rateHz = lfo.rate
    if (lfo.mode === 'sync') {
      const bpm = midiStore.currentBpm || 120
      const bps = bpm / 60
      const multiplier = SYNC_MULTIPLIERS[lfo.syncDivision] || 1
      rateHz = bps / multiplier
    }

    // Update Phase
    phases[id] = (phases[id] + rateHz * dt) % 1

    // Calculate Value (-1 to 1)
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
        // For S&H, we only change value when phase wraps
        if (lfo._lastP > p || lfo._shValue === undefined) {
          lfo._shValue = Math.random() * 2 - 1
        }
        val = lfo._shValue
        break
    }
    lfo._lastP = p

    // Apply Depth and Offset
    const activeVariant = presetStore.useAlternativeEngine ? presetStore.lastPreset?.bVariant : presetStore.lastPreset?.aVariant
    const baseValue = activeVariant?.data?.[lfo.targetParameter] ?? lfo.offset ?? 64
    const scaledVal = val * (lfo.depth / 100) * 63.5
    let finalVal = Math.round(baseValue + scaledVal)

    // Clamp
    finalVal = Math.max(0, Math.min(127, finalVal))

    // Throttling: Only send if changed
    if (finalVal !== lfo.lastSentValue) {
      midiStore.sendCC(cc, finalVal)
      lfo.lastSentValue = finalVal
    }
  }

  // Helper to restore parameter to its original preset value with staggering
  async function restoreParameterValue(param, offsetFallback = 64) {
    const cc = PARAM_TO_CC[param]
    if (cc === undefined) return

    const activeVariant = presetStore.useAlternativeEngine ? presetStore.lastPreset?.bVariant : presetStore.lastPreset?.aVariant
    const originalValue = activeVariant?.data?.[param] ?? offsetFallback

    // Staggered recovery: 3 messages over 150ms
    for (let i = 0; i < 3; i++) {
      midiStore.sendCC(cc, originalValue)
      await new Promise(r => setTimeout(r, 50))
    }
  }

  // Restore parameter when LFO stops
  function restoreParameter(lfo) {
    if (lfo.targetParameter) {
      restoreParameterValue(lfo.targetParameter, lfo.offset)
    }
    lfo.lastSentValue = null
  }

  // Auto-center when enabled or restore when stopped
  watch(() => lfo1.active, (active) => {
    if (active) {
      const activeVariant = presetStore.useAlternativeEngine ? presetStore.lastPreset?.bVariant : presetStore.lastPreset?.aVariant
      const val = activeVariant?.data?.[lfo1.targetParameter]
      if (val !== undefined) lfo1.offset = val
    } else {
      restoreParameter(lfo1)
    }
  })

  watch(() => lfo2.active, (active) => {
    if (active) {
      const activeVariant = presetStore.useAlternativeEngine ? presetStore.lastPreset?.bVariant : presetStore.lastPreset?.aVariant
      const val = activeVariant?.data?.[lfo2.targetParameter]
      if (val !== undefined) lfo2.offset = val
    } else {
      restoreParameter(lfo2)
    }
  })

  // Watch target parameter changes while active to restore old and init new
  watch(() => lfo1.targetParameter, (newParam, oldParam) => {
    if (lfo1.active) {
      if (oldParam) {
        restoreParameterValue(oldParam, lfo1.offset)
      }
      const activeVariant = presetStore.useAlternativeEngine ? presetStore.lastPreset?.bVariant : presetStore.lastPreset?.aVariant
      const val = activeVariant?.data?.[newParam]
      if (val !== undefined) lfo1.offset = val
    }
  })

  watch(() => lfo2.targetParameter, (newParam, oldParam) => {
    if (lfo2.active) {
      if (oldParam) {
        restoreParameterValue(oldParam, lfo2.offset)
      }
      const activeVariant = presetStore.useAlternativeEngine ? presetStore.lastPreset?.bVariant : presetStore.lastPreset?.aVariant
      const val = activeVariant?.data?.[newParam]
      if (val !== undefined) lfo2.offset = val
    }
  })

  // Start engine on mount
  startEngine()

  onUnmounted(() => {
    stopEngine()
  })

  return {
    lfo1,
    lfo2,
    WAVEFORMS,
    SYNC_DIVISIONS,
    startEngine,
    stopEngine,
    init: () => {
      startEngine()
    },
    toggleLfo: (id) => {
      const lfo = id === 1 ? lfo1 : lfo2
      lfo.active = !lfo.active
    }
  }
})
