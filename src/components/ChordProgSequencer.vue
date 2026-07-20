<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Play, Square, X, Minus, ChevronLeft, ChevronRight, RotateCcw, Save, FolderOpen, Trash2, Zap, Music2, AudioLines } from 'lucide-vue-next'
import { getTransport, getDraw, start as toneStart } from 'tone'
import { useTransportManager } from '@/composables/useTransportManager'
import { midiService, MidiSource } from '@/core/midi/midi-service'
import { useMidiStore } from '@/stores/useMidiStore'
import { useArpStore } from '@/stores/useArpStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { userKey } from '@/lib/userKey'
import { usePresetStore } from '@/stores/usePresetStore'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'
import { useSyncStore } from '@/stores/useSyncStore'
import { useUiStore } from '@/stores/useUiStore'
import { useChordProgStore, DURATION_OPTIONS, DURATION_LABELS, DEFAULT_CHORD_STEP } from '@/stores/useChordProgStore'
import { useProgressionLoader, KEY_FILE_NAMES } from '@/composables/useProgressionLoader'

const props = defineProps({
  isOpen: Boolean,
  bpm: { type: Number, default: 120 },
  channel: { type: Number, default: 1 },
})
const emit = defineEmits(['close'])

const midiStore = useMidiStore()
const arpStore = useArpStore()
const authStore = useAuthStore()
const presetStore = usePresetStore()
const transportManager = useTransportManager()
const store = useChordProgStore()
const syncStore = useSyncStore()
const uiStore = useUiStore()
const { progressionData, progressionNames, loading: progLoading, loadByIndex } = useProgressionLoader()

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } = useDraggableResizable({
  storageKey: 'SYCORE_POS_CHORD_PROG',
  minimizeLabel: 'Chord Prog Sequencer',
  initialWidth: 900,
  initialHeight: 640,
  minWidth: 640,
  minHeight: 440,
  zIndex: 100,
})
watch(() => props.isOpen, (v) => { if (v) bringToFront() })

// ── Playback ─────────────────────────────────────────────────────────────────

// Ticks per duration (base = 384th note = 1 tick, i.e. PPQ=96 per quarter)
// Schedule fires every '384n'; multiply old 128n-based values by 3 so triplets become integers.
const DURATION_TICKS = {
  '128n': 3,   '64n': 6,   '32n': 12,
  '16n': 24,   '16n.': 36, '16t': 16,
  '8n': 48,    '8n.': 72,  '8t': 32,
  '4n': 96,    '4n.': 144, '4t': 64,
  '2n': 192,   '2n.': 288,
  '1m': 384,   '2m': 768,  '4m': 1536, '8m': 3072,
}

const playStateRef = { current: {} }
const repeatEventIdRef = ref(null)
const rafRef = ref(null)

// Plain JS (non-reactive) for timing-critical note tracking.
// Vue reactive refs cause stale reads and proxy overhead inside nested setTimeout callbacks.
let _pendingTimeouts = new Set()  // all scheduled timeout IDs
let _activeNoteKeys = new Set()   // "note-channel" keys currently sounding
let _stopPending = false          // set synchronously on stop; blocks any queued tid callbacks
let _transportTicks = 0          // our own tick counter (384n resolution, resets on each play)
let _captureArmed = false         // set true on play, consumed by next schedule tick
let _captureBarsRemaining = 0     // tick counter until auto-stop
let _captureRecording = false     // set true after pre-roll fires, cleared on stop

const seqTranspose = ref(0)
const loopEnabled = ref(true)

// ── Audio Capture Sync ────────────────────────────────────────────────────────
const captureBarCount = ref(parseInt(localStorage.getItem(userKey('S1_CP_CAPTURE_BARS')) ?? '4', 10))
const captureAutoStop = ref(localStorage.getItem(userKey('S1_CP_CAPTURE_AUTOSTOP')) !== 'false')
const captureArmed = ref(false)
const captureRecording = ref(false)

watch(captureBarCount, v => localStorage.setItem(userKey('S1_CP_CAPTURE_BARS'), v.toString()))
watch(captureAutoStop, v => localStorage.setItem(userKey('S1_CP_CAPTURE_AUTOSTOP'), v ? 'true' : 'false'))

