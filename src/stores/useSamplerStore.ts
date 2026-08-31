import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useAuthStore } from './useAuthStore'
import { userKey } from '@/lib/userKey'
import type { FxChain, ModMatrixSlot } from '@/core/audio/types'
import type { FilterType } from '@/core/audio/filterMath'

// ── Constants ──────────────────────────────────────────────────────────────

export const BANKS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const
export type BankId = typeof BANKS[number]

export const PAD_COUNT = 8
export const STEP_COUNT = 64

// ── Types ──────────────────────────────────────────────────────────────────

export interface SamplerPad {
  id: string
  label: string
  url: string
  author: string
  duration: number
  bpm: number | null
  volume: number
  pan: number
  pitch: number
  startPoint: number
  endPoint: number
  loopMode: boolean
  filterFreq: number
  reverbSend: number
  delaySend: number
  sampleRate: number
  rootKey: number
  minKey: number
  maxKey: number
  midiInput: string
  attack: number
  decay: number
  sustain: number
  release: number
  chromatic: boolean
  polyMode: boolean
  armed: boolean
  // Granular (pads 7 & 8 — indices 6 & 7)
  granular?: boolean
  grainSize?: number
  grainOverlap?: number
  grainPosition?: number
  grainPitch?: number
  grainSpray?: number
  grainDirection?: number  // 0=forward, 1=backward, 2=alternating, 3=random
  grainStereo?: number
  grainCount?: number
  // Filter type/resonance (Phase 3 of
  // docs/plans/Sycore-DSP-Integration-Feasibility.md) -- absent = 'lowpass'
  // / 0 (resonance byte, same MIDI-byte convention as velocity/rootKey/etc),
  // matches today's hardcoded lowpass-only behavior exactly when unset.
  filterType?: FilterType
  filterResonance?: number
  // Optional per-pad effects chain (Phase 2 of
  // docs/plans/Sycore-DSP-Integration-Feasibility.md) -- absent = no FX
  // node instantiated, same lazy-seed pattern as everything else here.
  fx?: FxChain
  // Modulation Matrix cables (Phase 5 of
  // docs/plans/Sycore-DSP-Integration-Feasibility.md) -- absent = no live
  // cables built, same lazy-seed pattern as everything else here.
  modMatrix?: ModMatrixSlot[]
  // Internal, set only by SamplerPanel.vue's MIDI/app-note trigger path
  // alongside `_midiNote` -- raw 0-127 velocity for the Modulation Matrix's
  // one-time velocity source (core/audio/modMatrix.ts). Not persisted, not
  // user-editable.
  _midiVelocity?: number
}

export interface SamplerStep {
  active: boolean
  velocity: number
  accent: boolean
  probability: number
  microTiming: number
  pitchOffset: number
  automation: Record<string, number>
}

export interface SamplerBank {
  pads: SamplerPad[]
  steps: SamplerStep[][]
}

export interface SamplerPattern {
  id: string
  name: string
  bpm: number
  stepCount: number
  activeBank: string
  banks: Record<string, SamplerBank>
}

// ── Factory functions ──────────────────────────────────────────────────────

function defaultPad(bankId: string, padIdx: number): SamplerPad {
  const base: SamplerPad = {
    id: `sampler_${bankId}_${padIdx}`,
    label: '',
    url: '',
    author: '',
    duration: 0,
    bpm: null,
    volume: 0.85,
    pan: 0,
    pitch: 0,
    startPoint: 0,
    endPoint: 1,
    loopMode: false,
    filterFreq: 20000,
    filterType: 'lowpass',
    filterResonance: 0,
    reverbSend: 0,
    delaySend: 0,
    sampleRate: 44100,
    rootKey: 72,
    minKey: 0,
    maxKey: 127,
    midiInput: 'all',
    attack: 0.005,
    decay: 0,
    sustain: 1.0,
    release: 0.05,
    chromatic: true,
    polyMode: false,
    armed: false,
  }
  if (padIdx === 6 || padIdx === 7) {
    base.granular = true
    base.grainSize = 0.1
    base.grainOverlap = 0.5
    base.grainPosition = 0.5
    base.grainPitch = 0
    base.grainSpray = 0.3
    base.grainDirection = 0      // 0=forward, 1=backward, 2=alternating, 3=random
    base.grainStereo = 0
    base.grainCount = 4
  }
  return base
}

function defaultStep(): SamplerStep {
  return {
    active: false,
    velocity: 100,
    accent: false,
    probability: 1.0,
    microTiming: 0,
    pitchOffset: 0,
    automation: {},
  }
}

function defaultBank(bankId: string): SamplerBank {
  return {
    pads: Array.from({ length: PAD_COUNT }, (_, i) => defaultPad(bankId, i)),
    steps: Array.from({ length: PAD_COUNT }, () =>
      Array.from({ length: STEP_COUNT }, defaultStep)
    ),
  }
}

