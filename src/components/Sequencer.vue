<script setup>
import PlayEditToggle from '@/components/ui/PlayEditToggle.vue'
import ResizeHandles from '@/components/ui/ResizeHandles.vue'
import PlayPanelHeader from '@/components/play/PlayPanelHeader.vue'
import SeqPlayView from '@/components/play/SeqPlayView.vue'
import { usePlayView } from '@/composables/usePlayView'
// Performance: a play view (banks, pattern) instead of the panel; EDIT: the panel.
const { play } = usePlayView('sequencer2')
import { ref, computed, watch, onUnmounted, toRef } from 'vue'
import { X, Play, Square, Settings, Plus, Trash2, ChevronUp, Zap, ChevronDown, ChevronLeft, ChevronRight, Save, Download, Keyboard, Piano, Circle, FolderOpen, FolderPlus, Layers, Sparkles } from 'lucide-vue-next'
import { getTransport } from 'tone'
import { useMidiStore } from '@/stores/useMidiStore'
import { useStepSequencerStore, BANK_NAMES, BANK_COUNT, CHAIN_COUNT } from '@/stores/useStepSequencerStore'
import { S1_CC_MAP } from '@/constants/s1-config'
import { db, doc, collection, getDocs, setDoc, deleteDoc } from '@/lib/idb'
import { useAuthStore } from '@/stores/useAuthStore'
import { useUiStore } from '@/stores/useUiStore'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'
import AiPromptModal from './AiPromptModal.vue'
import { useSequencerEngine, DEFAULT_STEP, NOTE_NAMES, GRID_SEMITONES, STYLES, SCALES } from '@/core/engines/sequencer'

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
const authStore = useAuthStore()
const uiStore = useUiStore()
const { openMenu } = useMidiContextMenu()
const seqStore = useStepSequencerStore()

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
const showAiPrompt = ref(false)

// Playback and pattern state live in the engine (core/engines/sequencer.js): the Sequencer plays
// on with this panel closed or unmounted (Scenario Workspaces, Phase 1).
const engine = useSequencerEngine()
const {
  selectedStyle, selectedKey, selectedScale, chordsEnabled, maxPolyphony, chordDensity,
  isPlaying, isRecording, currentStep, selectedStepIdx, syncTrack, genDensity, arpModeForGen,
  swingAmount, basePatternLength, selectedOctave, octaveRange, numSteps, steps,
  param1CC, param2CC, clampParam1CC, clampParam2CC, param1Variation, param2Variation,
  dynamicMidiTranspose, gridCurrentStep, systemClock, tempoMultiplier, sequenceDirection,
  TEMPO_MULTIPLIERS, SEQ_DIRECTIONS,
  loadBankIntoLocal, selectBank, generateSequence, duplicateLength, reduceLength,
  updateStep, clearStep, isNoteBarActive, toggleNoteBar, setStepOctave, applyToAll, randomize,
} = engine

