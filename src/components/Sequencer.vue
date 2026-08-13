<script setup>
import { ref, computed, watch, onMounted, onUnmounted, toRef } from 'vue'
import { X, Play, Square, Settings, Plus, Trash2, ChevronUp, Zap, ChevronDown, ChevronLeft, ChevronRight, Save, Download, Keyboard, Piano, Circle, FolderOpen, FolderPlus, Layers } from 'lucide-vue-next'
import { getTransport, getDraw, start as toneStart } from 'tone'
import { useTransportManager } from '@/composables/useTransportManager'
import { midiService, MidiSource } from '@/core/midi/midi-service'
import { useArpStore } from '@/stores/useArpStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { usePresetStore } from '@/stores/usePresetStore'
import { useUiStore } from '@/stores/useUiStore'
import { useStepSequencerStore, BANK_NAMES, BANK_COUNT, CHAIN_COUNT } from '@/stores/useStepSequencerStore'
import { useLocalStorage } from '@/composables/useLocalStorage'
import { S1_CC_MAP } from '@/constants/s1-config'
import { db, doc, collection, getDocs, setDoc, deleteDoc } from '@/lib/idb'
import { useAuthStore } from '@/stores/useAuthStore'
import { useSyncStore } from '@/stores/useSyncStore'
import { dispatch } from '@/types/events'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  isOpen: Boolean,
  bpm: Number,
  channel: Number,
  currentSoundName: String,
  currentCategory: String,
  polyModeString: String,
  isKeyboardOpen: Boolean,
  globalTranspose: Number,
  seqStepsLimit: { type: Number, default: 16 },
  canUseSeqGen: Boolean,
  canUseSeqParam2: Boolean,
  canUseSeqGlobalTranspose: Boolean,
  canUseSeqSyncTrack: Boolean,
  midiMappings: Object,
  currentPresetCCValues: Object,
})

const emit = defineEmits(['bpmChange', 'transposeChange', 'prevSlot', 'nextSlot', 'openKeyboard', 'stop', 'close'])

const midiStore = useMidiStore()
const presetStore = usePresetStore()
const authStore = useAuthStore()
const syncStore = useSyncStore()
const uiStore = useUiStore()
const seqStore = useStepSequencerStore()
const transportManager = useTransportManager()

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } =
  useDraggableResizable({
    storageKey:    'S1_SEQUENCER2_MODAL',
    minimizeLabel: 'Sequencer',
    initialWidth:  1020,
    initialHeight: 700,
    minWidth:      760,
    minHeight:     500,
    zIndex:        120,
    openRef:       toRef(props, 'isOpen'),
    panelId:       'sequencer2',
  })

const showSaveLibraryModal = ref(false)
const showLoadLibraryModal = ref(false)
const libraryPatternName = ref('')
const libraryPatterns = ref([])
const loadingLibrary = ref(false)

const DEFAULT_STEP = {
  active: false,
  notes: [60],
  velocity: 100,
  gate: 75,
  tieSteps: 0,
  param1Value: 64,
  param2Value: 64,
  edited: false,
  octave: 4,        // which octave the 12-note grid displays/edits for this step
  accent: false,     // per-step velocity boost at playback
  probability: 100,  // % chance this step actually fires each pass
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

// Row order for the 12-note-bar grid — B at top down to C at bottom, per
// docs/plans/modular/new-step-sequencer.md's layout. Semitone index into
// NOTE_NAMES for each row, top to bottom.
const GRID_SEMITONES = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]

const STYLES = {
  House: { steps: 16, density: 0.50, octaves: [3, 4], velMin: 80, velMax: 110, gateMin: 40, gateMax: 70 },
  Techno: { steps: 16, density: 0.65, octaves: [2, 3], velMin: 95, velMax: 127, gateMin: 35, gateMax: 70, accentGrid: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false] },
  HipHop: { steps: 16, density: 0.40, octaves: [2, 4], velMin: 65, velMax: 105, gateMin: 40, gateMax: 80 },
  Acid: { steps: 16, density: 0.75, octaves: [2, 3], velMin: 80, velMax: 127, gateMin: 30, gateMax: 65, slideProbability: 0.25 },
  Funk: { steps: 16, density: 0.50, octaves: [3, 4], velMin: 75, velMax: 120, gateMin: 35, gateMax: 55, accentGrid: [true, false, false, true, false, false, true, false, false, true, false, false, true, false, false, false] },
  Jazz: { steps: 16, density: 0.45, octaves: [3, 5], velMin: 55, velMax: 100, gateMin: 35, gateMax: 90 },
  Ambient: { steps: 16, density: 0.22, octaves: [4, 5], velMin: 35, velMax: 75, gateMin: 75, gateMax: 100 },
  'Drum&Bass': { steps: 32, density: 0.55, octaves: [2, 4], velMin: 85, velMax: 127, gateMin: 30, gateMax: 50 },
  Minimal: { steps: 16, density: 0.28, octaves: [3, 4], velMin: 70, velMax: 95, gateMin: 30, gateMax: 50 },
  Latin: { steps: 16, density: 0.55, octaves: [3, 4], velMin: 75, velMax: 115, gateMin: 30, gateMax: 60, accentGrid: [true, false, false, true, false, true, false, false, true, false, false, true, false, true, false, false] },
  Industrial: { steps: 16, density: 0.65, octaves: [1, 3], velMin: 100, velMax: 127, gateMin: 38, gateMax: 55 },
  Reggae: { steps: 16, density: 0.40, octaves: [3, 4], velMin: 70, velMax: 105, gateMin: 35, gateMax: 65, accentGrid: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false] },
  Pop: { steps: 16, density: 0.55, octaves: [3, 4], velMin: 80, velMax: 115, gateMin: 45, gateMax: 75, accentGrid: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false] },
  Rock: { steps: 16, density: 0.60, octaves: [2, 4], velMin: 90, velMax: 127, gateMin: 35, gateMax: 65, accentGrid: [true, false, false, true, true, false, false, true, true, false, false, true, true, false, false, false] },
  Electronic: { steps: 16, density: 0.50, octaves: [3, 4], velMin: 85, velMax: 115, gateMin: 30, gateMax: 60, accentGrid: [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false] },
}

const SCALES = {
  'Major': [0, 2, 4, 5, 7, 9, 11],
  'Minor': [0, 2, 3, 5, 7, 8, 10],
  'Harmonic Min': [0, 2, 3, 5, 7, 8, 11],
  'Pentatonic Maj': [0, 2, 4, 7, 9],
  'Pentatonic Min': [0, 3, 5, 7, 10],
  'Blues': [0, 3, 5, 6, 7, 10],
  'Dorian': [0, 2, 3, 5, 7, 9, 10],
  'Phrygian': [0, 1, 3, 5, 7, 8, 10],
  'Lydian': [0, 2, 4, 6, 7, 9, 11],
  'Mixolydian': [0, 2, 4, 5, 7, 9, 10],
  'Locrian': [0, 1, 3, 5, 6, 8, 10],
  'Whole Tone': [0, 2, 4, 6, 8, 10],
  'Hungarian Min': [0, 2, 3, 6, 7, 8, 11],
  'Chromatic': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
}

const STYLE_PROGRESSIONS = {
  House: [[0, 4, 7, 4, 0, 4, 7, 4],
    [0, 2, 4, 5, 7, 5, 4, 2],
    [0, 4, 5, 7, 5, 4, 0],[0, 3, 4, 3], [0, 5, 3, 4]],
  Techno: [[0, 2, 4, 5, 7, 5, 4, 2],
    [0, 7, 0, 7, 0, 7, 0, 7],
    [0, 3, 7, 10, 7, 3, 0],[0, 6, 5, 6], [0, 3, 0, 3]],
  HipHop: [ [0, 3, 5, 6, 5, 3, 0],
    [0, 2, 3, 5, 7, 5, 3, 2],
    [0, 3, 5, 7, 8, 7, 5, 3],[0, 3, 4, 0], [1, 4, 0, 4]],
  Acid: [[0, 1, 3, 4, 6, 4, 3, 1],
    [0, 2, 3, 5, 7, 5, 3, 2],
    [0, 1, 2, 3, 4, 3, 2, 1],[0, 6, 0, 6], [0, 3, 5, 3]],
  Funk: [[0, 3, 0, 4], [1, 4, 0, 0]],
  Jazz: [[1, 4, 0, 5], [0, 5, 1, 4]],
  Ambient: [[0, 2, 3, 2], [0, 1, 3, 0]],
  'Drum&Bass': [ [0, 2, 4, 5, 7, 9, 5, 4],
    [0, 3, 5, 7, 8, 5, 3, 0],
    [0, 2, 3, 5, 7, 5, 3, 2],[0, 6, 5, 6], [0, 3, 0, 5]],
  Minimal: [[0, 3, 0, 6], [0, 6, 0, 3]],
  Latin: [[0, 3, 4, 0], [0, 4, 3, 4]],
  Industrial: [[0, 1, 6, 8, 6, 1, 0],
    [0, 2, 6, 8, 6, 2, 0],
    [0, 1, 4, 6, 8, 6, 4, 1],[0, 1, 0, 6], [0, 6, 5, 0]],
  Reggae: [[0, 3, 4, 3], [0, 4, 3, 0]],
  Pop: [[0, 4, 5, 3], [0, 5, 3, 4]],
  Rock: [[0, 6, 3, 0], [0, 3, 4, 0]],
  Electronic: [[0, 2, 3, 5, 7, 5, 3, 2], [0, 3, 5, 4], [0, 5, 3, 4]],
}

function getNoteName(midiNote) {
  const octave = Math.floor(midiNote / 12) - 1
  const note = NOTE_NAMES[midiNote % 12]
  return `${note}${octave}`
}

function formatStepNotes(notes) {
  if (!notes || notes.length === 0) return '–'
  if (notes.length === 1) return getNoteName(notes[0])
  const sortedNotes = [...notes].sort((a, b) => a - b)
  if (sortedNotes.length <= 2) {
    return sortedNotes.map(getNoteName).join('+')
  }
  return `${getNoteName(sortedNotes[0])}+${sortedNotes.length - 1}`
}

const hasP1Lock = (step) => step && step.param1Value !== undefined && step.param1Value !== 64
const hasP2Lock = (step) => step && step.param2Value !== undefined && step.param2Value !== 64

function buildChordNotes(scaleDegree, scaleIntervals, keyMidi, octave, voices) {
  const baseNote = (octave + 1) * 12 + keyMidi
  const len = scaleIntervals.length
  const notes = []
  for (let i = 0; i < voices; i++) {
    const deg = scaleDegree + i * 2
    const octaveBoost = Math.floor(deg / len)
    notes.push(baseNote + scaleIntervals[deg % len] + octaveBoost * 12)
  }
  return notes
}

// Local state — active bank working copy
const { state: seqStateStorage } = useLocalStorage('S1_SEQUENCER2_STATE', {})

const selectedStyle = ref(seqStore.activeBank.selectedStyle)
const selectedKey = ref(seqStore.activeBank.selectedKey)
const selectedScale = ref(seqStore.activeBank.selectedScale)
const chordsEnabled = ref(seqStore.activeBank.chordsEnabled)
const maxPolyphony = ref(seqStore.activeBank.maxPolyphony)
const chordDensity = ref(seqStore.activeBank.chordDensity)
const isPlaying = ref(false)
const isRecording = ref(false)
const currentStep = ref(0)
const transportPosition = ref('1:1:1')
const selectedStepIdx = ref(0)
const syncTrack = computed({
  get: () => syncStore.syncTrack,
  set: (v) => { syncStore.syncTrack = v },
})
const genDensity = ref(seqStore.activeBank.genDensity)
const swingAmount = ref(0)
const basePatternLength = ref(seqStore.activeBank.basePatternLength || seqStore.activeBank.numSteps)
const selectedOctave = ref(seqStore.activeBank.selectedOctave)
const octaveRange = ref(seqStore.activeBank.octaveRange)
let baseLengthTimer = null

const numSteps = ref(seqStore.activeBank.numSteps)

const steps = ref(seqStore.activeBank.steps.map(s => {
  const step = { ...DEFAULT_STEP, ...s }
  step.edited = s.edited !== undefined ? s.edited : (s.active || (s.notes && s.notes.length > 0))
  step.explicitNotes = s.explicitNotes !== undefined ? s.explicitNotes : (s.notes && s.notes.length > 0 && !(s.notes.length === 1 && s.notes[0] === 60))
  return step
}))

const param1CC = ref(seqStore.activeBank.param1CC)
const param2CC = ref(seqStore.activeBank.param2CC)