function defaultPattern(id = `pattern_${Date.now()}`): SamplerPattern {
  const banks: Record<string, SamplerBank> = {}
  BANKS.forEach(b => { banks[b] = defaultBank(b) })
  return { id, name: 'Pattern 1', bpm: 120, stepCount: 16, activeBank: 'A', banks }
}

// ── LocalStorage ───────────────────────────────────────────────────────────

const LS_KEY = 'SYCORE_SAMPLER_PATTERNS'
const LS_ACTIVE = 'SYCORE_SAMPLER_ACTIVE_PATTERN'

function _load(): SamplerPattern[] {
  try {
    const raw = localStorage.getItem(userKey(LS_KEY))
    const arr = raw ? JSON.parse(raw) : null
    if (Array.isArray(arr) && arr.length > 0) {
      _migratePatterns(arr)
      return arr
    }
  } catch {}
  return [defaultPattern()]
}

function _migratePatterns(patterns: SamplerPattern[]): void {
  for (const p of patterns) {
    for (const bankId of BANKS) {
      const bank = p.banks[bankId]
      if (!bank) continue
      // Pad pads array to PAD_COUNT
      while (bank.pads.length < PAD_COUNT) {
        bank.pads.push(defaultPad(bankId, bank.pads.length))
      }
      // Pad steps array to PAD_COUNT
      while (bank.steps.length < PAD_COUNT) {
        bank.steps.push(Array.from({ length: STEP_COUNT }, defaultStep))
      }
    }
  }
}

function _loadActiveId(): string | null {
  return localStorage.getItem(userKey(LS_ACTIVE)) || null
}

// ── Store ──────────────────────────────────────────────────────────────────

export const useSamplerStore = defineStore('sampler', () => {
  const authStore = useAuthStore()
  const uid = computed(() => authStore.user?.uid)

  const patterns = ref<SamplerPattern[]>(_load())
  const activePatternId = ref<string>(_loadActiveId() || patterns.value[0]?.id)

  const activePattern = computed<SamplerPattern | undefined>(() =>
    patterns.value.find(p => p.id === activePatternId.value) ?? patterns.value[0]
  )

  const activeBank = computed({
    get: () => activePattern.value?.activeBank ?? 'A',
    set: (b: string) => { if (activePattern.value) activePattern.value.activeBank = b },
  })

  const activeBankData = computed<SamplerBank | undefined>(() =>
    activePattern.value?.banks[activeBank.value]
  )

  function setPad(bankId: string, padIdx: number, data: Partial<SamplerPad>) {
    const bank = activePattern.value?.banks[bankId]
    if (!bank) return
    bank.pads[padIdx] = { ...bank.pads[padIdx], ...data }
  }

  function clearPad(bankId: string, padIdx: number) {
    const bank = activePattern.value?.banks[bankId]
    if (!bank) return
    bank.pads[padIdx] = defaultPad(bankId, padIdx)
  }

  function toggleStep(bankId: string, padIdx: number, stepIdx: number) {
    const bank = activePattern.value?.banks[bankId]
    if (!bank) return
    const s = bank.steps[padIdx][stepIdx]
    s.active = !s.active
  }

  function setStep(bankId: string, padIdx: number, stepIdx: number, data: Partial<SamplerStep>) {
    const bank = activePattern.value?.banks[bankId]
    if (!bank) return
    Object.assign(bank.steps[padIdx][stepIdx], data)
  }

  function addPattern(): SamplerPattern {
    const p = defaultPattern()
    patterns.value.push(p)
    activePatternId.value = p.id
    return p
  }

  function removePattern(id: string) {
    if (patterns.value.length <= 1) return
    patterns.value = patterns.value.filter(p => p.id !== id)
    if (activePatternId.value === id) activePatternId.value = patterns.value[0].id
  }

  function _save() {
    try {
      localStorage.setItem(userKey(LS_KEY), JSON.stringify(patterns.value))
      localStorage.setItem(userKey(LS_ACTIVE), activePatternId.value)
    } catch {}
  }

  watch(patterns, _save, { deep: true })
  watch(activePatternId, () => {
    try { localStorage.setItem(userKey(LS_ACTIVE), activePatternId.value) } catch {}
  })

  watch(uid, (newUid) => {
    if (!newUid) {
      patterns.value = [defaultPattern()]
      activePatternId.value = patterns.value[0].id
    } else {
      patterns.value = _load()
      activePatternId.value = _loadActiveId() || patterns.value[0]?.id
    }
  })

  return {
    BANKS,
    PAD_COUNT,
    STEP_COUNT,
    patterns,
    activePatternId,
    activePattern,
    activeBank,
    activeBankData,
    setPad,
    clearPad,
    toggleStep,
    setStep,
    addPattern,
    removePattern,
  }
})