function buildPlayState() {
  let steps = store.steps
  let numSteps = store.numSteps
  let playMode = store.playMode
  let arpRate = store.arpRate

  if (store.chainEnabled && store.chain.some(i => i >= 0)) {
    const chainSteps = store.getChainSteps()
    steps = chainSteps.steps
    numSteps = chainSteps.numSteps
  }

  return {
    isPlaying: store.isPlaying,
    steps,
    numSteps,
    bpm: arpStore.arpBpm || 120,
    channel: midiStore.midiChannel,
    playMode,
    arpRate,
    transpose: seqTranspose.value,
    loop: loopEnabled.value,
    stepPointer: 0,
    tickCounter: 0,
  }
}

let _panicTimeout = null

function stopAllNotes() {
  _stopPending = true
  _pendingTimeouts.forEach(id => clearTimeout(id))
  _pendingTimeouts.clear()
  _activeNoteKeys.forEach(key => {
    const [noteStr, chanStr] = key.split('-')
    midiStore.sendNoteOff(parseInt(noteStr), 0, parseInt(chanStr), MidiSource.CHORD_PROG)
  })
  _activeNoteKeys.clear()
  // Delayed panic: catches any note-ons that slipped through the timing gap
  if (_panicTimeout) clearTimeout(_panicTimeout)
  _panicTimeout = window.setTimeout(() => { midiStore.panic(); _panicTimeout = null }, panicDelayMs.value)
}

watch(() => store.isPlaying, (playing) => {
  if (!playing) {
    if (repeatEventIdRef.value !== null) {
      getTransport().clear(repeatEventIdRef.value)
      repeatEventIdRef.value = null
    }
    transportManager.releaseTransport()
    stopAllNotes()
    store.currentStep = 0
    playStateRef.current = {}
    _captureArmed = false
    if (_captureRecording) {
      _captureRecording = false
      captureRecording.value = false
      window.dispatchEvent(new CustomEvent('capture-stop-rec'))
    }
    captureArmed.value = false
    return
  }

  // Reset stop flag and clear stale state before starting
  _stopPending = false
  _transportTicks = 0
  _pendingTimeouts.clear()
  _activeNoteKeys.clear()
  playStateRef.current = buildPlayState()

  toneStart().then(() => {
    getTransport().bpm.value = arpStore.arpBpm || 120

const alignToBar = transportManager.isRunning.value && syncStore.syncChordProgToTransport.value
    repeatEventIdRef.value = getTransport().scheduleRepeat((time) => {
      const state = playStateRef.current
      if (!state.isPlaying || _stopPending) return

      _transportTicks++

      // ── Audio capture sync with pre-roll & auto-stop ─────────────────
      if (syncStore.syncChordProgToAudioCapture) {
        if (_captureArmed) {
          _captureArmed = false
          _captureRecording = true
          captureArmed.value = false
          captureRecording.value = true

          // Total ticks = sum of all chord durations (one full pass through the progression)
          const totalTicks = state.steps.reduce((acc, s) => {
            return acc + (DURATION_TICKS[s?.duration] ?? 32)
          }, 0)
          _captureBarsRemaining = captureAutoStop.value ? totalTicks : Infinity

          const PRE_ROLL = 0.2
          const timeUntilBeat = time - getTransport().now()
          const actualPreRoll = Math.min(PRE_ROLL, Math.max(0, timeUntilBeat))
          const delayMs = Math.max(0, (timeUntilBeat - PRE_ROLL) * 1000)

          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('capture-start-rec', {
              detail: { background: true, preRoll: actualPreRoll },
            }))
          }, delayMs)

          // Count this tick (armed tick is still a real tick)
          _captureBarsRemaining -= 1
        } else if (_captureRecording) {
          // Each schedule fire is 1 tick (384n resolution), so decrement by 1.
          _captureBarsRemaining -= 1
          if (_captureBarsRemaining <= 0) {
            _captureRecording = false
            captureRecording.value = false
            getDraw().schedule(() => {
              window.dispatchEvent(new CustomEvent('capture-stop-rec'))
            }, time)
          }
        }
      }

      const activeCount = Math.max(1, Math.min(state.numSteps, 16))
      const step = state.steps[state.stepPointer]
      const ticksNeeded = DURATION_TICKS[step?.duration] ?? 32

      if (state.tickCounter === 0) {
        getDraw().schedule(() => {
          store.currentStep = state.stepPointer
        }, time)

        if (step?.active && step.velocity > 0 && step.notes?.length > 0 && state.playMode !== 'arp') {
          const tickMs = 60000 / (state.bpm * 96)
          const stepMs = tickMs * ticksNeeded
          const noteDurationMs = Math.max(10, stepMs * ((step.gate ?? 80) / 100))
          const channel = state.channel
          step.notes.forEach(note => {
            const clampedNote = Math.max(0, Math.min(127, note + (state.transpose || 0) + (step.transpose || 0)))
            const noteKey = `${clampedNote}-${channel}`
            midiStore.sendNoteOn(clampedNote, step.velocity, channel, MidiSource.CHORD_PROG)
            _activeNoteKeys.add(noteKey)
            const tid = window.setTimeout(() => {
              _pendingTimeouts.delete(tid)
              midiStore.sendNoteOff(clampedNote, 0, channel, MidiSource.CHORD_PROG)
              _activeNoteKeys.delete(noteKey)
            }, noteDurationMs)
            _pendingTimeouts.add(tid)
          })
        }
      }

      if (state.playMode === 'arp' && step?.active && step.velocity > 0 && step.notes?.length > 0) {
        const arpTicks = DURATION_TICKS[state.arpRate] ?? 8
        if (state.tickCounter % arpTicks === 0) {
          if (_stopPending) return
          const tickMs = 60000 / (state.bpm * 96)
          const arpMs = tickMs * arpTicks
          const noteDurationMs = Math.max(10, arpMs * ((step.gate ?? 80) / 100))
          const channel = state.channel
          const noteIdx = Math.floor(state.tickCounter / arpTicks) % step.notes.length
          const clampedNote = Math.max(0, Math.min(127, step.notes[noteIdx] + (state.transpose || 0) + (step.transpose || 0)))
          const noteKey = `${clampedNote}-${channel}`
          midiStore.sendNoteOn(clampedNote, step.velocity, channel, MidiSource.CHORD_PROG)
          _activeNoteKeys.add(noteKey)
          const tid = window.setTimeout(() => {
            _pendingTimeouts.delete(tid)
            midiStore.sendNoteOff(clampedNote, 0, channel, MidiSource.CHORD_PROG)
            _activeNoteKeys.delete(noteKey)
          }, arpMs)
          _pendingTimeouts.add(tid)
        }
      }

      state.tickCounter++
      if (state.tickCounter >= ticksNeeded) {
        state.tickCounter = 0
        const nextPointer = state.stepPointer + 1
        if (nextPointer >= activeCount) {
          if (!state.loop) {
            getDraw().schedule(() => { store.isPlaying = false }, time)
          }
          state.stepPointer = 0
        } else {
          state.stepPointer = nextPointer
        }
      }
    }, '384n', alignToBar ? transportManager.getNextBarPosition() : undefined)

    transportManager.acquireTransport()
  })
})