const clampCCValue = (v) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.max(0, Math.min(127, n)) : 0
}
const clampParam1CC = () => { param1CC.value = clampCCValue(param1CC.value) }
const clampParam2CC = () => { param2CC.value = clampCCValue(param2CC.value) }

const param1Variation = ref(seqStore.activeBank.param1Variation)
const param2Variation = ref(seqStore.activeBank.param2Variation)

// Refs for playback state
const playStateRef = { current: {} }
const dynamicMidiTranspose = ref(0)
const sequenceRootMidi = computed(() => {
  const firstActiveStep = steps.value.find(s => s.active && s.notes && s.notes.length > 0)
  if (firstActiveStep) {
    return firstActiveStep.notes[0]
  }
  const keyIdx = NOTE_NAMES.indexOf(selectedKey.value)
  return (selectedOctave.value + 1) * 12 + (keyIdx >= 0 ? keyIdx : 0)
})
const rafRef = ref(null)
const repeatEventIdRef = ref(null)
const fadeOutIntervalRef = ref(null)
const lastHandledNoteTimeRef = ref(0)
const currentlyHeldNotes = ref(new Set())
const recordedNotesForCurrentStep = ref([])
const lastLiveRecordStepRef = ref(null)
const activeTimeouts = ref([])
const activeMidiNotes = ref(new Set())

watch([isRecording, isPlaying, selectedStepIdx], () => {
  currentlyHeldNotes.value.clear()
  recordedNotesForCurrentStep.value = []
  lastLiveRecordStepRef.value = null
})

const skipBackingTrackSync = ref(false)

function syncLocalToBank() {
  const bank = seqStore.activeBank
  if (!bank) return
  bank.numSteps = numSteps.value
  bank.basePatternLength = basePatternLength.value
  bank.steps = steps.value.map(s => ({ ...DEFAULT_STEP, ...s }))
  bank.param1CC = param1CC.value
  bank.param2CC = param2CC.value
  bank.param1Variation = param1Variation.value
  bank.param2Variation = param2Variation.value
  bank.selectedOctave = selectedOctave.value
  bank.octaveRange = octaveRange.value
  bank.selectedKey = selectedKey.value
  bank.selectedScale = selectedScale.value
  bank.selectedStyle = selectedStyle.value
  bank.genDensity = genDensity.value
  bank.chordsEnabled = chordsEnabled.value
  bank.maxPolyphony = maxPolyphony.value
  bank.chordDensity = chordDensity.value
}

function loadBankIntoLocal() {
  const bank = seqStore.activeBank
  if (!bank) return
  numSteps.value = bank.numSteps
  basePatternLength.value = bank.basePatternLength || bank.numSteps
  steps.value = bank.steps.map(s => {
    const step = { ...DEFAULT_STEP, ...s }
    step.edited = s.edited !== undefined ? s.edited : (s.active || (s.notes && s.notes.length > 0))
    step.explicitNotes = s.explicitNotes !== undefined ? s.explicitNotes : (s.notes && s.notes.length > 0 && !(s.notes.length === 1 && s.notes[0] === 60))
    return step
  })
  param1CC.value = bank.param1CC
  param2CC.value = bank.param2CC
  param1Variation.value = bank.param1Variation
  param2Variation.value = bank.param2Variation
  selectedOctave.value = bank.selectedOctave
  octaveRange.value = bank.octaveRange
  selectedKey.value = bank.selectedKey
  selectedScale.value = bank.selectedScale
  selectedStyle.value = bank.selectedStyle
  genDensity.value = bank.genDensity
  chordsEnabled.value = bank.chordsEnabled
  maxPolyphony.value = bank.maxPolyphony
  chordDensity.value = bank.chordDensity
}

function selectBank(index) {
  if (index === seqStore.activeBankIndex) return
  syncLocalToBank()
  seqStore.setActiveBank(index)
  loadBankIntoLocal()
  selectedStepIdx.value = 0
  lastFollowedBank = -1
}

const gridCurrentStep = computed(() => {
  if (!seqStore.chainEnabled) return currentStep.value
  if (seqStore.playingBankIndex === seqStore.activeBankIndex) {
    const pb = seqStore.playbackSteps
    const localIdx = pb.localIndices[currentStep.value]
    return localIdx !== undefined ? localIdx : null
  }
  return null
})

watch(() => seqStore.activeBankIndex, () => {
  loadBankIntoLocal()
})

let lastFollowedBank = -1

function followChainPlayback(stepIdx) {
  if (!seqStore.chainEnabled || !isPlaying.value) {
    lastFollowedBank = -1
    return
  }
  const pb = seqStore.playbackSteps
  const bankIdx = pb.bankIndices?.[stepIdx]
  if (bankIdx === undefined || bankIdx === lastFollowedBank) return
  lastFollowedBank = bankIdx
  const localIdx = pb.localIndices?.[stepIdx] ?? 0
  if (seqStore.activeBankIndex !== bankIdx) {
    seqStore.setActiveBank(bankIdx)
    loadBankIntoLocal()
  }
  selectedStepIdx.value = localIdx
}


function openSaveLibraryModal() {
  if (!authStore.user) return
  libraryPatternName.value = `${props.currentSoundName || 'Pattern'}`
  showSaveLibraryModal.value = true
}

