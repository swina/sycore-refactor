import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useAuthStore } from './useAuthStore'
import { userKey } from '@/lib/userKey'
import { db, doc, collection, getDocs, setDoc, deleteDoc } from '@/lib/idb'
import { sendAiPrompt } from '@/lib/ai-service'
import { useAiAgentStore } from './useAiAgentStore'
import type { ArpMode } from '@/lib/arp-patterns'

// ── Types ──────────────────────────────────────────────────────────────────

export type DurationOption = typeof DURATION_OPTIONS[number]

// A step's chord-strum direction, used when the slot's global playMode is
// 'chord'. Undefined/unset means "play simultaneously" — today's only
// behavior — so old saved progressions are unaffected until the user
// explicitly picks one of these 4 in the step-detail editor.
export type ChordStrumMode = 'up' | 'down' | 'up-down' | 'down-up'

export interface ChordStep {
  active: boolean
  chordName: string
  notes: number[]
  velocity: number
  duration: DurationOption
  gate: number
  transpose: number
  stepMode?: 'chord' | 'arp'   // per-step override of the slot's global playMode; unset = inherit playMode
  chordMode?: ChordStrumMode   // used when this step's effective mode is 'chord'; unset = simultaneous (today's behavior)
  arpMode?: ArpMode            // used when this step's effective mode is 'arp'; defaults to 'up' (today's hardcoded behavior)
  arpRate?: DurationOption     // per-step arp rate override; unset = inherit slot arpRate
}

export type PlayMode = 'chord' | 'arp' | 'bass'

export interface ChordProgAllSlotsSnapshot {
  type: 'all'
  slots: Array<{ steps: ChordStep[]; numSteps: number; playMode: PlayMode; arpRate: DurationOption }>
  activeSlotIndex: number
  chain: number[]
  chainEnabled: boolean
  selectedKey: number
  midiChannel: number
}
  export interface ChordProgSnapshot {
  steps: ChordStep[]
  numSteps: number
  selectedKey: number
  playMode: PlayMode
  arpRate: DurationOption
  midiChannel: number
}

// ── Constants ───────────────────────────────────────────────────────────────

export const DURATION_OPTIONS = [
  '8m', '4m', '2m', '1m',
  '2n.', '2n',
  '4n.', '4n', '4t',
  '8n.', '8n', '8t',
  '16n.', '16n', '16t',
  '32n', '64n', '128n',
] as const

export const DURATION_LABELS: Record<string, string> = {
  '8m': '8/1', '4m': '4/1', '2m': '2/1', '1m': '1/1',
  '2n.': '3/4', '2n': '1/2',
  '4n.': '3/8', '4n': '1/4', '4t': '1/4T',
  '8n.': '3/16', '8n': '1/8', '8t': '1/8T',
  '16n.': '3/32', '16n': '1/16', '16t': '1/16T',
  '32n': '1/32', '64n': '1/64', '128n': '1/128',
}

export const DEFAULT_CHORD_STEP: ChordStep = {
  active: false,
  chordName: '—',
  notes: [],
  velocity: 100,
  duration: '4n',
  gate: 90,
  transpose: 0,
  stepMode: undefined,
  chordMode: undefined,
  arpMode: 'up',
}

// ── Storage ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'SYCORE_CHORD_PROG_STATE'

function loadSaved(): ChordProgSnapshot | null {
  try {
    return JSON.parse(localStorage.getItem(userKey(STORAGE_KEY)) || 'null')
  } catch {
    return null
  }
}

// ── Store ───────────────────────────────────────────────────────────────────