// Sync live state changes into playStateRef without restarting
watch([() => store.steps, () => store.numSteps, () => store.playMode, () => store.arpRate, () => midiStore.midiChannel], () => {
  if (playStateRef.current && store.isPlaying) {
    playStateRef.current.steps = store.steps
    playStateRef.current.numSteps = store.numSteps
    playStateRef.current.playMode = store.playMode
    playStateRef.current.arpRate = store.arpRate
    playStateRef.current.channel = midiStore.midiChannel
  }
}, { deep: true })

watch(seqTranspose, v => { if (playStateRef.current) playStateRef.current.transpose = v })
watch(loopEnabled, v => { if (playStateRef.current) playStateRef.current.loop = v })

watch(() => store.isPlaying, (playing) => {
  if (midiStore.syncChordProgTransport) {
    if (playing) midiStore.sendStart()
    else midiStore.sendStop()
  }
  if (syncStore.syncChordProgToAudioCapture) {
    if (playing) {
      // Arm capture — the next transport tick will fire start-rec with pre-roll
      _captureArmed = true
      captureArmed.value = true
    } else {
      _captureArmed = false
      captureArmed.value = false
      if (_captureRecording) {
        _captureRecording = false
        captureRecording.value = false
        window.dispatchEvent(new CustomEvent('capture-stop-rec'))
      }
    }
  }
})

watch(() => arpStore.arpBpm, (bpm) => {
  if (playStateRef.current && store.isPlaying) {
    playStateRef.current.bpm = bpm
    getTransport().bpm.value = bpm
  }
})

// Transport position display — derived from our own tick counter (independent of global Tone.js transport)
const transportPos = ref('001:1:1')

function updateTransportPos() {
  const t    = _transportTicks
  const bar  = (Math.floor(t / 384) + 1).toString().padStart(3, '0')
  const beat = (Math.floor((t % 384) / 96) + 1).toString()
  const sixteenth = (Math.floor((t % 96) / 24) + 1).toString()
  transportPos.value = `${bar}:${beat}:${sixteenth}`
}

