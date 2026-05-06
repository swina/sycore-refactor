<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { X, Play, Square, Settings, Plus, Trash2, ChevronUp, ChevronDown, Save, Keyboard, Circle, RotateCcw } from 'lucide-vue-next'
import { getTransport, getDraw, start as toneStart } from 'tone'
import { midiService } from '@/core/midi/MidiService'
import { useArpStore } from '@/stores/useArpStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useLocalStorage } from '@/composables/useLocalStorage'
import { S1_CC_MAP } from '@/constants/s1-config'

const props = defineProps({
  isOpen: Boolean,
  bpm: Number,
  channel: Number,
  currentSoundName: String,
  currentCategory: String,
  polyModeString: String,
  isKeyboardOpen: Boolean,
  globalTranspose: Number,
  seqStepsLimit: { type: Number, default: 64 },
  canUseSeqGen: Boolean,
  canUseSeqParam2: Boolean,
  canUseSeqGlobalTranspose: Boolean,
  canUseSeqSyncTrack: Boolean,
  midiMappings: Object,
  initialConfig: Object,
  currentPresetCCValues: Object,
})

const emit = defineEmits(['close', 'bpmChange', 'transposeChange', 'prevSlot', 'nextSlot', 'savePattern', 'openKeyboard', 'stop'])

const midiStore = useMidiStore()

const DEFAULT_STEP = {
  active: false,
  notes: [60],
  velocity: 100,
  gate: 0,
  tieSteps: 0,
  param1Value: 64,
  param2Value: 64,
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const STYLES = {
  House: { steps: 16, density: 0.50, octaves: [3, 4], velMin: 80, velMax: 110, gateMin: 40, gateMax: 70 },
  Techno: { steps: 16, density: 0.65, octaves: [2, 3], velMin: 95, velMax: 127, gateMin: 15, gateMax: 40, accentGrid: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false] },
  HipHop: { steps: 16, density: 0.40, octaves: [2, 4], velMin: 65, velMax: 105, gateMin: 40, gateMax: 80 },
  Acid: { steps: 16, density: 0.75, octaves: [2, 3], velMin: 80, velMax: 127, gateMin: 10, gateMax: 35, slideProbability: 0.25 },
  Funk: { steps: 16, density: 0.50, octaves: [3, 4], velMin: 75, velMax: 120, gateMin: 25, gateMax: 55, accentGrid: [true, false, false, true, false, false, true, false, false, true, false, false, true, false, false, false] },
  Jazz: { steps: 16, density: 0.45, octaves: [3, 5], velMin: 55, velMax: 100, gateMin: 55, gateMax: 90 },
  Ambient: { steps: 16, density: 0.22, octaves: [4, 5], velMin: 35, velMax: 75, gateMin: 75, gateMax: 100 },
  'Drum&Bass': { steps: 32, density: 0.55, octaves: [2, 4], velMin: 85, velMax: 127, gateMin: 10, gateMax: 30 },
  Minimal: { steps: 16, density: 0.28, octaves: [3, 4], velMin: 70, velMax: 95, gateMin: 20, gateMax: 50 },
  Latin: { steps: 16, density: 0.55, octaves: [3, 4], velMin: 75, velMax: 115, gateMin: 30, gateMax: 60, accentGrid: [true, false, false, true, false, true, false, false, true, false, false, true, false, true, false, false] },
  Industrial: { steps: 16, density: 0.65, octaves: [1, 3], velMin: 100, velMax: 127, gateMin: 8, gateMax: 25 },
  Reggae: { steps: 16, density: 0.40, octaves: [3, 4], velMin: 70, velMax: 105, gateMin: 35, gateMax: 65, accentGrid: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false] },
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
  House: [[0, 3, 4, 3], [0, 5, 3, 4]],
  Techno: [[0, 6, 5, 6], [0, 3, 0, 3]],
  HipHop: [[0, 3, 4, 0], [1, 4, 0, 4]],
  Acid: [[0, 6, 0, 6], [0, 3, 5, 3]],
  Funk: [[0, 3, 0, 4], [1, 4, 0, 0]],
  Jazz: [[1, 4, 0, 5], [0, 5, 1, 4]],
  Ambient: [[0, 2, 3, 2], [0, 1, 3, 0]],
  'Drum&Bass': [[0, 6, 5, 6], [0, 3, 0, 5]],
  Minimal: [[0, 3, 0, 6], [0, 6, 0, 3]],
  Latin: [[0, 3, 4, 0], [0, 4, 3, 4]],
  Industrial: [[0, 1, 0, 6], [0, 6, 5, 0]],
  Reggae: [[0, 3, 4, 3], [0, 4, 3, 0]],
}

function getNoteName(midiNote) {
  const octave = Math.floor(midiNote / 12) - 1
  const note = NOTE_NAMES[midiNote % 12]
  return `${note}${octave}`
}

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