async function savePatternToLibrary() {
  if (!authStore.user || !libraryPatternName.value.trim()) return
  
  const uid = authStore.user.uid
  const patternName = libraryPatternName.value.trim()
  const patternId = `seq_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  
  const docRef = doc(db, 'users', uid, 'sequences', patternId)
  
  const config = {
    numSteps: numSteps.value,
    steps: JSON.parse(JSON.stringify(steps.value)),
    param1CC: param1CC.value,
    param2CC: param2CC.value,
    param1Variation: param1Variation.value,
    param2Variation: param2Variation.value,
    transpose: props.globalTranspose || 0,
    selectedOctave: selectedOctave.value,
    octaveRange: octaveRange.value,
  }

  const data = {
    id: patternId,
    name: patternName,
    key: selectedKey.value,
    scale: selectedScale.value,
    style: selectedStyle.value,
    config,
    createdAt: new Date().toISOString()
  }

  try {
    await setDoc(docRef, data)
    showSaveLibraryModal.value = false
  } catch (err) {
    console.error('Failed to save pattern to library:', err)
  }
}

async function openLoadLibraryModal() {
  if (!authStore.user) return
  showLoadLibraryModal.value = true
  await fetchLibraryPatterns()
}

async function fetchLibraryPatterns() {
  if (!authStore.user) return
  loadingLibrary.value = true
  try {
    const uid = authStore.user.uid
    const colRef = collection(db, 'users', uid, 'sequences')
    const snap = await getDocs(colRef)
    libraryPatterns.value = snap.docs.map(d => d.data()).sort((a, b) => {
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    })
  } catch (err) {
    console.error('Failed to fetch library patterns:', err)
  } finally {
    loadingLibrary.value = false
  }
}

function loadPatternFromLibrary(pattern) {
  const cfg = pattern.config
  if (cfg) {
    if (cfg.numSteps !== undefined) numSteps.value = cfg.numSteps
    if (cfg.steps !== undefined) {
      steps.value = cfg.steps.map(s => {
        const step = { ...DEFAULT_STEP, ...s }
        step.edited = s.edited !== undefined ? s.edited : (s.active || (s.notes && s.notes.length > 0))
        step.explicitNotes = s.explicitNotes !== undefined ? s.explicitNotes : (s.notes && s.notes.length > 0 && !(s.notes.length === 1 && s.notes[0] === 60))
        return step
      })
    }
    if (cfg.param1CC !== undefined) param1CC.value = cfg.param1CC
    if (cfg.param2CC !== undefined) param2CC.value = cfg.param2CC
    if (cfg.param1Variation !== undefined) param1Variation.value = cfg.param1Variation
    if (cfg.param2Variation !== undefined) param2Variation.value = cfg.param2Variation
    if (cfg.transpose !== undefined) {
      emit('transposeChange', cfg.transpose)
    }
    if (cfg.selectedOctave !== undefined) selectedOctave.value = cfg.selectedOctave
    if (cfg.octaveRange !== undefined) octaveRange.value = cfg.octaveRange
    
    if (pattern.key) selectedKey.value = pattern.key
    if (pattern.scale) selectedScale.value = pattern.scale
    if (pattern.style) selectedStyle.value = pattern.style
    // Local-only autosave (seqStateStorage) picks this up via the deep watch
    // below — no configChange emit here since Sequencer2 doesn't feed a
    // preset-embedded slot (see docs/plans/modular/new-step-sequencer.md).
  }
  showLoadLibraryModal.value = false
}

async function deletePatternFromLibrary(patternId) {
  if (!authStore.user) return
  try {
    const uid = authStore.user.uid
    const docRef = doc(db, 'users', uid, 'sequences', patternId)
    await deleteDoc(docRef)
    await fetchLibraryPatterns()
  } catch (err) {
    console.error('Failed to delete pattern:', err)
  }
}

watch(numSteps, (newVal) => {
  if (!newVal || isNaN(newVal)) return
  const targetLen = Math.max(2, Math.min(64, Number(newVal)))
  const currentSteps = [...steps.value]
  const oldLen = currentSteps.length
  
  if (oldLen === targetLen) return
  
  if (oldLen < targetLen) {
    // Create new steps by repeating the existing pattern (tiling)
    // We use basePatternLength instead of oldLen to handle slider intermediate steps correctly
    const additional = []
    const tileBase = basePatternLength.value || oldLen
    
    for (let i = oldLen; i < targetLen; i++) {
      const sourceStep = currentSteps[i % tileBase] || DEFAULT_STEP
      additional.push(JSON.parse(JSON.stringify(sourceStep)))
    }
    steps.value = [...currentSteps, ...additional]
  } else {
    steps.value = currentSteps.slice(0, targetLen)
  }

  // Debounce updating the base pattern length so intermediate slider values don't break tiling
  if (baseLengthTimer) clearTimeout(baseLengthTimer)
  baseLengthTimer = setTimeout(() => {
    basePatternLength.value = targetLen
  }, 800)
})

watch([
  numSteps, steps, param1CC, param2CC, param1Variation, param2Variation,
  selectedOctave, octaveRange, () => props.globalTranspose, () => props.bpm,
  dynamicMidiTranspose, selectedKey, selectedScale, selectedStyle,
  genDensity, chordsEnabled, maxPolyphony, chordDensity
], () => {
  const config = { 
    numSteps: numSteps.value, 
    steps: steps.value, 
    param1CC: param1CC.value, 
    param2CC: param2CC.value,
    param1Variation: param1Variation.value,
    param2Variation: param2Variation.value,
    selectedOctave: selectedOctave.value,
    octaveRange: octaveRange.value,
    transpose: props.globalTranspose || 0,
    bpm: props.bpm || 120,
    selectedKey: selectedKey.value,
    selectedScale: selectedScale.value,
    selectedStyle: selectedStyle.value,
    genDensity: genDensity.value,
    chordsEnabled: chordsEnabled.value,
    maxPolyphony: maxPolyphony.value,
    chordDensity: chordDensity.value
  }
  seqStateStorage.value = config
  midiStore.sendCC(77, Math.max(0, Math.min(127, (props.globalTranspose || 0) + 64)), props.channel)
  syncLocalToBank()

  // Sync live playback state immediately
  if (playStateRef.current) {
    const pb = seqStore.playbackSteps
    playStateRef.current.steps = pb.steps
    playStateRef.current.numSteps = pb.numSteps
    playStateRef.current.chainSlotIndices = pb.chainSlotIndices
    playStateRef.current.bankIndices = pb.bankIndices
    playStateRef.current.localIndices = pb.localIndices
    playStateRef.current.bpm = props.bpm || 120
    playStateRef.current.param1CC = param1CC.value
    playStateRef.current.param2CC = param2CC.value
    playStateRef.current.transpose = props.globalTranspose || 0
    playStateRef.current.channel = props.channel
    playStateRef.current.dynamicMidiTranspose = dynamicMidiTranspose.value
  }
}, { deep: true })

watch(() => props.bpm, (bpm) => {
  getTransport().bpm.value = bpm
  midiStore.setBpm(bpm)
})

watch(swingAmount, (val) => {
  getTransport().swing = val / 100
  getTransport().swingSubdivision = '16n'
})

function generateSequence() {
  const styleCfg = STYLES[selectedStyle.value]
  const keyIdx = NOTE_NAMES.indexOf(selectedKey.value)
  const scaleIntervals = SCALES[selectedScale.value] ?? SCALES['Major']

  const octMin = octaveRange.value >= 0 ? selectedOctave.value : selectedOctave.value + octaveRange.value
  const octMax = octaveRange.value >= 0 ? selectedOctave.value + octaveRange.value : selectedOctave.value
  const finalOctMin = Math.max(0, Math.min(8, octMin))
  const finalOctMax = Math.max(0, Math.min(8, octMax))

  if (chordsEnabled.value) {
    const progressions = STYLE_PROGRESSIONS[selectedStyle.value] ?? [[0, 3, 4, 0]]
    const baseProgression = progressions[Math.floor(Math.random() * progressions.length)]
    const effectiveDensity = genDensity.value === 100 ? numSteps.value : Math.max(1, Math.round(numSteps.value * (genDensity.value / 100)))
    const segSize = numSteps.value / effectiveDensity
    const avgGateFactor = (styleCfg.gateMin + styleCfg.gateMax) / 200

    const onsetPositions = Array.from({ length: effectiveDensity }, (_, c) =>
      Math.min(Math.round(c * segSize), numSteps.value - 1)
    )
    const onsetSet = new Set(onsetPositions)

    steps.value = Array(numSteps.value).fill(null).map((_, i) => {
      if (!onsetSet.has(i)) return { ...DEFAULT_STEP, active: false, octave: selectedOctave.value }

      const chordIdx = onsetPositions.indexOf(i)
      const octave = finalOctMin + Math.floor(Math.random() * (finalOctMax - finalOctMin + 1))
      const scaleDegree = baseProgression[chordIdx % baseProgression.length] % scaleIntervals.length
      const notes = buildChordNotes(scaleDegree, scaleIntervals, keyIdx, octave, maxPolyphony.value)

      const velRange = styleCfg.velMax - styleCfg.velMin
      const velocity = styleCfg.velMin + Math.floor(Math.random() * (velRange + 1))

      const nextOnset = chordIdx < effectiveDensity - 1 ? onsetPositions[chordIdx + 1] : numSteps.value
      const thisSpan = nextOnset - i
      const sustainSteps = Math.round(thisSpan * avgGateFactor)
      const tieSteps = Math.max(0, sustainSteps + (Math.floor(Math.random() * 3) - 1) - 1)

      return { ...DEFAULT_STEP, active: true, notes, octave, velocity, gate: 90, tieSteps, param1Value: Math.floor(Math.random() * 128), param2Value: Math.floor(Math.random() * 128), edited: true }
    })
  } else {
    const numActive = Math.round(numSteps.value * (genDensity.value / 100))
    const allIndices = Array.from({ length: numSteps.value }, (_, i) => i)
    for (let i = allIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allIndices[i], allIndices[j]] = [allIndices[j], allIndices[i]];
    }
    const activeIndices = new Set(allIndices.slice(0, numActive))

    steps.value = Array(numSteps.value).fill(null).map((_, i) => {
      const active = activeIndices.has(i)
      const accentHit = styleCfg.accentGrid ? styleCfg.accentGrid[i % styleCfg.accentGrid.length] : false
      let notes = [60]
      let octave = selectedOctave.value
      if (active) {
        octave = finalOctMin + Math.floor(Math.random() * (finalOctMax - finalOctMin + 1))
        const rootMidi = (octave + 1) * 12 + keyIdx
        const interval = scaleIntervals[Math.floor(Math.random() * scaleIntervals.length)]
        notes = [rootMidi + interval]
      }
      const velRange = styleCfg.velMax - styleCfg.velMin
      let velocity = active ? styleCfg.velMin + Math.floor(Math.random() * (velRange + 1)) : 0
      if (active && accentHit) velocity = Math.min(127, Math.floor(velocity * 1.15))
      const gateRange = styleCfg.gateMax - styleCfg.gateMin
      const gate = active ? styleCfg.gateMin + Math.floor(Math.random() * (gateRange + 1)) : 0
      const tieSteps = active && styleCfg.slideProbability && Math.random() < styleCfg.slideProbability ? 1 : 0
      
      const p1BaseVal = getPresetValueForCC(param1CC.value)
      const p1VarFactor = param1Variation.value / 100
      const p1Variation = Math.random() * p1VarFactor
      const param1Value = Math.max(0, Math.min(127, Math.round(p1BaseVal + (p1BaseVal * p1Variation))))

      const p2BaseVal = getPresetValueForCC(param2CC.value)
      const p2VarFactor = param2Variation.value / 100
      const p2Variation = Math.random() * p2VarFactor
      const param2Value = Math.max(0, Math.min(127, Math.round(p2BaseVal + (p2BaseVal * p2Variation))))

      return { ...DEFAULT_STEP, active, notes, octave, velocity, gate, tieSteps, param1Value, param2Value, edited: active }
    })
  }
  basePatternLength.value = numSteps.value
}

function duplicateLength() {
  const next = Math.min(props.seqStepsLimit || 16, numSteps.value * 2)
  if (next !== numSteps.value) {
    const currentSteps = [...steps.value]
    const additional = []
    const tileBase = basePatternLength.value || currentSteps.length
    for (let i = currentSteps.length; i < next; i++) {
      const sourceStep = currentSteps[i % tileBase] || DEFAULT_STEP
      additional.push(JSON.parse(JSON.stringify(sourceStep)))
    }
    steps.value = [...currentSteps, ...additional]
    numSteps.value = next
    basePatternLength.value = next
  }
}

function reduceLength() {
  const next = Math.max(2, Math.round(numSteps.value / 2))
  if (next !== numSteps.value) {
    steps.value = steps.value.slice(0, next)
    numSteps.value = next
    basePatternLength.value = next
  }
}

function updateStep(idx, updates) {
  const current = steps.value[idx]
  const hasChanges = Object.keys(updates).some(k => k !== 'active' && updates[k] !== current[k])
  
  steps.value[idx] = { 
    ...current, 
    ...updates,
    ...(hasChanges ? { edited: true } : {})
  }
  steps.value = [...steps.value]
}

function clearStep(idx) {
  steps.value[idx] = { ...DEFAULT_STEP }
  steps.value = [...steps.value]
}

// ── 12-note-bar grid (Sequencer2's click-to-program note input) ────────────
// `notes` (absolute MIDI numbers) stays the single source of truth for
// playback — a bar's lit/unlit state is derived from it, not tracked
// separately, so there's no risk of the grid and the engine disagreeing.
function stepMidiNote(step, semitoneIdx) {
  return (step.octave + 1) * 12 + semitoneIdx
}

function isNoteBarActive(step, semitoneIdx) {
  return step.notes.includes(stepMidiNote(step, semitoneIdx))
}

function toggleNoteBar(idx, semitoneIdx) {
  const step = steps.value[idx]
  const midiNote = stepMidiNote(step, semitoneIdx)
  const has = step.notes.includes(midiNote)
  const notes = has ? step.notes.filter(n => n !== midiNote) : [...step.notes, midiNote].sort((a, b) => a - b)
  updateStep(idx, { notes, active: true, explicitNotes: true })
}

// Changing the octave stepper transposes whatever notes are already
// programmed on this step, so a chord's shape follows the visible grid
// instead of scrolling out of view.
function setStepOctave(idx, newOctave) {
  const step = steps.value[idx]
  const clamped = Math.max(0, Math.min(8, newOctave))
  if (clamped === step.octave) return
  const deltaSemitones = (clamped - step.octave) * 12
  const notes = step.notes.map(n => Math.max(0, Math.min(127, n + deltaSemitones)))
  updateStep(idx, { octave: clamped, notes })
}

function applyToAll(field, value) {
  steps.value = steps.value.map(s => ({ ...s, [field]: value }))
}
const getPresetValueForCC = (cc) => {
  if (!props.currentPresetCCValues) return 64;
  for (const [key, mapCc] of Object.entries(S1_CC_MAP)) {
    if (mapCc === cc) {
      const val = props.currentPresetCCValues[key];
      return val !== undefined ? val : 64;
    }
  }
  return 64;
}

function randomize(field) {
  steps.value = steps.value.map(s => {
    let newVal = s[field]
    if (field === 'velocity') newVal = Math.floor(Math.random() * 127) + 1
    else if (field === 'gate') newVal = Math.floor(Math.random() * 101)
    else if (field === 'param1Value') {
      const varFactor = param1Variation.value / 100
      const variation = Math.random() * varFactor
      const baseVal = getPresetValueForCC(param1CC.value)
      newVal = Math.max(0, Math.min(127, Math.round(baseVal + (baseVal * variation))))
    }
    else if (field === 'param2Value') {
      const varFactor = param2Variation.value / 100
      const variation = Math.random() * varFactor
      const baseVal = getPresetValueForCC(param2CC.value)
      newVal = Math.max(0, Math.min(127, Math.round(baseVal + (baseVal * variation))))
    }
    return { ...s, [field]: newVal }
  })
}

function exportMidi() {
  const ppq = 480
  const ticksPerStep = ppq / 4 // 16th note
  const trackEvents = []
  let lastTick = 0

  // Add Tempo Meta Event
  const tempo = Math.round(60000000 / props.bpm)
  trackEvents.push(0, 0xFF, 0x51, 0x03, (tempo >> 16) & 0xFF, (tempo >> 8) & 0xFF, tempo & 0xFF)

  const activeNotes = [] // { note, offTick }

  steps.value.forEach((step, i) => {
    const currentTick = i * ticksPerStep
    
    if (step.active) {
      const gateTicks = Math.floor(ticksPerStep * (step.gate / 100))
      const durationTicks = gateTicks + (step.tieSteps * ticksPerStep)
      const offTick = currentTick + durationTicks

      step.notes.forEach(n => {
        const note = Math.max(0, Math.min(127, n + (props.globalTranspose || 0)))
        
        // Note On
        const delta = currentTick - lastTick
        writeVLQ(delta, trackEvents)
        trackEvents.push(0x90 | (props.channel - 1), note, step.velocity)
        lastTick = currentTick
        
        activeNotes.push({ note, offTick })
      })
    }

    // Process Note Offs that should happen before or at the start of next step
    // But since we want accurate timing, we'll sort all events at the end.
  })

  // Actually, a better approach for MIDI export with overlaps:
  // 1. Create a list of events with absolute ticks: { tick, type, data }
  // 2. Sort by tick
  // 3. Convert to delta times
  
  const events = []
  // Tempo
  events.push({ tick: 0, bytes: [0xFF, 0x51, 0x03, (tempo >> 16) & 0xFF, (tempo >> 8) & 0xFF, tempo & 0xFF] })
  
  steps.value.forEach((step, i) => {
    if (!step.active) return
    const startTick = i * ticksPerStep
    const gateTicks = Math.floor(ticksPerStep * (step.gate / 100))
    const durationTicks = Math.max(10, gateTicks + (step.tieSteps * ticksPerStep))
    const endTick = startTick + durationTicks
    
    step.notes.forEach(n => {
      const note = Math.max(0, Math.min(127, n + (props.globalTranspose || 0)))
      events.push({ tick: startTick, bytes: [0x90 | (props.channel - 1), note, step.velocity] })
      events.push({ tick: endTick, bytes: [0x80 | (props.channel - 1), note, 0] })
    })
  })
  
  // Sort events by tick, then Note Offs before Note Ons if ticks are equal
  events.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick
    return (a.bytes[0] & 0xF0) === 0x80 ? -1 : 1
  })
  
  const finalTrackData = []
  let prevTick = 0
  events.forEach(ev => {
    writeVLQ(ev.tick - prevTick, finalTrackData)
    finalTrackData.push(...ev.bytes)
    prevTick = ev.tick
  })
  
  // End of Track
  writeVLQ(0, finalTrackData)
  finalTrackData.push(0xFF, 0x2F, 0x00)

  // Construction
  const header = [
    0x4D, 0x54, 0x68, 0x64, // MThd
    0x00, 0x00, 0x00, 0x06, // Length
    0x00, 0x00,             // Format 0
    0x00, 0x01,             // 1 Track
    (ppq >> 8) & 0xFF, ppq & 0xFF // Division
  ]
  
  const trackHeader = [
    0x4D, 0x54, 0x72, 0x6B, // MTrk
    (finalTrackData.length >> 24) & 0xFF,
    (finalTrackData.length >> 16) & 0xFF,
    (finalTrackData.length >> 8) & 0xFF,
    finalTrackData.length & 0xFF
  ]
  
  const blob = new Blob([new Uint8Array([...header, ...trackHeader, ...finalTrackData])], { type: 'audio/midi' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const name = `${selectedStyle.value || 'Pattern'}-${selectedKey.value || 'C'}-${selectedScale.value || 'Major'}` 
  a.href = url

  a.download = `SYCORE_Sequence_${name}.mid`
  a.click()
  URL.revokeObjectURL(url)
}

function writeVLQ(value, array) {
  let buffer = value & 0x7F
  while ((value >>= 7) > 0) {
    buffer <<= 8
    buffer |= 0x80
    buffer |= (value & 0x7F)
  }
  while (true) {
    array.push(buffer & 0xFF)
    if (buffer & 0x80) buffer >>= 8
    else break
  }
}

const allS1Params = computed(() => {
  return Object.entries(S1_CC_MAP)
    .map(([cc, name]) => ({
      cc: parseInt(cc),
      label: name.replace(/([A-Z])/g, ' $1').toUpperCase()
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
})

const mappingOpts = computed(() => {
  if (!props.midiMappings) return []
  const _nameToCC = {}
  Object.entries(S1_CC_MAP).forEach(([cc, name]) => { _nameToCC[name] = parseInt(cc) })
  return [...new Set(Object.values(props.midiMappings))]
    .map(name => ({ cc: _nameToCC[name], label: `${name.toUpperCase()} · CC${_nameToCC[name]}` }))
    .filter((o) => o.cc !== undefined)
})

onMounted(() => {
  getTransport().bpm.value = props.bpm

  // No 'sequencer-action'/'toggle-sequencer' window listeners here — those are
  // the legacy AppAction-driven remote-control channel for the original
  // StepSequencer only (see docs/plans/modular/new-step-sequencer.md's scoping
  // notes). Every setting they touched has its own on-screen control here, and
  // Play/Stop's own sync-transport behavior already lives in the
  // watch(isPlaying, ...) below, which the panel's own Play/Stop button
  // already triggers.

  // 'toggle-sequencer2' is its own, narrower channel: just the "Sync Apps to
  // Transport" fan-out (TransportBar.vue's dropdown → useGlobalTransportControls'
  // playAll/stopAll), distinct from the legacy 'toggle-sequencer' channel above.
  // No skipBackingTrackSync-style guard needed — nothing but Play All/Stop All
  // dispatches this event, so there's no bidirectional loop to break.
  const handleToggle2 = (e) => {
    const play = e.detail?.play
    isPlaying.value = play === undefined ? !isPlaying.value : play
  }
  window.addEventListener('toggle-sequencer2', handleToggle2)

  const isMidiDeviceAllowed = (chan, inputId, note) => {
    if (!inputId) return true

    const inputDevice = midiService.getInputs().find(i => i.id === inputId)
    if (!inputDevice) {
      if (window.SY_LOG) window.SY_LOG(`[Seq Ingress] Input device not found for ID: ${inputId}`)
      return false
    }

    const deviceName = inputDevice.name
    
    const normalizeName = (name) => {
      if (!name) return ''
      return name.toLowerCase()
        .replace(/^(1-|2-|midi\s+|usb\s+|port\s+)/i, '')
        .replace(/(midi\s+port|midi\s+in|midi\s+out)$/i, '')
        .trim()
    }

    const normDevice = normalizeName(deviceName)

    // 1. Basic config checks (if exists in registrations)
    const config = Object.entries(midiStore.routingConfig?.registrations || {}).find(([key]) => {
      const normKey = normalizeName(key)
      return normKey === normDevice || normKey.includes(normDevice) || normDevice.includes(normKey)
    })?.[1]

    if (config) {
      if (!config.inEnabled) {
        if (window.SY_LOG) window.SY_LOG(`[Seq Ingress] Blocked ${deviceName} (inEnabled=false)`)
        return false
      }
      if (config.inChannel !== -1 && config.inChannel !== chan) {
        if (window.SY_LOG) window.SY_LOG(`[Seq Ingress] Blocked ${deviceName} (channel mismatch: expected ${config.inChannel}, got ${chan})`)
        return false
      }
    }

    // 2. MIDI FLOW device→app input routing (replaces the old output-matrix-
    // overlap heuristic — see docs/plans/modular/MIDI-Flow-Control.md).
    // Deliberately does NOT fail open, unlike most other apps' device gates
    // — Sequencer having its OUT wired to an instrument doesn't imply
    // anything about its IN, and an unwired IN must stay silent rather than
    // accepting whatever device happens to be sending MIDI. Two checks are
    // needed, not just isDeviceRoutedToApp: that function's own fail-open
    // default is "unwired anywhere = open to everyone" (right for one-shot
    // actions like the Virtual Keyboard, wrong here — see its comment in
    // useMidiStore.ts), so hasExplicitInputRouting is required in addition,
    // matching canAutoStart below and Note Latch's own convention.
    if (!midiStore.hasExplicitInputRouting(deviceName) || !midiStore.isDeviceRoutedToApp(deviceName, MidiSource.SEQUENCER2, note)) {
      if (window.SY_LOG) {
        window.SY_LOG(`[Seq Ingress] Blocked ${deviceName} (not routed to Sequencer in MIDI Flow)`)
      }
      return false
    }

    return true
  }

  // Gate for MIDI FLOW app-to-app routing (e.g. Chord Sequencer OUT → Step
  // Sequencer IN) — the app-source counterpart to isMidiDeviceAllowed,
  // which is device-specific (registrations/inChannel don't apply to an
  // app source). Same no-fail-open convention as above.
  function isAppSourceAllowed(sourceApp, note) {
    return midiStore.hasExplicitInputRouting(sourceApp) && midiStore.isDeviceRoutedToApp(sourceApp, MidiSource.SEQUENCER2, note)
  }

  // Auto-starting the sequencer's own transport is a higher-stakes action than
  // just sounding a note, so — unlike isMidiDeviceAllowed/isAppSourceAllowed
  // above — this does NOT fail open in broadcast mode. It requires an explicit
  // MIDI Flow routing entry for the source, mirroring the same guard applied to
  // ChordProgSequencer.vue and DrumMachine.vue.
  function canAutoStart(sourceApp, inputId) {
    const sourceKey = sourceApp || midiService.getInputs().find(i => i.id === inputId)?.name
    return !!sourceKey && midiStore.hasExplicitInputRouting(sourceKey)
  }

  const handleIncomingNote = (type, note, velocity, chan, inputId, sourceApp) => {
    if (window.SY_LOG) {
      window.SY_LOG(`[Seq Ingress] Note received: type=${type}, note=${note}, velocity=${velocity}, chan=${chan}, inputId=${inputId || 'null'}, sourceApp=${sourceApp || 'null'}, isOpen=${props.isOpen}, isPlaying=${isPlaying.value}, isRecording=${isRecording.value}, selectedStepIdx=${selectedStepIdx.value}`)
    }
    const allowed = sourceApp ? isAppSourceAllowed(sourceApp, note) : isMidiDeviceAllowed(chan, inputId, note)

    // When the panel is closed: still handle auto-start and transposition (no
    // preset-linking concept here — see docs/plans/modular/new-step-sequencer.md's
    // scoping notes — so this simply stays reachable any time a routed device sends notes).
    if (!props.isOpen) {
      if (!isRecording.value && allowed) {
        if (type === 'on' && velocity > 0) {
          if (!isPlaying.value && uiStore.seqAutoStart) {
            if (canAutoStart(sourceApp, inputId)) {
              dynamicMidiTranspose.value = note - sequenceRootMidi.value
              isPlaying.value = true
            }
          } else if (isPlaying.value) {
            dynamicMidiTranspose.value = note - sequenceRootMidi.value
          }
        }
      }
      return
    }

    // MIDI Performance routing matrix checks
    if (!allowed) {
      if (window.SY_LOG) {
        window.SY_LOG(`[Seq Ingress] Note blocked: ${sourceApp ? 'isAppSourceAllowed' : 'isMidiDeviceAllowed'} returned false`)
      }
      return
    }

    // Live overdub recording during PLAY + RECORD mode
    if (isPlaying.value && isRecording.value) {
      const isNoteOn = (type === 'on' && velocity > 0)
      const isNoteOff = (type === 'off' || (type === 'on' && velocity === 0))

      if (isNoteOn) {
        // 1. Make the note audible immediately
        midiStore.sendNoteOn(note, velocity, props.channel || 1, MidiSource.SEQUENCER2)

        // 2. Record it onto the currently active play step (overdub/overwrite)
        const stepIdx = currentStep.value
        const pb = seqStore.playbackSteps
        const bankIdx = pb.bankIndices?.[stepIdx]
        const localIdx = pb.localIndices?.[stepIdx]
        const targetBank = bankIdx !== undefined ? seqStore.banks[bankIdx] : null
        const targetSteps = targetBank ? targetBank.steps : steps.value
        const targetStepIdx = localIdx !== undefined ? localIdx : stepIdx
        if (stepIdx !== null && stepIdx >= 0 && targetStepIdx >= 0 && targetStepIdx < targetSteps.length) {
          const currentStepObj = targetSteps[targetStepIdx]
          let newNotes = []

          if (lastLiveRecordStepRef.value === stepIdx) {
            newNotes = [...(currentStepObj.notes || [])]
            if (!newNotes.includes(note)) {
              newNotes.push(note)
            }
          } else {
            newNotes = [note]
            lastLiveRecordStepRef.value = stepIdx
          }
          newNotes.sort((a, b) => a - b)

          const updates = {
            active: true,
            notes: newNotes,
            velocity: velocity,
            edited: true,
            explicitNotes: true
          }
          if (!currentStepObj.gate || currentStepObj.gate === 0) {
            updates.gate = 50
          }
          if (targetBank && bankIdx !== seqStore.activeBankIndex) {
            targetSteps[targetStepIdx] = { ...targetSteps[targetStepIdx], ...updates }
            seqStore.banks = [...seqStore.banks]
          } else {
            updateStep(targetStepIdx, updates)
          }
        }
      } else if (isNoteOff) {
        // Make the note-off audible immediately
        midiStore.sendNoteOff(note, 0, props.channel || 1, MidiSource.SEQUENCER2)
      }
      return
    }
    
    // Dynamic transposition during PLAY mode (not recording)
    if (isPlaying.value && !isRecording.value) {
      if (type === 'on' && velocity > 0) {
        dynamicMidiTranspose.value = note - sequenceRootMidi.value
      }
      return
    }

    // Auto-start when panel is open but sequencer not yet running
    if (!isPlaying.value && !isRecording.value && uiStore.seqAutoStart) {
      if (type === 'on' && velocity > 0 && canAutoStart(sourceApp, inputId)) {
        dynamicMidiTranspose.value = note - sequenceRootMidi.value
        isPlaying.value = true
      }
      return
    }

    // Step modification is strictly enabled only when in RECORD mode
    if (!isRecording.value) return

    const isNoteOn = (type === 'on' && velocity > 0)
    const isNoteOff = (type === 'off' || (type === 'on' && velocity === 0))

    if (isNoteOn && selectedStepIdx.value !== null) {
      // If we were not holding any notes, this starts a new step chord recording
      if (currentlyHeldNotes.value.size === 0) {
        recordedNotesForCurrentStep.value = [note]
      } else {
        // Otherwise, append to the active step chord
        if (!recordedNotesForCurrentStep.value.includes(note)) {
          recordedNotesForCurrentStep.value.push(note)
        }
      }
      
      currentlyHeldNotes.value.add(note)
      recordedNotesForCurrentStep.value.sort((a, b) => a - b)

      const currentStepObj = steps.value[selectedStepIdx.value]
      const updates = { 
        active: true, 
        notes: [...recordedNotesForCurrentStep.value], 
        velocity,
        explicitNotes: true
      }
      
      if (!currentStepObj.gate || currentStepObj.gate === 0) {
        updates.gate = 50
      }

      updateStep(selectedStepIdx.value, updates)
    } 
    else if (isNoteOff) {
      if (currentlyHeldNotes.value.has(note)) {
        currentlyHeldNotes.value.delete(note)
        
        // Once ALL notes are released, advance to the next step
        if (currentlyHeldNotes.value.size === 0 && selectedStepIdx.value !== null) {
          selectedStepIdx.value = (selectedStepIdx.value + 1) % numSteps.value
          recordedNotesForCurrentStep.value = []
        }
      }
    }
  }

  const handleIncomingCC = (cc, val, chan, inputId) => {
    if (!props.isOpen) return
    if (!isRecording.value) return

    // MIDI Performance routing matrix checks
    if (!isMidiDeviceAllowed(chan, inputId)) return

    const isP1 = (param1CC.value !== null && Number(cc) === Number(param1CC.value))
    const isP2 = (param2CC.value !== null && Number(cc) === Number(param2CC.value))
    if (!isP1 && !isP2) return

    let stepIdx = null
    let targetSteps = null
    let targetStepIdx = null
    if (isPlaying.value) {
      const pb = seqStore.playbackSteps
      const flatIdx = currentStep.value
      const bankIdx = pb.bankIndices?.[flatIdx]
      const localIdx = pb.localIndices?.[flatIdx]
      if (bankIdx !== undefined && localIdx !== undefined) {
        const bank = seqStore.banks[bankIdx]
        targetSteps = bank.steps
        targetStepIdx = localIdx
        stepIdx = localIdx
      }
    } else {
      stepIdx = selectedStepIdx.value
      targetSteps = steps.value
      targetStepIdx = stepIdx
    }

    if (stepIdx === null || stepIdx < 0 || !targetSteps || targetStepIdx === null || targetStepIdx < 0 || targetStepIdx >= targetSteps.length) {
      if (!isPlaying.value && window.SY_LOG) {
        window.SY_LOG(`[Seq CC Record] Blocked: select a step to lock CC#${cc} while sequencer is stopped`)
      }
      return
    }

    const currentStepObj = targetSteps[targetStepIdx]

    const updates = {}
    if (isP1) {
      updates.param1Value = val
    } else if (isP2) {
      updates.param2Value = val
    }
    updates.edited = true
    updates.active = true // Auto-activate step when parameter lock is recorded to ensure playback

    // If the step has no explicitly recorded notes from a MIDI NOTE message, keep notes empty
    if (!currentStepObj.explicitNotes) {
      updates.notes = []
    }

    if (isPlaying.value) {
      const flatIdx = currentStep.value
      const playingBankIdx = seqStore.playbackSteps.bankIndices?.[flatIdx]
      if (playingBankIdx !== undefined && playingBankIdx !== seqStore.activeBankIndex) {
        targetSteps[targetStepIdx] = { ...targetSteps[targetStepIdx], ...updates }
        seqStore.banks = [...seqStore.banks]
        if (window.SY_LOG) {
          window.SY_LOG(`[Seq CC Record] Step ${targetStepIdx + 1} locked ${isP1 ? 'P1' : 'P2'} (CC#${cc}) = ${val}`)
        }
        return
      }
    }
    updateStep(targetStepIdx, updates)
    if (window.SY_LOG) {
      window.SY_LOG(`[Seq CC Record] Step ${targetStepIdx + 1} locked ${isP1 ? 'P1' : 'P2'} (CC#${cc}) = ${val}`)
    }
  }

  const unsubNote = midiService.addNoteListener((type, note, velocity, chan, inputId) => {
    handleIncomingNote(type, note, velocity, chan, inputId)
  })

  // MIDI FLOW app-to-app routing — a separate pipeline from device input
  // above, since an app's generated notes never pass through a real MIDI
  // input port. sourceApp (6th arg) tells handleIncomingNote to gate via
  // isAppSourceAllowed instead of the device-based isMidiDeviceAllowed.
  //
  // Must ignore the sequencer's own notes regardless of routing state — if
  // Sequencer's OUT were ever cabled back into its own IN (directly, or via
  // a virtual instrument looped back), every note it schedules would
  // otherwise reach "Dynamic transposition during PLAY mode" below as if a
  // performer had played it, re-deriving dynamicMidiTranspose from the
  // *already-transposed* note it just sent — compounding the drift by a
  // fixed offset every loop. isAppSourceAllowed itself now requires an
  // explicit cable into Sequencer's IN (no broadcast-mode fail-open, see its
  // definition above), but this guard stays as a hard backstop against that
  // specific self-referencing cable case.
  const unsubAppNote = midiStore.addAppNoteListener((type, note, velocity, chan, sourceApp) => {
    if (sourceApp === MidiSource.SEQUENCER2) return
    handleIncomingNote(type, note, velocity, chan, null, sourceApp)
  })

  const unsubCC = midiService.addCCListener((cc, val, chan, inputId) => {
    handleIncomingCC(cc, val, chan, inputId)
  })

  const handleVirtualNote = (e) => {
    handleIncomingNote(e.detail.type, e.detail.note, e.detail.velocity, e.detail.chan)
  }
  window.addEventListener('virtual-midi-note', handleVirtualNote)

  return () => {
    midiService.isSequencerPlaying = false
    window.removeEventListener('virtual-midi-note', handleVirtualNote)
    window.removeEventListener('toggle-sequencer2', handleToggle2)
    unsubNote?.()
    unsubAppNote?.()
    unsubCC?.()
  }
})