// Step highlight animation + transport position update
watch(() => store.isPlaying, (playing) => {
  if (playing) {
    const tick = () => { updateTransportPos(); rafRef.value = requestAnimationFrame(tick) }
    tick()
  } else {
    if (rafRef.value !== null) { cancelAnimationFrame(rafRef.value); rafRef.value = null }
    transportPos.value = '001:1:1'
  }
})

onUnmounted(() => {
  store.isPlaying = false
  if (repeatEventIdRef.value !== null) getTransport().clear(repeatEventIdRef.value)
  transportManager.releaseTransport()
  stopAllNotes()
  if (_captureRecording) {
    _captureRecording = false
    captureRecording.value = false
    window.dispatchEvent(new CustomEvent('capture-stop-rec'))
  }
  if (_panicTimeout) { clearTimeout(_panicTimeout); midiStore.panic() }
  if (rafRef.value !== null) cancelAnimationFrame(rafRef.value)
  previewTimeouts.forEach(id => clearTimeout(id))
  window.removeEventListener('cp-start', _onCpStart)
  window.removeEventListener('cp-stop', _onCpStop)
  _unsubMidiNote?.()
})

// ── UI State ─────────────────────────────────────────────────────────────────

const panicDelayMs = ref(250)
const activeTab = ref('library')
watch(activeTab, (tab) => { if (tab === 'performance') loadPcSets() })
const libSubTab = ref(store.selectedKey >= 13 ? 'genre' : 'keys')
const selectedProgressionName = ref('')
const savePatternName = ref('')
const savingPattern = ref(false)
const saveError = ref('')

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

function handleSlotSelect(idx) {
  if (store.activeSlotIndex !== idx) {
    store.slotSave(store.activeSlotIndex)
    store.slotLoad(idx)
  }
}

function handleStepClick(idx) {
  store.selectedStepIdx = idx
  if (!store.isPlaying) previewStep(idx)
}

function handleStepDoubleClick(idx) {
  store.toggleStepActive(idx)
}

function previewStep(idx) {
  const step = store.steps[idx]
  if (!step?.active || !step.notes?.length) return
  previewTimeouts.forEach(id => clearTimeout(id))
  previewTimeouts.length = 0
  previewActiveNotes.forEach(({ note, channel }) =>
    midiStore.sendNoteOff(note, 0, channel, MidiSource.CHORD_PROG))
  previewActiveNotes.length = 0
  const channel = midiStore.midiChannel
  const shift = (seqTranspose.value || 0) + (step.transpose || 0)
  step.notes.forEach(note => {
    const n = Math.max(0, Math.min(127, note + shift))
    midiStore.sendNoteOn(n, 90, channel, MidiSource.CHORD_PROG)
    previewActiveNotes.push({ note: n, channel })
    previewTimeouts.push(window.setTimeout(() => {
      midiStore.sendNoteOff(n, 0, channel, MidiSource.CHORD_PROG)
      const i = previewActiveNotes.findIndex(x => x.note === n && x.channel === channel)
      if (i !== -1) previewActiveNotes.splice(i, 1)
    }, 1000))
  })
}

function handleDurationClick(idx, e) {
  e.stopPropagation()
  const reverse = e.shiftKey || e.button === 2
  store.cycleDuration(idx, reverse)
}

const selectedChord = ref(null) // { chordName, notes }
const chordTranspose = ref(0)
const previewTimeouts = []
const previewActiveNotes = [] // { note, channel } — track exactly what's sounding

function previewChord(chord) {
  selectedChord.value = chord
  // Cancel all pending note-offs
  previewTimeouts.forEach(id => clearTimeout(id))
  previewTimeouts.length = 0
  // Explicitly stop every note that is currently sounding
  previewActiveNotes.forEach(({ note, channel }) => {
    midiStore.sendNoteOff(note, 0, channel, MidiSource.CHORD_PROG)
  })
  previewActiveNotes.length = 0

  const channel = midiStore.midiChannel
  const velocity = 90
  chord.notes.forEach(note => {
    const n = Math.max(0, Math.min(127, note + chordTranspose.value))
    midiStore.sendNoteOn(n, velocity, channel, MidiSource.CHORD_PROG)
    previewActiveNotes.push({ note: n, channel })
    previewTimeouts.push(window.setTimeout(() => {
      midiStore.sendNoteOff(n, 0, channel, MidiSource.CHORD_PROG)
      const idx = previewActiveNotes.findIndex(x => x.note === n && x.channel === channel)
      if (idx !== -1) previewActiveNotes.splice(idx, 1)
    }, 1000))
  })
}

