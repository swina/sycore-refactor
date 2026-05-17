<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { X, Play, Square, Settings, Plus, Trash2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Save, Download, Keyboard, Piano, Circle, RotateCcw } from 'lucide-vue-next'
import { getTransport, getDraw, start as toneStart } from 'tone'
import { midiService, MidiSource } from '@/core/midi/MidiService'
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

const emit = defineEmits(['close', 'bpmChange', 'transposeChange', 'prevSlot', 'nextSlot', 'savePattern', 'configChange', 'openKeyboard', 'stop'])

const midiStore = useMidiStore()

const DEFAULT_STEP = {
  active: false,
  notes: [60],
  velocity: 100,
  gate: 50,
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
const syncTrack = ref(syncTrackStorage.value ?? false)
const genDensity = ref(75)
const swingAmount = ref(0)
const basePatternLength = ref(16)
const selectedOctave = ref((() => {
  try {
    const saved = seqStateStorage.value
    return saved?.selectedOctave ?? 4
  } catch { return 4 }
})())
const octaveRange = ref((() => {
  try {
    const saved = seqStateStorage.value
    return saved?.octaveRange ?? 0
  } catch { return 0 }
})())
let baseLengthTimer = null

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

const param1Variation = ref((() => {
  try {
    const saved = seqStateStorage.value
    return saved?.param1Variation ?? 25
  } catch { return 25 }
})())

const param2Variation = ref((() => {
  try {
    const saved = seqStateStorage.value
    return saved?.param2Variation ?? 25
  } catch { return 25 }
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

let lastEmittedConfig = null;

watch([numSteps, steps, param1CC, param2CC, param1Variation, param2Variation, selectedOctave, octaveRange, () => props.globalTranspose, () => props.bpm], () => {
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
    bpm: props.bpm || 120
  }
  seqStateStorage.value = config
  lastEmittedConfig = config
  emit('configChange', config)
  midiStore.sendCC(77, Math.max(0, Math.min(127, (props.globalTranspose || 0) + 64)), props.channel)

  // Sync live playback state immediately
  if (playStateRef.current) {
    playStateRef.current.steps = steps.value
    playStateRef.current.bpm = props.bpm || 120
    playStateRef.current.param1CC = param1CC.value
    playStateRef.current.param2CC = param2CC.value
    playStateRef.current.transpose = props.globalTranspose || 0
    playStateRef.current.channel = props.channel
  }
}, { deep: true })

watch(() => props.initialConfig, (cfg) => {
  if (cfg) {
    if (cfg.numSteps !== undefined && numSteps.value !== cfg.numSteps) {
      numSteps.value = cfg.numSteps
    }
    if (cfg.steps !== undefined) {
      const cleanStep = s => ({
        active: !!s.active,
        notes: s.notes || [60],
        velocity: s.velocity ?? 100,
        gate: s.gate ?? 50,
        tieSteps: s.tieSteps ?? 0,
        param1Value: s.param1Value ?? 64,
        param2Value: s.param2Value ?? 64
      })
      const currentJSON = JSON.stringify(steps.value.map(cleanStep))
      const incomingJSON = JSON.stringify(cfg.steps.map(cleanStep))
      if (currentJSON !== incomingJSON) {
        steps.value = cfg.steps.map(s => ({ ...DEFAULT_STEP, ...s }))
      }
    }
    if (cfg.param1CC !== undefined && param1CC.value !== cfg.param1CC) {
      param1CC.value = cfg.param1CC
    }
    if (cfg.param2CC !== undefined && param2CC.value !== cfg.param2CC) {
      param2CC.value = cfg.param2CC
    }
    if (cfg.param1Variation !== undefined && param1Variation.value !== cfg.param1Variation) {
      param1Variation.value = cfg.param1Variation
    }
    if (cfg.param2Variation !== undefined && param2Variation.value !== cfg.param2Variation) {
      param2Variation.value = cfg.param2Variation
    }
    if (cfg.transpose !== undefined && props.globalTranspose !== cfg.transpose) {
      emit('transposeChange', cfg.transpose)
    }
  }
}, { immediate: true })

watch(() => props.bpm, (bpm) => {
  getTransport().bpm.value = bpm
  midiStore.setBpm(bpm)
})

watch(swingAmount, (val) => {
  getTransport().swing = val / 100
  getTransport().swingSubdivision = '16n'
})

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
      if (!onsetSet.has(i)) return { ...DEFAULT_STEP, active: false }

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

      return { ...DEFAULT_STEP, active: true, notes, velocity, gate: 90, tieSteps, param1Value: Math.floor(Math.random() * 128), param2Value: Math.floor(Math.random() * 128) }
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
      if (active) {
        const octave = finalOctMin + Math.floor(Math.random() * (finalOctMax - finalOctMin + 1))
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

      return { ...DEFAULT_STEP, active, notes, velocity, gate, tieSteps, param1Value, param2Value }
    })
  }
  basePatternLength.value = numSteps.value
}