// Local state
const { state: seqStateStorage } = useLocalStorage('S1_SEQUENCER_BETA_STATE', {})
const { state: syncTrackStorage } = useLocalStorage('S1_SYNC_TRACK', false)

const selectedStyle = ref('House')
const selectedKey = ref('C')
const selectedScale = ref('Major')
const chordsEnabled = ref(false)
const maxPolyphony = ref(4)
const chordDensity = ref(4)
const isPlaying = ref(false)
const isRecording = ref(false)
const currentStep = ref(0)
const transportPosition = ref('1:1:1')
const selectedStepIdx = ref(null)
const confirmClear = ref(false)
const syncTrack = ref(syncTrackStorage.value ?? false)

const numSteps = ref((() => {
  try {
    const saved = seqStateStorage.value
    return saved?.numSteps ?? 16
  } catch { return 16 }
})())

const steps = ref((() => {
  try {
    const saved = seqStateStorage.value
    return saved?.steps ? saved.steps.map(s => ({ ...DEFAULT_STEP, ...s })) : Array(16).fill(null).map(() => ({ ...DEFAULT_STEP }))
  } catch { return Array(16).fill(null).map(() => ({ ...DEFAULT_STEP })) }
})())

const param1CC = ref((() => {
  try {
    const saved = seqStateStorage.value
    return saved?.param1CC ?? 74
  } catch { return 74 }
})())

const param2CC = ref((() => {
  try {
    const saved = seqStateStorage.value
    return saved?.param2CC ?? 71
  } catch { return 71 }
})())

// Refs for playback state
const playStateRef = { current: {} }
const rafRef = ref(null)
const repeatEventIdRef = ref(null)
const fadeOutIntervalRef = ref(null)
const lastHandledNoteTimeRef = ref(0)
const skipBackingTrackSync = ref(false)

watch(syncTrack, (val) => {
  syncTrackStorage.value = val
}, { deep: true })

watch([numSteps, steps, param1CC, param2CC, () => props.globalTranspose], () => {
  seqStateStorage.value = { numSteps: numSteps.value, steps: steps.value, param1CC: param1CC.value, param2CC: param2CC.value, transpose: props.globalTranspose }
  midiStore.sendCC(77, Math.max(0, Math.min(127, (props.globalTranspose || 0) + 64)), props.channel)
}, { deep: true })

watch(() => props.initialConfig, (cfg) => {
  if (cfg) {
    if (cfg.numSteps !== undefined) numSteps.value = cfg.numSteps
    if (cfg.steps !== undefined) steps.value = cfg.steps.map(s => ({ ...DEFAULT_STEP, ...s }))
    if (cfg.param1CC !== undefined) param1CC.value = cfg.param1CC
    if (cfg.param2CC !== undefined) param2CC.value = cfg.param2CC
    if (cfg.transpose !== undefined) emit('transposeChange', cfg.transpose)
  }
})

watch(() => props.bpm, (bpm) => {
  getTransport().bpm.value = bpm
})

watch(numSteps, (val) => {
  if (steps.value.length === val) return
  if (steps.value.length < val) {
    steps.value.push(...Array(val - steps.value.length).fill(null).map(() => ({ ...DEFAULT_STEP })))
  } else {
    steps.value = steps.value.slice(0, val)
  }
})