function loadSelectedChordToStep() {
  if (!selectedChord.value) return
  const transposedNotes = selectedChord.value.notes.map(n => Math.max(0, Math.min(127, n + chordTranspose.value)))
  store.assignChordToStep(store.selectedStepIdx, selectedChord.value.chordName, transposedNotes)
}

function loadProgressionToSteps() {
  if (!selectedProgressionName.value) return
  store.loadProgressionByName(progressionData.value, selectedProgressionName.value)
}

function handleGenerate() {
  store.generateAlgorithmic(progressionData.value)
  const dur = fillDurationRandom.value
    ? DURATION_OPTIONS[Math.floor(Math.random() * DURATION_OPTIONS.length)]
    : fillDuration.value
  for (let i = 0; i < store.numSteps; i++) store.setStep(i, { duration: dur })
}

async function handleSave() {
  if (!savePatternName.value.trim()) return
  savingPattern.value = true
  saveError.value = ''
  try {
    const ok = await store.saveToLibrary(savePatternName.value.trim())
    if (ok) savePatternName.value = ''
  } catch (e) {
    saveError.value = 'Save failed'
  } finally {
    savingPattern.value = false
  }
}

function handleLoadPattern(pattern) {
  store.loadFromDocument(pattern)
}

async function handleDeletePattern(id) {
  await store.deleteFromLibrary(id)
}

const _onCpStart = () => { store.isPlaying = true }
const _onCpStop = () => { store.isPlaying = false }

// MIDI FLOW device→app input routing: a device wired to Chord Sequencer in
// the canvas starts playback on note-on (see docs/plans/modular/MIDI-Flow-Control.md).
let _unsubMidiNote = null
function _onMidiNoteIn(type, note, velocity, chan, inputId) {
  if (type !== 'on' || velocity <= 0) return
  const inputDevice = midiService.getInputs().find(i => i.id === inputId)
  if (!midiStore.isDeviceRoutedToApp(inputDevice?.name, MidiSource.CHORD_PROG, note)) return
  _onCpStart()
}

onMounted(() => {
  if (authStore.user) store.loadLibrary()
  loadPcSets()
  window.addEventListener('cp-start', _onCpStart)
  window.addEventListener('cp-stop', _onCpStop)
  _unsubMidiNote = midiService.addNoteListener(_onMidiNoteIn)
})

// Auto-save current slot whenever steps/numSteps/playMode/arpRate change
watch([() => store.steps, () => store.numSteps, () => store.playMode, () => store.arpRate], () => {
  store.slotSave(store.activeSlotIndex)
}, { deep: true })

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

// ── Fill All ──────────────────────────────────────────────────────────────────

const fillDuration = ref('4n')
const fillDurationRandom = ref(false)
const fillVelocity = ref(100)
const fillVelocityRandom = ref(false)
const fillGate = ref(80)
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

// ── Performance Sets (from MidiDeviceProgramChangePanel / localStorage) ───────

const LS_PC_SETS = 'SYCORE_PC_PERFORMANCE_SETS'
const pcSets = ref([])
const activePcSetId = ref(null)

function loadPcSets() {
  try {
    const raw = localStorage.getItem(userKey(LS_PC_SETS))
    pcSets.value = raw ? JSON.parse(raw) : []
  } catch { pcSets.value = [] }
}