watch(isPlaying, (playing) => {
  midiService.isSequencerPlaying = playing
  uiStore.isSequencerPlaying = playing

  if (syncTrack.value) {
    if (skipBackingTrackSync.value) {
      skipBackingTrackSync.value = false
    } else {
      window.dispatchEvent(new CustomEvent('toggle-backing-track', { detail: { play: playing, restart: playing } }))
    }
  }

  if (midiStore.syncSequencerTransport) {
    if (midiStore.isTransportPlaying !== playing) {
      if (playing) midiStore.sendStart()
      else midiStore.sendStop()
    }
  }

  if (!playing) {
    dynamicMidiTranspose.value = 0
    transportManager.releaseTransport()
    if (repeatEventIdRef.value !== null) {
      getTransport().clear(repeatEventIdRef.value)
      repeatEventIdRef.value = null
    }

    if (fadeOutIntervalRef.value !== null) {
      clearInterval(fadeOutIntervalRef.value)
      fadeOutIntervalRef.value = null
    }

    // 1. Clear all active note-off timeouts
    activeTimeouts.value.forEach(id => clearTimeout(id))
    activeTimeouts.value = []

    // 2. Send Note Off for all active MIDI notes immediately
    activeMidiNotes.value.forEach(key => {
      const [noteStr, chanStr] = key.split('-')
      const note = parseInt(noteStr)
      const chan = parseInt(chanStr)
      midiStore.sendNoteOff(note, 0, chan, MidiSource.SEQUENCER2)
    })
    activeMidiNotes.value.clear()

    if (midiStore.syncSequencerTransport) midiStore.sendStop()
    midiStore.allNotesOff(props.channel)

    // Ensure Expression CC#11 is fully open at 127 immediately
    midiStore.sendCC(11, 127, props.channel, MidiSource.SEQUENCER2)

    emit('stop')
    currentStep.value = 0
    seqStore.playingChainIndex = null
    seqStore.playingBankIndex = null
    lastFollowedBank = -1
  } else {
    if (fadeOutIntervalRef.value !== null) {
      clearInterval(fadeOutIntervalRef.value)
      fadeOutIntervalRef.value = null
      midiStore.sendCC(11, 127, props.channel, MidiSource.SEQUENCER2)
    }

    let stepCounter = 0

    toneStart().then(() => {
      getTransport().bpm.value = props.bpm
      midiStore.setBpm(props.bpm)
      if (midiStore.syncSequencerTransport) midiStore.sendStart()

      repeatEventIdRef.value = getTransport().scheduleRepeat((time) => {
        const state = playStateRef.current
        if (!state.isPlaying) return
        stepCounter = stepCounter % state.steps.length
        const stepIdx = stepCounter
        stepCounter = (stepCounter + 1) % state.steps.length
        const step = state.steps[stepIdx]

        const bankIdx = state.bankIndices?.[stepIdx]
        const chainSlotIdx = state.chainSlotIndices?.[stepIdx]
        if (chainSlotIdx !== undefined) {
          seqStore.playingBankIndex = bankIdx ?? null
          seqStore.playingChainIndex = chainSlotIdx ?? null
        }

        // Probability: roll once per pass — a miss skips this step's CC/notes
        // entirely for this loop but the playhead still advances normally
        // below (standard Elektron/Ableton-style step probability).
        const probabilityHit = step.probability == null || Math.random() * 100 < step.probability

        if (step.active && probabilityHit) {
          if (state.param1CC !== null) midiStore.sendCC(state.param1CC, step.param1Value, state.channel, MidiSource.SEQUENCER2)
          if (state.param2CC !== null) midiStore.sendCC(state.param2CC, step.param2Value, state.channel, MidiSource.SEQUENCER2)

          const stepDurationMs = 60000 / (state.bpm * 4)
          let noteDurationMs = stepDurationMs * (step.gate / 100)
          if (step.tieSteps > 0) noteDurationMs += stepDurationMs * Math.min(step.tieSteps, state.steps.length - 1)
          noteDurationMs = Math.max(noteDurationMs, 10)

          // Accent boosts velocity the same way the style generator's own
          // accentGrid already does (see generateSequence() below).
          const velocity = step.accent ? Math.min(127, Math.floor(step.velocity * 1.15)) : step.velocity

          step.notes.forEach(note => {
            const clampedNote = Math.max(0, Math.min(127, note + state.transpose + (state.dynamicMidiTranspose || 0)))
            midiStore.sendNoteOn(clampedNote, velocity, state.channel, MidiSource.SEQUENCER2)
            
            const noteKey = `${clampedNote}-${state.channel}`
            activeMidiNotes.value.add(noteKey)

            const timeoutId = window.setTimeout(() => {
              midiStore.sendNoteOff(clampedNote, 0, state.channel, MidiSource.SEQUENCER2)
              activeMidiNotes.value.delete(noteKey)
              activeTimeouts.value = activeTimeouts.value.filter(id => id !== timeoutId)
            }, noteDurationMs)
            activeTimeouts.value.push(timeoutId)
          })
        }

        getDraw().schedule(() => {
          currentStep.value = stepIdx
          playStateRef.current.currentStep = stepIdx
          followChainPlayback(stepIdx)
        }, time)
      }, '16n', transportManager.isRunning.value && syncStore.syncSequencer2ToTransport.value ? transportManager.getNextBarPosition() : undefined)

      transportManager.acquireTransport()
    })
  }

  const pb = seqStore.playbackSteps
  playStateRef.current = {
    isPlaying: playing,
    currentStep: currentStep.value,
    steps: pb.steps,
    numSteps: pb.numSteps,
    chainSlotIndices: pb.chainSlotIndices,
    bankIndices: pb.bankIndices,
    localIndices: pb.localIndices,
    bpm: props.bpm,
    channel: props.channel,
    param1CC: param1CC.value !== null ? Number(param1CC.value) : null,
    param2CC: param2CC.value !== null ? Number(param2CC.value) : null,
    transpose: props.globalTranspose || 0,
    dynamicMidiTranspose: dynamicMidiTranspose.value
  }
})

