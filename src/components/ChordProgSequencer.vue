<script setup>
import PlayEditToggle from '@/components/ui/PlayEditToggle.vue'
import ResizeHandles from '@/components/ui/ResizeHandles.vue'
import { journaled } from '@/lib/session-takes'
import PlayPanelHeader from '@/components/play/PlayPanelHeader.vue'
import ChordProgPlayView from '@/components/play/ChordProgPlayView.vue'
import ChordGenControls from '@/components/play/ChordGenControls.vue'
import ProgressionBrowserModal from '@/components/play/ProgressionBrowserModal.vue'
import ChordModeSwitch from '@/components/play/ChordModeSwitch.vue'
import ChordKeyBadge from '@/components/play/ChordKeyBadge.vue'
import { usePlayView } from '@/composables/usePlayView'
// Performance: a play view (slots, chords) instead of the panel; EDIT: the panel.
const { play } = usePlayView('chord-prog')
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Play, Square, X, Minus, ChevronLeft, ChevronRight, RotateCcw, Save, FolderOpen, Trash2, Zap, Music2, AudioLines, Sparkles, Star, ListMusic } from 'lucide-vue-next'
import { getTransport, start as toneStart } from 'tone'
import { drawAt } from '@/lib/ui-clock'
import { useTransportManager } from '@/composables/useTransportManager'
import { midiService, MidiSource } from '@/core/midi/midi-service'
import { useMidiStore } from '@/stores/useMidiStore'
import { useArpStore } from '@/stores/useArpStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { userKey } from '@/lib/userKey'
import { usePerformanceSets } from '@/composables/usePerformanceSets'
import { useFavoriteChords } from '@/composables/useFavoriteChords'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'
import { useSyncStore } from '@/stores/useSyncStore'
import { useUiStore } from '@/stores/useUiStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import { useChordProgStore, stepPlayMode, DURATION_OPTIONS, DURATION_LABELS, DEFAULT_CHORD_STEP, CAPTURE_MAX } from '@/stores/useChordProgStore'
import { noteLabel } from '@/lib/chord-detector'
import { useProgressionLoader, KEY_FILE_NAMES } from '@/composables/useProgressionLoader'
import { orderChordStrumNotes } from '@/lib/chord-strum'
import { parseMidiFile } from '@/lib/midi-file'
import ChordAssignModal from './ChordAssignModal.vue'
import AiPromptModal from './AiPromptModal.vue'
import SongComposerDialog from './SongComposerDialog.vue'
import { sendPartPresets } from '@/lib/song-composer'
import { ARP_MODES, nextArpIndex, defaultArpPatternState } from '@/lib/arp-patterns'
import { StepScheduler, createWorkerTicker, chaseNote, VoiceLedger, noteOffDecideAt } from '@/core/midi/step-scheduler'
import { externalGrid } from '@/core/midi/external-grid'
import { keyLabel, NOTE_NAMES as KEY_NOTE_NAMES } from '@/lib/chord-key'
import { CHORD_GEN_STYLES, CHORD_GEN_STYLE_NAMES, MODAL_KEY_INDEX, progressionsInMode } from '@/lib/chord-gen-style'
import { chordAfter } from '@/lib/chord-next'
import { rigReports } from '@/lib/rig-live'
import { useChordProgEngine } from '@/core/engines/chord-prog'

const props = defineProps({
  isOpen: Boolean,
  bpm: { type: Number, default: 120 },
  channel: { type: Number, default: 1 },
})
const emit = defineEmits(['close'])

const midiStore = useMidiStore()
const arpStore = useArpStore()
const authStore = useAuthStore()
const transportManager = useTransportManager()
const store = useChordProgStore()
const syncStore = useSyncStore()
const uiStore = useUiStore()
const mappingStore = useMappingStore()
const { openMenu } = useMidiContextMenu()
const { progressionData, progressionNames, loading: progLoading, loadByIndex } = useProgressionLoader()

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } = useDraggableResizable({
  storageKey: 'SYCORE_POS_CHORD_PROG',
  minimizeLabel: 'Chord Prog Sequencer',
  initialWidth: 900,
  initialHeight: 640,
  minWidth: 640,
  minHeight: 440,
  zIndex: 100,
  panelId: 'chord-prog',
})
watch(() => props.isOpen, (v) => { if (v) bringToFront() })

const showAiPrompt = ref(false)
const showSongComposer = ref(false)
const aiLoading = ref(false)
const midiFileInputRef = ref(null)
const midiImportResult = ref(null)
const selectedMidiTrack = ref(0)
const midiImportBpm = ref(120)

async function handleAiResult(data) {
  aiLoading.value = true
  try {
    await journaled('chord', store.activeSlotIndex, () => store.generateFromAiPrompt(data), { source: 'ai' })
  } finally {
    aiLoading.value = false
  }
}

let _lastParseResult = null

function handleMidiFileImport(e) {
  const file = e.target?.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const buf = new Uint8Array(reader.result)
    const result = parseMidiFile(buf)
    _lastParseResult = result
    midiImportResult.value = result.tracks
    midiImportBpm.value = result.bpm
    selectedMidiTrack.value = 0
    if (result.bpm) arpStore.arpBpm = result.bpm
    e.target.value = ''
  }
  reader.readAsArrayBuffer(file)
}

function applyMidiImportTrack() {
  const result = _lastParseResult
  if (!result) return
  const track = result.tracks[selectedMidiTrack.value]
  if (!track) return
  store.loadFromMidiImport(track, result.ticksPerBeat)
  midiImportResult.value = null
  _lastParseResult = null
}

// ── Playback: the Chord Prog engine (core/engines/chord-prog.js) — it plays with this panel closed ──
const engine = useChordProgEngine()
const {
  seqTranspose, loopEnabled, bassEnabled, bassDevice, bassChannel, midiOutputs,
  captureBarCount, captureAutoStop, captureArmed, captureRecording,
  systemClock, panicDelayMs, cuedSlotIdx, fillDuration, fillDurationRandom,
  getTransportTicks, chordNotes, handleSlotSelect, triggerChordStep, stopHeldChord, releaseChord,
  previewStep, handleGenerate, loadProgressionAsIs,
} = engine
// Progressions (the button next to Source): the Source's progressions, one into the slot
const showProgBrowser = ref(false)
// a key file on Major / Minor: that mode's progressions (as Generate picks)
const browserNames = computed(() => store.selectedKey < 12 ? progressionsInMode(progressionNames.value, store.keyMode) : progressionNames.value)
function onBrowserUse(name) { handleGenerate(name); showProgBrowser.value = false }
function onBrowserLoad(name) { loadProgressionAsIs(name); showProgBrowser.value = false }
/** A library chord: selected, and heard (with the library's transpose). */
function previewChord(chord) {
  selectedChord.value = chord
  engine.previewChord(chord, chordTranspose.value)
}

const rafRef = ref(null)


// Transport position display — derived from our own tick counter (independent of global Tone.js transport)
// Written straight into its <span> (not a ref in the template): a ref re-rendered the whole Chord Prog
// at every sixteenth while playing, also with its panel hidden.
const transportPosEl = ref(null)
let _transportPosText = '001:1:1'
// re-created (minimized and restored): the current position at once
watch(transportPosEl, el => { if (el) el.textContent = _transportPosText })
function setTransportPos(text) {
  if (text === _transportPosText) return
  _transportPosText = text
  if (transportPosEl.value) transportPosEl.value.textContent = text
}

function updateTransportPos() {
  const t    = getTransportTicks()
  const bar  = (Math.floor(t / 384) + 1).toString().padStart(3, '0')
  const beat = (Math.floor((t % 384) / 96) + 1).toString()
  const sixteenth = (Math.floor((t % 96) / 24) + 1).toString()
  setTransportPos(`${bar}:${beat}:${sixteenth}`)
}

// Step highlight animation + transport position update
watch(() => store.isPlaying, (playing) => {
  if (playing) {
    const tick = () => { updateTransportPos(); rafRef.value = requestAnimationFrame(tick) }
    tick()
  } else {
    if (rafRef.value !== null) { cancelAnimationFrame(rafRef.value); rafRef.value = null }
    setTransportPos('001:1:1')
  }
})

// The engine plays on without the panel: unmounting only stops the readout.
onUnmounted(() => {
  if (rafRef.value !== null) cancelAnimationFrame(rafRef.value)
})

// ── UI State ─────────────────────────────────────────────────────────────────

const activeTab = ref('generate')
watch(activeTab, (tab) => { if (tab === 'performance') loadPcSets() })
const libSubTab = ref(store.selectedKey >= 13 ? 'genre' : 'keys')
const VOICING_LABEL = { triad: 'triads', seventh: '7ths', stab: 'stabs', power: 'power', open: 'open' }
const styleSummary = computed(() => {
  const st = CHORD_GEN_STYLES[store.genStyle]
  if (!st) return ''
  const lens = [...new Set(st.rhythms.map(r => r.map(d => DURATION_LABELS[d] ?? d).join('·')))].join(' / ')
  return `${lens} · ${VOICING_LABEL[st.voicing]}${st.arp ? ' · arp' : ''} · ${st.moods.slice(0, 3).join(', ')}`
})
const selectedProgressionName = ref('')
const savePatternName = ref('')
const loadedPatternName = ref(localStorage.getItem(userKey('S1_CP_LOADED_NAME')) || '')
watch(loadedPatternName, v => localStorage.setItem(userKey('S1_CP_LOADED_NAME'), v))
const savingPattern = ref(false)
const saveError = ref('')
const saveAllSlots = ref(false)

// Load progression data when selected key changes
watch(() => store.selectedKey, (idx) => {
  selectedProgressionName.value = ''
  loadByIndex(idx)
}, { immediate: true })

// Auto-select first progression when data loads
watch(progressionNames, (names) => {
  if (names.length && !selectedProgressionName.value) {
    selectedProgressionName.value = names[0]
  }
})

const selectedProgressionChords = computed(() => {
  if (!selectedProgressionName.value) return []
  return progressionData.value[selectedProgressionName.value] || []
})

function togglePlay() {
  store.isPlaying = !store.isPlaying
}


function handleStepClick(idx) {
  store.selectedStepIdx = idx
  if (!store.isPlaying) triggerChordStep(idx)
}

// The "now playing" highlight only makes sense when the slot being shown
// (activeSlotIndex) is the one actually sounding (playingSlotIndex) — during
// chain playback these diverge as playback advances through slots the user
// isn't looking at.
function isCurrentPlayingStep(idx) {
  if (store.isPlaying) return idx === store.currentStep && store.activeSlotIndex === store.playingSlotIndex
  return idx === store.currentStep && idx === store.selectedStepIdx
}

function handleStepDoubleClick(idx) {
  store.toggleStepActive(idx)
}

// ── Step copy/paste (right-click a step) ─────────────────────────
const stepClipboard = ref(null) // full ChordStep, or null
const stepContextMenu = ref({ visible: false, x: 0, y: 0, idx: null })
const slotContextMenu = ref({ visible: false, x: 0, y: 0, idx: null })

// ── Drag & drop a step to move its chord (the others shift) ───────────────
const dragFromIdx = ref(null)
const dragOverIdx = ref(null)

function onStepDragStart(idx, e) {
  if (idx >= store.numSteps) { e.preventDefault(); return }
  dragFromIdx.value = idx
  e.dataTransfer.effectAllowed = 'move'
  try { e.dataTransfer.setData('text/plain', String(idx)) } catch {}
}

function onStepDragOver(idx, e) {
  if (dragFromIdx.value === null || idx >= store.numSteps) return
  e.dataTransfer.dropEffect = 'move'
  dragOverIdx.value = idx
}

function onStepDrop(idx) {
  if (dragFromIdx.value !== null && idx < store.numSteps) store.moveStep(dragFromIdx.value, idx)
  onStepDragEnd()
}