function generateSequence() {
  const styleCfg = STYLES[selectedStyle.value]
  const keyIdx = NOTE_NAMES.indexOf(selectedKey.value)
  const scaleIntervals = SCALES[selectedScale.value] ?? SCALES['Major']

  if (chordsEnabled.value) {
    const progressions = STYLE_PROGRESSIONS[selectedStyle.value] ?? [[0, 3, 4, 0]]
    const baseProgression = progressions[Math.floor(Math.random() * progressions.length)]
    const effectiveDensity = Math.min(chordDensity.value, numSteps.value)
    const segSize = numSteps.value / effectiveDensity
    const avgGateFactor = (styleCfg.gateMin + styleCfg.gateMax) / 200

    const onsetPositions = Array.from({ length: effectiveDensity }, (_, c) =>
      Math.min(Math.round(c * segSize), numSteps.value - 1)
    )
    const onsetSet = new Set(onsetPositions)

    steps.value = Array(numSteps.value).fill(null).map((_, i) => {
      if (!onsetSet.has(i)) return { ...DEFAULT_STEP, active: false }

      const chordIdx = onsetPositions.indexOf(i)
      const [octMin, octMax] = styleCfg.octaves
      const octave = octMin + Math.floor(Math.random() * (octMax - octMin + 1))
      const scaleDegree = baseProgression[chordIdx % baseProgression.length] % scaleIntervals.length
      const notes = buildChordNotes(scaleDegree, scaleIntervals, keyIdx, octave, maxPolyphony.value)

      const velRange = styleCfg.velMax - styleCfg.velMin
      const velocity = styleCfg.velMin + Math.floor(Math.random() * (velRange + 1))

      const nextOnset = chordIdx < effectiveDensity - 1 ? onsetPositions[chordIdx + 1] : numSteps.value
      const thisSpan = nextOnset - i
      const sustainSteps = Math.round(thisSpan * avgGateFactor)
      const tieSteps = Math.max(0, sustainSteps + (Math.floor(Math.random() * 3) - 1) - 1)

      return { ...DEFAULT_STEP, active: true, notes, velocity, gate: 90, tieSteps }
    })
  } else {
    steps.value = Array(numSteps.value).fill(null).map((_, i) => {
      const accentHit = styleCfg.accentGrid ? styleCfg.accentGrid[i % styleCfg.accentGrid.length] : false
      const active = Math.random() < styleCfg.density
      let notes = [60]
      if (active) {
        const [octMin, octMax] = styleCfg.octaves
        const octave = octMin + Math.floor(Math.random() * (octMax - octMin + 1))
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
      return { ...DEFAULT_STEP, active, notes, velocity, gate, tieSteps }
    })
  }
}

function updateStep(idx, updates) {
  steps.value[idx] = { ...steps.value[idx], ...updates }
  steps.value = [...steps.value]
}

function applyToAll(field, value) {
  steps.value = steps.value.map(s => ({ ...s, [field]: value }))
}

function randomize(field) {
  steps.value = steps.value.map(s => ({
    ...s,
    [field]: field === 'velocity' ? Math.floor(Math.random() * 127) + 1 :
      field === 'gate' ? Math.floor(Math.random() * 101) :
        field === 'param1Value' || field === 'param2Value' ? Math.floor(Math.random() * 128) :
          s[field]
  }))
}

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

  const handleToggle = (e) => {
    const play = e.detail?.play
    if (e.detail?.source === 'backing-track') {
      skipBackingTrackSync.value = true
    }
    if (play === undefined) {
      isPlaying.value = !isPlaying.value
    } else {
      isPlaying.value = play
    }
  }
  window.addEventListener('toggle-sequencer', handleToggle)

  const handleIncomingNote = (type, note, velocity, chan) => {
    if (!props.isOpen) return
    const now = performance.now()
    if (type === 'on' && velocity > 0 && selectedStepIdx.value !== null) {
      if (now - lastHandledNoteTimeRef.value < 150) return
      lastHandledNoteTimeRef.value = now

      if (isRecording.value) {
        updateStep(selectedStepIdx.value, { active: true, notes: [note], velocity })
        selectedStepIdx.value = (selectedStepIdx.value + 1) % numSteps.value
      } else {
        updateStep(selectedStepIdx.value, { active: true, notes: [note], velocity })
      }
    }
  }

  const unsubNote = midiService.addNoteListener((type, note, velocity, chan) => {
    handleIncomingNote(type, note, velocity, chan)
  })

  const handleVirtualNote = (e) => {
    handleIncomingNote(e.detail.type, e.detail.note, e.detail.velocity, e.detail.chan)
  }
  window.addEventListener('virtual-midi-note', handleVirtualNote)

  return () => {
    window.removeEventListener('toggle-sequencer', handleToggle)
    window.removeEventListener('virtual-midi-note', handleVirtualNote)
    unsubNote?.()
  }
})