export const useChordProgStore = defineStore('chordProg', () => {
  const authStore = useAuthStore()
  const uid = computed(() => authStore.user?.uid)
  const saved = loadSaved()

  function ensureSteps16(arr: ChordStep[]): ChordStep[] {
    if (arr.length >= 16) return arr.slice(0, 16)
    return [...arr, ...Array(16 - arr.length).fill(null).map(() => ({ ...DEFAULT_CHORD_STEP }))]
  }

  const steps = ref<ChordStep[]>(
    ensureSteps16(
      saved?.steps
        ? saved.steps.map(s => ({ ...DEFAULT_CHORD_STEP, ...s }))
        : Array(16).fill(null).map(() => ({ ...DEFAULT_CHORD_STEP }))
    )
  )
  const numSteps = ref(saved?.numSteps ?? 8)
  const isPlaying = ref(false)
  const currentStep = ref(0)
  const selectedStepIdx = ref(0)
  const selectedKey = ref(saved?.selectedKey ?? 0)
  const playMode = ref<PlayMode>(saved?.playMode ?? 'chord')
  const arpRate = ref<DurationOption>(saved?.arpRate ?? '16n')
  const midiChannel = ref(saved?.midiChannel ?? 1)
  // ── Progression Slots (A-H) & Chain ─────────────────────────────────────
  const SLOT_COUNT = 8
  const CHAIN_MAX = 16

  function makeEmptySlot() {
    return {
      steps: Array(16).fill(null).map(() => ({ ...DEFAULT_CHORD_STEP })),
      numSteps: 8,
      playMode: 'chord' as PlayMode,
      arpRate: '16n' as DurationOption,
    }
  }

  const slots = ref<Array<{ steps: ChordStep[]; numSteps: number; playMode: PlayMode; arpRate: DurationOption }>>(
    Array.from({ length: SLOT_COUNT }, () => makeEmptySlot())
  )
  const activeSlotIndex = ref(0)
  // Which slot is actually sounding right now — distinct from activeSlotIndex
  // (which slot's steps are loaded into the editable buffer/shown in the
  // grid). During chain playback these diverge as playback advances through
  // slots the user isn't looking at; null when not playing.
  const playingSlotIndex = ref<number | null>(null)
  const chain = ref<number[]>(Array(CHAIN_MAX).fill(-1))
  const chainEnabled = ref(false)

  const SLOT_STORAGE_KEY = 'SYCORE_CHORD_PROG_SLOTS'
  const CHAIN_STORAGE_KEY = 'SYCORE_CHORD_PROG_CHAIN'

  function loadSlotData() {
    try {
      const raw = localStorage.getItem(userKey(SLOT_STORAGE_KEY))
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length === SLOT_COUNT) {
          slots.value = parsed.map((s: any) => ({
            steps: s.steps?.map((st: any) => ({ ...DEFAULT_CHORD_STEP, ...st })) ?? makeEmptySlot().steps,
            numSteps: s.numSteps ?? 8,
            playMode: s.playMode ?? 'chord',
            arpRate: s.arpRate ?? '16n',
          }))
        }
      }
    } catch {}
  }

  function persistSlots() {
    try {
      localStorage.setItem(userKey(SLOT_STORAGE_KEY), JSON.stringify(slots.value))
    } catch {}
  }

  function loadChainData() {
    try {
      const raw = localStorage.getItem(userKey(CHAIN_STORAGE_KEY))
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length === CHAIN_MAX) {
          chain.value = parsed
        }
      }
    } catch {}
  }

  function persistChain() {
    try {
      localStorage.setItem(userKey(CHAIN_STORAGE_KEY), JSON.stringify(chain.value))
    } catch {}
  }

  loadSlotData()
  loadChainData()

  // Save current editing state to a slot
  function slotSave(index: number) {
    if (index < 0 || index >= SLOT_COUNT) return
    slots.value[index] = {
      steps: steps.value.map(s => ({ ...s })),
      numSteps: numSteps.value,
      playMode: playMode.value,
      arpRate: arpRate.value,
    }
    persistSlots()
  }

  // Load a slot into current editing state
  function slotLoad(index: number) {
    if (index < 0 || index >= SLOT_COUNT) return
    const slot = slots.value[index]
    steps.value = ensureSteps16(slot.steps.map(s => ({ ...s })))
    numSteps.value = slot.numSteps
    playMode.value = slot.playMode
    arpRate.value = slot.arpRate
    activeSlotIndex.value = index
  }

  // Copy one slot's data to another slot
  function copySlot(fromIndex: number, toIndex: number) {
    if (fromIndex < 0 || fromIndex >= SLOT_COUNT) return
    if (toIndex < 0 || toIndex >= SLOT_COUNT) return
    slotSave(activeSlotIndex.value)
    const src = slots.value[fromIndex]
    slots.value[toIndex] = {
      steps: src.steps.map(s => ({ ...s, notes: [...s.notes] })),
      numSteps: src.numSteps,
      playMode: src.playMode,
      arpRate: src.arpRate,
    }
    persistSlots()
  }

  // Set a chain position to a slot index (0-7) or -1 to clear
  function chainSet(pos: number, slotIdx: number) {
    if (pos < 0 || pos >= CHAIN_MAX) return
    chain.value[pos] = slotIdx
    persistChain()
  }

  // Insert a slot at a chain position, shifting later entries right
  function chainInsert(pos: number, slotIdx: number) {
    if (pos < 0 || pos > CHAIN_MAX) return
    chain.value.splice(pos, 0, slotIdx)
    if (chain.value.length > CHAIN_MAX) chain.value.length = CHAIN_MAX
    persistChain()
  }

  // Remove a chain entry at position
  function chainRemove(pos: number) {
    if (pos < 0 || pos >= CHAIN_MAX) return
    chain.value.splice(pos, 1)
    while (chain.value.length < CHAIN_MAX) chain.value.push(-1)
    persistChain()
  }

  // Clear the entire chain
  function chainClear() {
    chain.value = Array(CHAIN_MAX).fill(-1)
    persistChain()
  }

  // Get the combined steps+numSteps for chain playback. slotIndices/localIndices
  // are parallel arrays (same length as steps) mapping each flattened step
  // back to which slot it came from and its index within that slot's own
  // grid — needed so the UI can show which slot is currently playing and
  // highlight the right step within it, instead of a flattened global index
  // that only makes sense against the concatenated array itself.
  function getChainSteps(): { steps: ChordStep[]; numSteps: number; slotIndices: number[]; localIndices: number[] } {
    const all: ChordStep[] = []
    const slotIndices: number[] = []
    const localIndices: number[] = []
    for (const slotIdx of chain.value) {
      if (slotIdx < 0 || slotIdx >= SLOT_COUNT) continue
      const slot = slots.value[slotIdx]
      const count = Math.min(slot.numSteps, slot.steps.length)
      for (let i = 0; i < count; i++) {
        all.push(slot.steps[i])
        slotIndices.push(slotIdx)
        localIndices.push(i)
      }
    }
    return { steps: all, numSteps: all.length, slotIndices, localIndices }
  }

  const libraryPatterns = ref<any[]>([])
  const loadingLibrary = ref(false)

  watch([steps, numSteps, selectedKey, playMode, arpRate, midiChannel], () => {
    try {
      localStorage.setItem(userKey(STORAGE_KEY), JSON.stringify({
        steps: steps.value,
        numSteps: numSteps.value,
        selectedKey: selectedKey.value,
        playMode: playMode.value,
        arpRate: arpRate.value,
        midiChannel: midiChannel.value,
      }))
    } catch {}
  }, { deep: true })

  function setStep(idx: number, data: Partial<ChordStep>) {
    if (idx < 0 || idx >= 16) return
    steps.value[idx] = { ...steps.value[idx], ...data }
  }

  // Full replace, not a merge — used for step copy/paste so the target ends
  // up with exactly the source step's parameters, including clearing any
  // optional field (stepMode/chordMode/arpMode/arpRate) the source doesn't
  // have set, which a Partial merge via setStep would instead leave alone.
  function replaceStep(idx: number, data: ChordStep) {
    if (idx < 0 || idx >= 16) return
    steps.value[idx] = { ...data, notes: [...data.notes] }
  }

  function toggleStepActive(idx: number) {
    if (idx < 0 || idx >= 16) return
    steps.value[idx] = { ...steps.value[idx], active: !steps.value[idx].active }
  }

  function assignChordToStep(idx: number, chordName: string, notes: number[]) {
    if (idx < 0 || idx >= 16) return
    steps.value[idx] = { ...steps.value[idx], chordName, notes: [...notes], active: true }
  }

  function cycleDuration(idx: number, reverse = false) {
    const step = steps.value[idx]
    if (!step) return
    const cur = DURATION_OPTIONS.indexOf(step.duration)
    const next = reverse
      ? (cur <= 0 ? DURATION_OPTIONS.length - 1 : cur - 1)
      : (cur + 1) % DURATION_OPTIONS.length
    steps.value[idx] = { ...step, duration: DURATION_OPTIONS[next] }
  }

  function loadProgressionByName(progressionData: Record<string, any>, name: string) {
    const chords = progressionData[name]
    if (!chords?.length) return
    for (let i = 0; i < numSteps.value; i++) {
      const chord = chords[i % chords.length]
      steps.value[i] = {
        ...DEFAULT_CHORD_STEP,
        chordName: chord.chordName,
        notes: [...chord.notes],
        active: true,
      }
    }
  }

  function generateAlgorithmic(progressionData: Record<string, any>) {
    const names = Object.keys(progressionData)
    if (!names.length) return
    const name = names[Math.floor(Math.random() * names.length)]
    loadProgressionByName(progressionData, name)
  }

  /**
   * Generate a chord progression from a natural-language prompt via the AI
   * Agent. Asks the model for a JSON array of { chordName, notes } objects,
   * then fills the active steps.
   * @param {string} prompt — e.g. "ambient romantic 8 chords"
   */
  async function generateFromAiPrompt(prompt: string): Promise<boolean> {
    const aiStore = useAiAgentStore()
    if (!aiStore.isConfigured) return false

    const keyNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    const rootMidi = 48 + (selectedKey.value % 12)
    const keyLabel = keyNames[((selectedKey.value % 12) + 12) % 12]

    const systemPrompt = [
      'You are a music theory assistant for a 16-step chord sequencer.',
      `Write a chord progression in the key of ${keyLabel}, ${numSteps.value} chords long, that matches the requested mood.`,
      `Output ONLY a valid JSON array (no markdown fences, no commentary) of objects with "chordName" (e.g. "Cmaj7", "Am7", "F") and "notes" — a flat array of MIDI note numbers. ` +
      `The notes should sit near MIDI ${rootMidi} (that octave is the root of ${keyLabel}).`,
      'Keep each chord to 3-5 notes, and use a cohesive key.'
    ].join('\n')

    try {
      const result = await sendAiPrompt(
        aiStore.selectedProvider,
        aiStore.endpoint,
        aiStore.model,
        aiStore.apiKey,
        systemPrompt,
        prompt,
      )
      if (!result.success || !result.data) throw new Error(result.error || 'AI generation failed')

      const raw = result.data.replace(/```json|```/g, '').trim()
      const start = raw.indexOf('[')
      const end = raw.lastIndexOf(']')
      if (start === -1 || end === -1) throw new Error('AI did not return valid JSON')
      const parsed = JSON.parse(raw.slice(start, end + 1))

      const fresh = Array(16).fill(null).map(() => ({ ...DEFAULT_CHORD_STEP }))
      for (let i = 0; i < numSteps.value; i++) {
        const c = parsed[i % parsed.length]
        if (!c) continue
        fresh[i] = {
          ...DEFAULT_CHORD_STEP,
          chordName: c.chordName || `Chord ${i + 1}`,
          notes: Array.isArray(c.notes) ? c.notes.map(Number).filter(n => Number.isFinite(n)) : [],
          active: Array.isArray(c.notes) && c.notes.length > 0,
        }
      }
      steps.value = fresh
      return true
    } catch (err) {
      console.error('[ChordProgStore] AI generation failed', err)
      return false
    }
  }

  function clearSteps() {
    steps.value = Array(16).fill(null).map(() => ({ ...DEFAULT_CHORD_STEP }))
  }

  async function saveToLibrary(name: string): Promise<boolean> {
    if (!authStore.user) return false
    const uid = authStore.user.uid
    const id = `chordprog_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    const docRef = doc(db, 'users', uid, 'chord_progressions', id)
    await setDoc(docRef, {
      id,
      name,
      type: 'single',
      slotIndex: activeSlotIndex.value,
      steps: JSON.parse(JSON.stringify(steps.value)),
      numSteps: numSteps.value,
      selectedKey: selectedKey.value,
      playMode: playMode.value,
      arpRate: arpRate.value,
      midiChannel: midiChannel.value,
      createdAt: new Date().toISOString(),
    } as any)
    await loadLibrary()
    return true
  }

  async function saveAllSlotsToLibrary(name: string): Promise<boolean> {
    if (!authStore.user) return false
    const uid = authStore.user.uid
    const id = `chordprog_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    const docRef = doc(db, 'users', uid, 'chord_progressions', id)

    // Snapshot active slot first, then persist all slots
    slotSave(activeSlotIndex.value)
    await setDoc(docRef, {
      id,
      name,
      type: 'all',
      slots: slots.value.map(s => ({
        steps: s.steps.map(st => ({ ...st })),
        numSteps: s.numSteps,
        playMode: s.playMode,
        arpRate: s.arpRate,
      })),
      activeSlotIndex: activeSlotIndex.value,
      chain: [...chain.value],
      chainEnabled: chainEnabled.value,
      selectedKey: selectedKey.value,
      midiChannel: midiChannel.value,
      createdAt: new Date().toISOString(),
    } as any)
    await loadLibrary()
    return true
  }

  async function loadLibrary() {
    if (!authStore.user) return
    loadingLibrary.value = true
    try {
      const uid = authStore.user.uid
      const colRef = collection(db, 'users', uid, 'chord_progressions')
      const snap = await getDocs(colRef)
      libraryPatterns.value = snap.docs
        .map(d => d.data())
        .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    } catch (e) {
      console.error('[ChordProgStore] loadLibrary error', e)
    } finally {
      loadingLibrary.value = false
    }
  }

  async function updateLibraryPattern(pattern: any) {
    if (!authStore.user) return
    const uid = authStore.user.uid
    const docRef = doc(db, 'users', uid, 'chord_progressions', pattern.id)
    const data = { ...pattern }
    if (data.type === 'all') {
      slotSave(activeSlotIndex.value)
      data.slots = slots.value.map(s => ({
        steps: s.steps.map(st => ({ ...st })),
        numSteps: s.numSteps,
        playMode: s.playMode,
        arpRate: s.arpRate,
      }))
      data.activeSlotIndex = activeSlotIndex.value
      data.chain = [...chain.value]
      data.chainEnabled = chainEnabled.value
      data.selectedKey = selectedKey.value
      data.midiChannel = midiChannel.value
    } else {
      data.steps = JSON.parse(JSON.stringify(steps.value))
      data.numSteps = numSteps.value
      data.selectedKey = selectedKey.value
      data.playMode = playMode.value
      data.arpRate = arpRate.value
      data.midiChannel = midiChannel.value
    }
    await setDoc(docRef, data)
    await loadLibrary()
  }

  async function deleteFromLibrary(id: string) {
    if (!authStore.user) return
    const uid = authStore.user.uid
    const docRef = doc(db, 'users', uid, 'chord_progressions', id)
    await deleteDoc(docRef)
    await loadLibrary()
  }

  function loadFromDocument(pattern: Partial<ChordProgSnapshot>) {
    if (pattern.steps) steps.value = ensureSteps16(pattern.steps.map(s => ({ ...DEFAULT_CHORD_STEP, ...s })))
    if (pattern.numSteps) numSteps.value = pattern.numSteps
    if (pattern.selectedKey !== undefined) selectedKey.value = pattern.selectedKey
    if (pattern.playMode) playMode.value = pattern.playMode
    if (pattern.arpRate) arpRate.value = pattern.arpRate
    if (pattern.midiChannel) midiChannel.value = pattern.midiChannel
  }

  function loadAllSlotsFromDocument(pattern: ChordProgAllSlotsSnapshot) {
    if (pattern.slots) {
      slots.value = pattern.slots.map((s: any) => ({
        steps: s.steps?.map((st: any) => ({ ...DEFAULT_CHORD_STEP, ...st })) ?? makeEmptySlot().steps,
        numSteps: s.numSteps ?? 8,
        playMode: s.playMode ?? 'chord',
        arpRate: s.arpRate ?? '16n',
      }))
    }
    if (pattern.selectedKey !== undefined) selectedKey.value = pattern.selectedKey
    if (pattern.midiChannel !== undefined) midiChannel.value = pattern.midiChannel
    if (pattern.chain) chain.value = pattern.chain
    if (pattern.chainEnabled !== undefined) chainEnabled.value = pattern.chainEnabled
    if (pattern.activeSlotIndex !== undefined) {
      activeSlotIndex.value = pattern.activeSlotIndex
      slotLoad(pattern.activeSlotIndex)
    }
    persistSlots()
    persistChain()
  }

  function loadFromMidiImport(track: { name: string; notes: Array<{ noteNumber: number; velocity: number; startTick: number }> }, ticksPerBeat: number) {
    const NOTES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]
    function guessChordName(notes: number[]): string {
      if (notes.length === 0) return '—'
      if (notes.length === 1) return NOTES[notes[0] % 12] + Math.floor(notes[0] / 12)
      const sorted = [...new Set(notes.map(n => n % 12))].sort((a, b) => a - b)
      return sorted.map(s => NOTES[s]).join('') || `Chord`
    }

    const tickGroups = new Map<number, number[]>()
    for (const n of track.notes) {
      if (!tickGroups.has(n.startTick)) tickGroups.set(n.startTick, [])
      tickGroups.get(n.startTick)!.push(n.noteNumber)
    }

    const sortedTicks = [...tickGroups.keys()].sort((a, b) => a - b)
    const fresh = Array(16).fill(null).map(() => ({ ...DEFAULT_CHORD_STEP }))

    for (let i = 0; i < Math.min(16, sortedTicks.length); i++) {
      const tick = sortedTicks[i]
      const noteNumbers = tickGroups.get(tick)!
      const nextTick = sortedTicks[i + 1] ?? tick + ticksPerBeat
      const tickDuration = nextTick - tick
      const dur = midiTickToDuration(tickDuration, ticksPerBeat)
      fresh[i] = {
        ...DEFAULT_CHORD_STEP,
        chordName: guessChordName(noteNumbers),
        notes: [...noteNumbers],
        active: true,
        velocity: 100,
        duration: dur,
      }
    }

    steps.value = fresh
    numSteps.value = Math.min(16, sortedTicks.length)
  }

  function midiTickToDuration(ticks: number, tpb: number): DurationOption {
    const beats = ticks / tpb
    const closest = DURATION_OPTIONS.slice().sort((a, b) => {
      const aBeats = durationToBeats(a)
      const bBeats = durationToBeats(b)
      return Math.abs(aBeats - beats) - Math.abs(bBeats - beats)
    })
    return closest[0] ?? '4n'
  }

  function durationToBeats(d: DurationOption): number {
    const map: Record<string, number> = {
      '128n': 0.03125, '64n': 0.0625, '32n': 0.125,
      '16t': 0.1667, '16n': 0.25, '16n.': 0.375,
      '8t': 0.3333, '8n': 0.5, '8n.': 0.75,
      '4t': 0.6667, '4n': 1, '4n.': 1.5,
      '2n': 2, '2n.': 3,
      '1m': 4, '2m': 8, '4m': 16, '8m': 32,
    }
    return map[d] ?? 1
  }

  watch(uid, (newUid) => {
    const s: ChordProgSnapshot | null = newUid ? loadSaved() : null
    steps.value = ensureSteps16(s?.steps ?? Array(16).fill(null).map(() => ({ ...DEFAULT_CHORD_STEP })))
    numSteps.value = s?.numSteps ?? 8
    selectedKey.value = s?.selectedKey ?? 0
    playMode.value = s?.playMode ?? 'chord'
    arpRate.value = s?.arpRate ?? '16n'
    midiChannel.value = s?.midiChannel ?? 1
  })

  return {
    steps, numSteps, isPlaying, currentStep, selectedStepIdx,
    selectedKey, playMode, arpRate, midiChannel,
    libraryPatterns, loadingLibrary,
    setStep, replaceStep, toggleStepActive, assignChordToStep, cycleDuration,
    loadProgressionByName, generateAlgorithmic, generateFromAiPrompt, clearSteps,
    saveToLibrary, saveAllSlotsToLibrary, updateLibraryPattern, loadLibrary, deleteFromLibrary, loadFromDocument, loadAllSlotsFromDocument,
    loadFromMidiImport,
    // Slots & Chain
    SLOT_COUNT, CHAIN_MAX,
    slots, activeSlotIndex, playingSlotIndex, chain, chainEnabled,
    slotSave, slotLoad, copySlot, chainSet, chainInsert, chainRemove, chainClear, getChainSteps,
  }
})