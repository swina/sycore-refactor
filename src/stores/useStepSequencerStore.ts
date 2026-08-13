import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { userKey } from '@/lib/userKey'

export const BANK_NAMES = ['A', 'B', 'C', 'D', 'E', 'F']
export const BANK_COUNT = 6
export const CHAIN_COUNT = 8

export const DEFAULT_STEP = {
  active: false,
  notes: [60],
  velocity: 100,
  gate: 75,
  tieSteps: 0,
  param1Value: 64,
  param2Value: 64,
  edited: false,
}

export interface SeqBank {
  numSteps: number
  basePatternLength: number
  steps: typeof DEFAULT_STEP[]
  param1CC: number
  param2CC: number
  param1Variation: number
  param2Variation: number
  selectedOctave: number
  octaveRange: number
  selectedKey: string
  selectedScale: string
  selectedStyle: string
  genDensity: number
  chordsEnabled: boolean
  maxPolyphony: number
  chordDensity: number
}

function makeBank(): SeqBank {
  return {
    numSteps: 16,
    basePatternLength: 16,
    steps: Array(16).fill(null).map(() => ({ ...DEFAULT_STEP })),
    param1CC: 74,
    param2CC: 71,
    param1Variation: 25,
    param2Variation: 25,
    selectedOctave: 4,
    octaveRange: 0,
    selectedKey: 'C',
    selectedScale: 'Major',
    selectedStyle: 'House',
    genDensity: 75,
    chordsEnabled: false,
    maxPolyphony: 4,
    chordDensity: 4,
  }
}

const BANKS_KEY = 'SYCORE_STEP_SEQ_BANKS'
const CHAIN_KEY = 'SYCORE_STEP_SEQ_CHAIN'

function loadString(key: string): string | null {
  try {
    return localStorage.getItem(userKey(key))
  } catch { return null }
}

function saveString(key: string, val: any) {
  try {
    localStorage.setItem(userKey(key), JSON.stringify(val))
  } catch {}
}

function loadBanks(): SeqBank[] | null {
  const raw = loadString(BANKS_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length === BANK_COUNT) {
      return parsed.map((b: any) => ({
        ...makeBank(),
        ...b,
        steps: Array.isArray(b.steps) ? b.steps.map((s: any) => ({ ...DEFAULT_STEP, ...s })) : makeBank().steps,
      }))
    }
  } catch {}
  return null
}

function loadChain(): { chain: (number | null)[]; chainEnabled: boolean } | null {
  const raw = loadString(CHAIN_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch { return null }
}

function migrateFromOldState(): SeqBank[] | null {
  const keys = ['S1_SEQUENCER_BETA_STATE', 'S1_SEQUENCER2_STATE']
  for (const storageKey of keys) {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) continue
      const old = JSON.parse(raw)
      if (!old.steps || !Array.isArray(old.steps)) continue
      const banks = Array.from({ length: BANK_COUNT }, () => makeBank())
      banks[0] = {
        numSteps: old.numSteps ?? 16,
        basePatternLength: old.numSteps ?? 16,
        steps: old.steps.map((s: any) => {
          const step = { ...DEFAULT_STEP, ...s }
          step.edited = s.edited !== undefined ? s.edited : (s.active || (s.notes && s.notes.length > 0))
          return step
        }),
        param1CC: old.param1CC ?? 74,
        param2CC: old.param2CC ?? 71,
        param1Variation: old.param1Variation ?? 25,
        param2Variation: old.param2Variation ?? 25,
        selectedOctave: old.selectedOctave ?? 4,
        octaveRange: old.octaveRange ?? 0,
        selectedKey: old.selectedKey ?? 'C',
        selectedScale: old.selectedScale ?? 'Major',
        selectedStyle: old.selectedStyle ?? 'House',
        genDensity: old.genDensity ?? 75,
        chordsEnabled: old.chordsEnabled ?? false,
        maxPolyphony: old.maxPolyphony ?? 4,
        chordDensity: old.chordDensity ?? 4,
      }
      return banks
    } catch { continue }
  }
  return null
}

