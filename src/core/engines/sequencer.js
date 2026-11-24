/**
 * Sequencer engine — the Sequencer's (sequencer2) playback and pattern state, outside its Vue
 * component (Scenario Workspaces, Phase 1): the working copy of the active bank, the clock
 * (Tone.js repeat or CLK SYS), the notes it holds, bank cue / chain follow, generate, the Rig and
 * Control Map events (toggle-sequencer2, seq-bank-select, seq-bank-cue, seq-generate,
 * seq-banks-reloaded, seq-time-set, seq-direction-set, seq-steps-set), MIDI inputs (transpose, auto-start,
 * record) and the local autosave.
 *
 * One instance per lane (useSequencerEngine(lane): Main — the Sequencer as it always was —, Bass, Arp;
 * lib/seq-lanes.ts), created on first use in a detached effectScope: it keeps playing with the
 * Sequencer panel closed or unmounted. The panel (Sequencer.vue) renders its state and calls its
 * actions. A lane has its own banks store, MIDI source and channel, events and MIDI Learn names; what
 * is the app's (the Rig's reports, the transport, the backing track, CC 77, swing) stays Main's.
 *
 * The code is moved from Sequencer.vue as it was (2026-11-11); only what tied it to the component
 * changed: props.bpm / channel → midiStore.currentBpm / midiChannel, props.isOpen →
 * uiStore.isSequencer2Open, props.globalTranspose → uiStore.seqGlobalTranspose,
 * props.currentPresetCCValues → presetStore.lastPreset.data; unmounting the panel stops nothing.
 */
import { autoName } from '@/lib/slot-names'
import { ref, computed, watch, effectScope, onScopeDispose } from 'vue'
import { getTransport, start as toneStart } from 'tone'
import { drawAt, uiTimeout } from '@/lib/ui-clock'
import { useTransportManager } from '@/composables/useTransportManager'
import { midiService, MidiSource, traceOn } from '@/core/midi/midi-service'
import { useMidiStore } from '@/stores/useMidiStore'
import { usePresetStore } from '@/stores/usePresetStore'
import { useUiStore } from '@/stores/useUiStore'
import { useSeqLaneStore, BANK_COUNT } from '@/stores/useStepSequencerStore'
import { SEQ_LANE_CFG, SEQ_LANES, SEQ_LANE_SOURCES, laneEvent, seqLanePlaying, seqLaneQueued } from '@/lib/seq-lanes'
import { useLiveMapStore } from '@/stores/useLiveMapStore'
import { journaled } from '@/lib/session-takes'
import { useLocalStorage } from '@/composables/useLocalStorage'
import { S1_CC_MAP } from '@/constants/s1-config'
import { useSyncStore } from '@/stores/useSyncStore'
import { nextArpIndex, defaultArpPatternState } from '@/lib/arp-patterns'
import { StepScheduler, createWorkerTicker, chaseNote, VoiceLedger, noteOffDecideAt } from '@/core/midi/step-scheduler'
import { externalGrid } from '@/core/midi/external-grid'
import { intGrid } from '@/core/midi/int-grid'
import { stopGate } from '@/core/midi/stop-gate'
import { densityKeeps, densityFor } from '@/lib/rig-density'
import { audioTimeToPerfMs, perfMsToAudioTime } from '@/lib/audio-clock'
import { userKey } from '@/lib/userKey'
import { rigReports, rigLaneRows } from '@/lib/rig-live'
import { degreeShift, transposeDiatonic, fitToChord, seqFitOf } from '@/lib/seq-gen/harmony'
import { pickOnsets, euclidOnsets, randomOnsets } from '@/lib/seq-gen/rhythm'
import { melodyLine, motifLength, repeatOnsets, arpDegrees } from '@/lib/seq-gen/melody'
import { berlinLine, sweepShape } from '@/lib/seq-gen/berlin'
import { bassLine, BASS_STYLES } from '@/lib/seq-gen/bass'
import { mixSteps, mutateAmount, varyFromMidi } from '@/lib/seq-gen/mutate'
import { paramValue } from '@/lib/seq-gen/params'
import { progressionKey, progressionKeyDetail } from '@/lib/chord-key'
import { paramTargets, hasDeviceRoutes } from '@/lib/seq-device-params'
import { captureLaneSound, laneSoundMessages, laneSoundLabel } from '@/lib/lane-sound'
import { useSeqDeviceParamsStore } from '@/stores/useSeqDeviceParamsStore'
import { useChordProgStore } from '@/stores/useChordProgStore'

export const DEFAULT_STEP = {
  active: false,
  notes: [60],
  velocity: 100,
  gate: 75,
  tieSteps: 0,
  param1Value: 64,
  param2Value: 64,
  edited: false,
  octave: 4,
  accent: false,
  probability: 100,
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

// Row order for the 12-note-bar grid — B at top down to C at bottom, per
// docs/plans/modular/new-step-sequencer.md's layout. Semitone index into
// NOTE_NAMES for each row, top to bottom.
export const GRID_SEMITONES = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]

export const STYLES = {
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
  // aligned with the Drum Machine's and the Chord Prog's styles (gen-styles.ts)
  Trap: { steps: 16, density: 0.35, octaves: [3, 5], velMin: 80, velMax: 120, gateMin: 30, gateMax: 85, accentGrid: [true, false, false, false, false, false, false, false, false, false, true, false, false, false, false, false] },
  EDM: { steps: 16, density: 0.60, octaves: [3, 5], velMin: 90, velMax: 122, gateMin: 40, gateMax: 70, accentGrid: [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false] },
  Urban: { steps: 16, density: 0.45, octaves: [3, 4], velMin: 70, velMax: 110, gateMin: 45, gateMax: 85, accentGrid: [true, false, false, false, false, false, true, false, false, false, false, false, true, false, false, false] },
  Arpeggio: { steps: 16, density: 1, octaves: [4, 5], velMin: 90, velMax: 110, gateMin: 60, gateMax: 80 },
  // every step, short notes, a root pedal under a repeated cell (seq-gen/berlin.ts)
  'Berlin School': { steps: 16, density: 1, octaves: [2, 3], velMin: 88, velMax: 102, gateMin: 35, gateMax: 50 },
  // bass lines (seq-gen/bass.ts; the Bass lane's styles): chord tones on the strong steps
  'Root-5-Oct': { steps: 16, density: 1, octaves: [2, 2], velMin: 90, velMax: 116, gateMin: 50, gateMax: 70 },
  Offbeat: { steps: 16, density: 1, octaves: [2, 2], velMin: 90, velMax: 116, gateMin: 35, gateMax: 45 },
  'Acid Slide': { steps: 16, density: 1, octaves: [2, 2], velMin: 78, velMax: 127, gateMin: 50, gateMax: 60 },
  Walking: { steps: 16, density: 1, octaves: [2, 2], velMin: 84, velMax: 112, gateMin: 80, gateMax: 90 },
}
export { BASS_STYLES }
/** Styles with their own generator: Density, Melody, Rhythm and chords don't apply. */
export const OWN_GEN_STYLES = ['Arpeggio', 'Berlin School', ...BASS_STYLES]

