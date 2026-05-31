<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Play, Square, X, Minus, ChevronLeft, ChevronRight, RotateCcw, Save, FolderOpen, Trash2, Zap, Music2 } from 'lucide-vue-next'
import { getTransport, getDraw, start as toneStart } from 'tone'
import { midiService, MidiSource } from '@/core/midi/MidiService'
import { useMidiStore } from '@/stores/useMidiStore'
import { useArpStore } from '@/stores/useArpStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
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
const store = useChordProgStore()
const { progressionData, progressionNames, loading: progLoading, loadByIndex } = useProgressionLoader()

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize } = useDraggableResizable({
  storageKey: 'SYCORE_POS_CHORD_PROG',
  minimizeLabel: 'Chord Prog Sequencer',
  initialWidth: 900,
  initialHeight: 640,
  minWidth: 640,
  minHeight: 440,
  zIndex: 700,
})

// ── Playback ─────────────────────────────────────────────────────────────────

// Ticks per duration (base = 128th note = 1 tick)
const DURATION_TICKS = {
  '128n': 1, '64n': 2, '32n': 4, '16n': 8,
  '8n': 16, '4n': 32, '2n': 64, '1m': 128,
  '2m': 256, '4m': 512, '8m': 1024,
}

const playStateRef = { current: {} }
const repeatEventIdRef = ref(null)
const rafRef = ref(null)
const activeTimeouts = ref([])
const activeMidiNotes = ref(new Set())

const seqTranspose = ref(0)
const loopEnabled = ref(true)

function buildPlayState() {
  return {
    isPlaying: store.isPlaying,
    steps: store.steps,
    numSteps: store.numSteps,
    bpm: arpStore.arpBpm || 120,
    channel: store.midiChannel,
    playMode: store.playMode,
    arpRate: store.arpRate,
    transpose: seqTranspose.value,
    loop: loopEnabled.value,
    stepPointer: 0,
    tickCounter: 0,
  }
}

function stopAllNotes() {
  activeTimeouts.value.forEach(id => clearTimeout(id))
  activeTimeouts.value = []
  activeMidiNotes.value.forEach(key => {
    const [noteStr, chanStr] = key.split('-')
    midiStore.sendNoteOff(parseInt(noteStr), 0, parseInt(chanStr), MidiSource.CHORD_PROG)
  })
  activeMidiNotes.value.clear()
  midiStore.allNotesOff(store.midiChannel)
}