export const useStepSequencerStore = defineStore('stepSequencer', () => {
  const savedBanks = loadBanks() ?? migrateFromOldState() ?? null
  const savedChain = loadChain()

  const banks = ref<SeqBank[]>(
    savedBanks ?? Array.from({ length: BANK_COUNT }, () => makeBank())
  )
  const activeBankIndex = ref(0)

  const chain = ref<(number | null)[]>(
    savedChain?.chain ?? Array(CHAIN_COUNT).fill(null)
  )
  const chainEnabled = ref(savedChain?.chainEnabled ?? false)
  const playingChainIndex = ref<number | null>(null)
  const playingBankIndex = ref<number | null>(null)

  const activeBank = computed(() => banks.value[activeBankIndex.value])

  const playbackSteps = computed(() => {
    if (!chainEnabled.value) {
      const bank = activeBank.value
      const count = Math.min(bank.numSteps, bank.steps.length)
      return {
        steps: bank.steps.slice(0, count),
        numSteps: count,
        chainSlotIndices: Array(count).fill(null) as (number | null)[],
        bankIndices: Array(count).fill(activeBankIndex.value),
        localIndices: Array.from({ length: count }, (_, i) => i),
      }
    }
    const allSteps: any[] = []
    const chainSlotIndices: (number | null)[] = []
    const bankIndices: number[] = []
    const localIndices: number[] = []
    for (let slotIdx = 0; slotIdx < CHAIN_COUNT; slotIdx++) {
      const bankIdx = chain.value[slotIdx]
      if (bankIdx === null || bankIdx < 0 || bankIdx >= BANK_COUNT) continue
      const bank = banks.value[bankIdx]
      const count = Math.min(bank.numSteps, bank.steps.length)
      for (let i = 0; i < count; i++) {
        allSteps.push(bank.steps[i])
        chainSlotIndices.push(slotIdx)
        bankIndices.push(bankIdx)
        localIndices.push(i)
      }
    }
    return {
      steps: allSteps,
      numSteps: allSteps.length,
      chainSlotIndices,
      bankIndices,
      localIndices,
    }
  })

  function persistBanks() {
    saveString(BANKS_KEY, banks.value.map(b => ({
      ...b,
      steps: b.steps.map(s => ({ ...s })),
    })))
  }

  function persistChain() {
    saveString(CHAIN_KEY, { chain: chain.value, chainEnabled: chainEnabled.value })
  }

  watch(banks, persistBanks, { deep: true })
  watch([chain, chainEnabled], persistChain, { deep: true })

  function setActiveBank(index: number) {
    if (index >= 0 && index < BANK_COUNT) {
      activeBankIndex.value = index
    }
  }

  function cycleChainSlot(pos: number) {
    if (pos < 0 || pos >= CHAIN_COUNT) return
    const current = chain.value[pos]
    if (current === null) {
      chain.value[pos] = 0
    } else if (current >= BANK_COUNT - 1) {
      chain.value[pos] = null
    } else {
      chain.value[pos] = current + 1
    }
    chain.value = [...chain.value]
  }

  function clearChainSlot(pos: number) {
    if (pos < 0 || pos >= CHAIN_COUNT) return
    chain.value[pos] = null
    chain.value = [...chain.value]
  }

  function clearChain() {
    chain.value = Array(CHAIN_COUNT).fill(null)
    playingChainIndex.value = null
    playingBankIndex.value = null
  }

  function setChainEnabled(v: boolean) {
    chainEnabled.value = v
    if (!v) {
      playingChainIndex.value = null
      playingBankIndex.value = null
    }
  }

  function captureChainForPreset() {
    return { chain: [...chain.value], chainEnabled: chainEnabled.value }
  }

  function restoreChainFromPreset(cfg: { chain: (number | null)[]; chainEnabled: boolean } | null) {
    if (!cfg) return
    chain.value = cfg.chain?.length === CHAIN_COUNT ? [...cfg.chain] : Array(CHAIN_COUNT).fill(null)
    chainEnabled.value = cfg.chainEnabled ?? false
  }

  function captureActiveBankForLink() {
    const bank = activeBank.value
    return {
      numSteps: bank.numSteps,
      steps: JSON.parse(JSON.stringify(bank.steps)),
      param1CC: bank.param1CC,
      param2CC: bank.param2CC,
      param1Variation: bank.param1Variation,
      param2Variation: bank.param2Variation,
      selectedOctave: bank.selectedOctave,
      octaveRange: bank.octaveRange,
      transpose: 0,
      selectedKey: bank.selectedKey,
      selectedScale: bank.selectedScale,
      selectedStyle: bank.selectedStyle,
    }
  }

  function restoreLinkedBank(cfg: any) {
    if (!cfg) return
    const bank = banks.value[0]
    if (cfg.numSteps !== undefined) bank.numSteps = cfg.numSteps
    if (cfg.steps !== undefined) {
      bank.steps = cfg.steps.map((s: any) => {
        const step = { ...DEFAULT_STEP, ...s }
        step.edited = s.edited !== undefined ? s.edited : (s.active || (s.notes && s.notes.length > 0))
        return step
      })
    }
    if (cfg.param1CC !== undefined) bank.param1CC = cfg.param1CC
    if (cfg.param2CC !== undefined) bank.param2CC = cfg.param2CC
    if (cfg.param1Variation !== undefined) bank.param1Variation = cfg.param1Variation
    if (cfg.param2Variation !== undefined) bank.param2Variation = cfg.param2Variation
    if (cfg.selectedOctave !== undefined) bank.selectedOctave = cfg.selectedOctave
    if (cfg.octaveRange !== undefined) bank.octaveRange = cfg.octaveRange
    if (cfg.selectedKey !== undefined) bank.selectedKey = cfg.selectedKey
    if (cfg.selectedScale !== undefined) bank.selectedScale = cfg.selectedScale
    if (cfg.selectedStyle !== undefined) bank.selectedStyle = cfg.selectedStyle
    if (cfg.genDensity !== undefined) bank.genDensity = cfg.genDensity
    if (cfg.chordsEnabled !== undefined) bank.chordsEnabled = cfg.chordsEnabled
    if (cfg.maxPolyphony !== undefined) bank.maxPolyphony = cfg.maxPolyphony
    if (cfg.chordDensity !== undefined) bank.chordDensity = cfg.chordDensity
    banks.value = [...banks.value]
  }

  return {
    banks,
    activeBankIndex,
    activeBank,
    chain,
    chainEnabled,
    playingChainIndex,
    playingBankIndex,
    playbackSteps,
    setActiveBank,
    cycleChainSlot,
    clearChainSlot,
    clearChain,
    setChainEnabled,
    captureChainForPreset,
    restoreChainFromPreset,
    captureActiveBankForLink,
    restoreLinkedBank,
  }
})