async function handleAiResult(data) {
  // journaled (lib/session-takes.ts): the bank it replaces is kept as a session take
  await engine.journaledGenerate(async () => {
    const ok = await seqStore.generateFromAiPrompt(data)
    loadBankIntoLocal()
    return ok
  })
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

// Written straight into its <span> (not a ref in the template): a ref re-rendered the whole Sequencer
// 30 times a second while playing, also with its panel hidden (trace 2026-11-11: ~570 ms in 25 s).
const transportPosEl = ref(null)
let _transportPosText = '1:1:1'
// re-created (minimized and restored): the current position at once
watch(transportPosEl, el => { if (el) el.textContent = _transportPosText })
function setTransportPosition(text) {
  if (text === _transportPosText) return
  _transportPosText = text
  if (transportPosEl.value) transportPosEl.value.textContent = text
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

const rafRef = ref(null)
watch(isPlaying, (playing) => {
  if (playing) {
    let lastUpdate = 0
    const tick = (now) => {
      // Throttle position update to ~30fps — every frame (60fps) reads
      // Tone.js transport position + string parsing, which causes
      // [Violation] warnings and stalls MIDI message processing.
      if (now - lastUpdate >= 33) {
        lastUpdate = now
        const pos = String(getTransport().position).split('.')[0].split(':')
        setTransportPosition(`${parseInt(pos[0]) + 1}:${parseInt(pos[1]) + 1}:${parseInt(pos[2]) + 1}`)
      }
      rafRef.value = requestAnimationFrame(tick)
    }
    rafRef.value = requestAnimationFrame(tick)
  } else {
    if (rafRef.value !== null) { cancelAnimationFrame(rafRef.value); rafRef.value = null }
    setTransportPosition('1:1:1')
  }
}, { immediate: true }) // opened while playing: the position at once
onUnmounted(() => { if (rafRef.value !== null) cancelAnimationFrame(rafRef.value) })

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
    <ResizeHandles :start="onResizeStart" />

    <template v-if="!play">
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
      <!-- Performance, in EDIT: back to the play view -->
      <PlayEditToggle panel-id="sequencer2" />
      <div class="flex-1" />
      <div class="flex items-center gap-1 pointer-events-auto">
        <button
          @click.stop="showAiPrompt = true"
          title="AI Prompt"
          class="p-1.5 rounded-lg text-neutral-500 hover:text-amber-400 hover:bg-amber-950/30 transition-colors"
        >
          <Sparkles class="w-4 h-4" />
        </button>
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
            <span ref="transportPosEl" class="text-3xl text-red-800 font-mono tabular-nums leading-none">1:1:1</span>
          </div>

          <!-- Tempo Multiplier -->
          <!-- <div class="flex items-center gap-1">
            <span class="text-[9px] text-neutral-500 font-mono">Time</span>
            <select
              v-model="tempoMultiplier"
              class="bg-black/60 border border-neutral-800 rounded px-1 py-0.5 text-[10px] font-mono text-amber-400 outline-none appearance-none cursor-pointer"
              title="Steps per beat"
            >
              <option
                v-for="opt in TEMPO_MULTIPLIERS"
                :key="opt.label"
                :value="opt"
              >{{ opt.label }}</option>
            </select>
          </div> -->

          <!-- Direction -->
          <!-- <span class="text-[9px] text-neutral-500 font-mono">Direction</span>  
          <div class="flex items-center gap-0.5 rounded bg-black/40 border border-neutral-800 p-0.5">
            <button
              v-for="dir in SEQ_DIRECTIONS"
              :key="dir"
              @click="sequenceDirection = dir"
              :class="[
                'px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider transition-colors',
                sequenceDirection === dir
                  ? 'bg-amber-600 text-black'
                  : 'text-neutral-500 hover:text-neutral-300'
              ]"
            >{{ dir === 'up-down' ? '↕' : dir === 'up' ? '↑' : dir === 'down' ? '↓' : '↔' }}</button>
          </div> -->

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
              @contextmenu.prevent="openMenu($event, { name: 'seq_bank_' + i, label: 'Sequencer: Pattern ' + name })"
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
      <div class="shrink-0 flex flex-wrap items-center gap-4 px-4 py-2 border-b border-neutral-900 bg-black/20">
        <div class="flex items-center gap-2">
          <span class="text-[12px] font-mono text-neutral-500 uppercase w-[40px]">Scale</span>
          <!-- <div class="flex items-center gap-1 p-1 rounded-lg border border-neutral-800/50"> -->
            <select v-model="selectedKey" class="bg-black/40 border border-neutral-800 text-synth-amber rounded-lg px-2 py-1 text-[14px] font-bold uppercase outline-none cursor-pointer [color-scheme:dark]">
              <option v-for="key in NOTE_NAMES" :key="key" :value="key" class="bg-neutral-900">{{ key }}</option>
            </select>
            <select v-model="selectedScale" class="bg-black/40 border border-neutral-800 text-synth-amber rounded-lg px-2 py-1 text-[14px] font-bold uppercase outline-none cursor-pointer [color-scheme:dark]">
              <option v-for="scale in Object.keys(SCALES)" :key="scale" :value="scale" class="bg-neutral-900">{{ scale }}</option>
            </select>
          <!-- </div> -->
        </div>

        <!-- How the pattern follows the chords / notes it receives (AUTO, MIDI Flow → Sequencer) -->
        <div class="flex items-center gap-2"
             title="Follow — how the pattern moves on the chords or notes it receives. Degree: by scale degree, stays in key (in C major, Dm moves C-E-G to D-F-A). Chromatic: by semitones from the pattern's first note (as before).">
          <span class="text-[12px] font-mono text-neutral-500 uppercase">Follow</span>
          <div class="flex rounded-lg border border-neutral-800 overflow-hidden">
            <button v-for="m in [['degree', 'Degree'], ['chromatic', 'Chrom']]" :key="m[0]"
                    @click="uiStore.seqFollowMode = m[0]"
                    :class="['px-2 py-1 text-[11px] font-bold uppercase transition-colors', uiStore.seqFollowMode === m[0] ? 'bg-synth-amber/20 text-synth-amber' : 'bg-black/40 text-neutral-500 hover:text-neutral-300']">{{ m[1] }}</button>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-[12px] font-mono text-neutral-500 uppercase">Oct</span>
          <!-- <div class="flex items-center gap-1 p-1 rounded-lg border border-neutral-800/50"> -->
            <select v-model="selectedOctave" class="bg-black/40 border border-neutral-800 text-synth-amber rounded-lg px-2 py-1 text-[14px] font-bold uppercase outline-none cursor-pointer [color-scheme:dark]">
              <option v-for="o in [0,1,2,3,4,5,6,7,8]" :key="o" :value="o" class="bg-neutral-900">{{ o }}</option>
            </select>
            <span class="text-[12px] font-mono text-neutral-500 uppercase">Range</span>
            <select v-model="octaveRange" class="bg-black/40 border border-neutral-800 text-synth-amber rounded-lg px-2 py-1 text-[14px] font-bold uppercase outline-none cursor-pointer [color-scheme:dark]">
              <option v-for="r in [-3,-2,-1,0,1,2,3]" :key="r" :value="r" class="bg-neutral-900">{{ r >= 0 ? '+' + r : r }}</option>
            </select>
          <!-- </div> -->
        </div>

        <div class="flex items-center gap-2">
          <span class="text-[12px] font-mono text-neutral-500 uppercase">Style</span>
          <select v-model="selectedStyle" class="bg-black/40 border border-neutral-800 text-synth-amber rounded-lg px-2 py-1 text-[14px] font-bold uppercase outline-none cursor-pointer [color-scheme:dark]">
            <option v-for="style in Object.keys(STYLES)" :key="style" :value="style" class="bg-neutral-900">{{ style }}</option>
          </select>
        </div>

        <div v-if="selectedStyle === 'Arpeggio'" class="flex items-center gap-2">
          <span class="text-[12px] font-mono text-neutral-500 uppercase">Arp</span>
          <select v-model="arpModeForGen" class="bg-black/40 border border-cyan-700 text-cyan-400 rounded-lg px-2 py-1 text-[14px] font-mono uppercase outline-none cursor-pointer [color-scheme:dark]">
            <option v-for="mode in ARP_MODES" :key="mode" :value="mode" class="bg-neutral-900">{{ mode }}</option>
          </select>
        </div>

        <div v-if="selectedStyle !== 'Arpeggio'" class="flex items-center gap-2">
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
      
      <div class="shrink-0 flex flex-wrap items-center gap-4 p-1 pl-4 border-b border-neutral-900 bg-neutral-900/50">
        <!-- Sequence Length -->
        <div class="flex items-center gap-2" @contextmenu.prevent="openMenu($event, { name: 'seq_steps', label: 'Sequencer: Steps' })">
          <span class="text-[12px] font-mono text-neutral-500 uppercase w-[40px]">Length</span>
          <div class="flex items-center bg-black border border-neutral-800 rounded-lg px-2 h-8 gap-2">
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
            <span class="text-[12px] font-mono text-orange-500 w-6 text-right font-bold">{{ numSteps }}</span>
          </div>
        </div>

        <div class="w-px h-5 bg-neutral-800" />

        <!-- Global Transpose Control -->
        <div class="flex items-center gap-2">
          <span class="text-[12px] font-mono text-neutral-500 uppercase">Transpose</span>
          <div class="flex items-center bg-black border border-neutral-800 rounded-lg px-1 h-8 gap-0.5">
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
          <span class="text-[12px] font-mono text-neutral-500 uppercase">Swing</span>
          <div class="flex items-center bg-black border border-neutral-800 rounded-lg w-24 px-2 h-8 gap-3">
            <input v-model.number="swingAmount" type="range" min="0" max="100" class="w-14 h-1 accent-emerald-500 bg-neutral-800 rounded-lg appearance-none cursor-pointer" />
            <span class="text-[12px] font-mono text-amber-500 w-8 text-right">{{ swingAmount }}%</span>
          </div>
        </div>
      </div>

      <div class="flex w-full gap-3 px-4 py-2 border-b border-neutral-900 bg-black/20 flex-wrap">
        <!-- Param Assign -->
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <span class="text-[12px] font-mono text-neutral-500 uppercase leading-none w-[40px]">P1</span>
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
      <div class="shrink-0 flex flex-wrap items-center gap-4 p-1 pl-3 border-b border-neutral-900 bg-black/70">
        <!-- Transport Controls -->
        <div class="flex items-center gap-1">
          <button @click="engine.userTogglePlay()"
            @contextmenu.prevent="openMenu($event, { name: 'seq_play', label: 'Sequencer: Play' })"
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

        <!-- Tempo Multiplier -->
          <div class="flex items-center gap-1" @contextmenu.prevent="openMenu($event, { name: 'seq_time', label: 'Sequencer: Time' })">
            <span class="text-[12px] text-neutral-500 font-mono">Time</span>
            <select
              v-model="tempoMultiplier"
              class="bg-black/60 border border-neutral-800 rounded px-1 py-0.5 text-[14px] font-mono text-amber-400 outline-none appearance-none cursor-pointer"
              title="Steps per beat"
            >
              <option
                v-for="opt in TEMPO_MULTIPLIERS"
                :key="opt.label"
                :value="opt"
              >{{ opt.label }}</option>
            </select>
          </div>

          <!-- Step clock: Audio (Tone.js transport, default) / System (Worker timer + Worker-timed MIDI) -->
          <button
            @click.stop="systemClock = !systemClock"
            :title="systemClock
              ? 'Clock: SYSTEM — steps on the system clock (a Worker timer), notes sent at their time: in time when the audio is overloaded or the window is in the background. Click for AUDIO.'
              : 'Clock: AUDIO — steps on the Tone.js transport (audio clock), as before. Click for SYSTEM (Worker timer).'"
            :class="[
              'px-2 py-0.5 rounded border text-[10px] font-black uppercase tracking-widest transition-colors',
              systemClock
                ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300'
                : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:text-white hover:border-neutral-500'
            ]"
          >CLK {{ systemClock ? 'SYS' : 'AUDIO' }}</button>

          <!-- Direction -->
          <span class="text-[12px] text-neutral-500 font-mono">Direction</span>  
          <div class="flex items-center gap-0.5 rounded bg-black/40 border border-neutral-800 p-0.5" @contextmenu.prevent="openMenu($event, { name: 'seq_direction', label: 'Sequencer: Direction' })">
            <button
              v-for="dir in SEQ_DIRECTIONS"
              :key="dir"
              @click="sequenceDirection = dir"
              :title="`Direction: ${ dir }`"
              :class="[
                'px-1.5 py-0.5 rounded text-[14px] font-mono font-bold uppercase tracking-wider transition-colors',
                sequenceDirection === dir
                  ? 'bg-amber-600 text-black'
                  : 'text-neutral-500 hover:text-neutral-300'
              ]"
            >{{ dir === 'up-down' ? '↕' : dir === 'up' ? '↑' : dir === 'down' ? '↓' : 'R' }}</button>
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
          <div class="flex flex-col shrink-0 sticky left-0 z-20 bg-neutral-900 rounded-lg">
            <div class="text-[9px] font-mono text-center py-0.5 select-none">&nbsp;</div>
            <div class="h-4 flex items-center justify-end pr-1.5 text-[9px] font-black uppercase tracking-wider text-neutral-500 border-t border-neutral-800">Notes</div>
            <div class="h-4 flex items-center justify-end pr-1.5 text-[9px] font-black uppercase tracking-wider text-neutral-500 border-t border-neutral-800">A</div>
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
              gridCurrentStep === idx && isPlaying ? 'border-amber-400 ring-1 ring-amber-400/50 z-10' : ''
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

            <!-- Note name -->
            <div class="h-4 flex items-center justify-center text-[7px] font-mono font-bold text-synth-amber border-t border-neutral-800 truncate px-0.5"
              :title="step.notes?.join(', ') || ''"
            >{{ step.active ? formatStepNotes(step.notes) : '—' }}</div>

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
    </template>
    <!-- Performance: the play view (display only; the Rig plays it) -->
    <template v-else>
      <PlayPanelHeader title="Sequencer" panel-id="sequencer2" @pointerdown.stop="onDragStart" @close="emit('close')" @minimize="toggleMinimize" @maximize="maximize">
        <!-- the active bank's style: what Generate (and the Rig's GEN on the Seq row) writes -->
        <select v-model="selectedStyle" title="Sequencer style (this bank): what Generate (and the Rig's GEN) writes"
                class="bg-neutral-900 border border-neutral-700 rounded px-1.5 py-0.5 text-[10px] font-bold text-amber-200 max-w-36 cursor-pointer [color-scheme:dark]"
                @pointerdown.stop @mousedown.stop>
          <option v-for="style in Object.keys(STYLES)" :key="style" :value="style">{{ style }}</option>
        </select>
      </PlayPanelHeader>
      <SeqPlayView class="flex-1 overflow-hidden" />
    </template>

    <!-- AI Prompt -->
    <AiPromptModal
      v-if="showAiPrompt"
      app-key="sequencer"
      system-prompt="You are a step-sequencer music designer. Generate a sequence as a JSON array of exactly 16 objects, each with {active: boolean, notes: array of 1-2 MIDI note numbers (40-96), velocity: 1-127, gate: 25-100}. Output ONLY valid JSON."
      placeholder="e.g. minimal techno sequence in C minor"
      button-label="Generate Sequence"
      @result="handleAiResult"
      @close="showAiPrompt = false"
    />
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