function onStepDragEnd() {
  dragFromIdx.value = null
  dragOverIdx.value = null
}

function openStepContextMenu(idx, e) {
  const menuW = 160
  const menuH = 60
  const x = Math.min(e.clientX, window.innerWidth - menuW - 8)
  const y = Math.min(e.clientY, window.innerHeight - menuH - 8)
  stepContextMenu.value = { visible: true, x: Math.max(8, x), y: Math.max(8, y), idx }
  openMenu(e, { name: 'cp_step_' + idx, label: 'Chord Prog: Step ' + (idx + 1) })
}

function closeStepContextMenu() {
  stepContextMenu.value = { ...stepContextMenu.value, visible: false }
}

function openSlotContextMenu(idx, e) {
  const menuW = 176
  const x = Math.min(e.clientX, window.innerWidth - menuW - 8)
  const y = Math.min(e.clientY, window.innerHeight - 260 - 8)
  slotContextMenu.value = { visible: true, x: Math.max(8, x), y: Math.max(8, y), idx }
}

function closeSlotContextMenu() {
  slotContextMenu.value = { ...slotContextMenu.value, visible: false }
}

function copySlotToSlot(fromIdx, toIdx) {
  store.copySlot(fromIdx, toIdx)
  closeSlotContextMenu()
}

function favoriteCurrentStep() {
  const step = selectedStep.value
  if (!step?.active || !step.notes?.length) return
  const notes = step.notes
  const lowest = Math.min(...notes)
  const root = lowest % 12
  const octave = Math.floor(lowest / 12)
  addFavorite(step.chordName || 'Chord', root, notes, octave)
}

function favoriteSlotAsChords(slotIdx) {
  const slot = store.slots[slotIdx]
  if (!slot) return
  const activeSteps = slot.steps.filter(s => s.active && s.notes?.length)
  if (activeSteps.length === 0) return
  for (const step of activeSteps) {
    const notes = step.notes
    const lowest = Math.min(...notes)
    const root = lowest % 12
    const octave = Math.floor(lowest / 12)
    addFavorite(step.chordName || 'Chord', root, notes, octave)
  }
}

function copyStep(idx) {
  const step = store.steps[idx]
  if (!step) return
  stepClipboard.value = { ...step, notes: [...step.notes] }
  closeStepContextMenu()
}

function pasteStep(idx) {
  if (!stepClipboard.value) return
  store.replaceStep(idx, stepClipboard.value)
  closeStepContextMenu()
}


function handleDurationClick(idx, e) {
  e.stopPropagation()
  const reverse = e.shiftKey || e.button === 2
  store.cycleDuration(idx, reverse)
}

const selectedChord = ref(null) // { chordName, notes }
const chordTranspose = ref(0)


function loadSelectedChordToStep() {
  if (!selectedChord.value) return
  const transposedNotes = selectedChord.value.notes.map(n => Math.max(0, Math.min(127, n + chordTranspose.value)))
  store.assignChordToStep(store.selectedStepIdx, selectedChord.value.chordName, transposedNotes)
}

function loadProgressionToSteps() {
  if (!selectedProgressionName.value) return
  store.loadProgressionByName(progressionData.value, selectedProgressionName.value)
}


async function handleSave() {
  if (!savePatternName.value.trim()) return
  savingPattern.value = true
  saveError.value = ''
  try {
    const ok = saveAllSlots.value
      ? await store.saveAllSlotsToLibrary(savePatternName.value.trim())
      : await store.saveToLibrary(savePatternName.value.trim())
    if (ok) {
      savePatternName.value = ''
      saveAllSlots.value = false
    }
  } catch (e) {
    saveError.value = 'Save failed'
  } finally {
    savingPattern.value = false
  }
}

function handleLoadPattern(pattern) {
  loadedPatternName.value = pattern.name
  if (pattern.type === 'all') {
    store.loadAllSlotsFromDocument(pattern)
  } else {
    store.loadFromDocument(pattern)
  }
}

async function handleDeletePattern(id) {
  await store.deleteFromLibrary(id)
}

async function handleUpdatePattern(pattern) {
  await store.updateLibraryPattern(pattern)
}


onMounted(() => {
  if (authStore.user) store.loadLibrary()
  loadPcSets()
})


watch(() => authStore.user, (u) => {
  if (u) store.loadLibrary()
})

// Step detail velocity editing
const editingVelocity = ref(false)
const editingGate = ref(false)

function updateSelectedStepField(field, val) {
  const parsed = parseFloat(val)
  if (isNaN(parsed)) return
  const step = store.steps[store.selectedStepIdx]
  if (!step) return
  if (field === 'velocity') store.setStep(store.selectedStepIdx, { velocity: Math.max(0, Math.min(127, Math.round(parsed))) })
  if (field === 'gate') store.setStep(store.selectedStepIdx, { gate: Math.max(0, Math.min(100, Math.round(parsed))) })
  if (field === 'transpose') store.setStep(store.selectedStepIdx, { transpose: Math.max(-24, Math.min(24, Math.round(parsed))) })
}

function handleVelocityKeydown(e) {
  const step = store.steps[store.selectedStepIdx]
  if (!step) return
  const isUp = e.key === 'ArrowUp'; const isDown = e.key === 'ArrowDown'
  if (!isUp && !isDown) return
  e.preventDefault()
  const delta = (isUp ? 1 : -1) * (e.shiftKey ? 10 : 1)
  store.setStep(store.selectedStepIdx, { velocity: Math.max(0, Math.min(127, step.velocity + delta)) })
}

function handleGateKeydown(e) {
  const step = store.steps[store.selectedStepIdx]
  if (!step) return
  const isUp = e.key === 'ArrowUp'; const isDown = e.key === 'ArrowDown'
  if (!isUp && !isDown) return
  e.preventDefault()
  const delta = (isUp ? 1 : -1) * (e.shiftKey ? 10 : 1)
  store.setStep(store.selectedStepIdx, { gate: Math.max(0, Math.min(100, step.gate + delta)) })
}

const selectedStep = computed(() => store.steps[store.selectedStepIdx])
const prevStep = computed(() => store.selectedStepIdx > 0 ? store.steps[store.selectedStepIdx - 1] : null)
const showChordAssign = ref(false)

function onChordAssigned({ notes, name }) {
  store.assignChordToStep(store.selectedStepIdx, name, notes)
  showChordAssign.value = false
}
// The selected step's own Chord/Arp mode if it overrides the slot's global
// playMode, else the global playMode — matches the scheduler's effectiveMode.
const effectiveStepMode = computed(() => stepPlayMode(store.progMode, selectedStep.value?.stepMode, store.playMode))

// While playing, follow the currently-sounding step so the STEP DETAIL
// panel shows its settings instead of staying frozen on whatever was last
// clicked. store.currentStep is already the correct local index into
// store.steps (chain playback auto-follows the sounding slot, see the
// scheduler's chain-follow block), so this is a direct, safe sync — the
// same "auto-follow while playing" pattern already used for slot follow.
watch(() => store.currentStep, (idx) => {
  if (store.isPlaying) store.selectedStepIdx = idx
})

// ── Fill All ──────────────────────────────────────────────────────────────────

const fillVelocity = ref(100)
const fillVelocityRandom = ref(false)
const fillGate = ref(90)
const fillGateRandom = ref(false)
const fillTranspose = ref(0)
const fillTransposeRandom = ref(false)

function applyFillDuration() {
  for (let i = 0; i < store.numSteps; i++) {
    const dur = fillDurationRandom.value
      ? DURATION_OPTIONS[Math.floor(Math.random() * DURATION_OPTIONS.length)]
      : fillDuration.value
    store.setStep(i, { duration: dur })
  }
}

function applyFillVelocity() {
  for (let i = 0; i < store.numSteps; i++) {
    const vel = fillVelocityRandom.value
      ? Math.floor(Math.random() * 128)
      : Math.max(0, Math.min(127, fillVelocity.value))
    store.setStep(i, { velocity: vel })
  }
}

function applyFillGate() {
  for (let i = 0; i < store.numSteps; i++) {
    const gate = fillGateRandom.value
      ? Math.floor(Math.random() * 101)
      : Math.max(0, Math.min(100, fillGate.value))
    store.setStep(i, { gate })
  }
}

function applyFillTranspose() {
  for (let i = 0; i < store.numSteps; i++) {
    const transpose = fillTransposeRandom.value
      ? Math.floor(Math.random() * 49) - 24
      : Math.max(-24, Math.min(24, fillTranspose.value))
    store.setStep(i, { transpose })
  }
}

// Bulk-apply the per-step Chord/Arp override, chord-strum direction, or
// arp pattern to every step — same "pick a value, click All" shape as the
// fills above, for the fields added alongside per-step Chord/Arp mixing.
const fillStepMode  = ref(undefined) // undefined | 'chord' | 'arp'
const fillChordMode = ref(undefined) // undefined | 'up' | 'down' | 'up-down' | 'down-up'
const fillArpMode   = ref('up')

function applyFillStepMode() {
  for (let i = 0; i < store.numSteps; i++) store.setStep(i, { stepMode: fillStepMode.value })
}
function applyFillChordMode() {
  for (let i = 0; i < store.numSteps; i++) store.setStep(i, { chordMode: fillChordMode.value })
}
function applyFillArpMode() {
  for (let i = 0; i < store.numSteps; i++) store.setStep(i, { arpMode: fillArpMode.value })
}

// ── Performance Sets (shared + IndexedDB-backed via usePerformanceSets) ──

const { pcSets, loadSets, recallSet: recallStoredSet } = usePerformanceSets()
const { favoriteChords, loadFavorites, addFavorite, removeFavorite } = useFavoriteChords()
const activePcSetId = ref(null)

function loadPcSets() {
  loadSets()
}

async function recallPcSet(set) {
  activePcSetId.value = set.id
  await recallStoredSet(set)
}

function velBarColor(v) {
  if (v === 0) return 'bg-neutral-700'
  if (v < 40) return 'bg-blue-600'
  if (v < 80) return 'bg-synth-neon/80'
  return 'bg-synth-neon'
}
</script>