function duplicateLength() {
  const next = Math.min(64, numSteps.value * 2)
  if (next !== numSteps.value) {
    // Tiling logic is handled by the watch(numSteps)
    numSteps.value = next
  }
}

function reduceLength() {
  const next = Math.max(2, Math.round(numSteps.value / 2))
  if (next !== numSteps.value) {
    numSteps.value = next
  }
}

function updateStep(idx, updates) {
  steps.value[idx] = { ...steps.value[idx], ...updates }
  steps.value = [...steps.value]
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
  a.href = url
  a.download = `S1_Sequence_${props.currentSoundName || 'Pattern'}.mid`
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

  const handleSequencerAction = (e) => {
    const { action, val } = e.detail
    switch (action) {
      case 'seq_swing_cc':
        swingAmount.value = Math.round((val / 127) * 100)
        break
      case 'seq_density_cc':
        genDensity.value = Math.round((val / 127) * 100)
        break
      case 'seq_length_cc':
        numSteps.value = 2 + Math.round((val / 127) * 62)
        break
      case 'seq_key_cc': {
        const idx = Math.floor((val / 128) * NOTE_NAMES.length)
        selectedKey.value = NOTE_NAMES[idx]
        break
      }
      case 'seq_scale_cc': {
        const scales = Object.keys(SCALES)
        const idx = Math.floor((val / 128) * scales.length)
        selectedScale.value = scales[idx]
        break
      }
      case 'seq_style_cc': {
        const styles = Object.keys(STYLES)
        const idx = Math.floor((val / 128) * styles.length)
        selectedStyle.value = styles[idx]
        break
      }
      case 'seq_transpose_cc':
        emit('transposeChange', Math.round((val / 127) * 48) - 24)
        break
      case 'seq_gen_trigger':
        if (val > 63) generateSequence()
        break
      case 'seq_duplicate':
        if (val > 63) duplicateLength()
        break
      case 'seq_reduce':
        if (val > 63) reduceLength()
        break
      case 'seq_skip_step':
        if (val > 63) {
          if (selectedStepIdx.value === null) selectedStepIdx.value = 0
          else selectedStepIdx.value = (selectedStepIdx.value + 2) % numSteps.value
        }
        break
      case 'seq_octave_cc':
        selectedOctave.value = Math.max(0, Math.min(8, Math.round((val / 127) * 8)))
        break
      case 'seq_range_cc':
        octaveRange.value = Math.max(-3, Math.min(3, Math.round((val / 127) * 6) - 3))
        break
    }
  }
  window.addEventListener('sequencer-action', handleSequencerAction)

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
    
    if (isPlaying.value) midiStore.sendStart()
    else midiStore.sendStop()
  }
  window.addEventListener('toggle-sequencer', handleToggle)

  const handleIncomingNote = (type, note, velocity, chan) => {
    if (!props.isOpen) return
    // Guard: ignore incoming notes for step editing if playing (prevents MIDI feedback loop)
    if (isPlaying.value && !isRecording.value) return
    
    const now = performance.now()
    if (type === 'on' && velocity > 0 && selectedStepIdx.value !== null) {
      if (now - lastHandledNoteTimeRef.value < 150) return
      lastHandledNoteTimeRef.value = now

      const currentStepObj = steps.value[selectedStepIdx.value]
      const updates = { active: true, notes: [note], velocity }
      
      // If gate is 0, set to default 50
      if (!currentStepObj.gate || currentStepObj.gate === 0) {
        updates.gate = 50
      }

      if (isRecording.value) {
        updateStep(selectedStepIdx.value, updates)
        selectedStepIdx.value = (selectedStepIdx.value + 1) % numSteps.value
      } else {
        updateStep(selectedStepIdx.value, updates)
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
    window.removeEventListener('sequencer-action', handleSequencerAction)
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
    midiStore.sendStop()
    midiStore.allNotesOff(props.channel)

    let fadeStep = 0
    const fadeSteps = 20
    const intervalMs = 500 / fadeSteps

    if (fadeOutIntervalRef.value !== null) clearInterval(fadeOutIntervalRef.value)

    fadeOutIntervalRef.value = window.setInterval(() => {
      fadeStep++
      const ratio = 1 - (fadeStep / fadeSteps)
      midiStore.sendCC(11, Math.max(0, Math.floor(127 * ratio)), props.channel, MidiSource.SEQUENCER)

      if (fadeStep >= fadeSteps) {
        if (fadeOutIntervalRef.value !== null) {
          clearInterval(fadeOutIntervalRef.value)
          fadeOutIntervalRef.value = null
        }
        emit('stop')
        setTimeout(() => midiStore.sendCC(11, 127, props.channel, MidiSource.SEQUENCER), 50)
      }
    }, intervalMs)

    currentStep.value = 0
  } else {
    if (fadeOutIntervalRef.value !== null) {
      clearInterval(fadeOutIntervalRef.value)
      fadeOutIntervalRef.value = null
      midiStore.sendCC(11, 127, props.channel, MidiSource.SEQUENCER)
    }

    let stepCounter = 0

    toneStart().then(() => {
      getTransport().bpm.value = props.bpm
      midiStore.setBpm(props.bpm)
      midiStore.sendStart()

      repeatEventIdRef.value = getTransport().scheduleRepeat((time) => {
        const state = playStateRef.current
        stepCounter = stepCounter % state.steps.length
        const stepIdx = stepCounter
        stepCounter = (stepCounter + 1) % state.steps.length
        const step = state.steps[stepIdx]

        if (step.active) {
          if (state.param1CC !== null) midiStore.sendCC(state.param1CC, step.param1Value, state.channel, MidiSource.SEQUENCER)
          if (state.param2CC !== null) midiStore.sendCC(state.param2CC, step.param2Value, state.channel, MidiSource.SEQUENCER)

          const stepDurationMs = 60000 / (state.bpm * 4)
          let noteDurationMs = stepDurationMs * (step.gate / 100)
          if (step.tieSteps > 0) noteDurationMs += stepDurationMs * Math.min(step.tieSteps, state.steps.length - 1)
          noteDurationMs = Math.max(noteDurationMs, 10)

          step.notes.forEach(note => {
            const clampedNote = Math.max(0, Math.min(127, note + state.transpose))
            midiStore.sendNoteOn(clampedNote, step.velocity, state.channel, MidiSource.SEQUENCER)
            window.setTimeout(() => midiStore.sendNoteOff(clampedNote, 0, state.channel, MidiSource.SEQUENCER), noteDurationMs)
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
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-[600] flex flex-col bg-neutral-950 font-sans text-white border-t-2 border-synth-neon overflow-hidden">
    <div class="w-full max-w-[1024px] m-auto h-full flex flex-col bg-neutral-900 shadow-2xl relative">
      
      <!-- ── HEADER: Compact & Responsive ── -->
      <div class="shrink-0 px-4 py-2 border-b border-neutral-800 bg-black/40 flex flex-col sm:flex-row items-center gap-3 justify-between">
        <div class="flex items-center gap-4 w-full sm:w-auto">
          <h2 class="text-base font-black uppercase tracking-tight text-synth-neon shrink-0">Sequencer</h2>
          
          <div class="flex items-center bg-black/60 border border-neutral-800 rounded-lg px-2 py-1 gap-3">
            <div class="flex items-center gap-1.5">
              <span class="text-[9px] text-neutral-500 font-mono">BPM</span>
              <input
                type="number"
                :value="bpm"
                @input="e => emit('bpmChange', Number(e.target.value))"
                class="w-10 bg-transparent text-synth-neon font-mono text-sm outline-none text-center"
              />
            </div>
            <div class="w-px h-3 bg-neutral-800" />
            <span class="text-sm text-synth-neon font-mono tabular-nums leading-none">
              {{ transportPosition }}
            </span>
          </div>

          <!-- Active Sound Info: Expanded with Nav -->
          <div v-if="currentSoundName" class="flex items-center gap-3 px-3 py-1 bg-black/40 rounded-lg border border-neutral-800/50 min-w-[180px]">
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

          <button @click="emit('savePattern', { numSteps, steps, param1CC, param2CC, param1Variation, param2Variation, transpose: globalTranspose, bpm })"
            class="p-2 bg-neutral-800 text-synth-neon rounded-lg border border-neutral-700 hover:text-white transition-colors" title="Save Pattern">
            <Save class="w-4 h-4" />
          </button>

          <button @click="emit('close')" class="p-2 text-neutral-500 hover:text-white transition-colors">
            <X class="w-5 h-5" />
          </button>
        </div>
      </div>

      <!-- ── GENERATION SETTINGS ROW ── -->
      <div class="shrink-0 flex items-center gap-4 px-4 py-2 border-b border-neutral-900 bg-black/20">
        <div class="flex items-center gap-2">
          <span class="text-[12px] font-mono text-neutral-500 uppercase">Scale</span>
          <div class="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-neutral-800/50">
            <select v-model="selectedKey" class="bg-neutral-900 text-synth-neon font-bold text-[14px] uppercase px-1 outline-none border-r border-neutral-800 cursor-pointer [color-scheme:dark]">
              <option v-for="key in NOTE_NAMES" :key="key" :value="key" class="bg-neutral-900">{{ key }}</option>
            </select>
            <select v-model="selectedScale" class="bg-neutral-900 text-synth-neon font-bold text-[14px] uppercase px-1 outline-none cursor-pointer [color-scheme:dark]">
              <option v-for="scale in Object.keys(SCALES)" :key="scale" :value="scale" class="bg-neutral-900">{{ scale }}</option>
            </select>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-[12px] font-mono text-neutral-500 uppercase">Oct</span>
          <div class="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-neutral-800/50">
            <select v-model="selectedOctave" class="bg-neutral-900 text-synth-neon font-bold text-[14px] uppercase px-1 outline-none border-r border-neutral-800 cursor-pointer [color-scheme:dark]">
              <option v-for="o in [0,1,2,3,4,5,6,7,8]" :key="o" :value="o" class="bg-neutral-900">{{ o }}</option>
            </select>
            <select v-model="octaveRange" class="bg-neutral-900 text-synth-neon font-bold text-[14px] uppercase px-1 outline-none cursor-pointer [color-scheme:dark]">
              <option v-for="r in [-3,-2,-1,0,1,2,3]" :key="r" :value="r" class="bg-neutral-900">{{ r >= 0 ? '+' + r : r }}</option>
            </select>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-[12px] font-mono text-neutral-500 uppercase">Style</span>
          <select v-model="selectedStyle" class="bg-black/40 border border-neutral-800 text-synth-neon rounded-lg px-2 py-1 text-[14px] font-bold uppercase outline-none cursor-pointer [color-scheme:dark]">
            <option v-for="style in Object.keys(STYLES)" :key="style" :value="style" class="bg-neutral-900">{{ style }}</option>
          </select>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-[12px] font-mono text-neutral-500 uppercase">Density</span>
          <div class="flex items-center gap-3 bg-black/40 border border-neutral-800 rounded-lg px-2 h-7">
            <input v-model.number="genDensity" type="range" min="0" max="100" class="w-24 h-1 accent-synth-neon bg-neutral-800 rounded-lg appearance-none cursor-pointer" />
            <span class="text-[12px] font-mono text-synth-neon w-8 text-right">{{ genDensity }}%</span>
          </div>
        </div>

        <div class="w-px h-6 bg-neutral-800 mx-2" />

        

        <button @click="generateSequence" 
          class="ml-auto flex items-center gap-2 px-4 py-1.5 bg-synth-neon text-black rounded-lg hover:bg-white transition-all font-black text-[9px] uppercase shadow-[0_0_15px_rgba(0,255,204,0.3)]">
          <Plus class="w-3.5 h-3.5" />
          Generate Pattern
        </button>
      </div>
      <div class="flex w-full gap-3 px-4">
        <!-- Param Assign -->
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <span class="text-[12px] font-mono text-neutral-500 uppercase leading-none">P1</span>
            <select v-model="param1CC" class="bg-black/40 border border-neutral-800 text-synth-neon rounded px-1.5 py-0.5 text-[14px] font-mono outline-none w-30 cursor-pointer [color-scheme:dark]">
              <option v-for="opt in allS1Params" :key="opt.cc" :value="opt.cc" class="bg-neutral-900">{{ opt.label }}</option>
            </select>
            <div class="flex items-center gap-1 bg-black/40 border border-neutral-800 rounded px-1.5 h-6 ml-1">
              <span class="text-[8px] font-mono text-neutral-500" title="Variazione P1 RND">RND%</span>
              <input v-model.number="param1Variation" type="range" min="-100" max="100" :disabled="midiStore.isTransportPlaying" class="w-12 h-1 accent-synth-neon bg-neutral-800 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" />
              <span class="text-[9px] font-mono text-synth-neon w-7 text-right" :class="{'opacity-50': midiStore.isTransportPlaying}">{{ param1Variation > 0 ? '+' : '' }}{{ param1Variation }}</span>
            </div>
          </div>
          
          <div class="w-px h-5 bg-neutral-800 mx-1" />

          <div class="flex items-center gap-2">
            <span class="text-[12px] font-mono text-neutral-500 uppercase leading-none">P2</span>
            <select v-model="param2CC" class="bg-black/40 border border-neutral-800 text-synth-neon rounded px-1.5 py-0.5 text-[14px] font-mono outline-none w-24 cursor-pointer [color-scheme:dark]">
              <option v-for="opt in allS1Params" :key="opt.cc" :value="opt.cc" class="bg-neutral-900">{{ opt.label }}</option>
            </select>
            <div class="flex items-center gap-1 bg-black/40 border border-neutral-800 rounded px-1.5 h-6 ml-1">
              <span class="text-[8px] font-mono text-neutral-500" title="Variazione P2 RND">RND%</span>
              <input v-model.number="param2Variation" type="range" min="-100" max="100" :disabled="midiStore.isTransportPlaying" class="w-12 h-1 accent-synth-neon bg-neutral-800 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" />
              <span class="text-[9px] font-mono text-synth-neon w-7 text-right" :class="{'opacity-50': midiStore.isTransportPlaying}">{{ param2Variation > 0 ? '+' : '' }}{{ param2Variation }}</span>
            </div>
          </div>
        </div>
      </div>
      <!-- ── MAIN TOOLBAR ── -->
      <div class="shrink-0 flex flex-wrap items-center gap-4 p-3 border-b border-neutral-900 bg-neutral-900/50">
        <!-- Transport Controls -->
        <div class="flex items-center gap-1">
          <button @click="isPlaying = !isPlaying"
            :class="['flex items-center gap-2 px-4 h-9 rounded-lg font-black uppercase text-[10px] transition-all', isPlaying ? 'bg-amber-500 text-black' : 'bg-synth-neon text-black']">
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

        <!-- Sequence Length -->
        <div class="flex items-center gap-2">
          <span class="text-[9px] font-mono text-neutral-500 uppercase">Length</span>
          <div class="flex items-center bg-black border border-neutral-800 rounded px-2 h-9 gap-2">
            <button @click="reduceLength" class="p-1 text-neutral-500 hover:text-orange-500 transition-colors" title="/2 (Dimezza)">
              <ChevronDown class="w-3.5 h-3.5" />
            </button>
            <input v-model.number="numSteps" type="range" min="2" :max="seqStepsLimit" 
              class="w-20 h-1 accent-orange-500 bg-neutral-800 rounded-lg appearance-none cursor-pointer" />
            <button @click="duplicateLength" class="p-1 text-neutral-500 hover:text-orange-500 transition-colors" title="x2 (Raddoppia)">
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
              class="w-8 bg-transparent text-synth-neon font-mono text-sm outline-none text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
          <div class="flex items-center bg-black border border-neutral-800 rounded px-2 h-9 gap-3">
            <input v-model.number="swingAmount" type="range" min="0" max="100" class="w-20 h-1 accent-emerald-500 bg-neutral-800 rounded-lg appearance-none cursor-pointer" />
            <span class="text-[9px] font-mono text-emerald-500 w-8 text-right">{{ swingAmount }}%</span>
          </div>
        </div>

        <!-- Toolbar Actions -->
        <div class="flex items-center gap-2 ml-auto">
          <button @click="handleClear"
            :class="['h-9 px-4 rounded-lg font-black uppercase text-[10px] transition-all border shadow-sm', confirmClear ? 'bg-red-500/20 text-red-500 border-red-500' : 'bg-black text-neutral-500 border-neutral-800 hover:border-neutral-700']">
            {{ confirmClear ? 'SURE?' : 'CLEAR' }}
          </button>
        </div>
      </div>

      <!-- ── CONTEXTUAL STEP TOOLBAR ── -->
      <Transition name="toolbar">
        <div v-if="selectedStepIdx !== null" class="shrink-0 bg-neutral-800 border-b border-synth-neon/20 p-2 px-4 flex items-center gap-6 overflow-x-auto no-scrollbar">
          <div class="flex items-center gap-3 shrink-0">
            <span class="text-[10px] font-black text-synth-neon uppercase tracking-tighter">Step {{ selectedStepIdx + 1 }}</span>
            <button @click="updateStep(selectedStepIdx, { active: !steps[selectedStepIdx].active })"
              :class="['px-2 py-1 rounded text-[9px] font-black', steps[selectedStepIdx]?.active ? 'bg-synth-neon text-black' : 'bg-neutral-900 text-neutral-500']">
              {{ steps[selectedStepIdx]?.active ? 'ACTIVE' : 'OFF' }}
            </button>
          </div>

          <template v-if="steps[selectedStepIdx]?.active">
            <div class="w-px h-4 bg-neutral-700 shrink-0" />
            
            <div class="flex items-center gap-4 shrink-0">
              <div class="flex flex-col">
                <span class="text-[8px] font-mono text-neutral-500 uppercase">Note</span>
                <span class="text-xs font-bold text-white leading-tight">{{ getNoteName(steps[selectedStepIdx].notes[0] || 60) }}</span>
              </div>
              
              <div class="flex flex-col min-w-[70px]">
                <div class="flex justify-between items-center mb-0.5">
                  <span class="text-[8px] font-mono text-neutral-500 uppercase">Vel ({{ steps[selectedStepIdx].velocity }})</span>
                  <div class="flex gap-1">
                    <button @click="applyToAll('velocity', steps[selectedStepIdx].velocity)" class="text-[7px] text-synth-neon hover:underline">ALL</button>
                    <button @click="randomize('velocity')" class="text-[7px] text-synth-neon hover:underline">RND</button>
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

              <div class="flex flex-col min-w-[70px]">
                <div class="flex justify-between items-center mb-0.5">
                  <span class="text-[8px] font-mono text-neutral-500 uppercase">Gate ({{ steps[selectedStepIdx].gate }}%)</span>
                  <div class="flex gap-1">
                    <button @click="applyToAll('gate', steps[selectedStepIdx].gate)" class="text-[7px] text-synth-neon hover:underline">ALL</button>
                    <button @click="randomize('gate')" class="text-[7px] text-synth-neon hover:underline">RND</button>
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
                    <span class="text-[8px] font-mono text-neutral-500 uppercase truncate max-w-[50px]">{{ S1_CC_MAP[param1CC] }}</span>
                    <div class="flex gap-1">
                      <button @click="applyToAll('param1Value', steps[selectedStepIdx].param1Value)" class="text-[7px] text-synth-neon hover:underline">ALL</button>
                      <button @click="randomize('param1Value')" class="text-[7px] text-synth-neon hover:underline">RND</button>
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
                    <span class="text-[8px] font-mono text-neutral-500 uppercase truncate max-w-[50px]">{{ S1_CC_MAP[param2CC] }}</span>
                    <div class="flex gap-1">
                      <button @click="applyToAll('param2Value', steps[selectedStepIdx].param2Value)" class="text-[7px] text-synth-neon hover:underline">ALL</button>
                      <button @click="randomize('param2Value')" class="text-[7px] text-synth-neon hover:underline">RND</button>
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

          <button @click="selectedStepIdx = null" class="ml-auto text-neutral-500 hover:text-white shrink-0">
            <X class="w-4 h-4" />
          </button>
        </div>
      </Transition>

      <!-- ── STEP GRID ── -->
      <div class="flex-1 overflow-y-auto p-4 bg-neutral-900/30 custom-scrollbar">
        <div class="grid grid-cols-4 sm:grid-cols-8 lg:grid-cols-16 gap-2">
          <div
            v-for="(step, idx) in steps" :key="idx"
            @click="selectedStepIdx = idx"
            :class="[
              'group relative flex flex-col rounded-lg border transition-all cursor-pointer',
              selectedStepIdx === idx ? 'border-synth-neon ring-1 ring-synth-neon/50 bg-neutral-800' : 'border-neutral-800 bg-neutral-950/40',
              currentStep === idx && isPlaying ? 'border-amber-400 bg-amber-500/5' : ''
            ]"
          >
            <!-- Step Number -->
            <div :class="['text-[8px] font-mono text-center py-0.5 rounded-t-[7px]', step?.active ? 'bg-synth-neon/20 text-synth-neon' : 'bg-neutral-900/50 text-neutral-600']">
              {{ idx + 1 }}
            </div>
            
            <!-- Step Content -->
            <div class="p-2 h-16 flex flex-col justify-center relative overflow-hidden">
              <template v-if="step?.active">
                <span class="text-[10px] font-black text-white leading-none mb-1">{{ getNoteName(step?.notes[0]) }}</span>
                <div class="space-y-1 mt-auto">
                  <div class="h-0.5 bg-orange-500/60 rounded-full" :style="{ width: (step.velocity / 127 * 100) + '%' }" />
                  <div class="h-0.5 bg-purple-500/60 rounded-full" :style="{ width: step.gate + '%' }" />
                </div>
                <!-- Play Indicator -->
                <div v-if="currentStep === idx && isPlaying" class="absolute inset-0 bg-amber-500/10 animate-pulse pointer-events-none" />
              </template>
              <template v-else>
                <div class="h-full flex items-center justify-center opacity-10">
                  <div class="w-1 h-1 rounded-full bg-neutral-500" />
                </div>
              </template>
            </div>

            <!-- Context Hint -->
            <div v-if="selectedStepIdx === idx" class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-synth-neon shadow-[0_0_4px_#00ff88]" />
          </div>
        </div>
      </div>

      <!-- Footer Info -->
      <div class="shrink-0 px-4 py-2 border-t border-neutral-900 bg-black/40 flex justify-between items-center">
        <div class="flex items-center gap-4">
          <span class="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">Sequencer // Build 0.9.8</span>
          <div class="flex items-center gap-1.5">
            <div class="w-1 h-1 rounded-full bg-synth-neon animate-pulse" />
            <span class="text-[9px] font-mono text-synth-neon uppercase">Ready</span>
          </div>
        </div>
        <div class="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">
          S-1 TWEAK // {{ selectedStyle }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #262626; border-radius: 10px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #404040; }

.toolbar-enter-active, .toolbar-leave-active { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.toolbar-enter-from, .toolbar-leave-to { opacity: 0; transform: translateY(-10px); height: 0; padding-top: 0; padding-bottom: 0; }

input[type=range] { -webkit-appearance: none; appearance: none; background: transparent; cursor: pointer; }
input[type=range]:focus { outline: none; }
input[type=range]::-webkit-slider-runnable-track { background: #171717; height: 4px; border-radius: 2px; }
input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 10px; width: 10px; border-radius: 50%; background: currentColor; margin-top: -3px; }
</style>