watch(() => store.isPlaying, (playing) => {
  if (!playing) {
    // Stop
    if (repeatEventIdRef.value !== null) {
      getTransport().clear(repeatEventIdRef.value)
      repeatEventIdRef.value = null
    }
    stopAllNotes()
    store.currentStep = 0
    playStateRef.current = {}
    return
  }

  // Start
  playStateRef.current = buildPlayState()

  toneStart().then(() => {
    getTransport().bpm.value = arpStore.arpBpm || 120

    repeatEventIdRef.value = getTransport().scheduleRepeat((time) => {
      const state = playStateRef.current
      if (!state.isPlaying) return

      const activeCount = Math.max(1, Math.min(state.numSteps, 16))
      const step = state.steps[state.stepPointer]
      const ticksNeeded = DURATION_TICKS[step?.duration] ?? 32

      if (state.tickCounter === 0) {
        getDraw().schedule(() => {
          store.currentStep = state.stepPointer
        }, time)

        if (step?.active && step.velocity > 0 && step.notes?.length > 0) {
          const tickMs = 60000 / (state.bpm * 32)
          const stepMs = tickMs * ticksNeeded
          const noteDurationMs = Math.max(10, stepMs * ((step.gate ?? 80) / 100))
          const channel = state.channel

          if (state.playMode === 'arp') {
            const arpTicks = DURATION_TICKS[state.arpRate] ?? 8
            const staggerMs = tickMs * arpTicks
            step.notes.forEach((note, i) => {
              const clampedNote = Math.max(0, Math.min(127, note + (state.transpose || 0)))
              const noteKey = `${clampedNote}-${channel}`
              const tid = window.setTimeout(() => {
                midiStore.sendNoteOn(clampedNote, step.velocity, channel, MidiSource.CHORD_PROG)
                activeMidiNotes.value.add(noteKey)
                const offTid = window.setTimeout(() => {
                  midiStore.sendNoteOff(clampedNote, 0, channel, MidiSource.CHORD_PROG)
                  activeMidiNotes.value.delete(noteKey)
                  activeTimeouts.value = activeTimeouts.value.filter(x => x !== offTid)
                }, noteDurationMs)
                activeTimeouts.value.push(offTid)
                activeTimeouts.value = activeTimeouts.value.filter(x => x !== tid)
              }, i * staggerMs)
              activeTimeouts.value.push(tid)
            })
          } else {
            step.notes.forEach(note => {
              const clampedNote = Math.max(0, Math.min(127, note + (state.transpose || 0)))
              const noteKey = `${clampedNote}-${channel}`
              midiStore.sendNoteOn(clampedNote, step.velocity, channel, MidiSource.CHORD_PROG)
              activeMidiNotes.value.add(noteKey)
              const tid = window.setTimeout(() => {
                midiStore.sendNoteOff(clampedNote, 0, channel, MidiSource.CHORD_PROG)
                activeMidiNotes.value.delete(noteKey)
                activeTimeouts.value = activeTimeouts.value.filter(x => x !== tid)
              }, noteDurationMs)
              activeTimeouts.value.push(tid)
            })
          }
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
    }, '128n')

    getTransport().start()
  })
})

// Sync live state changes into playStateRef without restarting
watch([() => store.steps, () => store.numSteps, () => store.playMode, () => store.arpRate, () => store.midiChannel], () => {
  if (playStateRef.current && store.isPlaying) {
    playStateRef.current.steps = store.steps
    playStateRef.current.numSteps = store.numSteps
    playStateRef.current.playMode = store.playMode
    playStateRef.current.arpRate = store.arpRate
    playStateRef.current.channel = store.midiChannel
  }
}, { deep: true })

watch(seqTranspose, v => { if (playStateRef.current) playStateRef.current.transpose = v })
watch(loopEnabled, v => { if (playStateRef.current) playStateRef.current.loop = v })

watch(() => arpStore.arpBpm, (bpm) => {
  if (playStateRef.current && store.isPlaying) {
    playStateRef.current.bpm = bpm
    getTransport().bpm.value = bpm
  }
})

// Step highlight animation
watch(() => store.isPlaying, (playing) => {
  if (playing) {
    const tick = () => { rafRef.value = requestAnimationFrame(tick) }
    tick()
  } else {
    if (rafRef.value !== null) { cancelAnimationFrame(rafRef.value); rafRef.value = null }
  }
})

onUnmounted(() => {
  store.isPlaying = false
  if (repeatEventIdRef.value !== null) getTransport().clear(repeatEventIdRef.value)
  stopAllNotes()
  if (rafRef.value !== null) cancelAnimationFrame(rafRef.value)
  previewTimeouts.forEach(id => clearTimeout(id))
})

// ── UI State ─────────────────────────────────────────────────────────────────

const activeTab = ref('library')
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

function handleStepClick(idx) {
  store.selectedStepIdx = idx
}

function handleStepDoubleClick(idx) {
  store.toggleStepActive(idx)
}

function handleDurationClick(idx, e) {
  e.stopPropagation()
  const reverse = e.shiftKey || e.button === 2
  store.cycleDuration(idx, reverse)
}

const selectedChord = ref(null) // { chordName, notes }
const chordTranspose = ref(0)
const previewTimeouts = []

function previewChord(chord) {
  selectedChord.value = chord
  previewTimeouts.forEach(id => clearTimeout(id))
  previewTimeouts.length = 0
  const channel = store.midiChannel
  const velocity = 90
  chord.notes.forEach(note => {
    const n = Math.max(0, Math.min(127, note + chordTranspose.value))
    midiStore.sendNoteOn(n, velocity, channel, MidiSource.CHORD_PROG)
    previewTimeouts.push(window.setTimeout(() => {
      midiStore.sendNoteOff(n, 0, channel, MidiSource.CHORD_PROG)
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

onMounted(() => {
  if (authStore.user) store.loadLibrary()
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
      class="shrink-0 px-3 py-2 bg-black/50 border-b border-neutral-800 flex items-center gap-3 cursor-grab active:cursor-grabbing"
      @mousedown="onDragStart"
    >
      <Music2 class="w-4 h-4 text-purple-400 shrink-0" />
      <h2 class="text-xs font-black uppercase tracking-widest text-purple-400 shrink-0">Chord Prog</h2>

      <!-- BPM display -->
      <div class="flex items-center gap-1.5 px-2 py-0.5 bg-black/60 border border-neutral-800 rounded text-[10px] font-mono">
        <span class="text-neutral-500">BPM</span>
        <span class="text-purple-300 font-bold">{{ arpStore.arpBpm }}</span>
      </div>

      <!-- Play / Stop -->
      <button
        @click.stop="togglePlay"
        :class="[
          'flex items-center gap-1 px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all',
          store.isPlaying
            ? 'bg-red-600 hover:bg-red-700 text-white'
            : 'bg-purple-600 hover:bg-purple-500 text-white'
        ]"
      >
        <Square v-if="store.isPlaying" class="w-3 h-3" />
        <Play v-else class="w-3 h-3" />
        {{ store.isPlaying ? 'Stop' : 'Play' }}
      </button>

      <!-- Step count -->
      <div class="flex items-center gap-1.5 text-[10px]">
        <span class="text-neutral-500 font-mono">Steps</span>
        <button @click.stop="store.numSteps = Math.max(1, store.numSteps - 1)" class="w-5 h-5 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300"><ChevronLeft class="w-3 h-3" /></button>
        <span class="text-purple-300 font-bold font-mono w-4 text-center">{{ store.numSteps }}</span>
        <button @click.stop="store.numSteps = Math.min(16, store.numSteps + 1)" class="w-5 h-5 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300"><ChevronRight class="w-3 h-3" /></button>
      </div>

      <!-- Channel -->
      <div class="flex items-center gap-1 text-[10px]">
        <span class="text-neutral-500 font-mono">Ch</span>
        <select
          v-model="store.midiChannel"
          @mousedown.stop
          class="bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-[10px] text-purple-300 font-mono outline-none"
        >
          <option v-for="ch in 16" :key="ch" :value="ch">{{ ch }}</option>
        </select>
      </div>

      <!-- Play mode -->
      <div class="flex items-center rounded overflow-hidden border border-neutral-700 text-[9px] font-bold uppercase tracking-wider">
        <button
          @click.stop="store.playMode = 'chord'"
          :class="['px-2 py-0.5 transition-colors', store.playMode === 'chord' ? 'bg-purple-700 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white']"
        >Chord</button>
        <button
          @click.stop="store.playMode = 'arp'"
          :class="['px-2 py-0.5 transition-colors', store.playMode === 'arp' ? 'bg-purple-700 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white']"
        >Arp</button>
      </div>

      <!-- Arp rate (only in arp mode) -->
      <div v-if="store.playMode === 'arp'" class="flex items-center gap-1 text-[10px]">
        <span class="text-neutral-500 font-mono">Rate</span>
        <select
          v-model="store.arpRate"
          @mousedown.stop
          class="bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-[10px] text-purple-300 font-mono outline-none"
        >
          <option v-for="d in DURATION_OPTIONS" :key="d" :value="d">{{ DURATION_LABELS[d] }}</option>
        </select>
      </div>

      <!-- Sequence transpose -->
      <div class="flex items-center gap-1 text-[10px]">
        <span class="text-neutral-500 font-mono shrink-0">Tr</span>
        <button @click.stop="seqTranspose = Math.max(-24, seqTranspose - 1)" class="w-4 h-4 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[9px]">−</button>
        <span :class="['font-bold font-mono w-6 text-center', seqTranspose !== 0 ? 'text-yellow-300' : 'text-neutral-400']">{{ seqTranspose > 0 ? '+' : '' }}{{ seqTranspose }}</span>
        <button @click.stop="seqTranspose = Math.min(24, seqTranspose + 1)" class="w-4 h-4 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[9px]">+</button>
        <button v-if="seqTranspose !== 0" @click.stop="seqTranspose = 0" class="text-[8px] text-neutral-600 hover:text-neutral-300 ml-0.5">↺</button>
      </div>

      <!-- Loop toggle -->
      <button
        @click.stop="loopEnabled = !loopEnabled"
        :title="loopEnabled ? 'Loop on — click to play once' : 'Loop off — click to enable loop'"
        :class="[
          'flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase border transition-colors',
          loopEnabled ? 'border-purple-600 text-purple-400 bg-purple-950/40' : 'border-neutral-700 text-neutral-500 hover:text-neutral-300'
        ]"
      >
        ⟳ {{ loopEnabled ? 'Loop' : 'Once' }}
      </button>

      <!-- Clear -->
      <button
        @click.stop="store.clearSteps()"
        title="Clear all steps"
        class="ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase text-neutral-500 hover:text-red-400 border border-neutral-800 hover:border-red-800 transition-colors"
      >
        <RotateCcw class="w-3 h-3" />
        Clear
      </button>

      <!-- Minimize -->
      <button @click.stop="toggleMinimize" class="text-neutral-500 hover:text-neutral-300 transition-colors">
        <Minus class="w-4 h-4" />
      </button>

      <!-- Close -->
      <button @click.stop="emit('close')" class="text-neutral-500 hover:text-red-400 transition-colors">
        <X class="w-4 h-4" />
      </button>
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
            <span :class="['text-[9px] font-bold font-mono', step.active ? 'text-purple-400' : 'text-neutral-600']">
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
              'text-[10px] font-bold truncate block leading-tight',
              step.active ? (idx === store.currentStep && store.isPlaying ? 'text-yellow-300' : 'text-white') : 'text-neutral-600'
            ]">
              {{ step.chordName }}
            </span>
          </div>

          <!-- Duration badge -->
          <button
            :class="[
              'text-[8px] font-mono px-1 rounded mb-0.5 transition-colors',
              step.active ? 'text-purple-300 hover:text-purple-100' : 'text-neutral-600 hover:text-neutral-400'
            ]"
            @click.stop="handleDurationClick(idx, $event)"
            @contextmenu.prevent="handleDurationClick(idx, $event)"
            title="Click to cycle duration | Right-click / Shift+click reverse"
          >
            {{ DURATION_LABELS[step.duration] }}
          </button>

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
      <div v-if="selectedStep" class="shrink-0 mx-3 mb-2 p-2 bg-black/40 border border-neutral-800 rounded-lg flex items-center gap-4 text-[10px]">
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
            class="w-10 bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-purple-300 font-mono outline-none text-center"
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
            class="w-10 bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-purple-300 font-mono outline-none text-center"
            title="Gate 0–100%. Arrow keys to nudge."
          />
          <span class="text-neutral-600">%</span>
        </div>
      </div>

      <!-- ── BOTTOM TABS ─────────────────────────────────────────────────── -->
      <div class="shrink-0 flex border-b border-neutral-800 px-3">
        <button
          v-for="tab in ['library', 'generate', 'save-load']"
          :key="tab"
          @click="activeTab = tab"
          :class="[
            'px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-colors',
            activeTab === tab ? 'border-purple-500 text-purple-300' : 'border-transparent text-neutral-500 hover:text-neutral-300'
          ]"
        >
          {{ tab === 'save-load' ? 'Save / Load' : tab }}
        </button>
      </div>

      <div class="flex-1 overflow-hidden flex flex-col min-h-0">

        <!-- Library Tab -->
        <div v-if="activeTab === 'library'" class="flex flex-1 min-h-0 overflow-hidden gap-0">

          <!-- Key selector column -->
          <div class="w-48 shrink-0 border-r border-neutral-800 flex flex-col overflow-y-auto py-1">
            <div class="px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-neutral-500">Key / Source</div>
            <button
              v-for="(name, idx) in KEY_FILE_NAMES"
              :key="idx"
              @click="store.selectedKey = idx"
              :class="[
                'text-left px-3 py-1 text-[10px] transition-colors truncate',
                store.selectedKey === idx ? 'bg-purple-900/50 text-purple-300 font-bold' : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
              ]"
            >
              {{ name }}
            </button>
          </div>

          <!-- Progression list -->
          <div class="flex-1 min-w-0 flex flex-col overflow-hidden border-r border-neutral-800">
            <div class="px-3 py-1 border-b border-neutral-800 flex items-center gap-2">
              <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-500 flex-1">Progressions</span>
              <div v-if="progLoading" class="w-3 h-3 border border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <div class="flex-1 overflow-y-auto">
              <button
                v-for="name in progressionNames"
                :key="name"
                @click="selectedProgressionName = name"
                :class="[
                  'w-full text-left px-3 py-1 text-[10px] truncate transition-colors',
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
          <div class="w-56 shrink-0 flex flex-col overflow-hidden">
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
                  class="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-purple-700 hover:bg-purple-600 text-white transition-colors whitespace-nowrap"
                  :title="`Assign ${selectedChord.chordName} to step ${store.selectedStepIdx + 1}`"
                >
                  + Step {{ store.selectedStepIdx + 1 }}
                </button>
                <button
                  v-if="selectedProgressionChords.length"
                  @click="loadProgressionToSteps"
                  class="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-neutral-700 hover:bg-neutral-600 text-white transition-colors whitespace-nowrap"
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
                <span class="font-bold truncate">{{ chord.chordName }}</span>
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
      </div>
    </div>

    <!-- Resize handle -->
    <div
      v-if="!isMinimized"
      class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-30 hover:opacity-80 transition-opacity"
      @mousedown.stop="onResizeStart"
      style="background: linear-gradient(135deg, transparent 50%, #7c3aed 50%); border-radius: 0 0 4px 0;"
    />
  </div>
</template>
