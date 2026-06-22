import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useAuthStore } from './useAuthStore'
import { userKey } from '@/lib/userKey'

const BANKS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const PAD_COUNT = 7    // 6 standard + 1 granular (index 6)
const STEP_COUNT = 64
const LS_KEY = 'SYCORE_SAMPLER_PATTERNS'
const LS_ACTIVE = 'SYCORE_SAMPLER_ACTIVE_PATTERN'

function defaultPad(bankId, padIdx) {
  const base = {
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
  }
  if (padIdx === 6) {
    // Granular pad extras
    base.granular = true
    base.grainSize = 0.1
    base.grainOverlap = 0.5
    base.grainPosition = 0.5
    base.grainPitch = 0
  }
  return base
}

function defaultStep() {
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

function defaultBank(bankId) {
  return {
    pads: Array.from({ length: PAD_COUNT }, (_, i) => defaultPad(bankId, i)),
    steps: Array.from({ length: PAD_COUNT }, () =>
      Array.from({ length: STEP_COUNT }, defaultStep)
    ),
  }
}

function defaultPattern(id = `pattern_${Date.now()}`) {
  const banks = {}
  BANKS.forEach(b => { banks[b] = defaultBank(b) })
  return { id, name: 'Pattern 1', bpm: 120, stepCount: 16, activeBank: 'A', banks }
}

function _load() {
  try {
    const raw = localStorage.getItem(userKey(LS_KEY))
    const arr = raw ? JSON.parse(raw) : null
    if (Array.isArray(arr) && arr.length > 0) return arr
  } catch {}
  return [defaultPattern()]
}

function _loadActiveId() {
  return localStorage.getItem(userKey(LS_ACTIVE)) || null
}

export const useSamplerStore = defineStore('sampler', () => {
  const authStore = useAuthStore()
  const uid = computed(() => authStore.user?.uid)

  const patterns = ref(_load())
  const activePatternId = ref(_loadActiveId() || patterns.value[0]?.id)

  const activePattern = computed(() =>
    patterns.value.find(p => p.id === activePatternId.value) ?? patterns.value[0]
  )

  const activeBank = computed({
    get: () => activePattern.value?.activeBank ?? 'A',
    set: (b) => { if (activePattern.value) activePattern.value.activeBank = b },
  })

  const activeBankData = computed(() => activePattern.value?.banks[activeBank.value])

  function setPad(bankId, padIdx, data) {
    const bank = activePattern.value?.banks[bankId]
    if (!bank) return
    bank.pads[padIdx] = { ...bank.pads[padIdx], ...data }
  }

  function clearPad(bankId, padIdx) {
    const bank = activePattern.value?.banks[bankId]
    if (!bank) return
    bank.pads[padIdx] = defaultPad(bankId, padIdx)
  }

  function toggleStep(bankId, padIdx, stepIdx) {
    const bank = activePattern.value?.banks[bankId]
    if (!bank) return
    const s = bank.steps[padIdx][stepIdx]
    s.active = !s.active
  }

  function setStep(bankId, padIdx, stepIdx, data) {
    const bank = activePattern.value?.banks[bankId]
    if (!bank) return
    Object.assign(bank.steps[padIdx][stepIdx], data)
  }

  function addPattern() {
    const p = defaultPattern()
    patterns.value.push(p)
    activePatternId.value = p.id
    return p
  }

  function removePattern(id) {
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