function recallPcSet(set) {
  activePcSetId.value = set.id
  if (set.midiChannel) midiStore.setMidiChannel(set.midiChannel)
  set.devices.forEach(entry => {
    if (!midiStore.routingConfig?.registrations?.[entry.deviceName]) return
    midiStore.updateRegistration(entry.deviceName, 'pcChannel',  entry.pcChannel)
    midiStore.updateRegistration(entry.deviceName, 'pcBank',     entry.pcBank)
    midiStore.updateRegistration(entry.deviceName, 'pcProgram',  entry.pcProgram)
    midiStore.updateRegistration(entry.deviceName, 'pcMsb',     entry.pcMsb ?? 0)
    midiStore.updateRegistration(entry.deviceName, 'pcLsb',     entry.pcLsb ?? 0)
    midiStore.updateRegistration(entry.deviceName, 'pcChannels', JSON.parse(JSON.stringify(entry.pcChannels)))
    if (entry.isUiDevice) {
      if (entry.lastPresetId) {
        const preset = presetStore.history.find(p => p.id === entry.lastPresetId)
        if (preset) presetStore.recallPreset(preset, false)
      }
    } else {
      const port = midiStore.outputs.find(o => o.name === entry.deviceName)
      if (!port) return
      const multiEntries = Object.entries(entry.pcChannels ?? {})
      if (multiEntries.length > 0) {
        multiEntries.forEach(([chStr, info]) => {
          const ch = parseInt(chStr)
          port.send([0xB0 | ch, 0,  info.msb ?? 0])
          port.send([0xB0 | ch, 32, info.lsb ?? 0])
          port.send([0xC0 | ch, info.program ?? 0])
        })
      } else {
        const ch = entry.pcChannel ?? 0
        port.send([0xB0 | ch, 0,  entry.pcMsb ?? 0])
        port.send([0xB0 | ch, 32, entry.pcLsb ?? 0])
        port.send([0xC0 | ch, entry.pcProgram ?? 0])
      }
    }
  })
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
    v-if="isOpen"
    :style="panelStyle"
    class="fixed flex flex-col bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl overflow-hidden text-white font-sans text-sm select-none"
    style="border-top: 2px solid #7c3aed;"
  >
    <!-- ── HEADER ─────────────────────────────────────────────────────────── -->
    <div
      class="shrink-0 px-3 py-2 bg-black/50 border-b border-neutral-800 flex flex-col items-center gap-3 cursor-grab active:cursor-grabbing"
      @mousedown="onDragStart"
    >
      <div class="flex items-center gap-2 w-full">
        <Music2 class="w-4 h-4 text-purple-400 shrink-0" />
        <h2 class="text-lg font-black uppercase tracking-widest text-purple-400 shrink-0">Chord Prog</h2>

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
                  'w-1.5 h-1.5 rounded-full transition-all duration-300',
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
        </div>
      </div>


      <div class="flex items-center gap-2 justify-start w-full gap-5">
        <!-- Transport position -->
        <div class="flex items-center gap-1 px-2 py-0.5 bg-black/60 border border-neutral-800 rounded font-mono" title="Bar : Beat : Sixteenth">
          <span :class="['text-[14px] font-bold tabular-nums tracking-wider', store.isPlaying ? 'text-red-700' : 'text-neutral-500']">
            {{ transportPos }}
          </span>
        </div>

        <!-- Play / Stop -->
        <button
          @click.stop="togglePlay"
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
        <div class="flex items-center gap-0.5" title="Progression slot — each slot holds an independent chord progression">
          <button
            v-for="i in store.SLOT_COUNT"
            :key="i"
            @click.stop="handleSlotSelect(i - 1)"
            :class="[
              'w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold font-mono transition-colors',
              store.activeSlotIndex === i - 1
                ? 'bg-purple-700 text-white ring-1 ring-purple-400'
                : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700'
            ]"
          >{{ String.fromCharCode(64 + i) }}</button>
          <div class="w-px h-4 bg-neutral-700 mx-1" />
        </div>

        <!-- Step count -->
        <div class="flex items-center gap-1.5 text-[12px]">
          <span class="text-neutral-500 font-mono">Steps</span>
          <button @click.stop="store.numSteps = Math.max(1, store.numSteps - 1)" class="w-6 h-6 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300"><ChevronLeft class="w-3 h-3" /></button>
          <span class="text-purple-300 font-bold font-mono w-4 text-center">{{ store.numSteps }}</span>
          <button @click.stop="store.numSteps = Math.min(16, store.numSteps + 1)" class="w-6 h-6 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300"><ChevronRight class="w-3 h-3" /></button>
        </div>

        <!-- Play mode -->
        <div class="flex items-center rounded overflow-hidden border border-neutral-700 text-[12px] font-mono uppercase tracking-wider">
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

        <!-- Arp rate (only in arp mode) -->
        <div v-if="store.playMode === 'arp'" class="flex items-center gap-1 text-[12px] font-mono">
          <span class="text-neutral-500 font-mono">Rate</span>
          <select
            v-model="store.arpRate"
            @mousedown.stop
            title="Arpeggio rate"
            class="bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-[12px] text-purple-300 font-mono outline-none"
          >
            <option v-for="d in DURATION_OPTIONS" :key="d" :value="d">{{ DURATION_LABELS[d] }}</option>
          </select>
        </div>

        <!-- Sequence transpose -->
        <div class="flex items-center gap-1 text-[12px]">
          <span class="text-neutral-500 font-mono shrink-0 text-[12px]">Transpose</span>
          <button @click.stop="seqTranspose = Math.max(-24, seqTranspose - 1)" class="w-6 h-6 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[12px]">−</button>
          <span :class="['font-bold font-mono w-6 text-center', seqTranspose !== 0 ? 'text-yellow-300' : 'text-neutral-400']">{{ seqTranspose > 0 ? '+' : '' }}{{ seqTranspose }}</span>
          <button @click.stop="seqTranspose = Math.min(24, seqTranspose + 1)" class="w-6 h-6 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[12px]">+</button>
          <button v-if="seqTranspose !== 0" @click.stop="seqTranspose = 0" class="text-[8px] text-neutral-600 hover:text-neutral-300 ml-0.5">↺</button>
        </div>

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
    </div>

    <div v-if="!isMinimized" class="flex flex-col flex-1 overflow-hidden">

      <!-- ── STEP GRID ───────────────────────────────────────────────────── -->
      <div class="shrink-0 p-3 grid grid-cols-8 gap-1.5">
        <button
          v-for="(step, idx) in store.steps.slice(0, 16)"
          :key="idx"
          :class="[
            'relative flex flex-col items-center justify-between rounded border transition-all overflow-hidden',
            idx >= store.numSteps ? 'opacity-25 pointer-events-none' : '',
            idx === store.currentStep && store.isPlaying ? 'border-yellow-400 bg-yellow-400/10' : '',
            idx === store.selectedStepIdx && !(idx === store.currentStep && store.isPlaying) ? 'border-purple-500 bg-purple-900/20' : '',
            step.active && !(idx === store.currentStep && store.isPlaying) && !(idx === store.selectedStepIdx) ? 'border-purple-700/60 bg-purple-950/40' : '',
            !step.active && !(idx === store.currentStep && store.isPlaying) && !(idx === store.selectedStepIdx) ? 'border-neutral-800 bg-neutral-950/60' : '',
          ]"
          style="height: 72px; min-width: 0;"
          @click="handleStepClick(idx)"
          @dblclick.prevent="handleStepDoubleClick(idx)"
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
              :class="idx === store.currentStep && store.isPlaying ? 'bg-yellow-400' : 'bg-purple-500'"
            />
          </div>

          <!-- Chord name -->
          <div class="px-1 w-full text-center">
            <span :class="[
              'text-[14px] font-mono truncate block leading-tight',
              step.active ? (idx === store.currentStep && store.isPlaying ? 'text-yellow-300' : 'text-white') : 'text-neutral-600'
            ]">
              {{ step.chordName }}
            </span>
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
        </button>
      </div>

      <!-- ── STEP DETAIL ────────────────────────────────────────────────── -->
      <div v-if="selectedStep" class="shrink-0 mx-3 mb-2 p-2 bg-black/40 border border-neutral-800 rounded-lg flex items-center gap-4 text-[12px]">
        <span class="text-neutral-500 font-mono shrink-0">Step {{ store.selectedStepIdx + 1 }}</span>

        <!-- Active toggle -->
        <button
          @click="store.toggleStepActive(store.selectedStepIdx)"
          :class="['px-2 py-0.5 rounded font-bold uppercase tracking-wider transition-colors', selectedStep.active ? 'bg-purple-700 text-white' : 'bg-neutral-800 text-neutral-400']"
        >
          {{ selectedStep.active ? 'Active' : 'Off' }}
        </button>

        <!-- Chord name -->
        <span class="text-purple-300 font-bold">{{ selectedStep.chordName }}</span>
        <span class="text-neutral-600 font-mono">{{ selectedStep.notes?.join(', ') || 'no notes' }}</span>

        <!-- Duration selector -->
        <div class="flex items-center gap-1">
          <span class="text-neutral-500">Dur</span>
          <select
            :value="selectedStep.duration"
            @change="e => store.setStep(store.selectedStepIdx, { duration: e.target.value })"
            class="bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-purple-300 font-mono outline-none"
          >
            <option v-for="d in DURATION_OPTIONS" :key="d" :value="d">{{ DURATION_LABELS[d] }}</option>
          </select>
        </div>

        <!-- Velocity -->
        <div class="flex items-center gap-1">
          <span class="text-neutral-500">Vel</span>
          <input
            type="number"
            :value="selectedStep.velocity"
            min="0" max="127"
            @change="e => updateSelectedStepField('velocity', e.target.value)"
            @keydown="handleVelocityKeydown"
            class="w-14 bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-purple-300 font-mono outline-none text-center"
            title="Velocity 0–127 (0 = off). Arrow keys to nudge, Shift+Arrow ×10"
          />
        </div>

        <!-- Gate -->
        <div class="flex items-center gap-1">
          <span class="text-neutral-500">Gate</span>
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

        <!-- Per-step Transpose -->
        <div class="flex items-center gap-1 ml-auto">
          <span class="text-neutral-500">Tr</span>
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

      <!-- ── FILL ALL ──────────────────────────────────────────────────────── -->
      <div class="shrink-0 mx-3 mb-2 p-2 bg-black/40 border border-neutral-800 rounded-lg flex items-center gap-3 text-[12px] flex-wrap">
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

        <!-- Clear -->
        <button
          @click.stop="store.clearSteps()"
          title="Clear all steps"
          class="flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-mono uppercase text-neutral-500 hover:text-red-400 border border-neutral-800 hover:border-red-800 transition-colors"
        >
          <RotateCcw class="w-3 h-3" />
          Clear
        </button>
      </div>

      <!-- ── BOTTOM TABS ─────────────────────────────────────────────────── -->
      <div class="shrink-0 flex border-b border-neutral-800 px-3">
        <button
          v-for="tab in ['chain', 'library', 'generate', 'save-load', 'performance']"
          :key="tab"
          @click="activeTab = tab"
          :class="[
            'px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-colors',
            activeTab === tab ? 'border-purple-500 text-purple-300' : 'border-transparent text-neutral-500 hover:text-neutral-300'
          ]"
        >
          {{ tab === 'save-load' ? 'Save / Load' : tab === 'performance' ? 'Performance Set' : tab }}
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
        <div v-else-if="activeTab === 'generate'" class="flex-1 p-4 flex flex-col gap-4 overflow-y-auto">
          <div class="text-[10px] text-neutral-400 leading-relaxed">
            Generate a random progression from the currently selected key source. Chords are distributed across all active steps.
          </div>

          <!-- Key display -->
          <div class="flex items-center gap-3">
            <span class="text-[10px] text-neutral-500 font-mono">Source:</span>
            <span class="text-[11px] font-bold text-purple-300">{{ KEY_FILE_NAMES[store.selectedKey] }}</span>
            <span class="text-[9px] text-neutral-600">(change in Library tab)</span>
          </div>

          <!-- Generate button -->
          <button
            @click="handleGenerate"
            :disabled="progLoading || progressionNames.length === 0"
            class="flex items-center gap-2 px-4 py-2 rounded bg-purple-700 hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-[11px] uppercase tracking-widest transition-colors self-start"
          >
            <Zap class="w-4 h-4" />
            Generate Progression
          </button>

          <div v-if="progLoading" class="text-[10px] text-neutral-500">Loading progression data…</div>
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
        <div v-else-if="activeTab === 'save-load'" class="flex-1 flex gap-0 overflow-hidden min-h-0">

          <!-- Save panel -->
          <div class="w-64 shrink-0 border-r border-neutral-800 flex flex-col p-3 gap-3">
            <div class="text-[9px] font-bold uppercase tracking-widest text-neutral-500">Save Current</div>
            <template v-if="authStore.user">
              <input
                v-model="savePatternName"
                placeholder="Pattern name…"
                class="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-[11px] text-white outline-none focus:border-purple-500 w-full"
                @keydown.enter="handleSave"
              />
              <button
                @click="handleSave"
                :disabled="savingPattern || !savePatternName.trim()"
                class="flex items-center gap-1 px-3 py-1.5 rounded bg-purple-700 hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-[10px] uppercase tracking-wider transition-colors"
              >
                <Save class="w-3.5 h-3.5" />
                {{ savingPattern ? 'Saving…' : 'Save' }}
              </button>
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
                  <div class="text-[11px] font-bold text-white truncate">{{ pattern.name }}</div>
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

    <!-- Resize handle -->
    <div
      v-if="!isMinimized"
      class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-30 hover:opacity-80 transition-opacity"
      @mousedown.stop="e => onResizeStart(e, 'se')"
      style="background: linear-gradient(135deg, transparent 50%, #7c3aed 50%); border-radius: 0 0 4px 0;"
    />
  </div>
</template>