watch(isPlaying, (playing) => {
  if (playing) {
    const tick = () => {
      const pos = String(getTransport().position).split('.')[0].split(':')
      transportPosition.value = `${parseInt(pos[0]) + 1}:${parseInt(pos[1]) + 1}:${parseInt(pos[2]) + 1}`
      rafRef.value = requestAnimationFrame(tick)
    }
    rafRef.value = requestAnimationFrame(tick)
  } else {
    if (rafRef.value !== null) { cancelAnimationFrame(rafRef.value); rafRef.value = null }
    transportPosition.value = '1:1:1'
  }
})

watch(() => midiStore.isTransportPlaying, (isPlayingMIDI) => {
  if (midiStore.syncSequencerTransport) {
    if (isPlaying.value !== isPlayingMIDI) {
      isPlaying.value = isPlayingMIDI
    }
  }
})

onUnmounted(() => {
  transportManager.releaseTransport()
  if (repeatEventIdRef.value !== null) {
    getTransport().clear(repeatEventIdRef.value)
  }
  if (fadeOutIntervalRef.value !== null) {
    clearInterval(fadeOutIntervalRef.value)
  }
  if (rafRef.value !== null) {
    cancelAnimationFrame(rafRef.value)
  }

  // Clear timeouts
  activeTimeouts.value.forEach(id => clearTimeout(id))
  activeTimeouts.value = []

  // Send Note Offs
  activeMidiNotes.value.forEach(key => {
    const [noteStr, chanStr] = key.split('-')
    const note = parseInt(noteStr)
    const chan = parseInt(chanStr)
    midiStore.sendNoteOff(note, 0, chan, MidiSource.SEQUENCER2)
  })
  activeMidiNotes.value.clear()
})
const handleKeyNudge = (stepField, e) => {
  if (selectedStepIdx.value === null) return;
  const step = steps.value[selectedStepIdx.value];
  if (!step || !step.active) return;

  const isUp = e.key === 'ArrowUp' || e.key === 'ArrowRight';
  const isDown = e.key === 'ArrowDown' || e.key === 'ArrowLeft';
  
  if (!isUp && !isDown) return;
  
  e.preventDefault();
  const delta = isUp ? 1 : -1;
  const multiplier = e.shiftKey ? 10 : 1;
  
  if (stepField === 'velocity') {
    step.velocity = Math.max(1, Math.min(127, step.velocity + delta * multiplier));
  } else if (stepField === 'gate') {
    step.gate = Math.max(0, Math.min(100, step.gate + delta * multiplier));
  } else if (stepField === 'tieSteps') {
    step.tieSteps = Math.max(0, Math.min(16, step.tieSteps + delta));
  } else if (stepField === 'param1Value') {
    step.param1Value = Math.max(0, Math.min(127, step.param1Value + delta * multiplier));
  } else if (stepField === 'param2Value') {
    step.param2Value = Math.max(0, Math.min(127, step.param2Value + delta * multiplier));
  }
};