export const SCALES = {
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

export const STYLE_PROGRESSIONS = {
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
  Trap: [[0, 5, 3, 0], [0, 6, 5, 6], [0, 0, 5, 3]],
  EDM: [[0, 4, 5, 3], [5, 3, 0, 4], [0, 5, 3, 4]],
  Urban: [[0, 3, 4, 3], [1, 4, 0, 5], [0, 5, 1, 4]],
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

const engines = {}
const engineScopes = {}

/** A lane's Sequencer engine (default Main; created on first call; needs Pinia installed). */
export function useSequencerEngine(lane = 'main') {
  if (!SEQ_LANE_CFG[lane]) lane = 'main'
  if (!engines[lane]) {
    engineScopes[lane] = effectScope(true)
    engines[lane] = engineScopes[lane].run(() => createSequencerEngine(lane))
  }
  return engines[lane]
}

/** Tests: drop the engines (their watchers and listeners), so the next call makes new ones. */
export function _resetSequencerEngine() {
  for (const lane of SEQ_LANES) {
    engineScopes[lane]?.stop()
    delete engineScopes[lane]
    delete engines[lane]
    seqLanePlaying[lane] = false
    seqLaneQueued[lane] = null
  }
}

function createSequencerEngine(lane = 'main') {
  const cfg = SEQ_LANE_CFG[lane]
  const isMain = lane === 'main'
  const SRC = cfg.source
  const ev = (name) => laneEvent(lane, name)
  const midiStore = useMidiStore()
  const presetStore = usePresetStore()
  const uiStore = useUiStore()
  const syncStore = useSyncStore()
  const seqStore = useSeqLaneStore(lane)
  const liveMap = useLiveMapStore()
  const transportManager = useTransportManager()
  const bpm = () => midiStore.currentBpm || 120
  // the lane's MIDI channel (seqStore.midiChannel): 0 = the global one, with MIDI Flow's remaps; 1–16 =
  // that channel as is (exactChannel: no cable / device OUT channel remap)
  const channel = () => (seqStore.midiChannel >= 1 ? seqStore.midiChannel : midiStore.midiChannel)
  // (the lane's cable OUT channels in MIDI Flow still win: cableWins — Seq Bass on CH 2 + 9 sends on both)
  const chOpts = (o) => (seqStore.midiChannel >= 1 ? { ...(o ?? {}), exactChannel: true, cableWins: true } : o)
  const laneChannel = computed({ get: () => seqStore.midiChannel, set: (v) => { seqStore.midiChannel = v } })
  // SYNC (seqStore.syncStart): a start waits for the next bar; startPending: started, its first step not yet played
  const laneSync = computed({ get: () => seqStore.syncStart, set: (v) => { seqStore.syncStart = !!v } })
  const startPending = ref(false)
  // M (the lane's mute): its notes and P1 / P2 don't go out; it plays on
  const laneMuted = computed({ get: () => seqStore.muted, set: (v) => { seqStore.muted = !!v } })
  const _onMuteSet = (e) => { const d = e.detail ?? {}; laneMuted.value = d.fromNote || d.value == null ? !laneMuted.value : d.value >= 64 }

  // SOUND (lib/lane-sound.ts): a bank remembers the presets now on the lane's channel, on each device
  // it is cabled to (MIDI Flow's Program Change state); they're sent again when that bank starts.
  function laneReach() {
    const ch0 = channel() - 1
    const exact = seqStore.midiChannel >= 1
    const regs = midiStore.routingConfig?.registrations ?? {}
    return midiService.getCableTargets(SRC).map(device => ({ device, chs: midiService.appChannelsOn(SRC, device, ch0, exact, true), pcChannels: regs[device]?.pcChannels }))
  }
  /** The active bank takes the sound now on the lane's channel (null: no preset recorded there). */
  function assignBankSound() {
    const s = captureLaneSound(laneReach())
    seqStore.activeBank.sound = s
    return s
  }
  function clearBankSound() { seqStore.activeBank.sound = null }
  const bankSound = computed(() => seqStore.activeBank?.sound ?? null)
  const bankSoundLabel = computed(() => laneSoundLabel(bankSound.value))
  // The sound now on the lane's channel (MIDI Flow's Program Change state), whether locked to the bank or not
  const currentSound = computed(() => { void JSON.stringify(midiStore.routingMatrix); return captureLaneSound(laneReach()) })
  const currentSoundLabel = computed(() => laneSoundLabel(currentSound.value))
  // the lane's Program Change on (its banks' sounds sent) / off (none sent); switched on while playing: sent now
  const laneSoundOn = computed({ get: () => seqStore.soundEnabled, set: (v) => { seqStore.soundEnabled = !!v; if (v && isPlaying.value) recallBankSound() } })
  function recallBankSound() {
    const sound = seqStore.activeBank?.sound
    if (!sound || !seqStore.soundEnabled) return
    for (const { device, msgs } of laneSoundMessages(sound)) for (const m of msgs) midiService.sendRawToDeviceByName(device, m)
    // the devices' panels show it as their channel's preset
    for (const t of sound.targets) {
      const reg = midiStore.routingConfig?.registrations?.[t.device]
      if (reg) midiStore.updateRegistration(t.device, 'pcChannels', { ...(reg.pcChannels ?? {}), [t.ch]: { ...t.preset } })
    }
  }
  // Local state — active bank working copy
  const { state: seqStateStorage } = useLocalStorage('S1_SEQUENCER2_STATE' + cfg.keySuffix, {})

  const selectedStyle = ref(seqStore.activeBank.selectedStyle)
  const selectedKey = ref(seqStore.activeBank.selectedKey)
  const selectedScale = ref(seqStore.activeBank.selectedScale)
  const chordsEnabled = ref(seqStore.activeBank.chordsEnabled)
  const maxPolyphony = ref(seqStore.activeBank.maxPolyphony)
  const chordDensity = ref(seqStore.activeBank.chordDensity)
  const isPlaying = ref(false)
  watch(isPlaying, v => { seqLanePlaying[lane] = v; if (isMain) rigReports.seqPlaying = v })
  // sent when the lane starts and when its bank changes while it plays (a queued slot, the chain)
  watch(() => [isPlaying.value, seqStore.activeBankIndex], ([playing, idx], old) => {
    if (!playing) return
    if (old && old[0] && old[1] === idx) return
    recallBankSound()
  })

  const isRecording = ref(false)
  const currentStep = ref(0)
  const selectedStepIdx = ref(0)
  const syncTrack = computed({
    get: () => syncStore.syncTrack,
    set: (v) => { syncStore.syncTrack = v },
  })
  const genDensity = ref(seqStore.activeBank.genDensity)
  // Generate's rhythm (seq-gen/rhythm.ts), per bank; banks saved before: Weighted, Sync 30
  const rhythmMode = ref(seqStore.activeBank.rhythmMode ?? 'weighted')
  const syncopation = ref(seqStore.activeBank.syncopation ?? 30)
  const euclidRotation = ref(seqStore.activeBank.euclidRotation ?? 0)
  // Generate's pitches: 'line' (default: a motif and a melodic walk) or 'classic' (as before)
  const melodyMode = ref(seqStore.activeBank.melodyMode ?? 'line')
  // Generate's Lock / Vary: the share of the pattern a Generate replaces (100 = all, as before)
  const varyAmount = ref(seqStore.activeBank.varyAmount ?? 100)
  // the Arpeggio style's notes: 'chord' (default: the tonic triad), 'chord7', 'scale' (as before)
  const arpNotes = ref(seqStore.activeBank.arpNotes ?? 'chord')
  const _onVarySet = (e) => { varyAmount.value = varyFromMidi(e.detail?.value ?? 0) }
  window.addEventListener(ev('vary-set'), _onVarySet)
  // the Arpeggio style's order (arp-patterns.ts), per bank
  const arpModeForGen = ref(seqStore.activeBank.arpMode ?? 'up')
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
  // Following by scale degree (uiStore.seqFollowMode 'degree'): the degrees the pattern moves inside its
  // scale, from the key's tonic to the chord's root (seq-gen/harmony.ts); dynamicMidiTranspose stays 0.
  const dynamicDegreeShift = ref(0)
  // The root of the chord the Chord Prog is about to play (its 'cp-chord-on', from the chord's name):
  // its notes then move the pattern by that root, not by each note of the voicing.
  let _cpRootPc = null
  let _cpChordPcs = null
  const _cpHeld = ref(false) // a Chord Prog chord is sounding (its notes received, not released)
  const _followsCp = ref(false) // the pattern was last moved by a Chord Prog chord (routed to this lane)
  let _cpChordNote = null // its lowest note (a probe for the routing; Chromatic's note)
  // The Chord Prog announces a chord when its tick runs — on CLK SYS ~200 ms ahead of the time it sounds
  // (`at`), while its notes reach the lanes only at that time. Waiting for them, the lane had already
  // handed out the first steps of the new chord (its lookahead) with the old one: the downbeat — and an
  // arpeggio's first 16ths — played on the chord before. So a chord ahead is kept pending and taken by
  // the first step at or after its time (stepCallback), or by its notes when they come first.
  let _pendingChord = null // { at, rootPc, pcs, note }
  function _setCpChord(c) {
    _cpRootPc = c.rootPc
    _cpChordPcs = c.pcs
    _cpChordNote = c.note
  }
  function _takePendingChord(atMs) {
    const c = _pendingChord
    if (!c || atMs < c.at - 2) return false
    _pendingChord = null
    _setCpChord(c)
    if (_cpFollowing(c.note)) { followNote(c.note, MidiSource.CHORD_PROG); _writeFollowState() }
    return true
  }
  const _onChordOn = (e) => {
    const c = {
      rootPc: typeof e.detail?.rootPc === 'number' ? e.detail.rootPc : null,
      pcs: Array.isArray(e.detail?.pcs) && e.detail.pcs.length ? e.detail.pcs : null,
      note: typeof e.detail?.note === 'number' ? e.detail.note : null,
      at: typeof e.detail?.at === 'number' ? e.detail.at : null,
    }
    if (c.at != null && c.at - performance.now() > 5 && isPlaying.value) { _pendingChord = c; return }
    _pendingChord = null
    _setCpChord(c)
    if (_cpFollowing(c.note)) { followNote(c.note, MidiSource.CHORD_PROG); _writeFollowState() }
  }
  // Fit (per lane, saved): 'scale' — the pattern moves by degree in its scale · 'chord' — then each note
  // is fitted onto the Chord Prog's chord sounding (seq-gen/harmony.ts fitToChord: the strong steps on a
  // chord tone, a weak step's b9 moved down onto it), so a borrowed chord doesn't clash. Default: Bass and
  // Arp on Chord, Main on Scale. With Follow: Degree only.
  const FIT_KEY = 'SYCORE_SEQ_FIT_' + lane
  const fitMode = ref(seqFitOf((() => { try { return localStorage.getItem(userKey(FIT_KEY)) } catch { return null } })() ?? (isMain ? 'scale' : 'chord')))
  watch(fitMode, v => { try { localStorage.setItem(userKey(FIT_KEY), seqFitOf(v)) } catch {} })
  // the chord the pattern is fitted to now (null: none — Fit: Scale, Chromatic, or no chord from the Chord Prog)
  const dynamicChordPcs = ref(null)
  // (only while the lane follows the Chord Prog: switching CHD on doesn't pin it to the chord of the moment)
  watch(fitMode, v => { dynamicChordPcs.value = v === 'chord' && uiStore.seqFollowMode !== 'chromatic' && _followsCp.value && _cpRootPc !== null ? _cpChordPcs : null })
  window.addEventListener('cp-chord-on', _onChordOn)
  // P1 / P2 out: the Sequencer's CC to every cable, or — a MIDI Flow device with a route of its own
  // (useSeqDeviceParamsStore, set in the → Map modal) — that device's CC to it, the CC to the rest.
  const deviceParams = useSeqDeviceParamsStore()
  function sendParam(which, cc, value, ch) {
    const cabled = midiService.getCableTargets(SRC)
    if (!hasDeviceRoutes(cabled, deviceParams.routes)) {
      midiStore.sendCC(cc, value, ch, SRC, null, chOpts())
      return
    }
    const ch0 = (ch ?? midiStore.midiChannel) - 1
    const { plain, own } = paramTargets(cabled, deviceParams.routes, which)
    if (plain.length) midiService.sendCC(cc, value, ch0, SRC, null, chOpts({ onlyTargets: plain }))
    for (const o of own) midiService.sendCC(o.cc, value, ch0, SRC, null, chOpts({ onlyTargets: [o.device] }))
  }
  const keyPc = () => Math.max(0, NOTE_NAMES.indexOf(selectedKey.value))
  const scaleNow = () => SCALES[selectedScale.value] ?? SCALES['Major']
  // Key alignment (Key: CP on, following the Chord Prog — playing, or a chord held): a bank written in
  // another key than the progression's (detectedKey) plays transposed into it, the pattern itself kept —
  // by the nearest way (−6…+5 semitones), and moved by degree in the progression's scale when it has one
  // (a mode). 0 / the bank's own key and scale otherwise.
  const alignKey = computed(() => {
    if (!uiStore.seqGenKeyFromProg || uiStore.seqDecoupled || uiStore.seqFollowMode === 'chromatic') return null
    if (!_followsCp.value) return null
    const cp = useChordProgStore()
    if (!cp.isPlaying && !_cpHeld.value) return null
    const k = progKey()
    return k ? k : null
  })
  const alignOffset = computed(() => {
    const k = alignKey.value
    if (!k) return 0
    const d = ((((k.root - keyPc()) % 12) + 12) % 12)
    return d > 5 ? d - 12 : d
  })
  const playKeyPc = () => (alignKey.value ? alignKey.value.root : keyPc())
  const playScale = () => (alignKey.value?.scale && SCALES[alignKey.value.scale]) || scaleNow()
  /** A note received moves the pattern: by scale degree (default) or by semitones (as before). */
  function followNote(note, sourceApp) {
    _followsCp.value = sourceApp === MidiSource.CHORD_PROG
    if (uiStore.seqFollowMode === 'chromatic') {
      dynamicDegreeShift.value = 0
      dynamicChordPcs.value = null
      dynamicMidiTranspose.value = note - sequenceRootMidi.value
      return
    }
    const fromCp = sourceApp === MidiSource.CHORD_PROG
    const root = fromCp && _cpRootPc !== null ? _cpRootPc : ((note % 12) + 12) % 12
    dynamicMidiTranspose.value = 0
    dynamicDegreeShift.value = degreeShift(root, playKeyPc(), playScale())
    const pcs = fromCp && fitMode.value === 'chord' ? _cpChordPcs : null
    if (pcs?.join() !== dynamicChordPcs.value?.join()) dynamicChordPcs.value = pcs
  }
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
    bank.rhythmMode = rhythmMode.value
    bank.syncopation = syncopation.value
    bank.euclidRotation = euclidRotation.value
    bank.melodyMode = melodyMode.value
    bank.varyAmount = varyAmount.value
    bank.arpNotes = arpNotes.value
    bank.arpMode = arpModeForGen.value
    bank.chordsEnabled = chordsEnabled.value
    bank.maxPolyphony = maxPolyphony.value
    bank.chordDensity = chordDensity.value
  }

  function loadBankIntoLocal() {
    const bank = seqStore.activeBank
    if (!bank) return
    _loadingBank = true
    try { _loadBank(bank) } finally { _loadingBank = false }
  }
  // A style picked by the user sets its own Density and octaves (STYLES: density, octaves) — the
  // starting point Generate works from; a bank loaded keeps the ones saved with it.
  let _loadingBank = false
  watch(selectedStyle, (style) => {
    if (_loadingBank) return
    const cfg = STYLES[style]
    if (!cfg || style === 'Arpeggio') return
    if (typeof cfg.density === 'number') genDensity.value = Math.round(cfg.density * 100)
    if (Array.isArray(cfg.octaves) && cfg.octaves.length === 2) {
      selectedOctave.value = cfg.octaves[0]
      octaveRange.value = cfg.octaves[1] - cfg.octaves[0]
    }
  }, { flush: 'sync' })
  function _loadBank(bank) {
    // LENGTH is the bank's step count: a bank written from outside (AI, Song Composer, a preset)
    // whose numSteps doesn't match its steps would play / show the wrong length
    const len = Math.max(2, Math.min(64, bank.steps?.length || bank.numSteps || 16))
    if (bank.numSteps !== len) bank.numSteps = len
    numSteps.value = len
    basePatternLength.value = Math.min(bank.basePatternLength || len, len)
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
    rhythmMode.value = bank.rhythmMode ?? 'weighted'
    syncopation.value = bank.syncopation ?? 30
    euclidRotation.value = bank.euclidRotation ?? 0
    melodyMode.value = bank.melodyMode ?? 'line'
    varyAmount.value = bank.varyAmount ?? 100
    arpNotes.value = bank.arpNotes ?? 'chord'
    arpModeForGen.value = bank.arpMode ?? 'up'
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
    refollowChord()
  }
  // A bank coming in while the lane follows the Chord Prog: moved onto the chord held at once, by its
  // own key (and the alignment into the progression's), not by the last bank's until the next chord.
  // The playback state is written now too: the bank switch happens on the step being played.
  // (also when the lane starts while the Chord Prog plays: a Rig pad, Play)
  function refollowChord() {
    const note = _lastCpNote ?? _cpChordNote
    if (_cpRootPc === null || note === null || !_cpFollowing(note)) return
    const cp = useChordProgStore()
    if (!cp.isPlaying && !_cpHeld.value) return
    followNote(note, MidiSource.CHORD_PROG)
    _writeFollowState()
  }
  /** This lane follows the Chord Prog now: playing, not recording, not Seq Free, and routed (a MIDI Flow
   *  cable Chord Prog → Sequencer) or with Key: CP on — the lanes in the Chord Prog's key follow its
   *  chords without a cable (they did only with one: without it a lane never moved, while switching Fit
   *  CHD on pinned it to the chord of that moment). */
  function _cpFollowing(note) {
    if (note == null || !isPlaying.value || isRecording.value || uiStore.seqDecoupled) return false
    return uiStore.seqGenKeyFromProg || isAppSourceAllowed(MidiSource.CHORD_PROG, note)
  }
  /** The follow written into the playback state at once (the step being played takes it). */
  function _writeFollowState() {
    const st = playStateRef.current
    if (!st) return
    st.degreeShift = dynamicDegreeShift.value
    st.dynamicMidiTranspose = dynamicMidiTranspose.value
    st.chordPcs = dynamicChordPcs.value
    st.keyPc = playKeyPc()
    st.scale = playScale()
    st.align = alignOffset.value
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

  // Chord Prog FOLLOW ('seq-bank-cue', one bar before a section ends): the bank of the next section
  // starts when the playing one wraps to its first step; stopped, it's selected now.
  let _pendingBank = null
  // The chain as the playback has it (a switch of seqStore.chainEnabled is taken at a pattern's end),
  // and the bank of the step played last.
  let _seqChainPlaying = false
  let _seqLastBank = null
  // Rig Controller (rig-live.ts): the queued bank, mirrored for the pads.
  function setPendingBank(v) { _pendingBank = v; seqLaneQueued[lane] = v; if (isMain) rigReports.queued.seq = v }
  function handleBankCue(e) {
    const idx = e.detail?.idx
    if (idx == null || idx < 0 || idx >= BANK_COUNT) return
    // the Chord Prog's section cue (Drums + Sequencer follow): only while the Sequencer plays — it
    // doesn't pick its slot while stopped
    if (e.detail?.fromChordProg && (uiStore.seqDecoupled || !isPlaying.value)) return
    if (!isPlaying.value) { setPendingBank(null); selectBank(idx); return }
    setPendingBank(idx === seqStore.activeBankIndex ? null : idx)
  }
  // The banks were replaced from outside (AI Song Composer, undo): drop the working copy.
  function handleBanksReloaded() {
    setPendingBank(null)
    loadBankIntoLocal()
    selectedStepIdx.value = 0
  }

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
    selectedOctave, octaveRange, () => uiStore.seqGlobalTranspose, () => midiStore.currentBpm,
    dynamicMidiTranspose, dynamicDegreeShift, dynamicChordPcs, fitMode, alignOffset, () => alignKey.value?.label, () => uiStore.seqFollowMode, selectedKey, selectedScale, selectedStyle,
    genDensity, rhythmMode, syncopation, euclidRotation, melodyMode, varyAmount, arpNotes, arpModeForGen, chordsEnabled, maxPolyphony, chordDensity
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
      transpose: uiStore.seqGlobalTranspose || 0,
      bpm: bpm() || 120,
      selectedKey: selectedKey.value,
      selectedScale: selectedScale.value,
      selectedStyle: selectedStyle.value,
      genDensity: genDensity.value,
      rhythmMode: rhythmMode.value,
      syncopation: syncopation.value,
      euclidRotation: euclidRotation.value,
      melodyMode: melodyMode.value,
      varyAmount: varyAmount.value,
      arpNotes: arpNotes.value,
      chordsEnabled: chordsEnabled.value,
      maxPolyphony: maxPolyphony.value,
      chordDensity: chordDensity.value
    }
    seqStateStorage.value = config
    if (isMain) midiStore.sendCC(77, Math.max(0, Math.min(127, (uiStore.seqGlobalTranspose || 0) + 64)), channel())
    syncLocalToBank()

    // Sync live playback state immediately
    if (playStateRef.current) {
      const pb = seqStore.playbackSteps
      _seqChainPlaying = seqStore.chainEnabled
      playStateRef.current.steps = pb.steps
      playStateRef.current.numSteps = pb.numSteps
      playStateRef.current.chainSlotIndices = pb.chainSlotIndices
      playStateRef.current.bankIndices = pb.bankIndices
      playStateRef.current.localIndices = pb.localIndices
      playStateRef.current.bpm = bpm() || 120
      playStateRef.current.param1CC = param1CC.value
      playStateRef.current.param2CC = param2CC.value
      playStateRef.current.transpose = uiStore.seqGlobalTranspose || 0
      playStateRef.current.channel = channel()
      playStateRef.current.dynamicMidiTranspose = dynamicMidiTranspose.value
      playStateRef.current.degreeShift = dynamicDegreeShift.value
      playStateRef.current.chordPcs = dynamicChordPcs.value
      playStateRef.current.keyPc = playKeyPc()
      playStateRef.current.scale = playScale()
      playStateRef.current.align = alignOffset.value
    }
  }, { deep: true })

  watch(() => bpm(), (bpm) => {
    if (isMain) {
      getTransport().bpm.value = bpm
      midiStore.setBpm(bpm)
    }
    // System clock on the internal tempo (with an external master the grid follows Live's beats).
    if (_sysSched && !externalGrid.active) { _sysSched.setTempo(bpm); intGrid.setTempo(bpm, performance.now()) }
  })

  // ── System clock (CLK SYS) — steps from a StepScheduler on performance.now(), ticked by a
  // Worker timer, instead of the Tone.js transport (audio clock); notes leave from a Worker-timed
  // queue at their time (see DrumMachine.vue). Off by default. ──
  const LS_SEQ_SYSTEM_CLOCK = 'SYCORE_SEQ2_SYSTEM_CLOCK'
  // one clock for every lane: Main's (saved), the other lanes share its ref
  const systemClock = isMain
    ? ref((() => { try { return localStorage.getItem(userKey(LS_SEQ_SYSTEM_CLOCK)) === '1' } catch { return false } })())
    : useSequencerEngine('main').systemClock
  if (isMain) watch(systemClock, v => { try { localStorage.setItem(userKey(LS_SEQ_SYSTEM_CLOCK), v ? '1' : '0') } catch {} })
  const SEQ_WORKER_TAG = cfg.workerTag
  /** CLK SYS: who owns each sounding pitch, so a bank switch ends a tied note of the old bank
   *  and its queued note-off doesn't cut the new bank's note of the same pitch. */
  const _seqVoices = new VoiceLedger()
  let _sysSched = null
  let _stopTicker = null
  let _offExtGrid = null
  let _sysStartSixteenth = 0
  // Rig Controller pads (Trigger sync, sixteenths: 16 bar, 8/4 two/one beats): the next start waits
  // for that sync point of Live's song grid; a stop lets the pattern play up to it (CLK SYS only).
  let _seqStartSteps = 0
  let _seqStopSteps = 0
  let _seqStopAtEnd = false // the Rig's "start only": the stop at the end of the pattern
  let _sysStep = 0 // the system clock's step index of the step being handed out

  function _startSystemClock(callback) {
    _stopSystemClock()
    const now = performance.now()
    let startMs = now + 20
    let startBpm = bpm()
    _sysStartSixteenth = 0
    if (externalGrid.active && externalGrid.anchor) {
      // The bar Live is playing now; steps already gone pass silently (see DrumMachine.vue).
      // A Rig pad's start waits for its sync point instead (bar line or beat).
      let bar = externalGrid.barAtOrBefore(now)
      if (_seqStartSteps && bar != null) {
        const graceMs = Math.min(80, 15000 / (externalGrid.bpm || startBpm) * 0.5)
        bar = externalGrid.pointAtOrAfter(now, _seqStartSteps, graceMs) ?? bar
      }
      const t = bar != null ? externalGrid.timeOf(bar) : null
      if (t != null) { startMs = t; startBpm = externalGrid.bpm || startBpm; _sysStartSixteenth = bar }
    } else {
      // INT: on the bar grid of the sequences already playing (int-grid.ts) — SYNC on: their next bar
      // line; off: in phase with the bar playing. Alone: now, or (SYNC / synced to the transport) the
      // Tone.js transport's next bar line when it runs.
      const sync = _seqStartSteps >= 16
      if (transportManager.isRunning.value && ((isMain && syncStore.syncSequencer2ToTransport.value) || sync)) {
        startMs = audioTimeToPerfMs(getTransport().nextSubdivision('1m'))
      }
      startMs = intGrid.join(SEQ_WORKER_TAG, now, startBpm, sync, startMs)
    }
    _seqStartSteps = 0
    _sysStep = 0
    _sysSched = new StepScheduler((step, t, late) => { _sysStep = step; callback(perfMsToAudioTime(t), t, late) }, { name: 'SEQ', startToleranceMs: 150 })
    _sysSched.start(startMs, startBpm, tempoMultiplier.value?.beatsPerStep ?? 0.25)
    _offExtGrid = externalGrid.on(e => {
      if (e.type === 'beat' && _sysSched) _sysSched.anchorTo(e.sixteenth - _sysStartSixteenth, e.t, e.bpm)
    })
    _stopTicker = createWorkerTicker(() => _sysSched?.tick(performance.now()))
    _sysSched.tick(performance.now())
  }

  function _stopSystemClock() {
    intGrid.leave(SEQ_WORKER_TAG)
    _stopTicker?.(); _stopTicker = null
    _offExtGrid?.(); _offExtGrid = null
    _sysSched?.stop(); _sysSched = null
    // Note-ons still queued would sound after Stop (their note-offs stay queued: harmless).
    midiService.cancelWorkerTimed(SEQ_WORKER_TAG)
  }

  // Switching the clock while playing: restart on the other one.
  watch(systemClock, () => {
    if (!isPlaying.value) return
    isPlaying.value = false
    setTimeout(() => { isPlaying.value = true }, 0)
  })

  const TEMPO_MULTIPLIERS = [
    { label: '1/128', interval: '128n', beatsPerStep: 0.03125 },
    { label: '1/64T', interval: '64t',  beatsPerStep: 0.04167 },
    { label: '1/64',  interval: '64n',  beatsPerStep: 0.0625 },
    { label: '1/64.', interval: '64n.', beatsPerStep: 0.09375 },
    { label: '1/32T', interval: '32t',  beatsPerStep: 0.0833 },
    { label: '1/32',  interval: '32n',  beatsPerStep: 0.125 },
    { label: '1/32.', interval: '32n.', beatsPerStep: 0.1875 },
    { label: '1/16',  interval: '16n',  beatsPerStep: 0.25 },
    { label: '1/16T', interval: '16t',  beatsPerStep: 0.1667 },
    { label: '1/16.', interval: '16n.', beatsPerStep: 0.375 },
    { label: '1/8',   interval: '8n',   beatsPerStep: 0.5 },
    { label: '1/8T',  interval: '8t',   beatsPerStep: 0.3333 },
    { label: '1/8.',  interval: '8n.',  beatsPerStep: 0.75 },
    { label: '1/4',   interval: '4n',   beatsPerStep: 1 },
    { label: '1/4T',  interval: '4t',   beatsPerStep: 0.6667 },
    { label: '1/4.',  interval: '4n.',  beatsPerStep: 1.5 },
    { label: '1/2',   interval: '2n',   beatsPerStep: 2 },
    { label: '1/2.',  interval: '2n.',  beatsPerStep: 3 },
    { label: '1/1',   interval: '1m',   beatsPerStep: 4 },
    { label: '2/1',   interval: '2m',   beatsPerStep: 8 },
    { label: '3/1',   interval: '2m.',  beatsPerStep: 12 },
    { label: '4/1',   interval: '4m',   beatsPerStep: 16 },
  ]
  const tempoMultiplier = ref(TEMPO_MULTIPLIERS.find(o => o.label === '1/16')) // default 1/16
  const sequenceDirection = ref('up')
  const SEQ_DIRECTIONS = ['up', 'down', 'up-down', 'random']

  // The running step repeat's callback (it carries the playhead), so a Time change while playing
  // can reschedule it at the new interval — scheduleRepeat fixes its interval when created.
  let stepCallback = null

  // Time changed while playing: restart the repeat at the new interval from the next boundary of
  // the new grid, so the steps stay on the beat and the playhead keeps its position.
  watch(tempoMultiplier, (opt) => {
    if (_sysSched && opt) { _sysSched.setStepBeats(opt.beatsPerStep); return }
    if (!stepCallback || repeatEventIdRef.value === null || !opt) return
    const transport = getTransport()
    const ticksPerStep = transport.toTicks(opt.interval)
    const nextTick = Math.ceil((transport.ticks + 1) / ticksPerStep) * ticksPerStep
    transport.clear(repeatEventIdRef.value)
    repeatEventIdRef.value = transport.scheduleRepeat(stepCallback, opt.interval, `${nextTick}i`)
  })

  // MIDI Learn (useMidiCCListener.js: seq_time / seq_direction / seq_steps): a CC picks the value across the
  // list (a knob sweeps it), a note steps to the next one.
  function pickFromMidi(list, current, { value, fromNote }) {
    if (fromNote) return list[(list.indexOf(current) + 1) % list.length]
    return list[Math.round((value / 127) * (list.length - 1))]
  }

  watch(swingAmount, (val) => {
    if (!isMain) return // the transport's swing: the Main's
    getTransport().swing = val / 100
    getTransport().swingSubdivision = '16n'
  })

  // Rig Controller GEN (LIVE): generate, in the Chord Prog's key when it has one ({ root 0–11, mode }),
  // so the line sits on the chords: a scale of the same family is kept (e.g. Pentatonic Min in a minor
  // key), otherwise Major / Minor.
  const MINOR_FAMILY = ['Minor', 'Harmonic Min', 'Pentatonic Min', 'Blues', 'Dorian', 'Phrygian', 'Locrian']
  const MAJOR_FAMILY = ['Major', 'Pentatonic Maj', 'Lydian', 'Mixolydian']
  // A bank queued (a Rig pad while playing, e.g. an empty one): GEN writes into it, not into the one playing —
  // the working copy goes to it for the generate and back (the playback reads the banks, untouched meanwhile).
  function handleRigGenerate(e) {
    const target = _pendingBank
    if (target === null || target === seqStore.activeBankIndex) { journaledGenerate(() => _rigGenerate(e)); return }
    const back = seqStore.activeBankIndex
    syncLocalToBank()
    // an empty bank takes the playing one's settings (style, key, octaves, length…): GEN writes in the same vein
    const dst = seqStore.banks[target]
    if (dst && !dst.steps.some(st => st?.active)) {
      const src = JSON.parse(JSON.stringify(seqStore.banks[back]))
      Object.assign(dst, src, { steps: Array.from({ length: src.numSteps }, () => ({ ...DEFAULT_STEP })), sound: dst.sound ?? null })
    }
    seqStore.setActiveBank(target)
    loadBankIntoLocal()
    try { journaledGenerate(() => _rigGenerate(e)) } finally {
      syncLocalToBank()
      seqStore.setActiveBank(back)
      loadBankIntoLocal()
    }
  }
  function applyKey(root, mode, scale = null) {
    selectedKey.value = NOTE_NAMES[((root % 12) + 12) % 12]
    // a mode detected from a progression with no major / minor (Modal Chords, a genre file): exactly that scale
    if (scale && SCALES[scale]) { selectedScale.value = scale; return }
    const family = mode === 'minor' ? MINOR_FAMILY : MAJOR_FAMILY
    if (!family.includes(selectedScale.value)) selectedScale.value = mode === 'minor' ? 'Minor' : 'Major'
  }
  // Gen "Key: CP" (uiStore.seqGenKeyFromProg): the key the Chord Prog's chords sit in (chord-key.ts
  // detectKey — the chain when it is on, else the slot's active steps; its own key file as the hint).
  // With no exact key (Modal Chords, a genre file, a key file on Both): the mode too (detectScale —
  // Dorian, Mixolydian…; Modal Chords' Root as the tonic when set), `scale` set.
  function progKey() {
    return useChordProgStore().detectedKey ?? null
  }
  function applyProgKey() {
    if (!uiStore.seqGenKeyFromProg) return
    const k = progKey()
    if (k) applyKey(k.root, k.mode, k.scale ?? null)
  }
  function _rigGenerate(e) {
    const { root, mode, scale, mutate } = e?.detail ?? {}
    if (typeof root === 'number' && typeof scale === 'string' && SCALES[scale]) applyKey(root, null, scale)
    else if (typeof root === 'number' && (mode === 'major' || mode === 'minor')) applyKey(root, mode)
    else applyProgKey()
    // the Rig's Mutate (Shift + GEN): a part of the pattern, Vary's amount or a quarter
    _generateSequence(mutate ? mutateAmount(varyAmount.value) : varyAmount.value)
  }

  // AUTO SEQ (uiStore.seqAutoRegen, the Chord Prog's header): when the key / scale of the Chord Prog's
  // progression changes (a new progression, another slot, a chord edited), this lane generates again in
  // it — when it's in use (playing, or a pattern in its bank); not with Seq Free (seqDecoupled).
  // Debounced: editing chords one after another regenerates once. Quantized: while the lane plays, the
  // new pattern comes in on the next bar line (written just before the scheduler hands that step out).
  let _autoRegenStop = null
  const AUTO_REGEN_DEBOUNCE_MS = 300
  const AUTO_REGEN_LEAD_MS = 250 // > the StepScheduler's 200 ms lookahead
  // The time (performance.now() ms) of the next bar line of this lane's playback, and one bar's length;
  // null when it isn't playing.
  function nextBarAt() {
    if (_sysSched?.isRunning) {
      const spb = Math.max(1, Math.round(4 / _sysSched.stepBeats))
      const b = Math.ceil(_sysSched.upcomingStep / spb) * spb
      return { t: _sysSched.timeOf(b), barMs: _sysSched.timeOf(b + spb) - _sysSched.timeOf(b) }
    }
    if (isPlaying.value && transportManager.isRunning.value) {
      const tr = getTransport()
      return { t: audioTimeToPerfMs(tr.nextSubdivision('1m')), barMs: tr.toSeconds('1m') * 1000 }
    }
    return null
  }
  function autoRegenDelay(now = performance.now()) {
    const bar = nextBarAt()
    if (!bar || !(bar.barMs > 0)) return AUTO_REGEN_DEBOUNCE_MS
    let at = bar.t - AUTO_REGEN_LEAD_MS
    while (at - now < AUTO_REGEN_DEBOUNCE_MS) at += bar.barMs
    return at - now
  }
  // (switching AUTO SEQ on regenerates nothing: only the next change of key does)
  watch(() => progKey()?.label ?? null, (label, prev) => {
    _autoRegenStop?.(); _autoRegenStop = null
    if (!uiStore.seqAutoRegen || !label || label === prev || uiStore.seqDecoupled) return
    _autoRegenStop = uiTimeout(() => {
      _autoRegenStop = null
      const k = progKey()
      if (!k || !uiStore.seqAutoRegen || uiStore.seqDecoupled) return
      if (!isPlaying.value && !steps.value.some(st => st?.active)) return
      handleRigGenerate({ detail: progressionKeyDetail(k) })
    }, autoRegenDelay())
  })

  // The bank as it is now: the working copy written into it first (its watcher syncs a tick later).
  function bankSnapshot() {
    syncLocalToBank()
    return JSON.parse(JSON.stringify(seqStore.activeBank ?? null))
  }
  /** Journaled (lib/session-takes.ts): `fn` runs between a take of the bank before and one after. */
  function journaledGenerate(fn) {
    if (!isMain) return fn() // session takes: the Main lane's for now
    return journaled('seq', seqStore.activeBankIndex, fn, { snap: bankSnapshot })
  }
  function generateSequence() { journaledGenerate(() => { applyProgKey(); _generateSequence() }) }

  /**
   * P1 / P2 only: new values on every step as Generate makes them (the preset's value for the CC, moved by
   * RND%, seq-gen/params.ts), notes, rhythm and the rest of the pattern untouched. `which`: 'p1' | 'p2' | 'both'.
   */
  function regenerateParams(which = 'both') {
    const p1 = which === 'p1' || which === 'both'
    const p2 = which === 'p2' || which === 'both'
    if (!p1 && !p2) return
    journaledGenerate(() => {
      const p1Base = getPresetValueForCC(param1CC.value)
      const p2Base = getPresetValueForCC(param2CC.value)
      steps.value = steps.value.map(s => ({
        ...s,
        ...(p1 ? { param1Value: paramValue(p1Base, param1Variation.value) } : {}),
        ...(p2 ? { param2Value: paramValue(p2Base, param2Variation.value) } : {}),
      }))
    })
  }

  /**
   * Generate: a new pattern by the rules (_generateFresh), of which only `amount` % of the positions
   * replace the pattern (Lock / Vary, seq-gen/mutate.ts; positions within the motif, so its repeats
   * change together). 100 = all new (the default), 0 = nothing.
   */
  function _generateSequence(amount = varyAmount.value) {
    autoName(lane === 'main' ? 'seq' : lane, seqStore.activeBankIndex, String(selectedStyle.value ?? ''))
    const before = steps.value.map(st => ({ ...st, notes: [...(st.notes ?? [])] }))
    _generateFresh()
    if (amount < 100 && before.length === steps.value.length) {
      const motifLen = melodyMode.value !== 'classic' && !chordsEnabled.value && !OWN_GEN_STYLES.includes(selectedStyle.value) ? motifLength(numSteps.value) : numSteps.value
      steps.value = mixSteps(before, steps.value, amount, { motifLen })
    }
  }

  function _generateFresh() {
    const styleCfg = STYLES[selectedStyle.value]
    const keyIdx = NOTE_NAMES.indexOf(selectedKey.value)
    const scaleIntervals = SCALES[selectedScale.value] ?? SCALES['Major']

    const octMin = octaveRange.value >= 0 ? selectedOctave.value : selectedOctave.value + octaveRange.value
    const octMax = octaveRange.value >= 0 ? selectedOctave.value + octaveRange.value : selectedOctave.value
    const finalOctMin = Math.max(0, Math.min(8, octMin))
    const finalOctMax = Math.max(0, Math.min(8, octMax))
    // P1 / P2 of a generated step, in every mode: the preset's value for the CC, moved by RND% (seq-gen/params.ts)
    const p1Base = getPresetValueForCC(param1CC.value)
    const p2Base = getPresetValueForCC(param2CC.value)
    const genParams = () => ({ param1Value: paramValue(p1Base, param1Variation.value), param2Value: paramValue(p2Base, param2Variation.value) })

    if (selectedStyle.value === 'Arpeggio') {
      const arpMode = arpModeForGen.value
      const allNotes = []
      // the tonic chord's notes (default; following the Chord Prog moves them onto each chord), or the scale
      const arpIntervals = arpDegrees(scaleIntervals, arpNotes.value).map(d => scaleIntervals[d])
      for (let oct = finalOctMin; oct <= finalOctMax; oct++) {
        const root = (oct + 1) * 12 + keyIdx
        for (const interval of arpIntervals) {
          const note = root + interval
          if (note >= 0 && note <= 127) allNotes.push(note)
        }
      }
      if (allNotes.length === 0) return

      const patternState = defaultArpPatternState()
      const ordered = []
      for (let i = 0; i < numSteps.value; i++) {
        const noteIdx = nextArpIndex(arpMode, patternState, allNotes.length)
        ordered.push(allNotes[noteIdx])
      }

      steps.value = Array(numSteps.value).fill(null).map((_, i) => ({
        ...DEFAULT_STEP,
        active: true,
        notes: [ordered[i]],
        octave: finalOctMin,
        velocity: styleCfg.velMin + Math.floor(Math.random() * (styleCfg.velMax - styleCfg.velMin + 1)),
        gate: 75,
        ...genParams(),
        edited: true,
      }))
      basePatternLength.value = numSteps.value
      return
    }

    if (selectedStyle.value === 'Berlin School') {
      const line = berlinLine({ steps: numSteps.value, keyPc: Math.max(0, keyIdx), scale: scaleIntervals, octMin: finalOctMin })
      steps.value = line.map((b, i) => {
        // the downbeats a little harder, the pedal a little softer
        let velocity = styleCfg.velMin + Math.floor(Math.random() * (styleCfg.velMax - styleCfg.velMin + 1))
        if (i % 4 === 0) velocity = Math.min(127, velocity + 14)
        if (b.pedal) velocity = Math.max(1, velocity - 6)
        const gate = styleCfg.gateMin + Math.floor(Math.random() * (styleCfg.gateMax - styleCfg.gateMin + 1))
        // P1 sweeps (the style's filter opening and closing across the pattern): RND% is how far, 0 → +50
        const p1Var = param1Variation.value || 50
        const sweep = sweepShape(i, line.length)
        return { ...DEFAULT_STEP, active: true, notes: [b.note], octave: Math.floor(b.note / 12) - 1, velocity, gate, tieSteps: 0,
          ...genParams(), param1Value: paramValue(p1Base, p1Var, () => sweep), edited: true }
      })
      basePatternLength.value = numSteps.value
      return
    }

    if (BASS_STYLES.includes(selectedStyle.value)) {
      const line = bassLine({ style: selectedStyle.value, steps: numSteps.value, keyPc: Math.max(0, keyIdx), scale: scaleIntervals, oct: finalOctMin })
      steps.value = line.map(b => b.active
        ? { ...DEFAULT_STEP, active: true, notes: [b.note], octave: Math.floor(b.note / 12) - 1, velocity: b.velocity, gate: b.gate,
            tieSteps: b.tie ? 1 : 0, accent: b.accent, ...genParams(), edited: true }
        : { ...DEFAULT_STEP, active: false, notes: [b.note], octave: Math.floor(b.note / 12) - 1, ...genParams() })
      basePatternLength.value = numSteps.value
      return
    }

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

        return { ...DEFAULT_STEP, active: true, notes, octave, velocity, gate: 90, tieSteps, ...genParams(), edited: true }
      })
    } else {
      const numActive = Math.round(numSteps.value * (genDensity.value / 100))
      // which steps play (seq-gen/rhythm.ts): Weighted — strong steps first, the style's accents, Sync —,
      // Euclid (Density = its pulses, turned by Rot), or Random (as before)
      const onsetsFor = (n, count) => rhythmMode.value === 'euclid'
        ? euclidOnsets(n, count, euclidRotation.value)
        : rhythmMode.value === 'random'
          ? randomOnsets(n, count)
          : pickOnsets(n, count, { styleGrid: styleCfg.accentGrid, sync: syncopation.value })
      // Line (default): a motif — its block's rhythm repeated — and a melodic walk (seq-gen/melody.ts);
      // Classic: every step its own (the generator before)
      const line = melodyMode.value !== 'classic'
      const motifLen = line ? motifLength(numSteps.value) : numSteps.value
      const activeIndices = motifLen < numSteps.value
        ? repeatOnsets(onsetsFor(motifLen, Math.round(numActive * motifLen / numSteps.value)), motifLen, numSteps.value)
        : onsetsFor(numSteps.value, numActive)
      const lineNotes = line
        ? melodyLine({ steps: numSteps.value, onsets: activeIndices, keyPc: Math.max(0, keyIdx), scale: scaleIntervals, octMin: finalOctMin, octMax: finalOctMax, motifLen })
        : null

      steps.value = Array(numSteps.value).fill(null).map((_, i) => {
        const active = activeIndices.has(i)
        const accentHit = styleCfg.accentGrid ? styleCfg.accentGrid[i % styleCfg.accentGrid.length] : false
        let notes = [60]
        let octave = selectedOctave.value
        if (active && lineNotes?.has(i)) {
          const n = lineNotes.get(i)
          notes = [n]
          octave = Math.floor(n / 12) - 1
        } else if (active) {
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
      
        return { ...DEFAULT_STEP, active, notes, octave, velocity, gate, tieSteps, ...genParams(), edited: active }
      })
    }
    basePatternLength.value = numSteps.value
  }

  function duplicateLength() {
    const next = Math.min(64 || 16, numSteps.value * 2)
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
    return step.notes && step.notes.some(n => n % 12 === semitoneIdx)
  }

  function toggleNoteBar(idx, semitoneIdx) {
    const step = steps.value[idx]
    // Check if any note at this semitone exists across all octaves
    const existing = step.notes?.find(n => n % 12 === semitoneIdx)
    const notes = existing
      ? step.notes.filter(n => n !== existing)
      : [...(step.notes || []), stepMidiNote(step, semitoneIdx)].sort((a, b) => a - b)
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
    if (!presetStore.lastPreset?.data) return 64;
    for (const [key, mapCc] of Object.entries(S1_CC_MAP)) {
      if (mapCc === cc) {
        const val = presetStore.lastPreset?.data[key];
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

  // ── Rig / Control Map / MIDI Flow events and MIDI inputs (were the panel's onMounted) ──
  getTransport().bpm.value = bpm()

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
  // A Rig pad adds { sync } (its Trigger sync, sixteenths): start on / stop at that sync point.
  const handleToggle2 = (e) => {
    const play = e.detail?.play
    const sync = e.detail?.sync
    // a Rig pad's Stop ({ user: true }) — not Stop All / Live's Stop: held off the auto-start
    if (play === false && e.detail?.user && isPlaying.value) _heldOff = true
    if (typeof sync === 'number') {
      if (play) {
        if (_seqStopSteps || _seqStopAtEnd) { _seqStopSteps = 0; _seqStopAtEnd = false; return } // a queued stop: un-queue it
        if (isPlaying.value) return
        _seqStartSteps = Math.max(0, sync)
        isPlaying.value = true
      } else if (isPlaying.value) {
        if (sync === -1) _seqStopAtEnd = true // at the end of its pattern
        else if (sync > 0 && _sysSched) _seqStopSteps = sync
        else isPlaying.value = false
      }
      return
    }
    const next = play === undefined ? !isPlaying.value : play
    if (next && !isPlaying.value) _armStartSync()
    isPlaying.value = next
  }
  /** A start not from a Rig pad: SYNC on — from the next bar line; off — now. */
  function _armStartSync() { _seqStartSteps = seqStore.syncStart ? 16 : 0 }
  window.addEventListener(cfg.toggle, handleToggle2)

  const handleBankSelect = (e) => {
    const idx = e.detail?.idx
    if (idx != null && idx >= 0 && idx < BANK_COUNT) selectBank(idx)
  }
  window.addEventListener(ev('bank-select'), handleBankSelect)
  window.addEventListener(ev('bank-cue'), handleBankCue)
  window.addEventListener(ev('generate'), handleRigGenerate)
  window.addEventListener(ev('banks-reloaded'), handleBanksReloaded)

  const handleTimeSet = (e) => {
    tempoMultiplier.value = pickFromMidi(TEMPO_MULTIPLIERS, tempoMultiplier.value, e.detail ?? {})
  }
  const handleDirectionSet = (e) => {
    sequenceDirection.value = pickFromMidi(SEQ_DIRECTIONS, sequenceDirection.value, e.detail ?? {})
  }
  // Length (seq_steps): a CC sweeps 2–64 (the panel's slider), a note steps to the next (wraps)
  const STEP_COUNTS = Array.from({ length: 63 }, (_, i) => i + 2)
  const handleStepsSet = (e) => {
    numSteps.value = pickFromMidi(STEP_COUNTS, STEP_COUNTS.includes(numSteps.value) ? numSteps.value : 16, e.detail ?? {})
  }
  window.addEventListener(ev('time-set'), handleTimeSet)
  window.addEventListener(ev('mute-set'), _onMuteSet)
  window.addEventListener(ev('direction-set'), handleDirectionSet)
  window.addEventListener(ev('steps-set'), handleStepsSet)

  // Routed to this lane in MIDI Flow: to its own IN, or (Bass / Arp) to the Main's — a lane follows
  // the chords the Sequencer is cabled to without a cable of its own.
  const routedHere = (key, note) => midiStore.isDeviceRoutedToApp(key, SRC, note)
    || (!isMain && midiStore.isDeviceRoutedToApp(key, MidiSource.SEQUENCER2, note))

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
    if (!midiStore.hasExplicitInputRouting(deviceName) || !routedHere(deviceName, note)) {
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
    return midiStore.hasExplicitInputRouting(sourceApp) && routedHere(sourceApp, note)
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

  // Play / Stop are the Sequencer's own: the Chord Prog's notes never start it, its chord's stop
  // never stops it (2026-11-16 — the two are switched on / off independently); they only transpose it
  // while it plays (and its section cues switch the bank then). A routed keyboard still auto-starts it.
  // Stopped by the user (its Stop, its Rig pad): the notes it follows no longer auto-start it, they only
  // transpose it once it plays. Any start (Play, a Rig pad, Play All) ends the hold.
  let _heldOff = false
  watch(isPlaying, v => { if (v) _heldOff = false })
  /** Play / Stop by the user (the panel's button): a Stop holds it off the auto-start. */
  function userTogglePlay() {
    _heldOff = isPlaying.value
    if (!isPlaying.value) _armStartSync()
    isPlaying.value = !isPlaying.value
  }
  // Decoupled from the Chord Prog (uiStore.seqDecoupled, the Rig's Seq Free pad): its notes, its stop
  // and its section cues are ignored, the Sequencer plays on as it is (started by a chord, it's now the
  // user's to stop). Coupled again: it moves at once to the chord the Chord Prog is holding.
  let _lastCpNote = null
  watch(() => uiStore.seqDecoupled, d => {
    if (d) return
    if (isPlaying.value && !isRecording.value && _lastCpNote !== null) followNote(_lastCpNote, MidiSource.CHORD_PROG)
  })
  const _onChordRelease = () => { _lastCpNote = null; _cpHeld.value = false }
  window.addEventListener('cp-chord-release', _onChordRelease)

  const handleIncomingNote = (type, note, velocity, chan, inputId, sourceApp) => {
    // Every note any app plays passes here: logged only with localStorage.SY_TRACE = '1'.
    if (window.SY_LOG && traceOn()) {
      window.SY_LOG(`[Seq Ingress] Note received: type=${type}, note=${note}, velocity=${velocity}, chan=${chan}, inputId=${inputId || 'null'}, sourceApp=${sourceApp || 'null'}, isOpen=${uiStore.isSequencer2Open}, isPlaying=${isPlaying.value}, isRecording=${isRecording.value}, selectedStepIdx=${selectedStepIdx.value}`)
    }
    if (sourceApp === MidiSource.CHORD_PROG) {
      if (type === 'on' && velocity > 0) { _lastCpNote = note; _cpHeld.value = true; if (_pendingChord) _takePendingChord(performance.now()) }
      if (uiStore.seqDecoupled) return
    }
    const allowed = sourceApp ? isAppSourceAllowed(sourceApp, note) : isMidiDeviceAllowed(chan, inputId, note)

    // When the panel is closed: still handle auto-start and transposition (no
    // preset-linking concept here — see docs/plans/modular/new-step-sequencer.md's
    // scoping notes — so this simply stays reachable any time a routed device sends notes).
    if (!uiStore.isSequencer2Open) {
      if (!isRecording.value && allowed) {
        if (type === 'on' && velocity > 0) {
          if (!isPlaying.value && uiStore.seqAutoStart) {
            if (!_heldOff && sourceApp !== MidiSource.CHORD_PROG && canAutoStart(sourceApp, inputId)) {
              followNote(note, sourceApp)
              isPlaying.value = true
            }
          } else if (isPlaying.value) {
            followNote(note, sourceApp)
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
        midiStore.sendNoteOn(note, velocity, channel() || 1, SRC, null, undefined, chOpts())

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
        midiStore.sendNoteOff(note, 0, channel() || 1, SRC, null, undefined, chOpts())
      }
      return
    }
    
    // Dynamic transposition during PLAY mode (not recording)
    if (isPlaying.value && !isRecording.value) {
      if (type === 'on' && velocity > 0) {
        followNote(note, sourceApp)
      }
      return
    }

    // Auto-start when panel is open but sequencer not yet running
    if (!isPlaying.value && !isRecording.value && uiStore.seqAutoStart) {
      if (type === 'on' && velocity > 0 && !_heldOff && sourceApp !== MidiSource.CHORD_PROG && canAutoStart(sourceApp, inputId)) {
        followNote(note, sourceApp)
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
    if (!uiStore.isSequencer2Open) return
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
    if (SEQ_LANE_SOURCES.has(sourceApp)) return // its own notes, or another lane's
    handleIncomingNote(type, note, velocity, chan, null, sourceApp)
  })

  const unsubCC = midiService.addCCListener((cc, val, chan, inputId) => {
    handleIncomingCC(cc, val, chan, inputId)
  })

  const handleVirtualNote = (e) => {
    handleIncomingNote(e.detail.type, e.detail.note, e.detail.velocity, e.detail.chan)
  }
  window.addEventListener('virtual-midi-note', handleVirtualNote)


  watch(isPlaying, (playing) => {
    if (playing) refollowChord() // started while the Chord Prog plays: on its chord from the first step
    else _pendingChord = null
    if (isMain) {
      midiService.isSequencerPlaying = playing
      uiStore.isSequencerPlaying = playing
    }

    if (isMain && syncTrack.value) {
      if (skipBackingTrackSync.value) {
        skipBackingTrackSync.value = false
      } else {
        window.dispatchEvent(new CustomEvent('toggle-backing-track', { detail: { play: playing, restart: playing } }))
      }
    }

    if (isMain && midiStore.syncSequencerTransport) {
      if (midiStore.isTransportPlaying !== playing) {
        if (playing) midiStore.sendStart()
        else midiStore.sendStop()
      }
    }

    startPending.value = playing
    if (!playing) {
      _stopSystemClock()
      _seqStartSteps = 0
      _seqStopSteps = 0
      _seqStopAtEnd = false
      dynamicMidiTranspose.value = 0
      dynamicDegreeShift.value = 0
      transportManager.releaseTransport()
      if (repeatEventIdRef.value !== null) {
        getTransport().clear(repeatEventIdRef.value)
        repeatEventIdRef.value = null
      }
      stepCallback = null

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
        midiStore.sendNoteOff(note, 0, chan, SRC, null, undefined, chOpts())
      })
      activeMidiNotes.value.clear()
      _seqVoices.clear()

      if (isMain && midiStore.syncSequencerTransport) midiStore.sendStop()
      midiStore.allNotesOff(channel())

      // Ensure Expression CC#11 is fully open at 127 immediately
      midiStore.sendCC(11, 127, channel(), SRC, null, chOpts())

      currentStep.value = 0
      seqStore.playingChainIndex = null
      seqStore.playingBankIndex = null
      lastFollowedBank = -1
      setPendingBank(null)
    } else {
      if (fadeOutIntervalRef.value !== null) {
        clearInterval(fadeOutIntervalRef.value)
        fadeOutIntervalRef.value = null
        midiStore.sendCC(11, 127, channel(), SRC, null, chOpts())
      }

      let stepCounter = 0
      let stepDirection = 1 // 1 = up, -1 = down (for up-down mode)

      toneStart().then(() => {
        getTransport().bpm.value = bpm()
        midiStore.setBpm(bpm())
        if (isMain && midiStore.syncSequencerTransport) midiStore.sendStart()

        // tMs (performance.now() ms) and late: only on the system clock (CLK SYS).
        stepCallback = (time, tMs, late = false) => {
          const state = playStateRef.current
          if (!state.isPlaying) return
          // a Stop queued on the bar line (stop-gate.ts): no step from there on
          if (stopGate.reached(tMs ?? audioTimeToPerfMs(time))) return
          if (_pendingChord) _takePendingChord(tMs ?? audioTimeToPerfMs(time))
          if (startPending.value) startPending.value = false // once per start: the first step is here
          // A Rig pad's stop: on its sync point of the song grid; the notes still sounding end there.
          if (_seqStopSteps && tMs != null) {
            const songPos = _sysStartSixteenth + _sysStep * (tempoMultiplier.value?.beatsPerStep ?? 0.25) * 4
            const off = songPos / _seqStopSteps
            if (Math.abs(off - Math.round(off)) < 1e-6) {
              _seqStopSteps = 0
              for (const v of _seqVoices.cutAt(tMs)) {
                midiStore.sendNoteOff(v.note, 0, v.channel, SRC, null, tMs - 1, chOpts({ workerTimed: true }))
                activeMidiNotes.value.delete(v.key)
              }
              state.isPlaying = false
              setTimeout(() => { isPlaying.value = false }, Math.max(0, tMs - performance.now()))
              return
            }
          }
          const len = state.steps.length
          let stepIdx
          const dir = sequenceDirection.value
          if (dir === 'random') {
            stepIdx = Math.floor(Math.random() * len)
          } else {
            stepCounter = ((stepCounter % len) + len) % len
            stepIdx = stepCounter
            if (dir === 'up') {
              stepCounter = (stepCounter + 1) % len
            } else if (dir === 'down') {
              stepCounter = (stepCounter - 1 + len) % len
            } else if (dir === 'up-down') {
              stepCounter += stepDirection
              if (stepCounter >= len || stepCounter < 0) {
                stepDirection *= -1
                stepCounter += stepDirection * 2
              }
            }
          }
          // Chain switched on / off while playing (the Rig's Seq Chain, the panel): at the end of the
          // pattern playing — on: the chain from its start; off: the bank that was playing, looped.
          if (seqStore.chainEnabled !== _seqChainPlaying && dir !== 'random'
              && (state.localIndices?.[stepIdx] ?? stepIdx) === 0) {
            _seqChainPlaying = seqStore.chainEnabled
            if (!_seqChainPlaying && _seqLastBank !== null && seqStore.activeBankIndex !== _seqLastBank) {
              seqStore.setActiveBank(_seqLastBank)
              loadBankIntoLocal()
            }
            const pb = seqStore.playbackSteps
            state.steps = pb.steps
            state.numSteps = pb.numSteps
            state.chainSlotIndices = pb.chainSlotIndices
            state.bankIndices = pb.bankIndices
            state.localIndices = pb.localIndices
            const n = Math.max(1, pb.steps.length)
            stepIdx = 0
            stepDirection = 1
            stepCounter = dir === 'down' ? n - 1 : 1 % n
            lastFollowedBank = -1
          }
          _seqLastBank = state.bankIndices?.[stepIdx] ?? null
          // the Rig's "start only" stop: at the end of the pattern (its first step again)
          if (_seqStopAtEnd && stepIdx === 0) {
            _seqStopAtEnd = false
            const at = tMs ?? audioTimeToPerfMs(time)
            for (const v of _seqVoices.cutAt(at)) {
              midiStore.sendNoteOff(v.note, 0, v.channel, SRC, null, at - 1, chOpts({ workerTimed: true }))
              activeMidiNotes.value.delete(v.key)
            }
            state.isPlaying = false
            setTimeout(() => { isPlaying.value = false }, Math.max(0, at - performance.now()))
            return
          }
          if (_pendingBank !== null && stepIdx === 0 && !seqStore.chainEnabled) {
            // The old bank's notes still sounding (ties) end where the new bank starts.
            if (tMs != null) {
              for (const v of _seqVoices.cutAt(tMs)) {
                midiStore.sendNoteOff(v.note, 0, v.channel, SRC, null, tMs - 1, chOpts({ workerTimed: true }))
                activeMidiNotes.value.delete(v.key)
              }
            }
            selectBank(_pendingBank)
            setPendingBank(null)
            const pb = seqStore.playbackSteps
            state.steps = pb.steps
            state.numSteps = pb.numSteps
            state.chainSlotIndices = pb.chainSlotIndices
            state.bankIndices = pb.bankIndices
            state.localIndices = pb.localIndices
          }
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
          // Rig Controller Density (LIVE) thins the weakest steps of the bar out, like a missed probability roll.
          const probabilityHit = (step.probability == null || Math.random() * 100 < step.probability)
            && densityKeeps(stepIdx, !!step.accent, isMain || rigLaneRows[lane] ? densityFor(cfg.rigRow) : 127)

          // CLK SYS, a late step (late start after Live's Play, stalled page): a long note
          // (ties, slow Time) whose end is still ahead sounds now for what is left ("chase").
          let chase = null
          if (step.active && probabilityHit && late && tMs != null) {
            const stepMs = 60000 / (state.bpm * 4) * (tempoMultiplier.value.beatsPerStep * 4)
            let durMs = stepMs * (step.gate / 100)
            if (step.tieSteps > 0) durMs += stepMs * Math.min(step.tieSteps, state.steps.length - 1)
            chase = chaseNote(tMs, Math.max(durMs, 10), performance.now(), true)
          }

          if (step.active && probabilityHit && (!late || chase) && !seqStore.muted) {
            if (state.param1CC !== null) sendParam(1, state.param1CC, step.param1Value, state.channel)
            if (state.param2CC !== null) sendParam(2, state.param2CC, step.param2Value, state.channel)
            // …and to Map · Live Instruments slots (Live can't MIDI-map a track's own CCs), a route per
            // track (useLiveMapStore.seqRoutes)
            if (isMain && state.param1CC !== null) liveMap.seqParam(1, step.param1Value)
            if (isMain && state.param2CC !== null) liveMap.seqParam(2, step.param2Value)

            const stepDurationMs = 60000 / (state.bpm * 4) * (tempoMultiplier.value.beatsPerStep * 4)
            let noteDurationMs = stepDurationMs * (step.gate / 100)
            if (step.tieSteps > 0) noteDurationMs += stepDurationMs * Math.min(step.tieSteps, state.steps.length - 1)
            noteDurationMs = Math.max(noteDurationMs, 10)
            if (chase) { tMs = chase.onMs; noteDurationMs = chase.durMs }

            // Accent boosts velocity the same way the style generator's own
            // accentGrid already does (see generateSequence() below).
            const velocity = step.accent ? Math.min(127, Math.floor(step.velocity * 1.15)) : step.velocity

            // Fit: Chord — a step on the beat is a strong one (lands on a chord tone)
            const fitPcs = state.chordPcs
            const strong = !!fitPcs && (((state.localIndices?.[stepIdx] ?? stepIdx) * (tempoMultiplier.value.beatsPerStep ?? 0.25)) % 1) < 1e-6
            step.notes.forEach(note => {
              const aligned = note + (state.align || 0)
              let followed = state.degreeShift ? transposeDiatonic(aligned, state.degreeShift, state.keyPc ?? 0, state.scale ?? SCALES['Major']) : aligned
              if (fitPcs) followed = fitToChord(followed, fitPcs, strong, state.keyPc ?? 0, state.scale ?? SCALES['Major'])
              const clampedNote = Math.max(0, Math.min(127, followed + state.transpose + (state.dynamicMidiTranspose || 0)))
              if (tMs != null) {
                // CLK SYS: on and off at their times, from the Worker-timed queue.
                const noteKey = `${clampedNote}-${state.channel}`
                const ch = state.channel
                const offAt = tMs + noteDurationMs
                const id = _seqVoices.start(noteKey, offAt, { note: clampedNote, channel: ch, key: noteKey })
                midiStore.sendNoteOn(clampedNote, velocity, ch, SRC, null, tMs, chOpts({ workerTimed: true, workerTag: SEQ_WORKER_TAG }))
                // a note-off of this pitch already sent for later would cut it: strike it again just after
                const cutBy = _seqVoices.sentOffAfter(noteKey, tMs)
                if (cutBy !== null && cutBy + 1 < offAt) midiStore.sendNoteOn(clampedNote, velocity, ch, SRC, null, cutBy + 1, chOpts({ workerTimed: true, workerTag: SEQ_WORKER_TAG }))
                activeMidiNotes.value.add(noteKey)
                // decided NOTE_OFF_LEAD_MS early, sent timestamped (not when due: the main thread delayed it)
                midiService.scheduleOnWorker(noteOffDecideAt(offAt, performance.now()), () => {
                  // A newer note of the same pitch owns it now: this note-off would cut it.
                  if (!_seqVoices.release(noteKey, id)) return
                  midiStore.sendNoteOff(clampedNote, 0, ch, SRC, null, offAt, chOpts({ workerTimed: true }))
                  activeMidiNotes.value.delete(noteKey)
                }, undefined, 'SEQ note-off')
                return
              }
              midiStore.sendNoteOn(clampedNote, velocity, state.channel, SRC, null, undefined, chOpts())
            
              const noteKey = `${clampedNote}-${state.channel}`
              activeMidiNotes.value.add(noteKey)

              const timeoutId = window.setTimeout(() => {
                midiStore.sendNoteOff(clampedNote, 0, state.channel, SRC, null, undefined, chOpts())
                activeMidiNotes.value.delete(noteKey)
                activeTimeouts.value = activeTimeouts.value.filter(id => id !== timeoutId)
              }, noteDurationMs)
              activeTimeouts.value.push(timeoutId)
            })
          }

          drawAt(() => {
            currentStep.value = stepIdx
            playStateRef.current.currentStep = stepIdx
            followChainPlayback(stepIdx)
          }, time)
        }
        if (systemClock.value) {
          if (!playStateRef.current.isPlaying) return
          _startSystemClock(stepCallback)
          transportManager.acquireTransport()
          return
        }
        const atBar = transportManager.isRunning.value && ((isMain && syncStore.syncSequencer2ToTransport.value) || _seqStartSteps >= 16)
        _seqStartSteps = 0
        repeatEventIdRef.value = getTransport().scheduleRepeat(stepCallback, tempoMultiplier.value.interval, atBar ? transportManager.getNextBarPosition() : undefined)

        transportManager.acquireTransport()
      })
    }

    const pb = seqStore.playbackSteps
    _seqChainPlaying = seqStore.chainEnabled
    _seqLastBank = null
    playStateRef.current = {
      isPlaying: playing,
      currentStep: currentStep.value,
      steps: pb.steps,
      numSteps: pb.numSteps,
      chainSlotIndices: pb.chainSlotIndices,
      bankIndices: pb.bankIndices,
      localIndices: pb.localIndices,
      bpm: bpm(),
      channel: channel(),
      param1CC: param1CC.value !== null ? Number(param1CC.value) : null,
      param2CC: param2CC.value !== null ? Number(param2CC.value) : null,
      transpose: uiStore.seqGlobalTranspose || 0,
      dynamicMidiTranspose: dynamicMidiTranspose.value,
      degreeShift: dynamicDegreeShift.value,
      chordPcs: dynamicChordPcs.value,
      keyPc: playKeyPc(),
      scale: playScale(),
      align: alignOffset.value,
    }
  })

  watch(() => midiStore.isTransportPlaying, (isPlayingMIDI) => {
    if (isMain && midiStore.syncSequencerTransport) {
      if (isPlaying.value !== isPlayingMIDI) {
        isPlaying.value = isPlayingMIDI
      }
    }
  })

  onScopeDispose(() => {
    if (repeatEventIdRef.value !== null) getTransport().clear(repeatEventIdRef.value)
    _stopSystemClock()
    if (isMain) midiService.isSequencerPlaying = false
    window.removeEventListener('virtual-midi-note', handleVirtualNote)
    window.removeEventListener(cfg.toggle, handleToggle2)
    window.removeEventListener('cp-chord-release', _onChordRelease)
    window.removeEventListener('cp-chord-on', _onChordOn)
    window.removeEventListener(ev('vary-set'), _onVarySet)
    window.removeEventListener(ev('bank-select'), handleBankSelect)
    window.removeEventListener(ev('bank-cue'), handleBankCue)
    window.removeEventListener(ev('generate'), handleRigGenerate)
    window.removeEventListener(ev('banks-reloaded'), handleBanksReloaded)
    window.removeEventListener(ev('time-set'), handleTimeSet)
    window.removeEventListener(ev('mute-set'), _onMuteSet)
    window.removeEventListener(ev('direction-set'), handleDirectionSet)
    window.removeEventListener(ev('steps-set'), handleStepsSet)
    unsubNote?.()
    unsubAppNote?.()
    unsubCC?.()
  })

  return {
    // the lane (lib/seq-lanes.ts) and its MIDI channel (0 = global, 1–16)
    lane, laneChannel, laneMuted, laneSync, startPending,
    bankSound, bankSoundLabel, currentSoundLabel, assignBankSound, clearBankSound, laneSoundOn,
    // pattern (working copy of the active bank) and settings the panel shows / edits
    selectedStyle, selectedKey, selectedScale, progKey, chordsEnabled, maxPolyphony, chordDensity,
    fitMode, alignOffset, isPlaying, isRecording, currentStep, selectedStepIdx, syncTrack, genDensity, rhythmMode, syncopation, euclidRotation, melodyMode, varyAmount, arpNotes, arpModeForGen,
    swingAmount, basePatternLength, selectedOctave, octaveRange, numSteps, steps,
    param1CC, param2CC, clampParam1CC, clampParam2CC, param1Variation, param2Variation,
    dynamicMidiTranspose, dynamicDegreeShift, gridCurrentStep, systemClock, tempoMultiplier, sequenceDirection,
    TEMPO_MULTIPLIERS, SEQ_DIRECTIONS,
    // actions
    syncLocalToBank, loadBankIntoLocal, selectBank, generateSequence, regenerateParams, journaledGenerate, duplicateLength, reduceLength,
    updateStep, clearStep, stepMidiNote, isNoteBarActive, toggleNoteBar, setStepOctave, applyToAll,
    randomize, getPresetValueForCC, userTogglePlay,
  }
}