watch(isPlaying, (playing) => {
  if (syncTrack.value) {
    if (skipBackingTrackSync.value) {
      skipBackingTrackSync.value = false
    } else {
      window.dispatchEvent(new CustomEvent('toggle-backing-track', { detail: { play: playing, restart: playing } }))
    }
  }

  if (!playing) {
    getTransport().stop()
    if (repeatEventIdRef.value !== null) {
      getTransport().clear(repeatEventIdRef.value)
      repeatEventIdRef.value = null
    }
    midiStore.allNotesOff(props.channel)

    let fadeStep = 0
    const fadeSteps = 20
    const intervalMs = 500 / fadeSteps

    if (fadeOutIntervalRef.value !== null) clearInterval(fadeOutIntervalRef.value)

    fadeOutIntervalRef.value = window.setInterval(() => {
      fadeStep++
      const ratio = 1 - (fadeStep / fadeSteps)
      midiStore.sendCC(11, Math.max(0, Math.floor(127 * ratio)), props.channel)

      if (fadeStep >= fadeSteps) {
        if (fadeOutIntervalRef.value !== null) {
          clearInterval(fadeOutIntervalRef.value)
          fadeOutIntervalRef.value = null
        }
        emit('stop')
        setTimeout(() => midiStore.sendCC(11, 127, props.channel), 50)
      }
    }, intervalMs)

    currentStep.value = 0
  } else {
    if (fadeOutIntervalRef.value !== null) {
      clearInterval(fadeOutIntervalRef.value)
      fadeOutIntervalRef.value = null
      midiStore.sendCC(11, 127, props.channel)
    }

    let stepCounter = 0

    toneStart().then(() => {
      getTransport().bpm.value = props.bpm

      repeatEventIdRef.value = getTransport().scheduleRepeat((time) => {
        const state = playStateRef.current
        stepCounter = stepCounter % state.steps.length
        const stepIdx = stepCounter
        stepCounter = (stepCounter + 1) % state.steps.length
        const step = state.steps[stepIdx]

        if (step.active) {
          if (state.param1CC !== null) midiStore.sendCC(state.param1CC, step.param1Value, state.channel)
          if (state.param2CC !== null) midiStore.sendCC(state.param2CC, step.param2Value, state.channel)

          const stepDurationMs = 60000 / (state.bpm * 4)
          let noteDurationMs = stepDurationMs * (step.gate / 100)
          if (step.tieSteps > 0) noteDurationMs += stepDurationMs * Math.min(step.tieSteps, state.steps.length - 1)
          noteDurationMs = Math.max(noteDurationMs, 10)

          step.notes.forEach(note => {
            const clampedNote = Math.max(0, Math.min(127, note + state.transpose))
            midiStore.sendNoteOn(clampedNote, step.velocity, state.channel)
            window.setTimeout(() => midiStore.sendNoteOff(clampedNote, 0, state.channel), noteDurationMs)
          })
        }

        getDraw().schedule(() => {
          currentStep.value = stepIdx
          playStateRef.current.currentStep = stepIdx
        }, time)
      }, '16n')

      getTransport().start()
    })
  }

  playStateRef.current = {
    isPlaying: playing,
    currentStep: currentStep.value,
    steps: steps.value,
    bpm: props.bpm,
    channel: props.channel,
    param1CC: param1CC.value,
    param2CC: param2CC.value,
    transpose: props.globalTranspose || 0
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

onUnmounted(() => {
  getTransport().stop()
  if (repeatEventIdRef.value !== null) {
    getTransport().clear(repeatEventIdRef.value)
  }
  if (fadeOutIntervalRef.value !== null) {
    clearInterval(fadeOutIntervalRef.value)
  }
  if (rafRef.value !== null) {
    cancelAnimationFrame(rafRef.value)
  }
})
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 pb-[42px] md:pb-[44px] z-[200] flex flex-col bg-neutral-950 font-sans text-white border-t-2 border-synth-neon overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 bg-neutral-900 border-b border-neutral-800">
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-3">
          <h2 class="text-xl font-black uppercase tracking-tight text-synth-neon">Step Sequencer</h2>
          <div class="flex items-center bg-black border border-neutral-800 rounded-lg px-2 py-1">
            <div class="flex items-center gap-2 border-r border-neutral-800 pr-2">
              <span class="text-xs text-neutral-500 font-mono">BPM</span>
              <input
                type="number"
                :value="bpm"
                @input="e => emit('bpmChange', Number(e.target.value))"
                class="w-16 bg-black text-synth-neon font-mono text-lg outline-none text-center"
              />
            </div>
            <span class="text-[22px] text-synth-neon font-mono bg-black ml-2 p-2 rounded-sm tracking-widest leading-none mt-0.5 tabular-nums">
              {{ transportPosition }}
            </span>
          </div>

          <div v-if="currentSoundName" class="flex items-center min-w-[250px] gap-2 ml-2 bg-black border border-neutral-800 rounded-lg px-3 py-2">
            <div class="flex flex-col">
              <button @click="emit('prevSlot')" class="text-neutral-500 hover:text-synth-neon transition-colors p-0.5">
                <ChevronUp class="w-3 h-3" />
              </button>
              <button @click="emit('nextSlot')" class="text-neutral-500 hover:text-synth-neon transition-colors p-0.5">
                <ChevronDown class="w-3 h-3" />
              </button>
            </div>
            <div class="flex flex-col ml-1">
              <span v-if="currentCategory || polyModeString" class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest leading-none mb-1">
                {{ [currentCategory, polyModeString].filter(Boolean).join(' // ') }}
              </span>
              <span class="text-sm font-bold text-emerald-400 uppercase tracking-widest leading-none">
                {{ currentSoundName }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="flex gap-2 mr-2">
        <select
          v-model="selectedStyle"
          class="bg-black text-synth-neon font-bold text-xs uppercase p-2 rounded-lg border border-neutral-800"
        >
          <option v-for="style in Object.keys(STYLES)" :key="style" :value="style">{{ style }}</option>
        </select>
        <select
          v-model="selectedKey"
          class="bg-black text-synth-neon font-bold text-xs uppercase p-2 rounded-lg border border-neutral-800"
        >
          <option v-for="key in NOTE_NAMES" :key="key" :value="key">{{ key }}</option>
        </select>
        <select
          v-model="selectedScale"
          class="bg-black text-synth-neon font-bold text-xs uppercase p-2 rounded-lg border border-neutral-800"
        >
          <option v-for="scale in Object.keys(SCALES)" :key="scale" :value="scale">{{ scale }}</option>
        </select>
        <label class="flex items-center gap-2 bg-black text-synth-neon font-bold text-xs uppercase p-2 rounded-lg border border-neutral-800 cursor-pointer">
          <input v-model="chordsEnabled" type="checkbox" />
          Chords
        </label>
        <template v-if="chordsEnabled">
          <div class="flex items-center gap-1.5 bg-black border border-neutral-800 rounded-lg px-2 py-1" title="Number of chords in progression">
            <span class="text-[10px] text-neutral-500 font-mono uppercase">Chords</span>
            <input
              v-model.number="chordDensity"
              type="number"
              min="1"
              max="16"
              class="w-10 bg-transparent text-synth-neon font-mono text-sm text-center outline-none"
            />
          </div>
          <div class="flex items-center gap-1.5 bg-black border border-neutral-800 rounded-lg px-2 py-1" title="Max polyphony (notes per chord)">
            <span class="text-[10px] text-neutral-500 font-mono uppercase">Poly</span>
            <input
              v-model.number="maxPolyphony"
              type="number"
              min="2"
              max="128"
              class="w-10 bg-transparent text-synth-neon font-mono text-sm text-center outline-none"
            />
          </div>
        </template>
        <button
          v-if="canUseSeqGen"
          @click="generateSequence"
          class="flex items-center gap-2 p-2 text-neutral-400 hover:text-synth-neon transition-colors bg-black rounded-lg border border-neutral-800"
        >
          <span class="text-xs font-bold uppercase">Generate</span>
        </button>
      </div>

      <button
        @click="emit('openKeyboard')"
        :class="['flex items-center gap-2 mr-2 p-2 px-3 transition-colors rounded-lg border shadow', isKeyboardOpen ? 'bg-synth-neon text-black border-synth-neon glow-neon' : 'bg-black text-neutral-400 hover:text-synth-neon border-neutral-800']"
      >
        <Keyboard class="w-4 h-4" />
        <span class="text-xs font-bold uppercase hidden sm:inline">Keys</span>
      </button>

      <button
        v-if="initialConfig"
        @click="() => {
          if (initialConfig.numSteps !== undefined) numSteps = initialConfig.numSteps;
          if (initialConfig.steps !== undefined) steps = initialConfig.steps.map(s => ({ ...DEFAULT_STEP, ...s }));
          if (initialConfig.param1CC !== undefined) param1CC = initialConfig.param1CC;
          if (initialConfig.param2CC !== undefined) param2CC = initialConfig.param2CC;
          if (initialConfig.transpose !== undefined) emit('transposeChange', initialConfig.transpose);
        }"
        class="flex items-center gap-2 mr-2 p-2 text-amber-400 hover:text-amber-300 transition-colors bg-black rounded-lg"
        title="Reload original sequence from preset"
      >
        <RotateCcw class="w-4 h-4" />
        <span class="text-xs font-bold uppercase hidden sm:inline">Reload</span>
      </button>

      <button
        @click="emit('savePattern', { numSteps, steps, param1CC, param2CC, transpose: globalTranspose, bpm })"
        class="flex items-center gap-2 mr-2 p-2 text-synth-neon hover:text-white transition-colors bg-black rounded-lg"
      >
        <Save class="w-4 h-4" />
        <span class="text-xs font-bold uppercase">Save</span>
      </button>

      <button @click="emit('close')" class="p-2 text-neutral-400 hover:text-white transition-colors bg-black rounded-lg">
        <X class="w-6 h-6" />
      </button>
    </div>

    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-6 p-4 border-b border-neutral-900 bg-black/50">
      <div class="flex items-center gap-2">
        <button
          @click="() => {
            isPlaying = !isPlaying;
            if (isPlaying) {
              isRecording = false;
              selectedStepIdx = null;
            }
          }"
          :class="['flex items-center gap-2 px-6 py-2 rounded-lg font-black uppercase text-sm transition-all', isPlaying ? 'bg-amber-500 text-black shadow-[0_0_15px_rgba(245,158,11,0.5)]' : 'bg-synth-neon text-black hover:bg-emerald-400']"
        >
          <template v-if="isPlaying">
            <Square class="w-4 h-4 fill-current" /> STOP
          </template>
          <template v-else>
            <Play class="w-4 h-4 fill-current" /> PLAY
          </template>
        </button>

        <button
          @click="() => {
            isRecording = !isRecording;
            if (isRecording) {
              isPlaying = false;
              if (selectedStepIdx === null) selectedStepIdx = 0;
            }
          }"
          :class="['flex items-center gap-2 px-4 py-2 rounded-lg font-black uppercase text-sm transition-all', isRecording ? 'bg-red-500 text-black shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'bg-black text-red-500 border border-red-900/50 hover:bg-red-950/30']"
        >
          <Circle class="w-4 h-4 fill-current" /> REC
        </button>

        <button
          @click="() => {
            confirmClear = true;
            setTimeout(() => { confirmClear = false; }, 3000);
            if (confirmClear) {
              const baseParam1 = (param1CC !== null && currentPresetCCValues?.[param1CC] !== undefined) ? currentPresetCCValues[param1CC] : 64;
              const baseParam2 = (param2CC !== null && currentPresetCCValues?.[param2CC] !== undefined) ? currentPresetCCValues[param2CC] : 64;
              steps.value = Array(numSteps).fill(null).map(() => ({ ...DEFAULT_STEP, active: false, notes: [], param1Value: baseParam1, param2Value: baseParam2 }));
              selectedStepIdx = null;
              confirmClear = false;
            }
          }"
          :class="['flex items-center gap-2 px-4 py-2 rounded-lg font-black uppercase text-sm transition-all border', confirmClear ? 'bg-red-500/20 text-red-500 border-red-500 hover:bg-red-500/40' : 'bg-black text-neutral-500 border-neutral-800 hover:text-white hover:border-neutral-500']"
        >
          <Trash2 class="w-4 h-4" /> {{ confirmClear ? 'SURE?' : 'CLEAR' }}
        </button>
      </div>

      <div class="flex items-center gap-3">
        <span class="text-xs font-mono text-neutral-500 uppercase">Length:</span>
        <input
          v-model.number="numSteps"
          type="number"
          min="4"
          :max="seqStepsLimit"
          class="bg-black border border-neutral-800 text-[#ff3300] rounded px-2 py-1 outline-none text-xl font-mono w-20 text-center font-black tracking-widest shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)]"
        />
        <span class="text-xs font-mono text-neutral-500 uppercase">STEPS</span>
      </div>

      <div class="flex items-center gap-3 border-l border-neutral-800 pl-6">
        <span class="text-xs font-mono text-neutral-500 uppercase">Param 1:</span>
        <input
          v-model.number="param1CC"
          type="number"
          min="0"
          max="127"
          class="bg-black border border-neutral-800 text-[#ff3300] rounded px-2 py-1 outline-none text-xl font-mono w-20 text-center font-black tracking-widest shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)]"
          placeholder="--"
        />
        <select
          v-if="mappingOpts.length > 0"
          :value="param1CC !== null && mappingOpts.some(o => o.cc === param1CC) ? String(param1CC) : ''"
          @change="e => param1CC = e.target.value ? parseInt(e.target.value) : null"
          class="bg-black border border-neutral-800 text-synth-neon rounded px-2 py-1 text-[10px] font-mono outline-none focus:border-synth-neon/40 cursor-pointer"
          title="Select from configured MIDI mappings"
        >
          <option value="">— mapped —</option>
          <option v-for="opt in mappingOpts" :key="opt.cc" :value="opt.cc">{{ opt.label }}</option>
        </select>
        <span class="text-[10px] text-synth-neon font-mono">{{ param1CC !== null ? (S1_CC_MAP[param1CC] || 'CC' + param1CC).toUpperCase() : '---' }}</span>

        <template v-if="canUseSeqParam2">
          <span class="text-xs font-mono text-neutral-500 uppercase ml-4">Param 2:</span>
          <input
            v-model.number="param2CC"
            type="number"
            min="0"
            max="127"
            class="bg-black border border-neutral-800 text-[#ff3300] rounded px-2 py-1 outline-none text-xl font-mono w-20 text-center font-black tracking-widest shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)]"
            placeholder="--"
          />
          <select
            v-if="mappingOpts.length > 0"
            :value="param2CC !== null && mappingOpts.some(o => o.cc === param2CC) ? String(param2CC) : ''"
            @change="e => param2CC = e.target.value ? parseInt(e.target.value) : null"
            class="bg-black border border-neutral-800 text-synth-neon rounded px-2 py-1 text-[10px] font-mono outline-none focus:border-synth-neon/40 cursor-pointer"
            title="Select from configured MIDI mappings"
          >
            <option value="">— mapped —</option>
            <option v-for="opt in mappingOpts" :key="opt.cc" :value="opt.cc">{{ opt.label }}</option>
          </select>
          <span class="text-[10px] text-synth-neon font-mono">{{ param2CC !== null ? (S1_CC_MAP[param2CC] || 'CC' + param2CC).toUpperCase() : '---' }}</span>
        </template>
      </div>

      <div class="flex items-center gap-4 border-l border-neutral-800 pl-6 ml-auto">
        <template v-if="canUseSeqGlobalTranspose">
          <div class="flex items-center gap-3 mr-4">
            <span class="text-xs font-mono text-neutral-500 uppercase">Transp:</span>
            <div class="flex bg-black shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)] border border-neutral-800 rounded">
              <button @click="emit('transposeChange', (globalTranspose || 0) - 1)" class="px-2 py-1 hover:bg-neutral-800 text-neutral-400 hover:text-white font-mono font-bold">-</button>
              <input
                type="number"
                min="-24"
                max="24"
                :value="globalTranspose"
                @input="e => emit('transposeChange', e.target.value ? parseInt(e.target.value) : 0)"
                class="bg-transparent text-[#ff3300] outline-none text-xl font-mono w-14 text-center font-black"
              />
              <button @click="emit('transposeChange', (globalTranspose || 0) + 1)" class="px-2 py-1 hover:bg-neutral-800 text-neutral-400 hover:text-white font-mono font-bold">+</button>
            </div>
          </div>
        </template>

        <template v-if="canUseSeqSyncTrack">
          <label class="flex items-center gap-2 cursor-pointer group">
            <div :class="['w-8 h-4 rounded-full p-[2px] transition-colors', syncTrack ? 'bg-synth-neon' : 'bg-neutral-800']">
              <div :class="['w-3 h-3 bg-white rounded-full transition-transform', syncTrack ? 'translate-x-4' : 'translate-x-0']" />
            </div>
            <input
              v-model="syncTrack"
              type="checkbox"
              class="hidden"
            />
            <span class="text-xs font-mono font-bold text-neutral-400 group-hover:text-white uppercase transition-colors tracking-widest">SYNC TRACK</span>
          </label>
        </template>
      </div>
    </div>

    <!-- Step Grid and Editor -->
    <div class="flex flex-1 overflow-hidden">
      <div class="flex-1 overflow-y-auto p-6 bg-grid-neon custom-scrollbar">
        <div class="grid grid-cols-4 md:grid-cols-8 lg:grid-cols-16 gap-2">
          <div
            v-for="(step, idx) in steps"
            :key="idx"
            @click="selectedStepIdx = idx"
            :class="['flex flex-col rounded-lg border overflow-hidden cursor-pointer transition-all', selectedStepIdx === idx ? 'border-synth-neon glow-neon scale-[1.02]' : 'border-neutral-800', currentStep === idx && isPlaying ? 'border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]' : '']"
          >
            <div :class="['text-[9px] font-mono text-center py-1 font-bold', step?.active ? 'bg-synth-neon text-black' : 'bg-neutral-900 text-neutral-500']">
              {{ idx + 1 }}
            </div>
            <div :class="['flex flex-col gap-1 p-2 h-24', step?.active ? 'bg-neutral-900/80' : 'bg-black', 'relative']">
              <div class="flex justify-between items-start">
                <span :class="['text-xs font-bold', step?.active ? 'text-white' : 'text-neutral-700']">
                  {{ step?.active ? getNoteName(step?.notes[0]) : '---' }}
                </span>
                <span v-if="step?.notes && step.notes.length > 1" class="text-[8px] bg-neutral-800 px-1 rounded text-neutral-400">+{{ step.notes.length - 1 }}</span>
              </div>

              <div v-if="step?.active" class="mt-auto space-y-1">
                <div class="flex gap-1 items-end h-4" :title="`Gate: ${step?.gate}%`">
                  <div class="bg-purple-500/60 rounded-sm" :style="{ width: `${step?.gate}%` }" />
                </div>
                <div class="flex gap-1">
                  <div class="h-1 bg-orange-500 rounded-full flex-1" :title="`Velocity: ${step?.velocity}`" :style="{ opacity: (step?.velocity || 0) / 127 }" />
                  <div v-if="step?.tieSteps && step.tieSteps > 0" class="h-1 bg-purple-500 rounded-full" :title="`Tie ${step.tieSteps} steps`" :style="{ width: `${8 + Math.min(step.tieSteps, 4) * 2}px` }" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Step Editor Sidebar -->
      <Transition name="panel">
        <div v-if="selectedStepIdx !== null && selectedStepIdx < steps.length" class="w-60 bg-black border-l border-neutral-900 flex flex-col">
          <div class="p-4 border-b border-neutral-900 flex justify-between items-center bg-neutral-900/50">
            <h3 class="font-black uppercase tracking-widest text-sm text-synth-neon">Step {{ selectedStepIdx + 1 }}</h3>
            <button @click="selectedStepIdx = null" class="text-neutral-500 hover:text-white"><X class="w-4 h-4" /></button>
          </div>

          <div class="p-4 space-y-3 overflow-y-auto custom-scrollbar flex-1">
            <div class="flex items-center justify-between">
              <span class="text-xs font-mono uppercase tracking-widest text-neutral-400">Step Active</span>
              <button
                @click="updateStep(selectedStepIdx, { active: !steps[selectedStepIdx].active })"
                :class="['px-3 py-1 rounded text-[10px] font-bold uppercase', steps[selectedStepIdx]?.active ? 'bg-synth-neon text-black' : 'bg-neutral-800 text-neutral-500']"
              >
                {{ steps[selectedStepIdx]?.active ? 'ON' : 'OFF' }}
              </button>
            </div>

            <template v-if="steps[selectedStepIdx]?.active">
              <div class="space-y-4">
                <div class="grid grid-cols-2 gap-3">
                  <div class="space-y-1">
                    <label class="text-[9px] font-mono text-neutral-500 uppercase">Note</label>
                    <div class="bg-neutral-900 border border-neutral-800 p-2 text-center font-bold text-synth-neon text-sm">
                      {{ getNoteName(steps[selectedStepIdx].notes[0] || 60) }}
                    </div>
                  </div>
                  <div class="space-y-1">
                    <label class="text-[9px] font-mono text-neutral-500 uppercase">Tie</label>
                    <input
                      v-model.number="steps[selectedStepIdx].tieSteps"
                      type="number"
                      min="0"
                      max="16"
                      class="w-full bg-neutral-900 border border-neutral-800 p-2 text-center text-sm text-white outline-none focus:border-synth-neon"
                    />
                  </div>
                </div>

                <div class="space-y-1">
                  <div class="flex justify-between text-[9px] font-mono text-neutral-500 uppercase">
                    <label>Velocity ({{ steps[selectedStepIdx].velocity }})</label>
                    <div class="flex gap-2">
                      <button @click="applyToAll('velocity', steps[selectedStepIdx].velocity)" class="hover:text-synth-neon text-[9px]">Set All</button>
                      <button @click="randomize('velocity')" class="hover:text-synth-neon text-[9px]">Rand</button>
                    </div>
                  </div>
                  <input
                    v-model.number="steps[selectedStepIdx].velocity"
                    type="range"
                    min="1"
                    max="127"
                    class="w-full accent-orange-500"
                  />
                </div>

                <div class="space-y-1">
                  <div class="flex justify-between text-[9px] font-mono text-neutral-500 uppercase">
                    <label>Gate ({{ steps[selectedStepIdx].gate }}%)</label>
                    <div class="flex gap-2">
                      <button @click="applyToAll('gate', steps[selectedStepIdx].gate)" class="hover:text-synth-neon text-[9px]">Set All</button>
                      <button @click="randomize('gate')" class="hover:text-synth-neon text-[9px]">Rand</button>
                    </div>
                  </div>
                  <input
                    v-model.number="steps[selectedStepIdx].gate"
                    type="range"
                    min="0"
                    max="100"
                    class="w-full accent-purple-500"
                  />
                </div>
              </div>

              <div class="pt-4 border-t border-neutral-900 space-y-4">
                <h4 class="text-[10px] font-mono text-synth-neon uppercase tracking-widest">Parameter Locks</h4>

                <template v-if="param1CC !== null">
                  <div class="space-y-2">
                    <label class="text-[10px] flex justify-between text-neutral-500">
                      <span>{{ (S1_CC_MAP[param1CC] || `CC ${param1CC}`).toUpperCase() }}</span>
                      <div class="flex gap-2">
                        <button @click="applyToAll('param1Value', steps[selectedStepIdx].param1Value)" class="hover:text-synth-neon text-[9px]">Set All</button>
                        <button @click="randomize('param1Value')" class="hover:text-synth-neon text-[9px]">Rand</button>
                      </div>
                      <span>{{ steps[selectedStepIdx].param1Value }}</span>
                    </label>
                    <input
                      v-model.number="steps[selectedStepIdx].param1Value"
                      type="range"
                      min="0"
                      max="127"
                      class="w-full accent-cyan-500"
                    />
                  </div>
                </template>

                <template v-if="canUseSeqParam2 && param2CC !== null">
                  <div class="space-y-2">
                    <label class="text-[10px] flex justify-between text-neutral-500">
                      <span>{{ (S1_CC_MAP[param2CC] || `CC ${param2CC}`).toUpperCase() }}</span>
                      <div class="flex gap-2">
                        <button @click="applyToAll('param2Value', steps[selectedStepIdx].param2Value)" class="hover:text-synth-neon text-[9px]">Set All</button>
                        <button @click="randomize('param2Value')" class="hover:text-synth-neon text-[9px]">Rand</button>
                      </div>
                      <span>{{ steps[selectedStepIdx].param2Value }}</span>
                    </label>
                    <input
                      v-model.number="steps[selectedStepIdx].param2Value"
                      type="range"
                      min="0"
                      max="127"
                      class="w-full accent-indigo-500"
                    />
                  </div>
                </template>

                <p v-if="param1CC === null && (!canUseSeqParam2 || param2CC === null)" class="text-xs text-neutral-600 italic text-center py-4 bg-neutral-900/50 rounded-lg">
                  No global parameters assigned.
                </p>
              </div>
            </template>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>