const confirmClear = ref(false)
const clearTimer = ref(null)

// No preset-linking (LINK/UNLINK/RELOAD) here — Sequencer2 persists purely via
// its own local seqStateStorage autosave and the Save/Load Library feature
// below, both independent of any preset. See
// docs/plans/modular/new-step-sequencer.md's scoping notes.

function handleClear() {
  if (!confirmClear.value) {
    confirmClear.value = true
    if (clearTimer.value) window.clearTimeout(clearTimer.value)
    clearTimer.value = window.setTimeout(() => {
      confirmClear.value = false
    }, 3000)
    return
  }
  
  // Confirmed
  steps.value = Array(numSteps.value).fill(null).map(() => ({ ...DEFAULT_STEP }))
  confirmClear.value = false
  if (clearTimer.value) {
    window.clearTimeout(clearTimer.value)
    clearTimer.value = null
  }
}

let generateHidden = ref(false)
</script>

<template>
  <div v-show="isOpen && !isMinimized"
    class="fixed bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden select-none"
    :style="panelStyle"
    @mousedown.capture="bringToFront"
  >
    <div @mousedown.stop="e => onResizeStart(e, 'n')"  class="absolute top-0    left-3  right-3  h-1.5  cursor-n-resize  z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 's')"  class="absolute bottom-0 left-3  right-3  h-1.5  cursor-s-resize  z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 'e')"  class="absolute top-3 bottom-3   right-0  w-1.5  cursor-e-resize  z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 'w')"  class="absolute top-3 bottom-3   left-0   w-1.5  cursor-w-resize  z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 'se')" class="absolute bottom-0 right-0  w-4 h-4  cursor-se-resize z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 'sw')" class="absolute bottom-0 left-0   w-4 h-4  cursor-sw-resize z-50" />

    <div
      class="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-neutral-800 bg-gradient-to-r from-amber-950/70 to-transparent cursor-grab active:cursor-grabbing"
      @mousedown.stop="onDragStart"
    >
      <div class="flex items-center gap-2 pointer-events-none">
        <div class="w-5 h-5 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
          <svg class="w-3 h-3 text-amber-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 4v2M16 4v2"/></svg>
        </div>
        <span class="text-[11px] font-black uppercase tracking-widest text-white">Sequencer</span>
      </div>
      <div class="flex-1" />
      <div class="flex items-center gap-1 pointer-events-auto">
        <MacOsButtons @close="emit('close')" @minimize="toggleMinimize" @maximize="maximize" />
      </div>
    </div>

    <div class="w-full m-auto h-full flex flex-col bg-neutral-900 shadow-2xl relative">
      
      <!-- ── HEADER: Compact & Responsive ── -->
      <div class="shrink-0 px-4 py-2 border-b border-neutral-800 bg-black/40 flex flex-col sm:flex-row items-center gap-3 justify-between">
        <div class="flex items-center gap-4 w-full sm:w-auto">
          <h2 class="text-base font-black uppercase tracking-tight text-synth-amber shrink-0">Sequencer</h2>
          
          <div class="flex items-center bg-black/60 border border-neutral-800 rounded-lg px-2 py-1 gap-3">
            <div class="flex items-center gap-1.5">
              <span class="text-[9px] text-neutral-500 font-mono">BPM</span>
              <input
                type="number"
                :value="bpm"
                @input="e => emit('bpmChange', Number(e.target.value))"
                class="w-10 bg-transparent text-synth-amber font-mono text-sm outline-none text-center"
              />
            </div>
            <div class="w-px h-3 bg-neutral-800" />
            <span class="text-3xl text-red-800 font-mono tabular-nums leading-none">
              {{ transportPosition }}
            </span>
          </div>

          <!-- Active Sound Info: Expanded with Nav -->
          <!-- <div v-if="currentSoundName" class="flex items-center gap-3 px-3 py-1 bg-black/40 rounded-lg border border-neutral-800/50 min-w-[180px]">
            <button @click="emit('prevSlot')" class="text-neutral-500 hover:text-synth-neon transition-colors">
              <ChevronLeft class="w-3.5 h-3.5" />
            </button>
            <div class="flex flex-col flex-1 min-w-0">
              <span class="text-[8px] font-mono text-neutral-500 uppercase tracking-widest leading-none">{{ currentCategory }}</span>
              <span class="text-[11px] font-bold text-emerald-400 uppercase truncate">{{ currentSoundName }}</span>
            </div>
            <button @click="emit('nextSlot')" class="text-neutral-500 hover:text-synth-neon transition-colors">
              <ChevronRight class="w-3.5 h-3.5" />
            </button>
          </div> -->

          <!-- A-F bank selector -->
          <div class="flex items-center bg-black/60 border border-neutral-800 rounded-lg p-0.5 font-mono text-[12px]">
            <span class="text-neutral-500 uppercase tracking-wider px-2 text-synth-amber">Patterns</span>
            <button
              v-for="(name, i) in BANK_NAMES" :key="name"
              @click="selectBank(i)"
              :class="['px-2.5 py-0.5 rounded font-bold transition-all uppercase tracking-wider', seqStore.activeBankIndex === i ? 'bg-synth-amber text-black font-black shadow-[0_0_8px_rgba(0,255,136,0.3)]' : 'text-neutral-500 hover:text-white']"
            >
              {{ name }}
            </button>
          </div>

        </div>

        <div class="flex items-center gap-1.5 w-full sm:w-auto justify-end">
          <button @click="emit('openKeyboard')" 
            :class="['p-2 rounded-lg border transition-colors', isKeyboardOpen ? 'bg-synth-neon text-black border-synth-neon' : 'bg-black text-neutral-500 border-neutral-800']" title="Keyboard">
            <Piano class="w-4 h-4" />
          </button>

          <button @click="exportMidi"
            class="p-2 bg-neutral-800 text-synth-neon rounded-lg border border-neutral-700 hover:text-white transition-colors" title="Export MIDI">
            <Download class="w-4 h-4" />
          </button>

          <button v-if="authStore.user" @click="openLoadLibraryModal"
            class="p-2 bg-neutral-800 text-synth-neon rounded-lg border border-neutral-700 hover:text-white transition-colors" title="Load from Library">
            <FolderOpen class="w-4 h-4" />
          </button>

          <button v-if="authStore.user" @click="openSaveLibraryModal"
            class="p-2 bg-neutral-800 text-synth-neon rounded-lg border border-neutral-700 hover:text-white transition-colors" title="Save to Library">
            <FolderPlus class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- ── GENERATION SETTINGS ROW ── -->
      <div class="shrink-0 flex items-center gap-4 px-4 py-2 border-b border-neutral-900 bg-black/20">
        <div class="flex items-center gap-2">
          <span class="text-[12px] font-mono text-neutral-500 uppercase">Scale</span>
          <div class="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-neutral-800/50">
            <select v-model="selectedKey" class="bg-neutral-900 text-synth-amber font-bold text-[14px] uppercase px-1 outline-none border-r border-neutral-800 cursor-pointer [color-scheme:dark]">
              <option v-for="key in NOTE_NAMES" :key="key" :value="key" class="bg-neutral-900">{{ key }}</option>
            </select>
            <select v-model="selectedScale" class="bg-neutral-900 text-synth-amber font-bold text-[14px] uppercase px-1 outline-none cursor-pointer [color-scheme:dark]">
              <option v-for="scale in Object.keys(SCALES)" :key="scale" :value="scale" class="bg-neutral-900">{{ scale }}</option>
            </select>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-[12px] font-mono text-neutral-500 uppercase">Oct</span>
          <div class="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-neutral-800/50">
            <select v-model="selectedOctave" class="bg-neutral-900 text-synth-amber font-bold text-[14px] uppercase px-1 outline-none border-r border-neutral-800 cursor-pointer [color-scheme:dark]">
              <option v-for="o in [0,1,2,3,4,5,6,7,8]" :key="o" :value="o" class="bg-neutral-900">{{ o }}</option>
            </select>
            <select v-model="octaveRange" class="bg-neutral-900 text-synth-amber font-bold text-[14px] uppercase px-1 outline-none cursor-pointer [color-scheme:dark]">
              <option v-for="r in [-3,-2,-1,0,1,2,3]" :key="r" :value="r" class="bg-neutral-900">{{ r >= 0 ? '+' + r : r }}</option>
            </select>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-[12px] font-mono text-neutral-500 uppercase">Style</span>
          <select v-model="selectedStyle" class="bg-black/40 border border-neutral-800 text-synth-amber rounded-lg px-2 py-1 text-[14px] font-bold uppercase outline-none cursor-pointer [color-scheme:dark]">
            <option v-for="style in Object.keys(STYLES)" :key="style" :value="style" class="bg-neutral-900">{{ style }}</option>
          </select>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-[12px] font-mono text-neutral-500 uppercase">Density</span>
          <div class="flex items-center gap-3 bg-black/40 border border-neutral-800 rounded-lg px-2 h-7">
            <input v-model.number="genDensity" type="range" min="0" max="100" class="w-24 h-1 accent-synth-amber bg-neutral-800 rounded-lg appearance-none cursor-pointer" />
            <span class="text-[12px] font-mono text-synth-amber w-8 text-right">{{ genDensity }}%</span>
          </div>
        </div>

        <!-- <div class="w-px h-6 bg-neutral-800 mx-2" /> -->

        

        <button @click="generateSequence" 
          class="ml-auto flex items-center gap-1 px-1 py-1.5 bg-synth-amber text-black rounded-lg hover:bg-white transition-all font-black text-[9px] uppercase shadow-[0_0_15px_rgba(0,255,166,0.3)]">
          <Zap class="w-3.5 h-3.5" />
          Generate
        </button>
      </div>
      
      <div class="flex w-full gap-3 px-4">
        <!-- Param Assign -->
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <span class="text-[12px] font-mono text-neutral-500 uppercase leading-none">P1</span>
            <select v-model="param1CC" class="bg-black/40 border border-neutral-800 text-synth-amber rounded px-1.5 py-0.5 text-[14px] font-mono outline-none w-30 cursor-pointer [color-scheme:dark]">
              <option v-for="opt in allS1Params" :key="opt.cc" :value="opt.cc" class="bg-neutral-900">{{ opt.label }}</option>
            </select>
            <div class="flex items-center gap-1 bg-black/40 border border-neutral-800 rounded px-1.5 h-6" title="Numero CC — modificabile per adattarsi allo strumento collegato">
              <span class="text-[8px] font-mono text-neutral-500">CC#</span>
              <input v-model.number="param1CC" @blur="clampParam1CC" type="number" min="0" max="127" class="w-8 bg-transparent text-synth-amber text-[10px] font-mono outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
            </div>
            <div class="flex items-center gap-1 bg-black/40 border border-neutral-800 rounded px-1.5 h-6 ml-1">
              <span class="text-[8px] font-mono text-neutral-500" title="Variazione P1 RND">RND%</span>
              <input v-model.number="param1Variation" type="range" min="-100" max="100" :disabled="midiStore.isTransportPlaying" class="w-12 h-1 accent-synth-amber bg-neutral-800 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" />
              <span class="text-[9px] font-mono text-synth-amber w-7 text-right" :class="{'opacity-50': midiStore.isTransportPlaying}">{{ param1Variation > 0 ? '+' : '' }}{{ param1Variation }}</span>
            </div>
          </div>
          
          <div class="w-px h-5 bg-neutral-800 mx-1" />

          <div class="flex items-center gap-2">
            <span class="text-[12px] font-mono text-neutral-500 uppercase leading-none">P2</span>
            <select v-model="param2CC" class="bg-black/40 border border-neutral-800 text-synth-amber rounded px-1.5 py-0.5 text-[14px] font-mono outline-none w-24 cursor-pointer [color-scheme:dark]">
              <option v-for="opt in allS1Params" :key="opt.cc" :value="opt.cc" class="bg-neutral-900">{{ opt.label }}</option>
            </select>
            <div class="flex items-center gap-1 bg-black/40 border border-neutral-800 rounded px-1.5 h-6" title="Numero CC — modificabile per adattarsi allo strumento collegato">
              <span class="text-[8px] font-mono text-neutral-500">CC#</span>
              <input v-model.number="param2CC" @blur="clampParam2CC" type="number" min="0" max="127" class="w-8 bg-transparent text-synth-amber text-[10px] font-mono outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
            </div>
            <div class="flex items-center gap-1 bg-black/40 border border-neutral-800 rounded px-1.5 h-6 ml-1">
              <span class="text-[8px] font-mono text-neutral-500" title="Variazione P2 RND">RND%</span>
              <input v-model.number="param2Variation" type="range" min="-100" max="100" :disabled="midiStore.isTransportPlaying" class="w-12 h-1 accent-synth-amber bg-neutral-800 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" />
              <span class="text-[9px] font-mono text-synth-amber w-7 text-right" :class="{'opacity-50': midiStore.isTransportPlaying}">{{ param2Variation > 0 ? '+' : '' }}{{ param2Variation }}</span>
            </div>
          </div>
        </div>
      </div>
      <!-- ── MAIN TOOLBAR ── -->
      <div class="shrink-0 flex flex-wrap items-center gap-4 p-3 border-b border-neutral-900 bg-neutral-900/50">
        <!-- Transport Controls -->
        <div class="flex items-center gap-1">
          <button @click="isPlaying = !isPlaying"
            :class="['flex items-center gap-2 px-4 h-9 rounded-lg font-black uppercase text-[10px] transition-all', isPlaying ? 'bg-amber-500 text-black' : 'bg-neutral-500 text-black']">
            <Square v-if="isPlaying" class="w-3.5 h-3.5 fill-current" />
            <Play v-else class="w-3.5 h-3.5 fill-current" />
            {{ isPlaying ? 'STOP' : 'PLAY' }}
          </button>
          <button @click="isRecording = !isRecording"
            :class="['w-9 h-9 flex items-center justify-center rounded-lg transition-all', isRecording ? 'bg-red-500 text-black shadow-[0_0_10px_rgba(239,68,68,0.4)]' : 'bg-black text-red-500 border border-red-900/40']">
            <Circle class="w-3.5 h-3.5 fill-current" />
          </button>
        </div>

        <div class="w-px h-5 bg-neutral-800" />

        <!-- Chain toggle -->
        <button
          @click="seqStore.setChainEnabled(!seqStore.chainEnabled)"
          :title="seqStore.chainEnabled ? 'Chain mode ON — plays through chained pattern slots' : 'Chain mode OFF — plays only the active pattern bank'"
          :class="[
            'flex items-center gap-1.5 h-9 px-3 rounded-lg font-black uppercase text-[10px] transition-all border',
            seqStore.chainEnabled ? 'bg-blue-600/20 text-blue-400 border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.3)]' : 'bg-black text-neutral-500 border-neutral-800 hover:border-blue-500/50 hover:text-blue-400'
          ]"
        >
          <Layers class="w-3.5 h-3.5" />
          <span>Chain</span>
          <span class="text-[9px] ml-0.5" :class="seqStore.chainEnabled ? 'text-blue-300' : 'text-neutral-600'">{{ seqStore.chainEnabled ? 'ON' : 'OFF' }}</span>
        </button>

        <div class="w-px h-5 bg-neutral-800" />

        <!-- Sequence Length -->
        <div class="flex items-center gap-2">
          <span class="text-[9px] font-mono text-neutral-500 uppercase">Length</span>
          <div class="flex items-center bg-black border border-neutral-800 rounded px-2 h-9 gap-2">
            <button @click="reduceLength" class="p-1 text-neutral-500 hover:text-orange-500 transition-colors" title="/2">
              <ChevronDown class="w-3.5 h-3.5" />
            </button>
            <!--//seqStepsLimit" -->
            <input v-model.number="numSteps" type="range" min="2" max="16" 
              class="w-20 h-1 accent-orange-500 bg-neutral-800 rounded-lg appearance-none cursor-pointer" />
            <button @click="duplicateLength" class="p-1 text-neutral-500 hover:text-orange-500 transition-colors" title="x2">
              <ChevronUp class="w-3.5 h-3.5" />
            </button>
            <div class="w-px h-3 bg-neutral-800 ml-1" />
            <span class="text-[9px] font-mono text-orange-500 w-6 text-right font-bold">{{ numSteps }}</span>
          </div>
        </div>

        <div class="w-px h-5 bg-neutral-800" />

        <!-- Global Transpose Control -->
        <div class="flex items-center gap-2">
          <span class="text-[9px] font-mono text-neutral-500 uppercase">Transpose</span>
          <div class="flex items-center bg-black border border-neutral-800 rounded px-1 h-9 gap-0.5">
            <button 
              @click="emit('transposeChange', Math.max(-24, (globalTranspose || 0) - 1))" 
              class="w-5 h-full flex items-center justify-center text-neutral-500 hover:text-synth-neon transition-colors text-xs font-bold"
            >–</button>
            <input
              type="number"
              :value="globalTranspose"
              @input="e => emit('transposeChange', Math.max(-24, Math.min(24, Number(e.target.value))))"
              class="w-8 bg-transparent text-synth-amber font-mono text-sm outline-none text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button 
              @click="emit('transposeChange', Math.min(24, (globalTranspose || 0) + 1))" 
              class="w-5 h-full flex items-center justify-center text-neutral-500 hover:text-synth-neon transition-colors text-xs font-bold"
            >+</button>
          </div>
        </div>
        <div class="w-px h-5 bg-neutral-800" />

        <!-- Swing Control -->
        <div class="flex items-center gap-2">
          <span class="text-[9px] font-mono text-neutral-500 uppercase">Swing</span>
          <div class="flex items-center bg-black border border-neutral-800 rounded w-24 px-2 h-9 gap-3">
            <input v-model.number="swingAmount" type="range" min="0" max="100" class="w-14 h-1 accent-emerald-500 bg-neutral-800 rounded-lg appearance-none cursor-pointer" />
            <span class="text-[9px] font-mono text-amber-500 w-8 text-right">{{ swingAmount }}%</span>
          </div>
        </div>

        <!-- Toolbar Actions -->
        <div class="flex items-center gap-1 ml-auto">
          <button @click="handleClear"
            :class="['h-8 px-2 rounded-lg font-black uppercase text-[10px] transition-all border shadow-sm', confirmClear ? 'bg-red-500/20 text-red-500 border-red-500' : 'bg-black text-neutral-500 border-neutral-800 hover:border-neutral-700']">
            {{ confirmClear ? 'SURE?' : 'CLEAR' }}
          </button>
        </div>
      </div>

      <!-- ── CHAIN EDITOR ── -->
      <div v-if="seqStore.chainEnabled" class="shrink-0 px-4 py-2 border-b border-neutral-900 bg-blue-950/10 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <span class="text-[9px] font-mono text-blue-400 uppercase tracking-widest shrink-0">Chain</span>
        <div class="flex gap-1.5 flex-1">
          <button v-for="pos in CHAIN_COUNT" :key="pos"
            @click="seqStore.cycleChainSlot(pos - 1)"
            @contextmenu.prevent="seqStore.clearChainSlot(pos - 1)"
            :class="['flex-1 min-w-[32px] h-8 rounded-lg border text-[10px] font-black font-mono transition-all',
              seqStore.chain[pos - 1] === null ? 'border-neutral-800 bg-black text-neutral-600' : 'border-blue-500/50 bg-blue-500/10 text-blue-300',
              seqStore.playingChainIndex === pos - 1 ? 'border-blue-400 bg-blue-500/30 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]' : '']">
            {{ seqStore.chain[pos - 1] === null ? '–' : BANK_NAMES[seqStore.chain[pos - 1]] }}
          </button>
        </div>
        <button @click="seqStore.clearChain" class="shrink-0 h-8 px-2 rounded-lg text-[9px] font-black uppercase border border-red-800/40 text-red-500 hover:bg-red-500/10">Clear all</button>
      </div>

      <!-- ── CONTEXTUAL STEP TOOLBAR ── -->
      <Transition name="toolbar">
        <div class="shrink-0 bg-neutral-800 border-b border-synth-neon/20 p-2 px-4 flex items-center gap-6 overflow-x-auto no-scrollbar h-12">
          <div class="flex items-center gap-3 shrink-0">
            <span class="text-[10px] font-black text-synth-amber uppercase tracking-tighter">Step {{ selectedStepIdx + 1 }}</span>
            <button @click="updateStep(selectedStepIdx, { active: !steps[selectedStepIdx].active })"
              :class="['px-2 py-1 rounded text-[9px] font-black', steps[selectedStepIdx]?.active ? 'bg-synth-amber text-black' : 'bg-neutral-900 text-neutral-500']">
              {{ steps[selectedStepIdx]?.active ? 'ACTIVE' : 'OFF' }}
            </button>
            <button 
              v-if="!steps[selectedStepIdx]?.active" 
              @click="clearStep(selectedStepIdx)"
              class="px-2 py-1 rounded text-[9px] font-black bg-red-600/30 hover:bg-red-600 text-red-400 hover:text-white transition-colors"
            >
              CLEAR
            </button>
          </div>

          <template v-if="steps[selectedStepIdx]?.active">
            <div class="w-px h-4 bg-neutral-700 shrink-0" />
            
            <div class="flex items-center gap-4 shrink-0">
              <div class="flex flex-col min-w-[70px]">
                <div class="flex justify-between items-center mb-0.5">
                  <span class="text-[8px] font-mono text-neutral-500 uppercase">Vel ({{ steps[selectedStepIdx].velocity }})</span>
                  <div class="flex gap-1">
                    <button @click="applyToAll('velocity', steps[selectedStepIdx].velocity)" class="text-[7px] text-synth-amber hover:underline">ALL</button>
                    <button @click="randomize('velocity')" class="text-[7px] text-synth-amber hover:underline">RND</button>
                  </div>
                </div>
                <input 
                  v-model.number="steps[selectedStepIdx].velocity" 
                  type="range" min="1" max="127" 
                  tabindex="0"
                  @keydown="handleKeyNudge('velocity', $event)"
                  class="h-1 accent-orange-500 bg-neutral-900 rounded-full focus:ring-1 focus:ring-orange-500 outline-none" 
                />
              </div>

              <div class="flex flex-col min-w-[100px]">
                <div class="flex justify-between items-center mb-0.5">
                  <span class="text-[8px] font-mono text-neutral-500 uppercase">Gate ({{ steps[selectedStepIdx].gate }}%)</span>
                  <div class="flex gap-1">
                    <button @click="applyToAll('gate', steps[selectedStepIdx].gate)" class="text-[7px] text-synth-amber hover:underline">ALL</button>
                    <button @click="randomize('gate')" class="text-[7px] text-synth-amber hover:underline">RND</button>
                  </div>
                </div>
                <input 
                  v-model.number="steps[selectedStepIdx].gate" 
                  type="range" min="0" max="100" 
                  tabindex="0"
                  @keydown="handleKeyNudge('gate', $event)"
                  class="h-1 accent-purple-500 bg-neutral-900 rounded-full focus:ring-1 focus:ring-purple-500 outline-none" 
                />
              </div>

              <div class="flex flex-col min-w-[40px]">
                <span class="text-[8px] font-mono text-neutral-500 uppercase">Tie</span>
                <input 
                  v-model.number="steps[selectedStepIdx].tieSteps" 
                  type="number" min="0" max="16" 
                  tabindex="0"
                  @keydown="handleKeyNudge('tieSteps', $event)"
                  class="bg-black text-[10px] text-center rounded border border-neutral-700 w-8 outline-none focus:border-synth-neon" 
                />
              </div>

              <template v-if="param1CC !== null">
                <div class="w-px h-4 bg-neutral-700 shrink-0" />
                <div class="flex flex-col min-w-[90px]">
                  <div class="flex justify-between items-center mb-0.5">
                    <span class="text-[8px] font-mono text-neutral-500 uppercase truncate max-w-[50px]">{{ S1_CC_MAP[param1CC] || `CC${param1CC}` }}</span>
                    <div class="flex gap-1">
                      <button @click="applyToAll('param1Value', steps[selectedStepIdx].param1Value)" class="text-[7px] text-synth-amber hover:underline">ALL</button>
                      <button @click="randomize('param1Value')" class="text-[7px] text-synth-amber hover:underline">RND</button>
                    </div>
                  </div>
                  <input 
                    v-model.number="steps[selectedStepIdx].param1Value" 
                    type="range" min="0" max="127" 
                    tabindex="0"
                    @keydown="handleKeyNudge('param1Value', $event)"
                    class="h-1 accent-cyan-500 bg-neutral-900 rounded-full focus:ring-1 focus:ring-cyan-500 outline-none" 
                  />
                </div>
              </template>

              <template v-if="canUseSeqParam2 && param2CC !== null">
                <div class="w-px h-4 bg-neutral-700 shrink-0" />
                <div class="flex flex-col min-w-[90px]">
                  <div class="flex justify-between items-center mb-0.5">
                    <span class="text-[8px] font-mono text-neutral-500 uppercase truncate max-w-[50px]">{{ S1_CC_MAP[param2CC] || `CC${param2CC}` }}</span>
                    <div class="flex gap-1">
                      <button @click="applyToAll('param2Value', steps[selectedStepIdx].param2Value)" class="text-[7px] text-synth-amber hover:underline">ALL</button>
                      <button @click="randomize('param2Value')" class="text-[7px] text-synth-amber hover:underline">RND</button>
                    </div>
                  </div>
                  <input 
                    v-model.number="steps[selectedStepIdx].param2Value" 
                    type="range" min="0" max="127" 
                    tabindex="0"
                    @keydown="handleKeyNudge('param2Value', $event)"
                    class="h-1 accent-indigo-500 bg-neutral-900 rounded-full focus:ring-1 focus:ring-indigo-500 outline-none" 
                  />
                </div>
              </template>
            </div>
          </template>

        </div>
      </Transition>

      <!-- ── STEP GRID (12-note-bar piano-roll style) ── -->
      <div class="flex-1 overflow-auto p-4 bg-neutral-900/30 custom-scrollbar">
        <div class="inline-flex gap-1" style="min-width: max-content">

          <!-- Sticky row labels: Accent / Prob / Oct header rows, then B..C -->
          <div class="flex flex-col shrink-0 sticky left-0 z-20 bg-neutral-900/95 backdrop-blur-sm rounded-lg">
            <div class="text-[9px] font-mono text-center py-0.5 select-none">&nbsp;</div>
            <div class="h-4 flex items-center justify-end pr-1.5 text-[9px] font-black uppercase tracking-wider text-neutral-500 border-t border-neutral-800">Accent</div>
            <div class="h-4 flex items-center justify-end pr-1.5 text-[9px] font-black uppercase tracking-wider text-neutral-500 border-t border-neutral-800">Prob</div>
            <div class="h-4 flex items-center justify-end pr-1.5 text-[9px] font-black uppercase tracking-wider text-neutral-500 border-t border-b border-neutral-800">Oct</div>
            <div v-for="semitone in GRID_SEMITONES" :key="semitone"
              class="h-4 flex items-center justify-end pr-1.5 text-[9px] font-mono"
              :class="NOTE_NAMES[semitone].includes('#') ? 'text-neutral-700' : 'text-neutral-400'"
            >{{ NOTE_NAMES[semitone] }}</div>
          </div>

          <!-- Step columns -->
          <div
            v-for="(step, idx) in steps" :key="idx"
            class="group relative flex flex-col w-13 shrink-0 rounded-lg border transition-all"
            :class="[
              selectedStepIdx === idx ? 'border-synth-amber ring-1 ring-synth-amber/50 bg-neutral-800' : 'border-neutral-800 bg-neutral-950/40',
              gridCurrentStep === idx && isPlaying ? 'border-amber-400 ring-1 ring-amber-400/50 z-10 shadow-[0_0_10px_rgba(245,158,11,0.25)]' : ''
            ]"
          >
            <!-- Step Number -->
            <div
              @click="selectedStepIdx = idx"
              class="text-[8px] font-mono text-center py-0.5 rounded-t-[9px] cursor-pointer"
              :class="step?.active ? 'bg-synth-neon/20 text-synth-neon' : 'bg-neutral-900/50 text-neutral-600'"
            >
              {{ idx + 1 }}
              <span v-if="hasP1Lock(step)" class="inline-block w-1 h-1 rounded-full bg-cyan-400 shadow-[0_0_3px_#22d3ee] ml-0.5" title="P1 Locked" />
              <span v-if="hasP2Lock(step)" class="inline-block w-1 h-1 rounded-full bg-indigo-400 shadow-[0_0_3px_#818cf8] ml-0.5" title="P2 Locked" />
            </div>

            <!-- Accent -->
            <button
              @click="selectedStepIdx = idx; updateStep(idx, { accent: !step.accent })"
              class="h-4 text-[9px] font-black uppercase border-t border-neutral-800 transition-colors"
              :class="step.accent ? 'bg-amber-500 text-black' : 'bg-neutral-900 text-neutral-600 hover:text-neutral-400'"
              title="Accent — boosts this step's velocity when it fires"
            >A</button>

            <!-- Probability -->
            <input type="number" min="0" max="100" step="5"
              :value="step.probability"
              @click.stop="selectedStepIdx = idx"
              @change="e => updateStep(idx, { probability: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })"
              class="h-4 w-full text-[9px] font-mono text-center bg-black border-t border-neutral-800 text-neutral-400 outline-none focus:text-synth-neon [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              title="Probability — % chance this step fires each loop"
            />

            <!-- Octave -->
            <input type="number" min="0" max="8"
              :value="step.octave"
              @click.stop="selectedStepIdx = idx"
              @change="e => setStepOctave(idx, Number.isNaN(parseInt(e.target.value)) ? step.octave : parseInt(e.target.value))"
              class="h-4 w-full text-[9px] font-mono font-bold text-center bg-black border-t border-b border-neutral-800 text-synth-amber outline-none focus:text-synth-neon [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              title="Octave — which octave the note bars below target (transposes existing notes when changed)"
            />

            <!-- 12 note bars, B at top down to C -->
            <button v-for="semitone in GRID_SEMITONES" :key="semitone"
              @click="selectedStepIdx = idx; toggleNoteBar(idx, semitone)"
              class="h-4 transition-colors"
              
              :class="isNoteBarActive(step, semitone)
                ? step.velocity < 10 
                ? 'bg-neutral-700 shadow-[0_0_4px_rgba(0,255,136,0.5)]' : 
                step.velocity < 60 ? 'bg-synth-neon shadow-[0_0_4px_rgba(0,255,136,0.5)]': 
                step.velocity < 95 ?'bg-orange-500 shadow-[0_0_4px_rgba(245,158,11,0.5)]' : 'bg-red-500 shadow-[0_0_4px_rgba(245,158,11,0.5)]' 
                : (NOTE_NAMES[semitone].includes('#') ? 'bg-neutral-950 hover:bg-neutral-800' : 'bg-neutral-900 hover:bg-neutral-800')"
              :title="`${NOTE_NAMES[semitone]}${step.octave}`"
              :style="isNoteBarActive(step, semitone)
                ? 'width: ' + step.gate + '%;':''"
            />

            <!-- Play Indicator -->
            <div v-if="gridCurrentStep === idx && isPlaying" class="absolute inset-0 bg-amber-500/10 border-t-2 border-amber-400 pointer-events-none animate-pulse rounded-lg" />
          </div>
        </div>
      </div>

      <!-- Footer Info -->
      <div class="shrink-0 px-4 py-2 border-t border-neutral-900 bg-black/40 flex justify-between items-center">
        <div class="flex items-center gap-4">
          <span class="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">Sequencer</span>
          <div class="flex items-center gap-1.5">
            <div class="w-1 h-1 rounded-full bg-synth-neon animate-pulse" />
            <span class="text-[9px] font-mono text-synth-neon uppercase">Ready</span>
          </div>
        </div>
        <div class="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">
          SY.CORE // {{ selectedStyle }}
        </div>
      </div>

      <!-- ── SAVE PATTERN TO LIBRARY MODAL ── -->
      <Transition name="fade">
        <div v-if="showSaveLibraryModal" class="absolute inset-0 bg-black/85 backdrop-blur-md z-[999] flex items-center justify-center p-4">
          <div class="bg-neutral-950 border border-synth-neon/30 rounded-xl max-w-sm w-full p-6 shadow-2xl relative overflow-hidden flex flex-col items-center text-center gap-4">
            <!-- Neon pulsing top stripe -->
            <div class="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-emerald-500 via-synth-neon to-emerald-500 animate-pulse" />
            
            <div class="w-10 h-10 rounded-full bg-synth-neon/10 border border-synth-neon/20 flex items-center justify-center text-synth-neon">
              <Save class="w-5 h-5" />
            </div>

            <div class="flex flex-col gap-1 w-full">
              <h3 class="text-xs font-mono font-black uppercase text-synth-neon tracking-[0.2em]">Save Pattern</h3>
              <p class="text-[9px] text-neutral-500 font-mono uppercase tracking-wider mb-2">Enter a unique name for this pattern</p>
              <input 
                v-model="libraryPatternName" 
                type="text" 
                placeholder="Pattern Name"
                class="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-center text-white text-sm focus:outline-none focus:border-synth-neon transition-colors font-mono uppercase"
                @keyup.enter="savePatternToLibrary"
              />
            </div>

            <div class="flex items-center gap-3 w-full mt-2 font-mono">
              <button 
                @click="showSaveLibraryModal = false"
                class="flex-1 h-8 rounded border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-800 text-[10px] font-bold text-neutral-400 hover:text-white transition-all uppercase tracking-wider"
              >
                CANCEL
              </button>
              <button 
                @click="savePatternToLibrary"
                class="flex-1 h-8 rounded bg-synth-neon hover:bg-emerald-400 text-[10px] font-bold text-black transition-all uppercase tracking-wider shadow-lg shadow-synth-neon/10"
              >
                SAVE
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- ── LOAD PATTERN FROM LIBRARY MODAL ── -->
      <Transition name="fade">
        <div v-if="showLoadLibraryModal" class="absolute inset-0 bg-black/85 backdrop-blur-md z-[999] flex items-center justify-center p-4">
          <div class="bg-neutral-950 border border-synth-neon/30 rounded-xl max-w-lg w-full h-[360px] p-6 shadow-2xl relative overflow-hidden flex flex-col gap-4">
            <!-- Neon pulsing top stripe -->
            <div class="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-emerald-500 via-synth-neon to-emerald-500 animate-pulse" />
            
            <!-- Header -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-full bg-synth-neon/10 border border-synth-neon/20 flex items-center justify-center text-synth-neon">
                  <FolderOpen class="w-4 h-4" />
                </div>
                <h3 class="text-xs font-mono font-black uppercase text-synth-neon tracking-[0.2em]">Pattern Library</h3>
              </div>
              <button @click="showLoadLibraryModal = false" class="text-neutral-500 hover:text-white transition-colors">
                <X class="w-4 h-4" />
              </button>
            </div>

            <!-- Loader -->
            <div v-if="loadingLibrary" class="flex-1 flex flex-col items-center justify-center">
              <div class="w-8 h-8 border-t-2 border-synth-neon rounded-full animate-spin mb-3"></div>
              <span class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">Accessing IndexedDB...</span>
            </div>

            <!-- Empty State -->
            <div v-else-if="libraryPatterns.length === 0" class="flex-1 flex flex-col items-center justify-center text-center p-4">
              <span class="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">No patterns saved in library yet.</span>
              <span class="text-[9px] font-mono text-neutral-600 uppercase tracking-widest mt-1">Use the save icon in the header to export sequences.</span>
            </div>

            <!-- Patterns List -->
            <div v-else class="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
              <div 
                v-for="pattern in libraryPatterns" 
                :key="pattern.id"
                class="flex items-center justify-between p-2.5 bg-neutral-900/60 border border-neutral-800/80 rounded-lg hover:border-synth-neon/40 hover:bg-neutral-900 transition-all group cursor-pointer"
                @click="loadPatternFromLibrary(pattern)"
              >
                <div class="flex flex-col min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-bold text-white group-hover:text-synth-neon transition-colors uppercase font-mono truncate">{{ pattern.name }}</span>
                    <span class="text-[8px] font-mono bg-neutral-800 text-neutral-400 px-1 rounded uppercase">{{ pattern.style }}</span>
                  </div>
                  <div class="flex items-center gap-3 text-[8px] font-mono text-neutral-500 uppercase tracking-wider mt-1">
                    <span>Steps: <strong class="text-neutral-300">{{ pattern.config?.numSteps || 16 }}</strong></span>
                    <span>Key: <strong class="text-neutral-300">{{ pattern.key || 'C' }} {{ pattern.scale || 'Major' }}</strong></span>
                    <span class="hidden sm:inline">Saved: <strong class="text-neutral-400">{{ new Date(pattern.createdAt).toLocaleDateString() }}</strong></span>
                  </div>
                </div>

                <!-- Delete action -->
                <button 
                  @click.stop="deletePatternFromLibrary(pattern.id)"
                  class="p-2 text-neutral-600 hover:text-red-500 transition-colors"
                  title="Delete Pattern"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>

.toolbar-enter-active, .toolbar-leave-active { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.toolbar-enter-from, .toolbar-leave-to { opacity: 0; transform: translateY(-10px); height: 0; padding-top: 0; padding-bottom: 0; }

input[type=range] { -webkit-appearance: none; appearance: none; background: transparent; cursor: pointer; }
input[type=range]:focus { outline: none; }
input[type=range]::-webkit-slider-runnable-track { background: #171717; height: 4px; border-radius: 2px; }
input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 10px; width: 10px; border-radius: 50%; background: currentColor; margin-top: -3px; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