<template>
  <div
    v-show="isOpen && !isMinimized"
    :style="panelStyle"
    class="fixed flex flex-col bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl overflow-hidden text-white font-sans text-sm select-none"
    style="border-top: 2px solid #7c3aed;"
    @mousedown.capture="bringToFront"
  >
    <!-- ── HEADER ─────────────────────────────────────────────────────────── -->
    <template v-if="!play">
    <div
      class="shrink-0 px-3 py-2 bg-black/50 border-b border-neutral-800 flex flex-col items-center gap-3 cursor-grab active:cursor-grabbing"
      @mousedown="onDragStart"
    >
      <div class="flex items-center gap-2 w-full">
        <Music2 class="w-4 h-4 text-purple-400 shrink-0" />
        <h2 class="text-lg font-black uppercase tracking-widest text-purple-400 shrink-0">Chord Prog</h2>
        <!-- Performance, in EDIT: back to the play view -->
        <PlayEditToggle panel-id="chord-prog" />
        <div v-if="loadedPatternName" class="flex items-center gap-1.5 px-2 py-0.5 bg-black/60 border border-purple-700/40 rounded text-[11px] font-mono text-purple-300 w-[300px] max-w-[300px] truncate" :title="loadedPatternName">
          <FolderOpen class="w-3 h-3 shrink-0" />
          <span class="">{{ loadedPatternName }}</span>
        </div>

        <!-- BPM display -->
        <!--
        <div class="flex items-center gap-1.5 px-2 py-0.5 bg-black/60 border border-neutral-800 rounded text-[10px] font-mono">
          <span class="text-neutral-500">BPM</span>
          <span class="text-purple-300 font-bold">{{ arpStore.arpBpm }}</span>
        </div> -->

        

        

        <!-- Channel (follows QuickChannelSelector / midiStore) -->
        <div class="flex items-center gap-1 text-[10px]" title="MIDI channel — change via the global channel selector">
          <span class="text-neutral-500 font-mono">Ch</span>
          <span class="text-purple-300 font-bold font-mono">{{ midiStore.midiChannel }}</span>
        </div>

        <div class="flex w-full justify-end gap-4">
          <!-- REC SYNC -->
          <div class="flex items-center gap-1.5">
            <div
              class="flex items-center gap-1.5 cursor-pointer select-none"
              @click.stop="syncStore.syncChordProgToAudioCapture = !syncStore.syncChordProgToAudioCapture"
              title="Sync audio recording with playback"
            >
              <span
                :class="[
                  'w-1.5 h-1.5 rounded-full transition-colors duration-300',
                  captureRecording
                    ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)] animate-pulse'
                    : syncStore.syncChordProgToAudioCapture
                      ? 'bg-red-500/60'
                      : 'bg-neutral-700'
                ]"
              />
              <span :class="[
                'text-[11px] font-mono uppercase tracking-widest transition-colors duration-300',
                captureRecording
                  ? 'text-red-400'
                  : syncStore.syncChordProgToAudioCapture
                    ? 'text-red-500/60 hover:text-red-400'
                    : 'text-neutral-600 hover:text-neutral-500'
              ]">REC SYNC</span>
            </div>

            <!-- Capture arming indicator -->
            <span
              v-if="captureArmed"
              class="text-[9px] font-mono text-yellow-400 animate-pulse"
            >ARMED</span>

            <!-- Capture recording indicator -->
            <span
              v-if="captureRecording"
              class="flex items-center gap-1 text-[9px] font-mono text-red-400"
            >
              <span class="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
              REC
            </span>

            <!-- Bar count & auto-stop controls (only when sync is enabled) -->
            <div v-if="syncStore.syncChordProgToAudioCapture" class="flex items-center gap-1.5 ml-1">
              <div class="flex items-center gap-0.5">
                <span class="text-[8px] font-mono text-neutral-600">Bars</span>
                <button
                  @click.stop="captureBarCount = Math.max(1, captureBarCount - 1)"
                  class="w-4 h-4 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-[9px]"
                >−</button>
                <span class="text-[10px] font-mono text-cyan-400 w-4 text-center">{{ captureBarCount }}</span>
                <button
                  @click.stop="captureBarCount = Math.min(32, captureBarCount + 1)"
                  class="w-4 h-4 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-[9px]"
                >+</button>
              </div>
              <button
                @click.stop="captureAutoStop = !captureAutoStop"
                :title="captureAutoStop ? 'Auto-stop ON — recording stops after progression ends' : 'Auto-stop OFF — record until manually stopped'"
                :class="[
                  'flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border transition-colors',
                  captureAutoStop
                    ? 'border-cyan-600/50 text-cyan-400 bg-cyan-950/30'
                    : 'border-neutral-700 text-neutral-600 hover:text-neutral-400'
                ]"
              >
                <span v-if="captureAutoStop">Auto</span>
                <span v-else>∞</span>
              </button>
            </div>

            <div
              v-if="syncStore.syncChordProgToAudioCapture && !store.isPlaying"
              @click.stop="uiStore.isAudioCaptureOpen = true"
              class="cursor-pointer text-synth-cyan"
              title="Open Audio Capture"
            >
              <AudioLines class="w-4 h-4" />
            </div>
          </div>
          
          <MacOsButtons @close="emit('close')" @minimize="toggleMinimize" @maximize="maximize" />
          <button
            @click.stop="showAiPrompt = true"
            title="AI Prompt"
            class="p-1.5 rounded-lg text-neutral-500 hover:text-purple-400 hover:bg-purple-950/30 transition-colors"
          >
            <Sparkles class="w-4 h-4" />
          </button>
          <button
            @click.stop="showSongComposer = true"
            title="Compose Song (AI): key + style + tempo → slots, chain and drums"
            class="p-1.5 rounded-lg text-neutral-500 hover:text-synth-neon hover:bg-synth-neon/10 transition-colors"
          >
            <ListMusic class="w-4 h-4" />
          </button>
        </div>
      </div>


      <div class="flex items-center gap-2 justify-start w-full gap-5">
        <!-- Transport position -->
        <div class="flex items-center gap-1 px-2 py-0.5 bg-black/60 border border-neutral-800 rounded font-mono" title="Bar : Beat : Sixteenth">
          <span ref="transportPosEl" :class="['text-[14px] font-bold tabular-nums tracking-wider', store.isPlaying ? 'text-red-700' : 'text-neutral-500']">001:1:1</span>
        </div>

        <!-- Step clock: Audio (Tone.js transport, default) / System (Worker timer + Worker-timed MIDI) -->
        <button
          @click.stop="systemClock = !systemClock"
          :title="systemClock
            ? 'Timing: MIDI — timed for MIDI: chords, strums, arps and bass sent at their exact times, in time when the audio is overloaded or the window is in the background. Click for AUDIO.'
            : 'Timing: AUDIO — follows the audio engine (Tone.js), as before. Click for MIDI.'"
          :class="[
            'px-2 py-0.5 rounded border text-[10px] font-black uppercase tracking-widest transition-colors',
            systemClock
              ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300'
              : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:text-white hover:border-neutral-500'
          ]"
        >TIMING {{ systemClock ? 'MIDI' : 'AUDIO' }}</button>

        <!-- Play / Stop -->
        <button
          @click.stop="togglePlay"
          @contextmenu.prevent="openMenu($event, { name: 'cp_play', label: 'Chord Prog: Play' })"
          :class="[
            'flex items-center gap-1 px-3 py-1 rounded text-[12x] font-mono uppercase tracking-wider transition-all',
            store.isPlaying
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-purple-600 hover:bg-purple-500 text-white'
          ]"
        >
          <Square v-if="store.isPlaying" class="w-3 h-3" />
          <Play v-else class="w-3 h-3" />
          {{ store.isPlaying ? 'Stop' : 'Play' }}
        </button>

        

        

        <!-- Slot selector (A-H) -->
        <div class="flex items-center gap-1" title="Progression slot — each slot holds an independent chord progression">
          <button
            v-for="i in store.SLOT_COUNT"
            :key="i"
            @click.stop="handleSlotSelect(i - 1)"
            @contextmenu.prevent="openSlotContextMenu(i - 1, $event)"
            :title="store.isPlaying && store.playingSlotIndex === i - 1 ? 'Now playing (chain)' : undefined"
            :class="[
              'relative w-8 h-8 flex items-center justify-center rounded text-[10px] font-bold font-mono transition-colors',
              store.activeSlotIndex === i - 1
                ? 'bg-purple-700 text-white ring-1 ring-purple-400'
                : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700',
              cuedSlotIdx === i - 1 ? 'ring-2 ring-amber-400 animate-pulse' : ''
            ]"
          >
            {{ String.fromCharCode(64 + i) }}
            <!-- Now-playing indicator — distinct from the purple "editing" ring since
                 during chain playback the sounding slot and the displayed slot differ -->
            <span
              v-if="store.isPlaying && store.playingSlotIndex === i - 1"
              class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-yellow-400 ring-1 ring-neutral-900 animate-pulse"
            />
          </button>
          <div class="w-px h-4 bg-neutral-700 mx-1" />
        </div>

        <!-- Step count -->
        <div class="flex items-center gap-1.5 text-[12px]">
          <span class="text-neutral-500 font-mono">Steps</span>
          <button @click.stop="store.numSteps = Math.max(1, store.numSteps - 1)" class="w-6 h-6 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300"><ChevronLeft class="w-3 h-3" /></button>
          <span class="text-purple-300 font-bold font-mono w-4 text-center">{{ store.numSteps }}</span>
          <button @click.stop="store.numSteps = Math.min(16, store.numSteps + 1)" class="w-6 h-6 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300"><ChevronRight class="w-3 h-3" /></button>
        </div>

        <!-- Arp rate — always visible; used by Arp play mode and per-step Arp overrides -->
        <div class="flex items-center gap-1 text-[12px] font-mono">
          <span class="text-neutral-500 font-mono">Rate</span>
          <select
            v-model="store.arpRate"
            @mousedown.stop
            title="Arpeggio rate — applies to this slot (and any per-step Arp overrides)"
            class="bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-[12px] text-purple-300 font-mono outline-none"
          >
            <option v-for="d in DURATION_OPTIONS" :key="d" :value="d">{{ DURATION_LABELS[d] }}</option>
          </select>
        </div>

        <!-- Sequence transpose -->
        <!-- <div class="flex items-center gap-1 text-[12px]">
          <span class="text-neutral-500 font-mono shrink-0 text-[12px]">Transpose</span>
          <button @click.stop="seqTranspose = Math.max(-24, seqTranspose - 1)" class="w-6 h-6 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[12px]">−</button>
          <span :class="['font-bold font-mono w-6 text-center', seqTranspose !== 0 ? 'text-yellow-300' : 'text-neutral-400']">{{ seqTranspose > 0 ? '+' : '' }}{{ seqTranspose }}</span>
          <button @click.stop="seqTranspose = Math.min(24, seqTranspose + 1)" class="w-6 h-6 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[12px]">+</button>
          <button v-if="seqTranspose !== 0" @click.stop="seqTranspose = 0" class="text-[8px] text-neutral-600 hover:text-neutral-300 ml-0.5">↺</button>
        </div> -->

        <!-- Loop toggle -->
        <button
          @click.stop="loopEnabled = !loopEnabled"
          :title="loopEnabled ? 'Loop on — click to play once' : 'Loop off — click to enable loop'"
          :class="[
            'flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-bold uppercase border transition-colors',
            loopEnabled ? 'border-purple-600 text-purple-400 bg-purple-950/40' : 'border-neutral-700 text-neutral-500 hover:text-neutral-300'
          ]"
        >
          ⟳ {{ loopEnabled ? 'Loop' : 'Once' }}
        </button>

        <!-- Chain toggle -->
        <button
          @click.stop="store.chainEnabled = !store.chainEnabled"
          :title="store.chainEnabled ? 'Chain mode ON — plays through chained slots' : 'Chain mode OFF — plays only the active slot'"
          :class="[
            'flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-bold uppercase border transition-colors',
            store.chainEnabled ? 'border-cyan-600 text-cyan-400 bg-cyan-950/40' : 'border-neutral-700 text-neutral-500 hover:text-neutral-300'
          ]"
        >
          <span class="tracking-wider">Chain</span>
          <span :class="['text-[9px]', store.chainEnabled ? 'text-cyan-400' : 'text-neutral-600']">{{ store.chainEnabled ? 'ON' : 'OFF' }}</span>
        </button>

        <!-- Drums follow the chain: the Drum Machine switches to the sequence of the playing slot's letter -->
        <button
          @click.stop="store.drumFollow = !store.drumFollow"
          :title="store.drumFollow ? 'Drums + Sequencer follow the chain: slot A plays Drum Machine sequence A and Sequencer bank A, B plays B… (switches at the slot boundary; their own chains off)' : 'Drums and Sequencer don\'t follow the chain'"
          :class="[
            'flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-bold uppercase border transition-colors',
            store.drumFollow ? 'border-amber-600 text-amber-400 bg-amber-950/40' : 'border-neutral-700 text-neutral-500 hover:text-neutral-300'
          ]"
        >
          <span class="tracking-wider">Follow</span>
          <span :class="['text-[9px]', store.drumFollow ? 'text-amber-400' : 'text-neutral-600']">{{ store.drumFollow ? 'ON' : 'OFF' }}</span>
        </button>

        <!-- Panic delay -->
        <div class="ml-auto flex items-center gap-1" title="Delay before All Notes Off is sent on stop">
          <span class="text-[10px] text-neutral-600 font-mono">AOF</span>
          <input
            v-model.number="panicDelayMs"
            type="number"
            min="0"
            max="2000"
            step="50"
            class="w-14 bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 text-[11px] font-mono text-neutral-300 text-center outline-none focus:border-purple-600"
          />
          <span class="text-[10px] text-neutral-600 font-mono">ms</span>
        </div>
      </div>

      <div class="flex items-center gap-2 justify-start w-full">
        <!-- The whole progression's mode (as in the play view's header) -->
        <ChordModeSwitch />
        <!-- the key / scale detected + AUTO SEQ -->
        <ChordKeyBadge />
        <!-- The slot's mode: what AUTO plays for the steps on Auto -->
        <div :class="['flex items-center rounded overflow-hidden border border-neutral-700 text-[12px] font-mono uppercase tracking-wider', store.progMode !== 'auto' ? 'opacity-40' : '']"
             title="This slot's mode — used with AUTO for the steps whose Mode is Auto">
          <button
            @click.stop="store.playMode = 'chord'"
            title="Play chords"
            :class="['px-2 py-0.5 transition-colors', store.playMode === 'chord' ? 'bg-purple-700 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white']"
          >Chord</button>
          <button
            @click.stop="store.playMode = 'arp'"
            title="Play arpeggio"
            :class="['px-2 py-0.5 transition-colors', store.playMode === 'arp' ? 'bg-purple-700 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white']"
          >Arp</button>
        </div>

        <!-- Sequence transpose -->
        <div class="flex items-center gap-1 text-[12px]">
          <span class="text-neutral-500 font-mono shrink-0 text-[12px]">Transpose</span>
          <button @click.stop="seqTranspose = Math.max(-24, seqTranspose - 1)" class="w-6 h-6 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[12px]">−</button>
          <span :class="['font-bold font-mono w-6 text-center', seqTranspose !== 0 ? 'text-yellow-300' : 'text-neutral-400']">{{ seqTranspose > 0 ? '+' : '' }}{{ seqTranspose }}</span>
          <button @click.stop="seqTranspose = Math.min(24, seqTranspose + 1)" class="w-6 h-6 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[12px]">+</button>
          <button v-if="seqTranspose !== 0" @click.stop="seqTranspose = 0" class="text-[8px] text-neutral-600 hover:text-neutral-300 ml-0.5">↺</button>
        </div>

        <!-- Bass note output -->
        <div class="flex items-center gap-1" title="Send the lowest note of each chord to a separate device/channel">
          <span class="text-[10px] text-neutral-600 font-mono">Bass</span>
          <button
            @click.stop="bassEnabled = !bassEnabled"
            :class="[
              'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors',
              bassEnabled ? 'bg-emerald-700 text-white' : 'bg-neutral-800 text-neutral-500 hover:text-neutral-300'
            ]"
            title="Toggle bass note output"
          >{{ bassEnabled ? 'ON' : 'OFF' }}</button>
          <select
            v-if="bassEnabled"
            v-model="bassDevice"
            class="w-28 bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-[10px] font-mono outline-none truncate"
            :class="bassDevice ? 'text-emerald-300' : 'text-neutral-500'"
            title="MIDI output device for bass note"
          >
            <option value="">—</option>
            <option v-if="bassDevice && !midiOutputs.some(o => o.name === bassDevice)" :value="bassDevice">{{ bassDevice }} (offline)</option>
            <option v-for="out in midiOutputs" :key="out.name" :value="out.name">{{ out.name }}</option>
          </select>
          <select
            v-if="bassEnabled"
            v-model.number="bassChannel"
            class="w-12 bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-[10px] font-mono outline-none"
            :class="'text-emerald-300'"
            title="MIDI channel for bass note"
          >
            <option v-for="ch in 16" :key="ch" :value="ch">CH{{ ch }}</option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="!isMinimized" class="flex flex-col flex-1 overflow-hidden">

      <!-- ── STEP GRID ───────────────────────────────────────────────────── -->
      <div class="shrink-0 p-3 grid grid-cols-8 gap-1.5">
        <button
          v-for="(step, idx) in store.steps.slice(0, 16)"
          :key="idx"
          :class="[
            'relative flex flex-col items-center justify-between rounded border transition-colors overflow-hidden',
            mappingStore.mappedParams.has('cp_step_' + idx) ? 'ring-1 ring-amber-500/60' : '',
            idx >= store.numSteps ? 'opacity-25 pointer-events-none' : '',
            isCurrentPlayingStep(idx) ? 'border-yellow-400 bg-yellow-500/25 ring-1 ring-yellow-400/60' : '',
            idx === store.selectedStepIdx && !isCurrentPlayingStep(idx) ? 'border-purple-500 bg-purple-900/20' : '',
            step.active && !isCurrentPlayingStep(idx) && !(idx === store.selectedStepIdx) ? 'border-purple-700/60 bg-purple-950/40' : '',
            !step.active && !isCurrentPlayingStep(idx) && !(idx === store.selectedStepIdx) ? 'border-neutral-800 bg-neutral-950/60' : '',
            dragFromIdx === idx ? 'opacity-40' : '',
            dragOverIdx === idx && dragFromIdx !== null && dragFromIdx !== idx ? 'ring-2 ring-cyan-400' : '',
          ]"
          style="height: 72px; min-width: 0;"
          :draggable="idx < store.numSteps"
          title="Drag to move this chord"
          @dragstart="onStepDragStart(idx, $event)"
          @dragover.prevent="onStepDragOver(idx, $event)"
          @dragleave="dragOverIdx === idx && (dragOverIdx = null)"
          @drop.prevent="onStepDrop(idx)"
          @dragend="onStepDragEnd"
          @click="handleStepClick(idx)"
          @dblclick.prevent="handleStepDoubleClick(idx)"
          @contextmenu.prevent="openStepContextMenu(idx, $event)"
        >
          <!-- Step number -->
          <div class="w-full flex items-center justify-between px-1 pt-1">
            <span :class="['text-[12px] font-bold font-mono', step.active ? 'text-purple-400' : 'text-neutral-600']">
              {{ idx + 1 }}
            </span>
            <!-- Active indicator dot -->
            <span
              v-if="step.active"
              class="w-1.5 h-1.5 rounded-full"
              :class="isCurrentPlayingStep(idx) ? 'bg-yellow-400' : 'bg-purple-500'"
            />
          </div>

          <!-- Chord name -->
          <div class="px-1 w-full text-center">
            <span :class="[
              'text-[14px] font-mono truncate block leading-tight',
              step.active ? (isCurrentPlayingStep(idx) ? 'text-yellow-300' : 'text-white') : 'text-neutral-600'
            ]">
              {{ step.chordName }}  </span>
          </div>

          <!-- Duration badge -->
          <div
            role="button"
            tabindex="0"
            :class="[
              'text-[12px] font-mono px-1 rounded mb-0.5 transition-colors cursor-pointer',
              step.active ? 'text-purple-300 hover:text-purple-100' : 'text-neutral-700 hover:text-neutral-400'
            ]"
            @click.stop="handleDurationClick(idx, $event)"
            @contextmenu.prevent="handleDurationClick(idx, $event)"
            @keydown.enter.stop="handleDurationClick(idx, $event)"
            @keydown.space.stop.prevent="handleDurationClick(idx, $event)"
            title="Click to cycle duration | Right-click / Shift+click reverse"
          >
            {{ DURATION_LABELS[step.duration] }}
          </div>

          <!-- Velocity bar -->
          <div class="w-full h-1 bg-neutral-800 rounded-b overflow-hidden">
            <div
              :class="['h-full transition-all', velBarColor(step.velocity)]"
              :style="{ width: step.velocity ? `${(step.velocity / 127) * 100}%` : '0%' }"
            />
          </div>
          <!-- MIDI Learn indicator dot -->
          <span
            v-if="mappingStore.learningParamName === 'cp_step_' + idx"
            class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] animate-pulse z-50 pointer-events-none"
          />
        </button>
      </div>

      <!-- ── STEP DETAIL ────────────────────────────────────────────────── -->
      <div v-if="selectedStep" class="shrink-0 mx-3 mb-2 p-2 bg-black/40 border border-neutral-800 rounded-lg flex items-center gap-4 text-[12px]">
        <div class="flex flex-col rounded text-neutral-400 font-mono shrink-0 bg-violet-600/40 h-full p-1 justify-center items-center w-[60px] gap-1">
          <span>Step {{ store.selectedStepIdx + 1 }}</span>
          <div class="flex gap-1" title="Move this chord one step left / right (or drag it in the grid)">
            <button
              @click="store.moveStep(store.selectedStepIdx, store.selectedStepIdx - 1)"
              :disabled="store.selectedStepIdx <= 0"
              class="w-5 h-4 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[9px] disabled:opacity-30"
            >◀</button>
            <button
              @click="store.moveStep(store.selectedStepIdx, store.selectedStepIdx + 1)"
              :disabled="store.selectedStepIdx >= store.numSteps - 1"
              class="w-5 h-4 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[9px] disabled:opacity-30"
            >▶</button>
          </div>
        </div>

        <div class="flex flex-col w-1/5">
          <!-- Active toggle -->
          <button
            @click="store.toggleStepActive(store.selectedStepIdx)"
            :class="['px-2 py-0.5 rounded font-bold uppercase tracking-wider transition-colors', selectedStep.active ? 'bg-purple-700 text-white' : 'bg-neutral-800 text-neutral-400']"
          >
            {{ selectedStep.active ? 'Active' : 'Off' }}
          </button>

          <!-- Chord name -->
          <div class="flex items-center gap-3">
            <!-- <span class="text-neutral-600 text-[10px] font-mono pt-2">{{ selectedStep.notes?.join(', ') || 'no notes' }}</span> -->
            <button
            @click="showChordAssign = true"
            class="text-[9px] px-1.5 py-0.5 mt-2 rounded border border-neutral-700 hover:border-purple-500 hover:text-purple-400 bg-purple-600 text-neutral-300 transition-colors font-mono"
            title="Assign custom chord via MIDI IN or Virtual Keyboard"
            >Custom</button>
            <button
              @click="openMenu($event, { name: 'cp_step_' + store.selectedStepIdx, label: 'Chord Prog: Step ' + (store.selectedStepIdx + 1) })"
              class="text-[9px] px-1.5 py-0.5 mt-2 rounded border border-neutral-700 hover:border-amber-500 hover:text-amber-400 text-neutral-500 transition-colors font-mono"
              title="MIDI Learn — map a MIDI controller to trigger this step"
            >MIDI Learn</button>
            <div class="flex flex-col items-start">
              <span class="text-purple-300 mt-2 text-[12px] font-bold">{{ selectedStep.chordName }} </span>
              <span class="text-purple-400 text-[9px] font-normal">{{ chordNotes(selectedStep).join(' ') }}</span>
            </div>
          </div>
        </div>

        
        <div class="flex items-center gap-1 px-2 border-l h-full border-neutral-700">
          <div class="flex flex-col">
            <!-- Duration selector -->
            <div class="flex items-center">
              <span class="text-neutral-500 mr-1 w-8">Dur</span>
              <select
                :value="selectedStep.duration"
                @change="e => store.setStep(store.selectedStepIdx, { duration: e.target.value })"
                class="bg-neutral-800 border border-neutral-700 w-18 rounded px-1 py-0.5 text-purple-300 font-mono outline-none"
              >
                <option v-for="d in DURATION_OPTIONS" :key="d" :value="d">{{ DURATION_LABELS[d] }}</option>
              </select>
            </div>
            <!-- Per-step Transpose -->
            <div class="flex items-center gap-1 pt-2" title="Transpose this step's chord up/down in semitones">
              <span class="text-neutral-500 w-8">Trsp</span>
              <button
                @click="updateSelectedStepField('transpose', (selectedStep.transpose || 0) - 1)"
                class="w-4 h-4 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[9px]"
              >−</button>
              <span
                :class="['font-bold font-mono w-6 text-center', (selectedStep.transpose || 0) !== 0 ? 'text-yellow-300' : 'text-neutral-400']"
              >{{ (selectedStep.transpose || 0) > 0 ? '+' : '' }}{{ selectedStep.transpose || 0 }}</span>
              <button
                @click="updateSelectedStepField('transpose', (selectedStep.transpose || 0) + 1)"
                class="w-4 h-4 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[9px]"
              >+</button>
              <button
                v-if="(selectedStep.transpose || 0) !== 0"
                @click="updateSelectedStepField('transpose', 0)"
                class="text-[8px] text-neutral-600 hover:text-neutral-300"
              >↺</button>
            </div>
          </div>
        </div>
        <div class="flex flex-col gap-1 items-end px-4 pt-1.5 border-r h-full border-neutral-700">
          <!-- Velocity -->
          <div class="flex items-center gap-1">
            <span class="text-neutral-500 w-8">Vel</span>
            <input
              type="number"
              :value="selectedStep.velocity"
              min="0" max="127"
              @change="e => updateSelectedStepField('velocity', e.target.value)"
              @keydown="handleVelocityKeydown"
              class="w-18 bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-purple-300 font-mono outline-none text-center"
              title="Velocity 0–127 (0 = off). Arrow keys to nudge, Shift+Arrow ×10"
            />
          </div>
          <!-- Gate -->
          <div class="flex items-center gap-1">
            <span class="text-neutral-500 w-8">Gate</span>
            <input
              type="number"
              :value="selectedStep.gate"
              min="0" max="100"
              @change="e => updateSelectedStepField('gate', e.target.value)"
              @keydown="handleGateKeydown"
              class="w-14 bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-purple-300 font-mono outline-none text-center"
              title="Gate 0–100%. Arrow keys to nudge."
            />
            <span class="text-neutral-600">%</span>
          </div>
        </div>

        <!-- Per-step Chord/Arp override — lets individual steps play as Chord/Strum
             while others in the same progression play as Arp, independent of the
             slot's global Play Mode toggle. Auto = inherit the global mode. -->
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-1" title="Override Chord/Arp for just this step — Auto follows the global Play Mode">
            <span class="text-neutral-500 w-12">Mode</span>
            <div class="flex items-center rounded overflow-hidden border border-neutral-700">
              <button
                v-for="opt in [{ v: undefined, label: 'Auto' }, { v: 'chord', label: 'Chord' }, { v: 'arp', label: 'Arp' }]"
                :key="opt.label"
                @click="store.setStep(store.selectedStepIdx, { stepMode: opt.v })"
                :class="['px-1.5 py-0.5 text-[10px] font-mono uppercase transition-colors', (selectedStep.stepMode ?? undefined) === opt.v ? 'bg-cyan-700 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white']"
              >{{ opt.label }}</button>
            </div>
          </div>

          <!-- Per-step Chord strum direction (only meaningful when this step's effective mode is Chord) -->
          <div v-if="effectiveStepMode === 'chord'" class="flex items-center gap-1" title="Strum direction for this step's chord — Sim = simultaneous (default)">
            <span class="text-neutral-500 w-12">Strum</span>
            <div class="flex items-center rounded overflow-hidden border border-neutral-700">
              <button
                v-for="opt in [{ v: undefined, label: 'Sim' }, { v: 'up', label: 'Up' }, { v: 'down', label: 'Dn' }, { v: 'up-down', label: 'U-D' }, { v: 'down-up', label: 'D-U' }]"
                :key="opt.label"
                @click="store.setStep(store.selectedStepIdx, { chordMode: opt.v })"
                :class="['px-1.5 py-0.5 text-[10px] font-mono uppercase transition-colors', (selectedStep.chordMode ?? undefined) === opt.v ? 'bg-purple-700 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white']"
              >{{ opt.label }}</button>
            </div>
          </div>

          <div class="flex gap-2">
          <!-- Per-step Arp pattern (only meaningful when this step's effective mode is Arp) -->
          <div v-if="effectiveStepMode === 'arp'" class="flex items-center gap-1" title="Arpeggio pattern for this step">
            <span class="text-neutral-500 w-12">Pattern</span>
            <select
              :value="selectedStep.arpMode ?? 'up'"
              @change="e => store.setStep(store.selectedStepIdx, { arpMode: e.target.value })"
              class="bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-purple-300 font-mono outline-none text-[10px]"
            >
              <option v-for="mode in ARP_MODES" :key="mode" :value="mode">{{ mode }}</option>
            </select>
          </div>
        
          <!-- Per-step Arp rate override (only meaningful when this step's effective mode is Arp) -->
          <div v-if="effectiveStepMode === 'arp'" class="flex items-center gap-1" title="Arp rate for this step — overrides the slot rate when set">
            <span class="text-neutral-500">Rate</span>
            <select
              :value="selectedStep.arpRate ?? ''"
              @change="e => store.setStep(store.selectedStepIdx, { arpRate: e.target.value || undefined })"
              class="bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 font-mono outline-none text-[10px]"
              :class="selectedStep.arpRate ? 'text-yellow-300' : 'text-neutral-500'"
            >
              <option value="">Slot ({{ DURATION_LABELS[store.arpRate] }})</option>
              <option v-for="d in DURATION_OPTIONS" :key="d" :value="d">{{ DURATION_LABELS[d] }}</option>
            </select>
          </div>
          </div>
        </div>
        <!-- Favorite button -->
        <button
          v-if="selectedStep?.active && selectedStep.notes?.length"
          @click="favoriteCurrentStep()"
          class="ml-auto px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 border transition-colors bg-amber-950/30 border-amber-700/40 text-amber-400 hover:bg-amber-900/50 hover:border-amber-500 shrink-0"
          title="Save this chord to favorites"
        ><Star class="w-3 h-3" /> Favorite</button>

        
      </div>

      <!-- ── FILL ALL ──────────────────────────────────────────────────────── -->
      <div class="relative shrink-0 mx-3 mb-2 p-2 bg-black/40 border border-neutral-800 rounded-lg flex items-center gap-3 text-[12px] flex-wrap">
        <span class="text-neutral-500 font-mono shrink-0 font-bold uppercase tracking-wider">Fill</span>

        <!-- Duration fill -->
        <div class="flex items-center gap-1.5">
          <span class="text-neutral-500">Dur</span>
          <select
            v-if="!fillDurationRandom"
            v-model="fillDuration"
            class="bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-purple-300 font-mono outline-none"
          >
            <option v-for="d in DURATION_OPTIONS" :key="d" :value="d">{{ DURATION_LABELS[d] }}</option>
          </select>
          <span v-else class="text-yellow-400 font-mono px-1 py-0.5 bg-neutral-800 border border-neutral-700 rounded">Rnd</span>
          <label class="flex items-center gap-0.5 cursor-pointer text-neutral-500 hover:text-neutral-300 select-none">
            <input type="checkbox" v-model="fillDurationRandom" class="w-14 h-3 accent-purple-500" />
            <span>~</span>
          </label>
          <button
            @click="applyFillDuration"
            class="px-2 py-0.5 rounded bg-neutral-700 hover:bg-purple-700 text-white font-bold uppercase tracking-wider transition-colors text-[9px]"
          >All</button>
        </div>

        <div class="w-px h-4 bg-neutral-800 shrink-0" />

        <!-- Velocity fill -->
        <div class="flex items-center gap-1.5">
          <span class="text-neutral-500">Vel</span>
          <input
            v-if="!fillVelocityRandom"
            v-model.number="fillVelocity"
            type="number" min="0" max="127"
            class="w-14 bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-purple-300 font-mono outline-none text-center"
          />
          <span v-else class="text-yellow-400 font-mono px-1 py-0.5 bg-neutral-800 border border-neutral-700 rounded">Rnd</span>
          <label class="flex items-center gap-0.5 cursor-pointer text-neutral-500 hover:text-neutral-300 select-none">
            <input type="checkbox" v-model="fillVelocityRandom" class="w-7 h-3 accent-purple-500" />
            <span>~</span>
          </label>
          <button
            @click="applyFillVelocity"
            class="px-2 py-0.5 rounded bg-neutral-700 hover:bg-purple-700 text-white font-bold uppercase tracking-wider transition-colors text-[9px]"
          >All</button>
        </div>

        <div class="w-px h-4 bg-neutral-800 shrink-0" />

        <!-- Gate fill -->
        <div class="flex items-center gap-1.5">
          <span class="text-neutral-500">Gate</span>
          <input
            v-if="!fillGateRandom"
            v-model.number="fillGate"
            type="number" min="0" max="100"
            class="w-14 bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-purple-300 font-mono outline-none text-center"
          />
          <span v-else class="text-yellow-400 font-mono px-1 py-0.5 bg-neutral-800 border border-neutral-700 rounded">Rnd</span>
          <label class="flex items-center gap-0.5 cursor-pointer text-neutral-500 hover:text-neutral-300 select-none">
            <input type="checkbox" v-model="fillGateRandom" class="w-7 h-3 accent-purple-500" />
            <span>~</span>
          </label>
          <button
            @click="applyFillGate"
            class="px-2 py-0.5 rounded bg-neutral-700 hover:bg-purple-700 text-white font-bold uppercase tracking-wider transition-colors text-[9px]"
          >All</button>
        </div>

        <div class="w-px h-4 bg-neutral-800 shrink-0" />

        <!-- Transpose fill -->
        <div class="flex items-center gap-1.5">
          <span class="text-neutral-500">Tr</span>
          <input
            v-if="!fillTransposeRandom"
            v-model.number="fillTranspose"
            type="number" min="-24" max="24"
            class="w-12 bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-purple-300 font-mono outline-none text-center"
          />
          <span v-else class="text-yellow-400 font-mono px-1 py-0.5 bg-neutral-800 border border-neutral-700 rounded">Rnd</span>
          <label class="flex items-center gap-0.5 cursor-pointer text-neutral-500 hover:text-neutral-300 select-none">
            <input type="checkbox" v-model="fillTransposeRandom" class="w-7 h-3 accent-purple-500" />
            <span>~</span>
          </label>
          <button
            @click="applyFillTranspose"
            class="px-2 py-0.5 rounded bg-neutral-700 hover:bg-purple-700 text-white font-bold uppercase tracking-wider transition-colors text-[9px]"
          >All</button>
        </div>

        <div class="w-px h-4 bg-neutral-800 shrink-0" />

        <!-- Chord/Arp mode fill -->
        <div class="flex items-center gap-1.5">
          <span class="text-neutral-500">Mode</span>
          <div class="flex items-center rounded overflow-hidden border border-neutral-700">
            <button
              v-for="opt in [{ v: undefined, label: 'Auto' }, { v: 'chord', label: 'Chord' }, { v: 'arp', label: 'Arp' }]"
              :key="opt.label"
              @click="fillStepMode = opt.v"
              :class="['px-1.5 py-0.5 text-[10px] font-mono uppercase transition-colors', fillStepMode === opt.v ? 'bg-cyan-700 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white']"
            >{{ opt.label }}</button>
          </div>
          <button
            @click="applyFillStepMode"
            title="Set every step to this Chord/Arp override (Auto = clear override, follow global Play Mode)"
            class="px-2 py-0.5 rounded bg-neutral-700 hover:bg-cyan-700 text-white font-bold uppercase tracking-wider transition-colors text-[9px]"
          >All</button>
        </div>

        <div class="w-px h-4 bg-neutral-800 shrink-0" />

        <!-- Chord strum direction fill -->
        <div class="flex items-center gap-1.5">
          <span class="text-neutral-500">Strum</span>
          <div class="flex items-center rounded overflow-hidden border border-neutral-700">
            <button
              v-for="opt in [{ v: undefined, label: 'Sim' }, { v: 'up', label: 'Up' }, { v: 'down', label: 'Dn' }, { v: 'up-down', label: 'U-D' }, { v: 'down-up', label: 'D-U' }]"
              :key="opt.label"
              @click="fillChordMode = opt.v"
              :class="['px-1.5 py-0.5 text-[10px] font-mono uppercase transition-colors', fillChordMode === opt.v ? 'bg-purple-700 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white']"
            >{{ opt.label }}</button>
          </div>
          <button
            @click="applyFillChordMode"
            title="Set every step's chord-strum direction"
            class="px-2 py-0.5 rounded bg-neutral-700 hover:bg-purple-700 text-white font-bold uppercase tracking-wider transition-colors text-[9px]"
          >All</button>
        </div>

        <div class="w-px h-4 bg-neutral-800 shrink-0" />

        <!-- Arp pattern fill -->
        <div class="flex items-center gap-1.5">
          <span class="text-neutral-500">Pattern</span>
          <select
            v-model="fillArpMode"
            class="bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-purple-300 font-mono outline-none"
          >
            <option v-for="mode in ARP_MODES" :key="mode" :value="mode">{{ mode }}</option>
          </select>
          <button
            @click="applyFillArpMode"
            title="Set every step's arp pattern"
            class="px-2 py-0.5 rounded bg-neutral-700 hover:bg-purple-700 text-white font-bold uppercase tracking-wider transition-colors text-[9px]"
          >All</button>
        </div>

        <div class="w-px h-4 bg-neutral-800 shrink-0" />

        <!-- Arp Rate fill — sets this slot's arp rate (used by Arp mode and per-step Arp overrides) -->
        <div class="flex items-center gap-1.5" title="Set the arp rate for this slot">
          <span class="text-neutral-500">Rate</span>
          <select
            v-model="store.arpRate"
            class="bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-purple-300 font-mono outline-none"
          >
            <option v-for="d in DURATION_OPTIONS" :key="d" :value="d">{{ DURATION_LABELS[d] }}</option>
          </select>
        </div>

        <div class="w-px h-4 bg-neutral-800 shrink-0" />

        <!-- Clear -->
        <button
          @click.stop="store.clearSteps()"
          title="Clear all steps"
          class="flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-mono uppercase text-neutral-500 hover:text-red-400 border border-neutral-800 hover:border-red-800 transition-colors"
        >
          <RotateCcw class="w-3 h-3" />
          Clear
        </button>
        <!-- Manual trigger sync: AUTO (align to next bar) or OFF (immediate) -->
        <button
          @click.stop="syncStore.syncChordProgManualTrigger = !syncStore.syncChordProgManualTrigger"
          :title="syncStore.syncChordProgManualTrigger ? 'Manual triggers sync to next bar (AUTO)' : 'Manual triggers fire immediately (OFF)'"
          :class="[
            'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase border transition-colors',
            syncStore.syncChordProgManualTrigger
              ? 'border-cyan-600 text-cyan-400 bg-cyan-950/30'
              : 'border-neutral-700 text-neutral-500 hover:text-neutral-300'
          ]"
        >
          <span v-if="syncStore.syncChordProgManualTrigger">SYNC</span>
          <span v-else>SYNC</span>
        </button>
        <!-- Panic (stop held step note-off only on chord prog channel) -->
        <button
          @click.stop="releaseChord()"
          @contextmenu.prevent="openMenu($event, { name: 'cp_panic', label: 'Chord Prog: Panic' })"
          class="absolute right-10 mt-8 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider bg-neutral-800 hover:bg-red-900 text-neutral-500 hover:text-red-300 border border-neutral-700 hover:border-red-700 transition-all"
          title="Stop any manually-triggered step — sends note-offs on chord prog channel only"
        >
          <X class="w-3 h-3" />
          STOP
        </button>
      </div>

      <!-- ── BOTTOM TABS ─────────────────────────────────────────────────── -->
      <div class="shrink-0 flex border-b border-neutral-800 px-3">
        <button
          v-for="tab in ['generate', 'library', 'capture', 'chain', 'performance', 'save-load']"
          :key="tab"
          @click="activeTab = tab"
          :class="[
            'px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-colors',
            activeTab === tab ? 'border-purple-500 text-purple-300' : 'border-transparent text-neutral-500 hover:text-neutral-300'
          ]"
        >
          {{ tab === 'save-load' ? 'Save / Load' : tab === 'performance' ? 'Performance Set' : tab }}
          <span v-if="tab === 'capture' && store.captureBuffer.length" class="ml-1 text-[8px] font-black px-1 rounded bg-amber-500/15 text-amber-400">{{ store.captureBuffer.length }}</span>
        </button>
      </div>

      <div class="flex-1 overflow-hidden flex flex-col min-h-0">

        <!-- Library Tab -->
        <div v-if="activeTab === 'library'" class="flex flex-1 min-h-0 overflow-hidden gap-0">

          <!-- Key selector column -->
          <div class="w-48 shrink-0 border-r border-neutral-800 flex flex-col overflow-hidden">
            <!-- Sub-tabs -->
            <div class="flex shrink-0 border-b border-neutral-800">
              <button
                @click="libSubTab = 'keys'"
                :class="['flex-1 py-1.5 text-[9px] font-bold uppercase tracking-widest transition-colors',
                  libSubTab === 'keys' ? 'text-purple-300 bg-purple-900/20' : 'text-neutral-500 hover:text-neutral-300']"
              >Keys</button>
              <button
                @click="libSubTab = 'genre'"
                :class="['flex-1 py-1.5 text-[9px] font-bold uppercase tracking-widest transition-colors',
                  libSubTab === 'genre' ? 'text-purple-300 bg-purple-900/20' : 'text-neutral-500 hover:text-neutral-300']"
              >Genre</button>
            </div>
            <!-- Keys (0–12) -->
            <div v-if="libSubTab === 'keys'" class="flex-1 overflow-y-auto py-1 custom-scrollbar">
              <button
                v-for="(name, idx) in KEY_FILE_NAMES.slice(0, 13)"
                :key="idx"
                @click="store.selectedKey = idx"
                :class="[
                  'text-left px-3 py-1 font-mono text-[11px] transition-colors truncate w-full',
                  store.selectedKey === idx ? 'bg-purple-900/50 text-purple-300 font-bold' : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
                ]"
              >{{ name }}</button>
            </div>
            <!-- Genre (13–20) -->
            <div v-else class="flex-1 overflow-y-auto py-1 custom-scrollbar">
              <button
                v-for="(name, idx) in KEY_FILE_NAMES.slice(13)"
                :key="idx + 13"
                @click="store.selectedKey = idx + 13"
                :class="[
                  'text-left px-3 py-1 font-mono text-[11px] transition-colors truncate w-full',
                  store.selectedKey === idx + 13 ? 'bg-purple-900/50 text-purple-300 font-bold' : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
                ]"
              >{{ name }}</button>
            </div>
          </div>

          <!-- Progression list -->
          <div class="flex-1 min-w-0 flex flex-col overflow-hidden border-r border-neutral-800">
            <div class="px-3 py-1 border-b border-neutral-800 flex items-center gap-2">
              <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-500 flex-1">Progressions</span>
              <div v-if="progLoading" class="w-3 h-3 border border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <div class="flex-1 overflow-y-auto custom-scrollbar">
              <button
                v-for="name in progressionNames"
                :key="name"
                @click="selectedProgressionName = name"
                :class="[
                  'w-full text-left font-mono px-3 items-center py-1 text-[11px] truncate transition-colors',
                  selectedProgressionName === name ? 'bg-purple-900/40 text-purple-300 font-bold' : 'text-neutral-400 hover:text-white hover:bg-neutral-800/40'
                ]"
              >
                {{ name }}
              </button>
              <div v-if="!progLoading && progressionNames.length === 0" class="px-3 py-4 text-[10px] text-neutral-600 text-center">
                No progressions loaded
              </div>
            </div>
          </div>

          <!-- Chord list + assign -->
          <div class="w-56 shrink-0 flex flex-col overflow-hidden custom-scrollbar">
            <div class="px-2 py-1 border-b border-neutral-800 flex flex-col gap-1">
              <!-- Chord transpose row -->
              <div class="flex items-center gap-1 text-[9px]">
                <span class="text-neutral-500 font-mono shrink-0">Transpose</span>
                <button @click="chordTranspose = Math.max(-24, chordTranspose - 1)" class="w-4 h-4 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300">−</button>
                <span :class="['font-bold font-mono w-6 text-center', chordTranspose !== 0 ? 'text-yellow-300' : 'text-neutral-400']">{{ chordTranspose > 0 ? '+' : '' }}{{ chordTranspose }}</span>
                <button @click="chordTranspose = Math.min(24, chordTranspose + 1)" class="w-4 h-4 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300">+</button>
                <button v-if="chordTranspose !== 0" @click="chordTranspose = 0" class="text-[8px] text-neutral-600 hover:text-neutral-300">↺</button>
              </div>
              <!-- Action buttons row -->
              <div class="flex items-center gap-1">
                <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-500 shrink-0 flex-1">Chords</span>
              <div class="flex items-center gap-1">
                <button
                  v-if="selectedChord"
                  @click="loadSelectedChordToStep"
                  class="text-[9px] font-mono uppercase px-2 py-0.5 rounded bg-purple-700 hover:bg-purple-600 text-white transition-colors whitespace-nowrap"
                  :title="`Assign ${selectedChord.chordName} to step ${store.selectedStepIdx + 1}`"
                >
                  + Step {{ store.selectedStepIdx + 1 }}
                </button>
                <button
                  v-if="selectedProgressionChords.length"
                  @click="loadProgressionToSteps"
                  class="text-[9px] font-mono uppercase px-2 py-0.5 rounded bg-neutral-700 hover:bg-neutral-600 text-white transition-colors whitespace-nowrap"
                >
                  Load All
                </button>
              </div>
              </div><!-- end action buttons row -->
            </div><!-- end header -->
            <div class="flex-1 overflow-y-auto">
              <button
                v-for="(chord, idx) in selectedProgressionChords"
                :key="idx"
                @click="previewChord(chord)"
                :class="[
                  'w-full text-left px-3 py-1 text-[10px] transition-colors flex items-center justify-between gap-2',
                  selectedChord?.chordName === chord.chordName && selectedChord?.notes?.join() === chord.notes?.join()
                    ? 'bg-purple-800/50 text-white'
                    : 'text-neutral-300 hover:text-white hover:bg-purple-900/30'
                ]"
              >
                <span class="font-mono text-[12px] truncate">{{ chord.chordName }}</span>
                <span class="text-neutral-600 font-mono text-[8px] shrink-0">{{ chord.notes.length }}n</span>
              </button>
              <div v-if="!selectedProgressionName" class="px-3 py-4 text-[10px] text-neutral-600 text-center">
                Select a progression
              </div>
            </div>
          </div>
        </div>

        <!-- Generate Tab -->
        <div v-else-if="activeTab === 'generate'" class="flex-1 p-4 flex gap-4 overflow-y-auto custom-scrollbar justify-between">
            <div class="flex flex-col gap-2">
              
              <!-- Hidden file input -->
              <input
                ref="midiFileInputRef"
                type="file"
                accept=".mid,.midi"
                class="hidden"
                @change="handleMidiFileImport"
              />
             
              
              <!-- Generate button -->
              <button
                @click="handleGenerate"
                :disabled="progLoading || progressionNames.length === 0"
                class="flex items-center gap-2 px-4 py-2 rounded bg-purple-700 hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-[11px] uppercase tracking-widest transition-colors self-start"
                >
                <Zap class="w-4 h-4" />
                Generate Progression
              </button>
              <!-- Source: the library the progression comes from (Modal Chords by default) -->
              <div class="flex items-center gap-2">
                <span class="text-[10px] text-neutral-500 font-mono w-12">Source</span>
                <select v-model.number="store.selectedKey"
                        class="bg-neutral-800 border border-neutral-700 rounded px-1.5 py-0.5 text-[11px] text-purple-300 font-bold outline-none">
                  <option v-for="(name, idx) in KEY_FILE_NAMES" :key="idx" :value="idx">{{ name.replace(/^· /, 'Genre · ') }}</option>
                </select>
                <button type="button" data-prog-browse
                        :disabled="progLoading || progressionNames.length === 0"
                        class="flex items-center gap-1 px-2 py-0.5 rounded border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-[10px] font-bold uppercase tracking-widest text-purple-300 disabled:opacity-40"
                        :title="`The progressions of ${KEY_FILE_NAMES[store.selectedKey]?.replace(/^· /, 'Genre · ')} (${progressionNames.length}): hear them, put one in the slot`"
                        @click="showProgBrowser = true"><ListMusic class="w-3 h-3" /> {{ progressionNames.length }}</button>
              </div>
              <!-- Modal Chords: the root to stay on -->
              <div v-if="store.selectedKey === MODAL_KEY_INDEX" class="flex items-center gap-2">
                <span class="text-[10px] text-neutral-500 font-mono w-12">Root</span>
                <select :value="store.modalRoot ?? ''" @change="store.modalRoot = $event.target.value === '' ? null : Number($event.target.value)"
                        class="bg-neutral-800 border border-neutral-700 rounded px-1.5 py-0.5 text-[11px] text-purple-300 font-bold font-mono outline-none"
                        title="Modal Chords: only the progressions on this root (Rig Key ◀ ▶ moves it)">
                  <option value="">Any</option>
                  <option v-for="(n, i) in KEY_NOTE_NAMES" :key="n" :value="i">{{ n }}</option>
                </select>
              </div>
              <!-- Mode: exactly the major or the minor key of the pair (e.g. Cm), or both -->
              <div v-if="store.selectedKey < 12" class="flex items-center gap-2">
                <span class="text-[10px] text-neutral-500 font-mono w-12">Key</span>
                <div class="flex rounded border border-neutral-700 overflow-hidden">
                  <button v-for="m in [['major', 'Major'], ['minor', 'Minor'], [null, 'Both']]" :key="String(m[0])"
                          @click="store.keyMode = m[0]"
                          :class="['px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest transition-colors',
                            store.keyMode === m[0] ? 'bg-purple-800 text-purple-100' : 'text-neutral-500 hover:text-neutral-200']"
                          :title="m[0] === 'major' ? 'Major key: the library\'s major progressions (50 per key)' : m[0] === 'minor' ? 'Minor key: the library\'s minor progressions (60 per key)' : 'Any progression of the pair'">{{ m[1] }}</button>
                </div>
                <span class="text-[11px] font-bold text-purple-300 font-mono">{{ keyLabel(store.selectedKey, store.keyMode) }}</span>
              </div>
              <!-- Style: harmonic rhythm, mood, voicing -->
              <div class="flex items-center gap-2">
                <span class="text-[10px] text-neutral-500 font-mono w-12">Style</span>
                <select v-model="store.genStyle"
                        class="bg-neutral-800 border border-neutral-700 rounded px-1.5 py-0.5 text-[11px] text-purple-300 font-bold outline-none">
                  <option v-for="n in CHORD_GEN_STYLE_NAMES" :key="n" :value="n">{{ n }}</option>
                </select>
                <span class="text-[9px] text-neutral-500 font-mono">{{ styleSummary }}</span>
              </div>
              <div class="text-[10px] text-neutral-400 leading-relaxed max-w-[300px]">
                Generate a progression from the source (Modal Chords: on its root; Major / Minor: that key exactly).
                The style sets each chord's length, gate and velocity, the voicing and — on Modal Chords — the moods
                it picks first. Fill › Dur › All still sets every length afterwards.
              </div>

          </div>

          <div class="flex flex-col gap-2">
            <div class="text-[10px] text-neutral-400 leading-relaxed max-w-[300px]">
              <button
              @click.stop="showAiPrompt = true"
              title="AI Prompt"
              class="flex items-center gap-2 px-4 py-2 rounded bg-purple-700 hover:bg-purple-600 text-white font-bold text-[11px] uppercase tracking-widest transition-colors self-start mb-3"
            >
              <Sparkles class="w-4 h-4" />
              AI Generate
            </button>
            <div class="text-[10px] text-neutral-400 leading-relaxed max-w-[300px]">
              To use the AI generator, you must have an OpenAI API key. Enter your key in the Settings panel. Then click the AI Generate button and enter a prompt describing the type of chord progression you want to generate.
            </div>
          </div>
          </div>
          
          <!-- MIDI File Import -->
          <div class="flex flex-col gap-2">
            <button
              @click="midiFileInputRef?.click()"
              class="flex items-center gap-2 px-4 py-2 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-[11px] uppercase tracking-widest transition-colors self-start"
              >
              <Music2 class="w-4 h-4" />
              Import MIDI
            </button>
            <div class="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mb-2">Import .mid File</div>
          
            <!-- Track selector overlay -->
            <Transition name="sy-modal">
              <div
                v-if="midiImportResult"
                class="mt-3 p-3 rounded-lg border border-emerald-600/40 bg-emerald-950/30"
              >
                <div class="text-[10px] text-neutral-400 mb-2">Select track to import ({{ midiImportBpm }} BPM):</div>
                <div class="flex flex-wrap gap-1.5 mb-3">
                  <button
                    v-for="(track, idx) in midiImportResult"
                    :key="idx"
                    @click="selectedMidiTrack = idx"
                    :class="[
                      'px-2 py-1 rounded text-[10px] font-mono transition-colors border',
                      selectedMidiTrack === idx
                        ? 'bg-emerald-700 border-emerald-500 text-white'
                        : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:border-emerald-600 hover:text-emerald-300'
                    ]"
                  >
                    {{ track.name || `Track ${idx + 1}` }}
                    <span class="text-neutral-500 ml-1">({{ track.notes.length }}n)</span>
                  </button>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    @click="applyMidiImportTrack"
                    class="px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-widest transition-colors"
                  >
                    Load to Steps
                  </button>
                  <button
                    @click="midiImportResult = null; _lastParseResult = null"
                    class="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-[10px] font-mono transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </Transition>
          </div>
        </div>

        <!-- Performance Set Tab -->
        <div v-else-if="activeTab === 'performance'" class="flex-1 flex flex-col overflow-hidden min-h-0">
          <div class="px-3 py-1.5 border-b border-neutral-800 flex items-center gap-2 shrink-0">
            <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-500 flex-1">Performance Sets</span>
            <span v-if="pcSets.length" class="text-[8px] font-black px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 border border-violet-500/20">{{ pcSets.length }}</span>
          </div>
          <div class="flex-1 overflow-y-auto custom-scrollbar">
            <button
              v-for="set in pcSets"
              :key="set.id"
              @click="recallPcSet(set)"
              :class="[
                'w-full text-left flex items-center gap-3 px-4 py-2.5 border-b border-neutral-800/50 transition-colors group',
                activePcSetId === set.id
                  ? 'bg-violet-900/30 border-l-2 border-l-violet-500'
                  : 'hover:bg-violet-900/20 border-l-2 border-l-transparent'
              ]"
            >
              <div class="flex-1 min-w-0">
                <div :class="['text-[13px] font-bold truncate transition-colors', activePcSetId === set.id ? 'text-violet-300' : 'text-white group-hover:text-violet-200']">
                  {{ set.name }}
                </div>
                <div class="text-[10px] text-neutral-600 font-mono mt-0.5">
                  {{ set.devices.length }} device{{ set.devices.length !== 1 ? 's' : '' }}
                  <span v-if="set.midiChannel"> · CH{{ set.midiChannel }}</span>
                </div>
              </div>
              <RotateCcw :class="['w-3.5 h-3.5 shrink-0 transition-colors', activePcSetId === set.id ? 'text-violet-400' : 'text-neutral-700 group-hover:text-violet-400']" />
            </button>
            <div v-if="pcSets.length === 0" class="px-4 py-8 text-[10px] text-neutral-600 text-center font-mono">
              No performance sets saved — create them in the Multi Sound panel
            </div>
          </div>
        </div>

        <!-- Save / Load Tab -->
        <div v-else-if="activeTab === 'save-load'" class="flex-1 flex gap-0 overflow-hidden custom-scrollbar min-h-0">

          <!-- Save panel -->
          <div class="w-64 shrink-0 border-r border-neutral-800 flex flex-col p-3 gap-3">
            <div class="text-[9px] font-bold uppercase tracking-widest text-neutral-500">Save</div>
            <template v-if="authStore.user">
              <input
                v-model="savePatternName"
                placeholder="Pattern name…"
                class="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-[11px] text-white outline-none focus:border-purple-500 w-full"
                @keydown.enter="handleSave"
              />
              <div class="flex items-center gap-2">
                <button
                  @click="handleSave"
                  :disabled="savingPattern || !savePatternName.trim()"
                  class="flex items-center gap-1 px-3 py-1.5 rounded bg-purple-700 hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-[10px] uppercase tracking-wider transition-colors"
                >
                  <Save class="w-3.5 h-3.5" />
                  {{ savingPattern ? 'Saving…' : 'Save' }}
                </button>
                <label class="flex items-center gap-1.5 cursor-pointer select-none text-[10px] font-mono text-neutral-500 hover:text-neutral-300">
                  <input type="checkbox" v-model="saveAllSlots" class="accent-purple-500" />
                  All Slots
                </label>
              </div>
              <div v-if="saveAllSlots" class="text-[9px] text-cyan-400 font-mono">Saves all 8 slots + chain configuration</div>
              <div v-if="saveError" class="text-[10px] text-red-400">{{ saveError }}</div>
            </template>
            <div v-else class="text-[10px] text-neutral-600">Sign in to save progressions</div>
          </div>

          <!-- Load panel -->
          <div class="flex-1 min-w-0 flex flex-col overflow-hidden">
            <div class="px-3 py-1.5 border-b border-neutral-800 flex items-center gap-2">
              <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-500 flex-1">Saved Progressions</span>
              <div v-if="store.loadingLibrary" class="w-3 h-3 border border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <div class="flex-1 overflow-y-auto">
              <div
                v-for="pattern in store.libraryPatterns"
                :key="pattern.id"
                class="flex items-center gap-2 px-3 py-1.5 border-b border-neutral-800/50 hover:bg-neutral-800/30 group"
              >
                <div class="flex-1 min-w-0">
                  <div class="text-[11px] font-bold text-white truncate flex items-center gap-1.5">
                    {{ pattern.name }}
                    <span v-if="pattern.type === 'all'" class="text-[7px] font-mono uppercase tracking-wider px-1 py-0.5 rounded bg-cyan-950/40 text-cyan-400 border border-cyan-700/40">8 Slots</span>
                    <span v-else class="text-[7px] font-mono uppercase tracking-wider px-1 py-0.5 rounded bg-purple-950/40 text-purple-400 border border-purple-700/40">{{ String.fromCharCode(65 + (pattern.slotIndex ?? 0)) }}</span>
                  </div>
                  <div class="text-[9px] text-neutral-600 font-mono">
                    {{ KEY_FILE_NAMES[pattern.selectedKey] || '—' }} · {{ pattern.numSteps }} steps
                  </div>
                </div>
                <button
                  @click="handleLoadPattern(pattern)"
                  class="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-purple-800 text-neutral-400 hover:text-white transition-all"
                  title="Load"
                >
                  <FolderOpen class="w-3.5 h-3.5" />
                </button>
                <button
                  @click="handleUpdatePattern(pattern)"
                  class="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-cyan-800 text-neutral-400 hover:text-cyan-300 transition-all"
                  title="Update (overwrite with current steps)"
                >
                  <Save class="w-3.5 h-3.5" />
                </button>
                <button
                  @click="handleDeletePattern(pattern.id)"
                  class="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-900 text-neutral-400 hover:text-red-400 transition-all"
                  title="Delete"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
              <div v-if="!store.loadingLibrary && store.libraryPatterns.length === 0" class="px-3 py-6 text-[10px] text-neutral-600 text-center">
                {{ authStore.user ? 'No saved progressions' : 'Sign in to use library' }}
              </div>
            </div>
          </div>
        </div>

        <!-- Capture Tab — chords snapshotted from the MIDI input by the cp_capture button -->
        <div v-else-if="activeTab === 'capture'" class="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div class="px-3 py-1.5 border-b border-neutral-800 flex items-center gap-2 shrink-0">
            <button
              @click="store.captureChord()"
              @contextmenu.prevent="openMenu($event, { name: 'cp_capture', label: 'Chord Prog: Capture Chord' })"
              title="Capture the chord held (or last played) on the MIDI input — right-click to MIDI Learn a controller button"
              class="relative flex items-center gap-1 px-2 py-0.5 rounded bg-amber-700/80 hover:bg-amber-600 text-white text-[9px] font-bold uppercase tracking-wider transition-colors"
            >
              <span v-if="mappingStore.learningParamName === 'cp_capture'" class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none" />
              <Music2 class="w-3 h-3" />
              Capture
            </button>
            <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-500 flex-1">Captured Chords</span>
            <span class="text-[8px] text-neutral-600 font-mono">{{ store.captureBuffer.length }} / {{ CAPTURE_MAX }}</span>
            <button
              @click="store.importCaptureBuffer(0)"
              :disabled="!store.captureBuffer.length"
              :title="`Import into slot ${String.fromCharCode(65 + store.activeSlotIndex)} from step 1 (pattern length = captured count)`"
              class="px-2 py-0.5 rounded bg-purple-700 hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[9px] font-bold uppercase tracking-wider transition-colors"
            >Import → {{ String.fromCharCode(65 + store.activeSlotIndex) }}</button>
            <button
              @click="store.importCaptureBuffer(store.selectedStepIdx)"
              :disabled="!store.captureBuffer.length"
              :title="`Import into slot ${String.fromCharCode(65 + store.activeSlotIndex)} starting at the selected step`"
              class="px-2 py-0.5 rounded bg-neutral-800 hover:bg-purple-800 disabled:opacity-40 disabled:cursor-not-allowed text-neutral-300 text-[9px] font-bold uppercase tracking-wider transition-colors"
            >At step {{ store.selectedStepIdx + 1 }}</button>
            <button
              @click="store.clearCaptureBuffer()"
              :disabled="!store.captureBuffer.length"
              class="px-2 py-0.5 rounded bg-neutral-800 hover:bg-red-900 disabled:opacity-40 text-neutral-400 hover:text-red-400 text-[9px] font-bold uppercase tracking-wider transition-colors"
              title="Clear the capture buffer"
            >Clear</button>
          </div>
          <div class="flex-1 overflow-y-auto custom-scrollbar p-3">
            <div v-if="!store.captureBuffer.length" class="text-[10px] text-neutral-500 leading-relaxed max-w-[420px]">
              Play a chord on your MIDI keyboard and press <b>Capture</b> — or right-click it to MIDI Learn a controller button,
              then each press stores the chord you are holding (or the last one you played). Captures work even with this panel closed.
            </div>
            <div v-else class="grid grid-cols-8 gap-2">
              <div
                v-for="(chord, i) in store.captureBuffer"
                :key="i"
                @click="previewChord(chord)"
                :title="chord.notes.map(noteLabel).join(' ')"
                class="flex flex-col gap-0.5 p-2 rounded border border-amber-700/40 bg-amber-950/20 hover:border-amber-500/60 cursor-pointer transition-colors"
              >
                <div class="flex items-center justify-between">
                  <span class="text-[10px] font-mono text-neutral-500">#{{ i + 1 }}</span>
                  <button
                    @click.stop="store.removeCapturedChord(i)"
                    class="text-[9px] text-neutral-600 hover:text-red-400 transition-colors"
                    title="Remove"
                  >✕</button>
                </div>
                <span class="text-[11px] font-bold text-amber-300 truncate">{{ chord.chordName }}</span>
                <span class="text-[8px] font-mono text-neutral-500 truncate">{{ chord.notes.map(noteLabel).join(' ') }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Chain Tab -->
        <div v-else-if="activeTab === 'chain'" class="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div class="px-3 py-1.5 border-b border-neutral-800 flex items-center gap-2 shrink-0">
            <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-500 flex-1">Chain Editor</span>
            <span class="text-[8px] text-neutral-600 font-mono">{{ store.chain.filter(i => i >= 0).length }} / {{ store.CHAIN_MAX }}</span>
            <button
              @click="store.chainClear()"
              class="px-2 py-0.5 rounded bg-neutral-800 hover:bg-red-900 text-neutral-400 hover:text-red-400 text-[9px] font-bold uppercase tracking-wider transition-colors"
              title="Clear chain"
            >Clear</button>
          </div>
          <div class="flex-1 overflow-y-auto custom-scrollbar p-3">
            <div class="grid grid-cols-8 gap-2">
              <div
                v-for="(slotIdx, pos) in store.chain"
                :key="pos"
                class="flex flex-col gap-1 p-2 rounded border transition-colors"
                :class="slotIdx >= 0 ? 'border-purple-700/40 bg-purple-950/20' : 'border-neutral-800 bg-neutral-950/40'"
              >
                <div class="flex items-center justify-between">
                  <span class="text-[10px] font-mono text-neutral-500">#{{ pos + 1 }}</span>
                  <button
                    v-if="slotIdx >= 0"
                    @click="store.chainRemove(pos)"
                    class="text-[9px] text-neutral-600 hover:text-red-400 transition-colors"
                    title="Remove from chain"
                  >✕</button>
                </div>
                <select
                  :value="slotIdx"
                  @change="e => store.chainSet(pos, parseInt(e.target.value))"
                  class="bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-[11px] font-mono outline-none"
                  :class="slotIdx >= 0 ? 'text-purple-300' : 'text-neutral-600'"
                >
                  <option :value="-1">—</option>
                  <option v-for="i in store.SLOT_COUNT" :key="i" :value="i - 1">{{ String.fromCharCode(64 + i) }}</option>
                </select>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
    </template>
    <!-- Performance: the play view (display only; the Rig plays it) -->
    <template v-else>
      <PlayPanelHeader title="Chord Prog" panel-id="chord-prog" accent="text-purple-300" @pointerdown="onDragStart" @close="emit('close')" @minimize="toggleMinimize" @maximize="maximize">
        <!-- the whole progression's mode: AUTO / CHORD / ARP -->
        <ChordModeSwitch />
        <!-- Generate's Source / Root / Style (also the Rig's Chord GEN) -->
        <ChordGenControls @browse="showProgBrowser = true" />
        <!-- the key / scale detected + AUTO SEQ -->
        <ChordKeyBadge />
      </PlayPanelHeader>
      <ChordProgPlayView v-if="!isMinimized" class="flex-1 overflow-hidden" />
    </template>

    <!-- Resize handles: every edge and corner -->
    <ResizeHandles v-if="!isMinimized" :start="onResizeStart" />

    <!-- Progressions of the Source (Generate's / the play view header's list button) -->
    <Teleport to="body">
    <ProgressionBrowserModal
      v-if="showProgBrowser"
      :title="store.selectedKey < 12 && store.keyMode ? keyLabel(store.selectedKey, store.keyMode) : (KEY_FILE_NAMES[store.selectedKey]?.replace(/^· /, 'Genre · ') ?? '')"
      :names="browserNames" :data="progressionData" :loading="progLoading"
      :root="store.selectedKey === MODAL_KEY_INDEX ? store.modalRoot : null"
      :style-name="store.genStyle" :num-steps="store.numSteps"
      @preview="previewChord" @use="onBrowserUse" @load="onBrowserLoad" @close="showProgBrowser = false"
    />
    </Teleport>

    <!-- Custom chord assignment modal -->
    <ChordAssignModal
      v-if="showChordAssign && selectedStep"
      :step-idx="store.selectedStepIdx"
      :current-notes="selectedStep?.notes ?? []"
      :current-name="selectedStep?.chordName ?? ''"
      :prev-notes="prevStep?.notes ?? []"
      :prev-name="prevStep?.chordName ?? ''"
      @assign="onChordAssigned"
      @close="showChordAssign = false"
    />

    <!-- Step copy/paste context menu (right-click a step in the grid) -->
    <div
      v-if="stepContextMenu.visible"
      class="fixed inset-0 z-[200]"
      @click="closeStepContextMenu"
      @contextmenu.prevent="closeStepContextMenu"
    />
    <div
      v-if="stepContextMenu.visible"
      class="fixed z-[201] w-40 bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl overflow-hidden text-[11px] font-mono"
      :style="{ left: (stepContextMenu.x -200) + 'px', top: (stepContextMenu.y-30) + 'px' }"
    >
      <button
        @click="copyStep(stepContextMenu.idx)"
        class="w-full text-left px-3 py-1.5 text-neutral-300 hover:bg-purple-700/40 hover:text-white transition-colors"
      >Copy Step {{ stepContextMenu.idx + 1 }}</button>
      <button
        @click="stepClipboard && pasteStep(stepContextMenu.idx)"
        :class="[
          'w-full text-left px-3 py-1.5 transition-colors border-t border-neutral-800',
          stepClipboard ? 'text-neutral-300 hover:bg-purple-700/40 hover:text-white' : 'text-neutral-700 cursor-not-allowed'
        ]"
      >Paste to Step {{ stepContextMenu.idx + 1 }}</button>
    </div>

    <!-- Slot copy context menu (right-click a slot A-H) -->
    <div
      v-if="slotContextMenu.visible"
      class="fixed inset-0 z-[200]"
      @click="closeSlotContextMenu"
      @contextmenu.prevent="closeSlotContextMenu"
    />
    <div
      v-if="slotContextMenu.visible"
      class="fixed z-[201] w-44 bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl overflow-hidden text-[11px] font-mono"
      :style="{ left: slotContextMenu.x + 'px', top: slotContextMenu.y + 'px' }"
    >
      <div class="px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-neutral-500 border-b border-neutral-800">
        Copy {{ String.fromCharCode(65 + slotContextMenu.idx) }} to…
      </div>
      <button
        v-for="i in store.SLOT_COUNT"
        :key="i"
        v-show="i - 1 !== slotContextMenu.idx"
        @click="copySlotToSlot(slotContextMenu.idx, i - 1)"
        class="w-full text-left px-3 py-1.5 text-neutral-300 hover:bg-purple-700/40 hover:text-white transition-colors"
      >Slot {{ String.fromCharCode(64 + i) }}</button>
      <div class="border-t border-neutral-800" />
      <button
        @click="favoriteSlotAsChords(slotContextMenu.idx); closeSlotContextMenu()"
        class="w-full text-left px-3 py-1.5 text-neutral-300 hover:bg-amber-700/40 hover:text-amber-300 transition-colors flex items-center gap-1.5"
      ><Star class="w-3 h-3" /> Favorite All Chords</button>
    </div>

    <!-- AI Loading Overlay -->
    <div
      v-if="aiLoading"
      class="absolute inset-0 z-[300] flex flex-col items-center justify-center bg-neutral-900/90 rounded-lg"
    >
      <div class="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-3" />
      <span class="text-sm font-mono text-purple-300 animate-pulse">Loading progression…</span>
    </div>

    <!-- AI Prompt -->
    <AiPromptModal
      v-if="showAiPrompt"
      app-key="chord-prog"
      system-prompt="You are a music theory assistant. Generate a chord progression as a JSON array of {chordName, notes} objects for a 16-step chord sequencer. notes are MIDI note numbers. Output ONLY valid JSON."
      placeholder="e.g. ambient romantic 8 chords in C major"
      button-label="Generate Progression"
      @result="handleAiResult"
      @close="showAiPrompt = false"
    />
    <SongComposerDialog v-if="showSongComposer" @close="showSongComposer = false" />
  </div>
</template>
