<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { getTransport, getDraw, start as toneStart, now as toneNow } from 'tone'
import { Drum, Play, Square, X, Minus, ChevronDown, Copy, Trash2, Zap, Save, FolderOpen, Shuffle, Layers, Music2 } from 'lucide-vue-next'
import { useUiStore } from '@/stores/useUiStore'
import { useDrumMachineStore, DRUM_STYLE_NAMES } from '@/stores/useDrumMachineStore'
import { useAudioMixerStore } from '@/stores/useAudioMixerStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useArpStore } from '@/stores/useArpStore'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'
import { useFreesoundCache } from '@/composables/useFreesoundCache'
import * as drumEngine from '@/lib/drum-engine'

const uiStore        = useUiStore()
const drumStore      = useDrumMachineStore()
const mixer          = useAudioMixerStore()
const mappingStore   = useMappingStore()
const arpStore       = useArpStore()
const { openMenu }   = useMidiContextMenu()
const { cacheFileBlob, resolveUrl } = useFreesoundCache()

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } =
  useDraggableResizable({
    storageKey:    'S1_DRUM_MACHINE_DR',
    minimizeLabel: 'Drum Machine',
    openRef:       () => uiStore.isDrumMachineOpen,
    initialWidth:  960,
    initialHeight: 520,
    minWidth:      720,
    minHeight:     380,
    zIndex:        210,
  })

// ── Local UI state ─────────────────────────────────────────────────────────────
const selectedStyle   = ref('House')
const showStyleMenu   = ref(false)
const generateAsFill  = ref(false)
const showImportMenu  = ref(false)
const selectedCategory = ref('Rock')
const selectedPattern = ref(0)
const lastImportedPattern = ref(null) // { category, title }
let _importedCategoryIdx = 0
let _importedPatternIdx = 0
const copySourceSeq       = ref(null)
const copySoundsSourceSeq = ref(null)
const stepContextMenu = ref(null) // { trackIdx, stepIdx, x, y }
const basslineStepContextMenu = ref(null) // { voiceIdx, stepIdx, x, y }

// Preset panel
const showPresets    = ref(false)
const newPresetName  = ref('')
const currentPresetId = ref(null)

// Drum Kit panel
const showKits    = ref(false)
const newKitName  = ref('')

// Init confirmation
const initConfirm     = ref(false)
const presetSavedToast  = ref(false)
const kitSavedToast     = ref(false)
const kitOverwriteToast = ref(false)
const fxCopiedToast    = ref(false)
let _toastTimer    = null
let _kitToastTimer = null
let _kitOverwriteTimer = null
let _fxToastTimer  = null

// Bassline UI
const showBassline = ref(false)
const hideBasslineSlots = ref(false)
const basslineMidiCapture = ref(-1) // voice index awaiting MIDI note, or -1
const notePreviewTimer = ref(null)
const basslineRootNote = ref(24)

function toggleShowBassline() {
  showBassline.value = !showBassline.value
  if (showBassline.value) drumStore.basslineEnabled = true
}

function captureBasslineMidiNote(voiceIdx, stepIdx) {
  basslineMidiCapture.value = voiceIdx * 16 + stepIdx
}

function clearBasslinePattern() {
  const seq = drumStore.basslineSequences[drumStore.activeSequence]
  if (!seq) return
  seq.forEach(voice => {
    voice.steps.forEach(s => { s.active = false; s.note = undefined })
  })
}

function overwritePresetWithToast(id) {
  drumStore.overwritePreset(id, _chainExtra())
  presetSavedToast.value = true
  clearTimeout(_toastTimer)
  _toastTimer = setTimeout(() => { presetSavedToast.value = false }, 2000)
}

// Quantized sequence switching — set by tab click, applied at next bar start
let _pendingSequence = null
const pendingSequence = ref(null) // UI display only (drives pulsing tab border)

// Fill
const fillActive    = ref(false)
let _fillAutoStop   = false
const fillSaveFrom  = ref(1)
const fillSaveTo    = ref(16)
const fillPattern = ref(
  Array(drumStore.TRACK_LABELS.length).fill(null).map(() => Array(16).fill(null).map(() => ({ active: false, velocity: 100, accent: false, ratchet: 1, tie: 0 })))
)

// REC SYNC — arms at bar start, records 16 × multiplier steps, auto-stops
let _recSyncArmed          = false
let _recSyncRecording      = false
let _recSyncBarsRemaining  = 0
const recSyncArmed      = ref(false)
const recSyncActive     = ref(false)
const recSyncMultiplier = ref(1)

// ── Sync BPM from arpStore (global BPM) ───────────────────────────────────────
watch(() => arpStore.arpBpm, v => { drumStore.bpm = v }, { immediate: true })
watch(() => drumStore.bpm, v => drumEngine.setDelayTime(v))

// ── FX strip visibility per track ─────────────────────────────────────────────
const showFx = ref(Array(drumStore.TRACK_LABELS.length).fill(false))

// ── FX clipboard (copy/paste across sequences for the same track slot) ────────
const fxClipboard = ref(null) // { pan, pitch, filterFreq, reverbSend, delaySend }

function copyTrackFx(track) {
  fxClipboard.value = {
    pan:        track.pan        ?? 0,
    pitch:      track.pitch      ?? 0,
    filterFreq: track.filterFreq ?? 20000,
    reverbSend: track.reverbSend ?? 0,
    delaySend:  track.delaySend  ?? 0,
  }
  fxCopiedToast.value = true
  clearTimeout(_fxToastTimer)
  _fxToastTimer = setTimeout(() => { fxCopiedToast.value = false }, 2000)
}

function pasteTrackFxTo(trackIdx, targetSeq) {
  if (!fxClipboard.value) return
  drumStore.pasteTrackFx(trackIdx, targetSeq, fxClipboard.value)
  // sync engine for current sequence if target is active
  if (targetSeq === drumStore.activeSequence) {
    const t = drumStore.sequences[targetSeq][trackIdx]
    drumEngine.setPadPan(trackIdx, t.pan ?? 0)
    drumEngine.setPadPitch(trackIdx, t.pitch ?? 0)
    drumEngine.setPadFilter(trackIdx, t.filterFreq ?? 20000)
    drumEngine.setPadReverbSend(trackIdx, t.reverbSend ?? 0)
    drumEngine.setPadDelaySend(trackIdx, t.delaySend ?? 0)
  }
}

function trackHasFx(track) {
  return (track.pan ?? 0) !== 0
    || (track.pitch ?? 0) !== 0
    || (track.filterFreq ?? 20000) !== 20000
    || (track.reverbSend ?? 0) !== 0
    || (track.delaySend ?? 0) !== 0
}

// ── Tone.js scheduling ────────────────────────────────────────────────────────
const playStateRef = { current: null }
let repeatEventIdRef = null
let stepCounter = 0
let _tieCountdown = Array(11).fill(0)

function buildPlayState() {
  return {
    tracks: drumStore.currentPattern.map(t => ({
      muted:  t.muted,
      solo:   t.solo,
      volume: t.volume,
      length: t.length ?? 16,
      steps:  t.steps.map(s => ({ ...s })),
    })),
    basslineEnabled: drumStore.basslineEnabled && showBassline.value,
    basslineTracks: drumStore.currentBasslinePattern.map(t => ({
      muted:  t.muted,
      solo:   t.solo,
      volume: t.volume,
      pitch:  t.pitch ?? 0,
      length: t.length ?? 16,
      filterFreq: t.filterFreq ?? 20000,
      steps:  t.steps.map(s => ({ ...s })),
    })),
    basslineSourceSlots: [...drumStore.basslineSourceSlots],
    bpm:              drumStore.bpm,
    swing:            drumStore.swing,
    repeaterActive:   drumStore.repeaterActive,
    repeaterDivision: drumStore.repeaterDivision,
    fillActive:       fillActive.value,
    fillSteps:        fillPattern.value.map(steps => steps.map(s => ({ ...s }))),
  }
}

const hasSolo = computed(() =>
  drumStore.currentPattern.some(t => t.solo) ||
  (showBassline.value && drumStore.currentBasslinePattern.some(t => t.solo))
)

function _scheduleCallback(time) {
  let state = playStateRef.current
  if (!state) return

  // Global 16-step position drives the bar boundary and UI highlight.
  // Each track uses its own length for wrapping (per-track polymetry).
  const globalStep = stepCounter % 16

  // ── Bar boundary (step 0): pending sequence swap + fill auto-stop ──
  if (globalStep === 0) {
    if (_pendingStop) {
      _pendingStop = false
      getDraw().schedule(() => { drumStore.isPlaying = false; pendingStop.value = false }, time)
      return
    }
    if (chainEnabled.value) {
      _chainSlotIdx = (_chainSlotIdx + 1) % chainLength.value
      let seq = chain.value[_chainSlotIdx]
      if (!seq) {
        for (let j = _chainSlotIdx - 1; j >= 0; j--) {
          if (chain.value[j]) { seq = chain.value[j]; break }
        }
      }
      if (seq) {
        drumStore.swapSequence(seq)
        _pendingSequence = null
        playStateRef.current = buildPlayState()
        state = playStateRef.current
        getDraw().schedule(() => { pendingSequence.value = null; chainSlotRef.value = _chainSlotIdx }, time)
      }
    } else if (_pendingSequence !== null) {
      drumStore.swapSequence(_pendingSequence)
      _pendingSequence = null
      playStateRef.current = buildPlayState()
      state = playStateRef.current
      getDraw().schedule(() => { pendingSequence.value = null }, time)
    }
    _measureCount++
    if (autofillEnabled.value && _measureCount % autofillEvery.value === 0) {
      getDraw().schedule(() => { generateFill(); triggerFill() }, time)
    }
    if (_fillAutoStop) {
      _fillAutoStop = false
      playStateRef.current = { ...state, fillActive: false }
      state = playStateRef.current
      getDraw().schedule(() => { fillActive.value = false }, time)
    }
    // REC SYNC: stop first (completed 16 steps), then start if newly armed.
    // Both events are deferred via getDraw so they fire at actual playback
    // time, not at Tone.js lookahead schedule time.
    if (_recSyncRecording) {
      _recSyncBarsRemaining--
      if (_recSyncBarsRemaining <= 0) {
        _recSyncRecording = false
        getDraw().schedule(() => {
          window.dispatchEvent(new CustomEvent('capture-stop-rec'))
          recSyncActive.value = false
        }, time)
      }
    }
    if (_recSyncArmed) {
      _recSyncArmed = false
      _recSyncRecording = true
      _recSyncBarsRemaining = recSyncMultiplier.value
      // Fire capture-start-rec via setTimeout so the MediaRecorder codec has
      // time to initialise before the beat hits. Pre-roll = 200ms; clamped to
      // however long is left until the bar boundary.
      const PRE_ROLL = 0.2
      const timeUntilBeat = time - toneNow()
      const actualPreRoll = Math.min(PRE_ROLL, Math.max(0, timeUntilBeat))
      const delayMs = Math.max(0, (timeUntilBeat - PRE_ROLL) * 1000)
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('capture-start-rec', {
          detail: { background: true, preRoll: actualPreRoll },
        }))
      }, delayMs)
      getDraw().schedule(() => {
        recSyncArmed.value = false
        recSyncActive.value = true
      }, time)
    }
  }

  const stepTimeSec = 60 / (state.bpm * 4)
  const swingOffset = (globalStep % 2 === 1)
    ? stepTimeSec * (state.swing / 200)
    : 0
  const fireTime = time + swingOffset

  const soloActive = state.tracks.some(t => t.solo)

  state.tracks.forEach((track, trackIdx) => {
    const audible = soloActive ? track.solo : !track.muted
    if (!audible) return

    // When bassline is active, skip drum tracks that are assigned to bassline source slots
    if (state.basslineEnabled && state.basslineSourceSlots?.includes(trackIdx)) return

    // Each track wraps at its own length
    const trackStep = stepCounter % (track.length || 16)
    let step = track.steps[trackStep]
    if (state.fillActive && state.fillSteps?.[trackIdx]?.[trackStep]?.active) {
      step = state.fillSteps[trackIdx][trackStep]
    }

    // Tie countdown: if > 0, skip this step and decrement
    if (_tieCountdown[trackIdx] > 0) {
      _tieCountdown[trackIdx]--
      return
    }

    if (!step.active) return

    drumEngine.setPadVolume(trackIdx, track.volume * mixer.effectiveDrumsLevel)

    // Gate duration: tie=0 → 1 step, tie=N → N steps
    const stepDur = step.tie > 0 ? step.tie * stepTimeSec : stepTimeSec

    const divisions = state.repeaterActive
      ? state.repeaterDivision
      : step.ratchet

    if (divisions <= 1) {
      drumEngine.triggerPad(trackIdx, { velocity: step.velocity, accent: step.accent, time: fireTime, duration: stepDur })
    } else {
      drumEngine.triggerRatchet(trackIdx, stepTimeSec, divisions, {
        velocity: step.velocity,
        accent:   step.accent,
        baseTime: fireTime,
        duration: stepDur,
      })
    }

    // Set tie countdown for subsequent steps
    if (step.tie > 0) {
      _tieCountdown[trackIdx] = step.tie
    }
  })

  getDraw().schedule(() => { drumStore.currentStep = globalStep }, time)
  stepCounter++ // no wrap — each track uses its own modulo

  // ── Bassline voices ──
  if (state.basslineEnabled && state.basslineTracks) {
    const bassSoloActive = state.basslineTracks.some(t => t.solo)
    state.basslineTracks.forEach((voice, vi) => {
      if (voice.muted) return
      if (bassSoloActive && !voice.solo) return
      const padIdx = state.basslineSourceSlots?.[vi]
      if (padIdx == null || padIdx < 0 || padIdx >= 11) return
      const trackStep = stepCounter % (voice.length || 16)
      const step = voice.steps[trackStep]
      if (!step.active) return
      const bassDur = step.tie > 0 ? step.tie * stepTimeSec : stepTimeSec
      drumEngine.setPadPitch(padIdx, voice.pitch ?? 0)
      drumEngine.triggerPadWithNote(padIdx, step.note ?? 36, {
        velocity: step.velocity,
        accent: step.accent ?? false,
        time: fireTime,
        duration: bassDur,
        filterFreq: voice.filterFreq ?? 20000,
      })
    })
  }
}

watch(() => drumStore.isPlaying, (playing) => {
  if (!playing) {
    if (repeatEventIdRef !== null) {
      getTransport().clear(repeatEventIdRef)
      repeatEventIdRef = null
    }
    getTransport().stop()
    stepCounter = 0
    _tieCountdown = Array(11).fill(0)
    drumStore.currentStep = -1
    chainSlotRef.value = -1
    _pendingStop = false
    pendingStop.value = false
    // Cancel any pending or active rec sync
    if (_recSyncRecording) {
      window.dispatchEvent(new CustomEvent('capture-stop-rec'))
    }
    _recSyncArmed         = false
    _recSyncRecording     = false
    _recSyncBarsRemaining = 0
    recSyncArmed.value  = false
    recSyncActive.value = false
    return
  }

  stepCounter = 0
  _tieCountdown = Array(11).fill(0)
  _chainSlotIdx = -1
  _measureCount = 0
  chainSlotRef.value = -1

  toneStart().then(() => {
    getTransport().bpm.value = drumStore.bpm
    playStateRef.current = buildPlayState()

    repeatEventIdRef = getTransport().scheduleRepeat(_scheduleCallback, '16n')
    getTransport().start()
  })
})

// Keep snapshot live while playing
watch(
  [
    () => drumStore.currentPattern,
    () => drumStore.bpm,
    () => drumStore.swing,
    () => drumStore.repeaterActive,
    () => drumStore.repeaterDivision,
    fillActive,
    fillPattern,
  ],
  () => {
    if (drumStore.isPlaying) playStateRef.current = buildPlayState()
  },
  { deep: true }
)

// ── Sample loading ─────────────────────────────────────────────────────────────
async function restoreSample(trackIdx, track) {
  // Use this track's own sound, or fall back to the nearest previous sequence's sound
  const resolved = drumStore.resolveTrackSound(trackIdx)
  if (!resolved?.soundId) return
  const url = await resolveUrl(resolved.soundId, '')
  if (!url) return
  // Only write soundUrl back into the track object if it owns the sound
  if (resolved.own) track.soundUrl = url
  await drumEngine.loadSample(trackIdx, url)
}

async function loadAllSamples(pattern) {
  for (let i = 0; i < pattern.length; i++) {
    await restoreSample(i, pattern[i])
  }
}

watch(() => drumStore.activeSequence, async () => {
  await nextTick()
  await loadAllSamples(drumStore.currentPattern)
  pushAllFxToEngine(drumStore.currentPattern)
})

// ── Master volume (footer) — applied as a multiplier on all track volumes at trigger time ─
function _setMasterVolume(vol) {
  mixer.setDrumsLevelVol(Math.max(0, Math.min(1, vol)))
}

// ── Master volume from AudioMixer — controls the engine's _masterGain node ───
function _onMasterVolume(e) {
  drumEngine.setMasterVolume(e.detail)
}

function _onMidiFill()         { triggerFill() }
function _onMidiGenerate()     { generatePattern() }
function _onMidiSeqSwitch(e)   { clickSequenceTab(e.detail?.seq) }

// ── REC SYNC ───────────────────────────────────────────────────────────────────
function toggleRecSync() {
  if (recSyncActive.value) {
    // Stop recording immediately
    _recSyncRecording = false
    window.dispatchEvent(new CustomEvent('capture-stop-rec'))
    recSyncActive.value = false
  } else if (recSyncArmed.value) {
    // Cancel the arm
    _recSyncArmed = false
    recSyncArmed.value = false
  } else {
    // Arm: will trigger at next bar start (step 0)
    _recSyncArmed = true
    recSyncArmed.value = true
    // Pre-warm AudioCapture monitor so it's ready the moment recording starts
    window.dispatchEvent(new CustomEvent('capture-monitor-pre-arm'))
  }
}

function pushAllFxToEngine(pattern) {
  pattern.forEach((track, i) => {
    drumEngine.setPadPan(i, track.pan ?? 0)
    drumEngine.setPadPitch(i, track.pitch ?? 0)
    drumEngine.setPadFilter(i, track.filterFreq ?? 20000)
    drumEngine.setPadReverbSend(i, track.reverbSend ?? 0)
    drumEngine.setPadDelaySend(i, track.delaySend ?? 0)
  })
}

async function _tlDmStartHandler(e) {
  const { presetName, seqKey, chainEnabled: ce, bpm } = e.detail ?? {}
  if (presetName) {
    const preset = drumStore.presets.find(p => p.name === presetName)
    if (preset) await handleLoadPreset(preset)
  }
  // Restore timeline BPM — preset load may have overwritten arpStore.arpBpm
  if (bpm) { arpStore.arpBpm = bpm; drumStore.bpm = bpm }
  if (seqKey) drumStore.swapSequence(seqKey)
  if (ce != null) chainEnabled.value = ce
  if (!drumStore.isPlaying) drumStore.isPlaying = true
}
function _tlDmStopHandler() { drumStore.isPlaying = false }

// ── Timeline DM Rec Sync ─────────────────────────────────────────────────────
function _tlDmRecSyncHandler(e) {
  const measures = e.detail?.measures ?? 4
  recSyncMultiplier.value = measures
  // Ensure drum machine is playing — the scheduler must run for rec sync
  // to trigger at the next bar boundary (step 0)
  if (!drumStore.isPlaying) {
    drumStore.isPlaying = true
    // Call arm on next tick so the watch handler has time to start transport
    setTimeout(() => toggleRecSync(), 0)
  } else {
    toggleRecSync()
  }
}

function _onPadTrigger(e) {
  const { trackIdx, velocity } = e.detail ?? {}
  if (typeof trackIdx === 'number' && trackIdx >= 0 && trackIdx < drumStore.TRACK_LABELS.length) {
    drumEngine.triggerPad(trackIdx, { velocity: velocity ?? 100, accent: false, time: 0 })
  }
}

onMounted(async () => {
  drumEngine.initDrumEngine()
  drumEngine.setDelayTime(drumStore.bpm)
  if (drumStore.presets.length) {
    const last = drumStore.presets[drumStore.presets.length - 1]
    await handleLoadPreset(last)
  } else {
    await loadAllSamples(drumStore.currentPattern)
    pushAllFxToEngine(drumStore.currentPattern)
  }
  window.addEventListener('dm-master-volume',  _onMasterVolume)
  window.addEventListener('dm-trigger-fill',   _onMidiFill)
  window.addEventListener('dm-generate',       _onMidiGenerate)
  window.addEventListener('dm-seq-switch',     _onMidiSeqSwitch)
  window.addEventListener('timeline-dm-start', _tlDmStartHandler)
  window.addEventListener('timeline-dm-stop',  _tlDmStopHandler)
  window.addEventListener('timeline-dm-rec-sync', _tlDmRecSyncHandler)
  window.addEventListener('dm-pad-trigger',    _onPadTrigger)

  window.addEventListener('dm-bass-midi-note', _onBassMidiNote)
})

const _onBassMidiNote = (e) => {
  if (basslineMidiCapture.value < 0) return
  const note = e.detail?.note
  if (typeof note !== 'number') return
  const voiceIdx = Math.floor(basslineMidiCapture.value / 16)
  const stepIdx = basslineMidiCapture.value % 16
  drumStore.setBasslineNote(voiceIdx, stepIdx, note)
  // Preview the note
  const padIdx = drumStore.basslineSourceSlots[voiceIdx] ?? 8
  drumEngine.triggerPadWithNote(padIdx, note, { velocity: 100, time: 0 })
  basslineMidiCapture.value = -1
}

onUnmounted(() => {
  if (drumStore.isPlaying) drumStore.isPlaying = false
  if (repeatEventIdRef !== null) {
    getTransport().clear(repeatEventIdRef)
    repeatEventIdRef = null
  }
  drumEngine.stopAll()
  if (_recSyncRecording) window.dispatchEvent(new CustomEvent('capture-stop-rec'))
  window.removeEventListener('dm-master-volume',  _onMasterVolume)
  window.removeEventListener('dm-trigger-fill',   _onMidiFill)
  window.removeEventListener('dm-generate',       _onMidiGenerate)
  window.removeEventListener('dm-seq-switch',     _onMidiSeqSwitch)
  window.removeEventListener('timeline-dm-start', _tlDmStartHandler)
  window.removeEventListener('timeline-dm-stop',  _tlDmStopHandler)
  window.removeEventListener('timeline-dm-rec-sync', _tlDmRecSyncHandler)
  window.removeEventListener('dm-pad-trigger',    _onPadTrigger)
  window.removeEventListener('dm-bass-midi-note', _onBassMidiNote)
})

// ── File / URL loading ─────────────────────────────────────────────────────────
async function handleTrackFileLoad(trackIdx, e) {
  const file = e.target.files?.[0]
  if (!file) return
  const soundId    = `dm_${Date.now()}_${trackIdx}`
  const soundLabel = file.name.replace(/\.[^.]+$/, '')
  const blob       = new Blob([await file.arrayBuffer()], { type: file.type || 'audio/wav' })
  const soundUrl   = await cacheFileBlob(soundId, soundLabel, blob)
  drumStore.setTrackSound(trackIdx, { soundId, soundLabel, soundUrl })
  await drumEngine.loadSample(trackIdx, soundUrl)
  // Reset file input so the same file can be re-selected
  e.target.value = ''
}

async function handleTrackUrlDrop(trackIdx, e) {
  e.preventDefault()
  const url = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('URL')
  if (!url) return
  // External URLs aren't cached in IDB — store as direct URL
  drumStore.setTrackSound(trackIdx, { soundId: '', soundLabel: url, soundUrl: url })
  await drumEngine.loadSample(trackIdx, url)
}

function openFolderBrowserForTrack(trackIdx) {
  const track = drumStore.currentPattern[trackIdx]
  uiStore.soundFolderAssignTarget = {
    label: track?.label || `Track ${trackIdx + 1}`,
    trackLabels: drumStore.TRACK_LABELS.slice(0, 11),
    onAssign: async (file) => {
      const soundId    = `dm_${Date.now()}_${trackIdx}`
      const soundLabel = file.name.replace(/\.[^.]+$/, '')
      const fileObj    = await file.handle.getFile()
      const blob       = new Blob([await fileObj.arrayBuffer()], { type: fileObj.type || 'audio/wav' })
      const soundUrl   = await cacheFileBlob(soundId, soundLabel, blob)
      drumStore.setTrackSound(trackIdx, { soundId, soundLabel, soundUrl })
      await drumEngine.loadSample(trackIdx, soundUrl)
    },
    onAssignRandom: async (files, slotIndices) => {
      const indices = slotIndices ?? drumStore.TRACK_LABELS.slice(0, 11).map((_, i) => i)
      const count = Math.min(files.length, indices.length)
      for (let j = 0; j < count; j++) {
        const slotIdx = indices[j]
        const file = files[j]
        const soundId    = `dm_${Date.now()}_${slotIdx}`
        const soundLabel = file.name.replace(/\.[^.]+$/, '')
        const fileObj    = await file.handle.getFile()
        const blob       = new Blob([await fileObj.arrayBuffer()], { type: fileObj.type || 'audio/wav' })
        const soundUrl   = await cacheFileBlob(soundId, soundLabel, blob)
        drumStore.setTrackSound(slotIdx, { soundId, soundLabel, soundUrl })
        await drumEngine.loadSample(slotIdx, soundUrl)
      }
    },
  }
  uiStore.isSoundFolderBrowserOpen = true
}

async function copySoundsTo(targetSeq) {
  const srcSeq = copySoundsSourceSeq.value
  if (!srcSeq) return
  drumStore.copySounds(srcSeq, targetSeq)
  copySoundsSourceSeq.value = null
  if (targetSeq === drumStore.activeSequence) {
    await nextTick()
    await loadAllSamples(drumStore.currentPattern)
  }
}

function previewPad(trackIdx) {
  drumEngine.triggerPad(trackIdx, { velocity: 100, accent: false, time: 0 })
}

// ── Preset save / load ────────────────────────────────────────────────────────
function _chainExtra() {
  return {
    chain:            [...chain.value],
    chainLength:      chainLength.value,
    autofillEnabled:  autofillEnabled.value,
    autofillEvery:    autofillEvery.value,
    generatedStyle:   selectedStyle.value,
    bpm:              drumStore.bpm,
    basslineEnabled:  drumStore.basslineEnabled,
    basslineSourceSlots: [...drumStore.basslineSourceSlots],
    basslineSequences: drumStore.basslineSequences,
  }
}

function handleSavePreset() {
  drumStore.savePreset(newPresetName.value, _chainExtra())
  newPresetName.value = ''
}

async function handleLoadPreset(preset) {
  drumStore.loadPreset(preset)
  currentPresetId.value = preset.id
  const clen = preset.chainLength ?? 16
  chainLength.value  = Math.max(2, Math.min(16, clen))
  chain.value        = preset.chain?.length >= 2 ? (preset.chain.slice(0, chainLength.value).map(s => s ?? null)) : Array(chainLength.value).fill(null)
  autofillEnabled.value = preset.autofillEnabled ?? false
  autofillEvery.value   = preset.autofillEvery   ?? 4
  if (preset.generatedStyle) selectedStyle.value = preset.generatedStyle
  if (preset.bpm)           arpStore.arpBpm = preset.bpm
  showPresets.value = false
  await nextTick()
  await loadAllSamples(drumStore.currentPattern)
}

function handleSaveKit() {
  drumStore.saveDrumKit(newKitName.value)
  newKitName.value = ''
  kitSavedToast.value = true
  clearTimeout(_kitToastTimer)
  _kitToastTimer = setTimeout(() => { kitSavedToast.value = false }, 2000)
}

function overwriteKitWithToast(id) {
  drumStore.overwriteDrumKit(id)
  kitOverwriteToast.value = true
  clearTimeout(_kitOverwriteTimer)
  _kitOverwriteTimer = setTimeout(() => { kitOverwriteToast.value = false }, 2000)
}

async function handleApplyKit(id) {
  drumStore.applyDrumKit(id)
  showKits.value = false
  await nextTick()
  await loadAllSamples(drumStore.currentPattern)
  pushAllFxToEngine(drumStore.currentPattern)
}

// ── Quantized sequence switching ───────────────────────────────────────────────
// Sync Retrig: TRUE = switch pattern on next first beat (quantized), FALSE = switch immediately on click
const syncRetrig = ref(true)

function clickSequenceTab(seq) {
  if (syncRetrig.value && drumStore.isPlaying && seq !== drumStore.activeSequence) {
    _pendingSequence = seq
    pendingSequence.value = seq
  } else {
    _pendingSequence = null
    pendingSequence.value = null
    drumStore.swapSequence(seq)
  }
}

// ── Fill ───────────────────────────────────────────────────────────────────────
function triggerFill() {
  fillActive.value = true
  _fillAutoStop = true
  if (drumStore.isPlaying) playStateRef.current = buildPlayState()
}

function saveFillToPattern() {
  const from = Math.max(1, Math.min(16, fillSaveFrom.value)) - 1
  const to   = Math.max(from, Math.min(15, fillSaveTo.value - 1))
  fillPattern.value.forEach((trackSteps, trackIdx) => {
    const track = drumStore.currentPattern[trackIdx]
    if (!track) return
    for (let s = from; s <= to; s++) {
      if (trackSteps[s]) track.steps[s] = { ...trackSteps[s] }
    }
  })
  if (drumStore.isPlaying) playStateRef.current = buildPlayState()
}

function generateFill() {
  const r    = Math.random
  const rnd  = (lo, hi) => Math.floor(r() * (hi - lo + 1)) + lo
  const pick = (...args) => args[Math.floor(r() * args.length)]
  const hit  = (vel) => ({ active: true, velocity: vel, accent: false, ratchet: 1, tie: 0 })
  const hitA = (vel) => ({ active: true, velocity: vel, accent: true,  ratchet: 1, tie: 0 })
  const off  = ()    => ({ active: false, velocity: 100, accent: false, ratchet: 1, tie: 0 })
  const fp   = Array(drumStore.TRACK_LABELS.length).fill(null).map(() => Array(16).fill(null).map(off))

  const archetype = rnd(0, 5)

  if (archetype === 0) {
    // Snare roll — density builds toward end, crash on 16
    const density = pick(4, 6, 8) // how many snare hits
    const pool = [8,9,10,11,12,13,14,15]
    pool.sort(() => r() - 0.5)
    pool.slice(0, density).sort((a,b)=>a-b).forEach((s, i) =>
      fp[1][s] = i === density - 1 ? hitA(127) : hit(rnd(70 + i * 7, 100 + i * 4))
    )
    fp[0][0] = hitA(rnd(100, 120))
    if (r() > 0.4) fp[0][pick(2,4)] = hit(rnd(80, 100))
    fp[7][15] = hitA(rnd(105, 127))

  } else if (archetype === 1) {
    // Tom cascade — toms roll across the bar
    const pairs = pick(
      [[5,4],[5,6],[5,8],[6,9],[6,11],[7,14]],
      [[5,2],[5,5],[6,8],[6,10],[6,12],[7,15]],
      [[5,0],[5,3],[6,6],[6,9],[5,11],[6,13],[7,15]]
    )
    pairs.forEach(([t, s]) => fp[t][s] = hit(rnd(85, 115)))
    fp[7][15] = hitA(rnd(100, 127))
    fp[0][0]  = hit(rnd(90, 110))
    if (r() > 0.5) fp[1][pick(4,8,12)] = hit(rnd(80, 105))

  } else if (archetype === 2) {
    // Kick frenzy — busy syncopated kick + accent snare on 4
    const kicks = pick([0,3,5,7,9,12],[0,2,6,9,11,14],[0,4,6,8,10,13,15])
    kicks.forEach(s => fp[0][s] = s === 0 ? hitA(rnd(105,127)) : hit(rnd(75,105)))
    fp[1][12] = hitA(rnd(100, 120))
    fp[1][15] = hit(rnd(90, 115))
    for (let s = 0; s < 16; s += 2) if (r() > 0.4) fp[2][s] = hit(rnd(45, 70))
    fp[7][15] = hitA(rnd(100, 127))

  } else if (archetype === 3) {
    // HH frenzy — 16th hats driving, open hat stabs
    for (let s = 0; s < 16; s++) fp[2][s] = hit(rnd(55 + (s > 7 ? 15 : 0), 90 + (s > 11 ? 20 : 0)))
    const opens = pick([3,7,15],[7,11,15],[5,10,15],[7,15])
    opens.forEach(s => { fp[2][s] = off(); fp[3][s] = hitA(rnd(90, 120)) })
    fp[0][0] = hitA(rnd(100, 120))
    if (r() > 0.5) fp[0][pick(8,9,10)] = hit(rnd(75, 100))
    fp[1][pick(12,13,14)] = hitA(rnd(95, 120))
    fp[7][15] = hitA(rnd(105, 127))

  } else if (archetype === 4) {
    // Broken/syncopated — ghost snares + clap + scattered kick
    const ghosts = pick([1,3,5,9,11,13],[2,5,7,10,13],[1,4,7,9,12,14])
    ghosts.forEach(s => fp[1][s] = hit(rnd(35, 58)))
    fp[1][pick(12,13,14)] = hitA(rnd(100, 120))
    fp[1][15] = hitA(127)
    fp[0][0]  = hitA(rnd(100, 120))
    if (r() > 0.4) fp[0][pick(6,7,9,10)] = hit(rnd(70, 95))
    fp[4][pick(4,8)] = hit(rnd(85, 110))
    fp[3][pick(7,11,15)] = hit(rnd(80, 105))
    fp[7][15] = hitA(rnd(100, 127))

  } else {
    // Crash & build — sparse start, dense finish, big crash
    const snStart = pick(8, 9, 10)
    for (let s = snStart; s < 16; s++) fp[1][s] = s < 15 ? hit(rnd(60 + (s-snStart)*8, 95 + (s-snStart)*3)) : hitA(127)
    fp[0][0]  = hitA(rnd(100, 120))
    fp[0][8]  = hit(rnd(85, 110))
    fp[5][pick(10,11,12)] = hit(rnd(85, 110))
    fp[6][pick(12,13,14)] = hit(rnd(90, 115))
    fp[7][0]  = hit(rnd(70, 90))
    fp[7][15] = hitA(127)
    for (let s = 2; s < snStart; s += 2) if (r() > 0.5) fp[2][s] = hit(rnd(45, 68))
  }

  fillPattern.value = fp
}

// ── Bassline helpers ──────────────────────────────────────────────────
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

function midiNoteName(note) {
  const octave = Math.floor(note / 12) - 1
  return `${NOTE_NAMES[note % 12]}${octave}`
}

function basslineStepTitle(voiceIdx, stepIdx) {
  const step = drumStore.currentBasslinePattern[voiceIdx]?.steps[stepIdx]
  if (!step?.active) return `Step ${stepIdx + 1} · empty`
  return `Step ${stepIdx + 1} · ${midiNoteName(step.note ?? 36)} · vel ${step.velocity}`
}

function onBasslineStepWheel(voiceIdx, stepIdx, event) {
  const step = drumStore.currentBasslinePattern[voiceIdx]?.steps[stepIdx]
  if (!step) return
  const dir = Math.sign(event.deltaY)
  const current = step.note ?? 36
  const next = Math.max(24, Math.min(60, current - dir))
  drumStore.setBasslineNote(voiceIdx, stepIdx, next)
}

// ── Style generation ───────────────────────────────────────────────────────────
function generatePattern() {
  drumStore.generateDrumPattern(selectedStyle.value)
  if (generateAsFill.value) {
    const raw = drumStore.generateDrumPatternRaw(selectedStyle.value)
    if (raw) {
      fillPattern.value = raw.map(track => track.map(s => ({ ...s })))
      if (drumStore.isPlaying) playStateRef.current = buildPlayState()
    }
  }
  showStyleMenu.value = false
}

// ── Imported patterns ───────────────────────────────────────────────────────────
const currentCatPatterns = computed(() => {
  return drumStore.IMPORTED_PATTERNS[selectedCategory.value] || []
})

const sortedImportCats = computed(() =>
  Object.keys(drumStore.IMPORTED_PATTERNS).sort()
)

function loadImportedPattern() {
  drumStore.loadImportedPattern(selectedCategory.value, selectedPattern.value)
  showImportMenu.value = false
}

function selectCategory(cat) {
  selectedCategory.value = cat
  selectedPattern.value = 0
}

function loadSelectedPattern() {
  const p = currentCatPatterns.value[selectedPattern.value]
  if (p) {
    lastImportedPattern.value = { category: selectedCategory.value, title: p.title }
    _importedCategoryIdx = sortedImportCats.value.indexOf(selectedCategory.value)
    _importedPatternIdx = selectedPattern.value
  }
  drumStore.loadImportedPattern(selectedCategory.value, selectedPattern.value)
  showImportMenu.value = false
}

function navigateImport(dir) {
  const cats = sortedImportCats.value
  if (!cats.length) return
  const catPatterns = drumStore.IMPORTED_PATTERNS[cats[_importedCategoryIdx]]
  if (!catPatterns?.length) return

  _importedPatternIdx += dir

  if (_importedPatternIdx < 0) {
    _importedCategoryIdx = (_importedCategoryIdx - 1 + cats.length) % cats.length
    const prevCat = drumStore.IMPORTED_PATTERNS[cats[_importedCategoryIdx]]
    _importedPatternIdx = prevCat ? prevCat.length - 1 : 0
  } else if (_importedPatternIdx >= catPatterns.length) {
    _importedCategoryIdx = (_importedCategoryIdx + 1) % cats.length
    _importedPatternIdx = 0
  }

  const cat = cats[_importedCategoryIdx]
  const p = drumStore.IMPORTED_PATTERNS[cat]?.[_importedPatternIdx]
  if (!p) return
  lastImportedPattern.value = { category: cat, title: p.title }
  selectedCategory.value = cat
  selectedPattern.value = _importedPatternIdx
  drumStore.loadImportedPattern(cat, _importedPatternIdx)
}

// ── Step right-click context ───────────────────────────────────────────────────
function openStepContext(trackIdx, stepIdx, event) {
  event.preventDefault()
  const toolbarH = 48
  const dialogH = 260
  const maxY = window.innerHeight - toolbarH - dialogH
  stepContextMenu.value = { trackIdx, stepIdx, x: event.clientX, y: Math.min(event.clientY, maxY) }
}

function closeStepContext() {
  stepContextMenu.value = null
  basslineStepContextMenu.value = null
}

function setContextVelocity(v) {
  if (!stepContextMenu.value) return
  drumStore.setStep(stepContextMenu.value.trackIdx, stepContextMenu.value.stepIdx, { velocity: parseInt(v) })
}

function setContextAccent(v) {
  if (!stepContextMenu.value) return
  drumStore.setStep(stepContextMenu.value.trackIdx, stepContextMenu.value.stepIdx, { accent: v })
}

function setContextRatchet(v) {
  if (!stepContextMenu.value) return
  drumStore.setStep(stepContextMenu.value.trackIdx, stepContextMenu.value.stepIdx, { ratchet: v })
}

function setContextTie(v) {
  if (!stepContextMenu.value) return
  drumStore.setStep(stepContextMenu.value.trackIdx, stepContextMenu.value.stepIdx, { tie: v })
}

// ── Bassline step right-click context ──────────────────────────────────────────
function openBasslineStepContext(voiceIdx, stepIdx, event) {
  event.preventDefault()
  const bottomMargin = 80
  const dialogH = 300
  let y = event.clientY
  if (y + dialogH > window.innerHeight - bottomMargin) {
    y = Math.max(bottomMargin, event.clientY - dialogH)
  }
  basslineStepContextMenu.value = { voiceIdx, stepIdx, x: event.clientX, y }
}

function closeBasslineStepContext() {
  basslineStepContextMenu.value = null
}

function setBasslineContextVelocity(v) {
  if (!basslineStepContextMenu.value) return
  drumStore.setBasslineStep(basslineStepContextMenu.value.voiceIdx, basslineStepContextMenu.value.stepIdx, { velocity: parseInt(v) })
}

function setBasslineContextAccent(v) {
  if (!basslineStepContextMenu.value) return
  drumStore.setBasslineStep(basslineStepContextMenu.value.voiceIdx, basslineStepContextMenu.value.stepIdx, { accent: v })
}

function setBasslineContextRatchet(v) {
  if (!basslineStepContextMenu.value) return
  drumStore.setBasslineStep(basslineStepContextMenu.value.voiceIdx, basslineStepContextMenu.value.stepIdx, { ratchet: v })
}

function setBasslineContextTie(v) {
  if (!basslineStepContextMenu.value) return
  drumStore.setBasslineStep(basslineStepContextMenu.value.voiceIdx, basslineStepContextMenu.value.stepIdx, { tie: v })
}

function setBasslineContextNote(v) {
  if (!basslineStepContextMenu.value) return
  drumStore.setBasslineStep(basslineStepContextMenu.value.voiceIdx, basslineStepContextMenu.value.stepIdx, { note: parseInt(v) })
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function velOpacity(velocity) {
  if (velocity <= 30)  return 'opacity-30'
  if (velocity <= 50)  return 'opacity-50'
  if (velocity <= 100) return 'opacity-75'
  return ''
}

function stepClass(step, stepIdx, isCurrentStep, trackLength) {
  if (stepIdx >= trackLength) {
    return 'bg-neutral-900/60 border-neutral-800/40 opacity-30 cursor-not-allowed'
  }
  const isCurrent = isCurrentStep && drumStore.isPlaying
  const baseRing = isCurrent ? 'ring-2 ring-white/70' : ''
  if (!step.active) return `bg-zinc-800 border-zinc-700 hover:bg-zinc-700 ${baseRing}`
  const op = velOpacity(step.velocity)
  if (step.accent)  return `bg-yellow-400 border-yellow-300 shadow-[0_0_12px_rgba(250,204,21,0.7)] ${op} ${baseRing}`
  return `bg-purple-600 border-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.5)] ${op} ${baseRing}`
}

const SEQUENCES = ['A', 'B', 'C', 'D', 'E', 'F']

// ── Pattern chain ───────────────────────────────────────────────────────────────
const showChain      = ref(false)
const chainEnabled   = ref(false)
const chainLength    = ref(16)
const chain          = ref(Array(16).fill(null))
const chainSlotRef   = ref(-1)
let _chainSlotIdx    = -1

function resizeChain(len) {
  const clamped = Math.max(2, Math.min(16, len))
  const prev = chain.value
  if (clamped === prev.length) return
  chainLength.value = clamped
  chain.value = Array.from({ length: clamped }, (_, i) => prev[i] ?? null)
  if (_chainSlotIdx >= clamped) _chainSlotIdx = 0
}

const autofillEnabled = ref(false)
const autofillEvery   = ref(4)
let _measureCount     = 0

const stopAtEnd    = ref(false)
const endWithFill  = ref(false)
const pendingStop  = ref(false)
let   _pendingStop = false

function handlePlayStop() {
  if (!drumStore.isPlaying) { drumStore.isPlaying = true; return }
  if (_pendingStop) { _pendingStop = false; pendingStop.value = false; drumStore.isPlaying = false; return }
  if (stopAtEnd.value) {
    _pendingStop = true
    pendingStop.value = true
    if (endWithFill.value) { generateFill(); triggerFill() }
  } else {
    drumStore.isPlaying = false
  }
}

function cycleChainSlot(i) {
  const order = [null, 'A', 'B', 'C', 'D', 'E', 'F']
  chain.value[i] = order[(order.indexOf(chain.value[i]) + 1) % order.length]
}
</script>

<template>
  <Teleport to="body">
    <div
      v-show="uiStore.isDrumMachineOpen && !isMinimized"
      :style="panelStyle"
      class="fixed bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden select-none"
      @mousedown="bringToFront"
      @click="closeStepContext"
    >
      <!-- ── Header ──────────────────────────────────────────────────────────── -->
      <div
        class="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-neutral-800 bg-gradient-to-r from-sky-950/70 to-transparent cursor-grab active:cursor-grabbing"
        @mousedown.stop="onDragStart"
      >
        <Drum class="w-3.5 h-3.5 text-purple-400 shrink-0" />
        <span class="text-[11px] font-black uppercase tracking-widest text-white">Drum Machine</span>

        <!-- BPM display -->
        <span class="ml-2 text-[12px] font-mono bg-black p-1 rounded-lg px-2 text-synth-neon">{{ drumStore.bpm }} BPM</span>

        

        
        <!-- Style generator -->
        <div class="relative ml-2 flex items-center gap-1" title="Style generator">
          <button
            @click.stop="showStyleMenu = !showStyleMenu"
            class="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:border-neutral-500 transition-colors"
          >
            <Zap class="w-3.5 h-3.5 text-amber-400" />
            {{ selectedStyle }}
            <ChevronDown class="w-3.5 h-3.5 ml-0.5" />
          </button>
          <div
            v-if="showStyleMenu"
            class="absolute top-full left-0 mt-1 z-50 bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl overflow-hidden"
            @click.stop
          >
            <button
              v-for="style in DRUM_STYLE_NAMES"
              :key="style"
              @click="selectedStyle = style; showStyleMenu = false"
              :class="[
                'block w-full text-left px-3 py-2 text-[11px] font-bold transition-colors',
                selectedStyle === style
                  ? 'bg-purple-600/30 text-purple-300'
                  : 'text-neutral-300 hover:bg-neutral-800'
              ]"
            >{{ style }}</button>
          </div>
        </div>

        <div class="flex items-center gap-1">
          <!-- <button
            @click.stop="generateAsFill = !generateAsFill"
            :class="[
              'px-2 py-1 rounded border text-[9px] font-black uppercase tracking-widest transition-colors',
              generateAsFill
                ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-500 hover:text-white'
            ]"
            title="When active, Generate writes to Fill pattern instead of sequence"
          >→Fill</button> -->
          <div class="relative -mt-0.5" :class="mappingStore.mappedParams.has('dm_generate') ? 'ring-1 ring-amber-500/60 rounded-lg' : ''">
            <button
              @click.stop="generatePattern"
              @contextmenu.prevent="openMenu($event, { name: 'dm_generate', label: 'Drum Machine: Generate' })"
              :class="[
                'px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors',
                generateAsFill
                  ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/40'
                  : 'border-amber-600 bg-amber-600/20 text-amber-300 hover:bg-amber-600/40'
              ]"
            >Generate</button>
            <span
              v-if="mappingStore.learningParamName === 'dm_generate'"
              class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none z-50"
            />
          </div>
        </div>

        <!-- Imported patterns -->
        <div class="relative ml-1" title="Import patterns from book collections">
          <div class="flex items-center gap-1">
            <button
            @click.stop="showImportMenu = !showImportMenu"
            class="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:border-neutral-500 transition-colors"
            >
            <Layers class="w-3.5 h-3.5 text-cyan-400" />
            Import
          </button>
          
          <div v-if="lastImportedPattern" class="flex items-center gap-0.5 ml-1">
            <button
              @click.stop="navigateImport(-1)"
              class="w-5 h-5 flex items-center justify-center rounded border border-neutral-700 bg-neutral-800 text-neutral-500 hover:text-cyan-300 hover:border-cyan-600 transition-colors text-[10px] font-black leading-none"
              title="Previous pattern"
            >‹</button>
            <button
              @click.stop="navigateImport(1)"
              class="w-5 h-5 flex items-center justify-center rounded border border-neutral-700 bg-neutral-800 text-neutral-500 hover:text-cyan-300 hover:border-cyan-600 transition-colors text-[10px] font-black leading-none"
              title="Next pattern"
            >›</button>
          </div>
          <span
            v-if="lastImportedPattern"
            class="ml-2 text-[11px] font-mono text-cyan-500/70 truncate max-w-[120px]"
            :title="lastImportedPattern.category + ' · ' + lastImportedPattern.title"
            >
            {{ lastImportedPattern.title }}
          </span>
        </div>

          <!-- Modal dialog -->
          <Teleport to="body">
            <div
              v-if="showImportMenu"
              class="fixed inset-0 z-[9999] flex items-center justify-center"
              @click.stop="showImportMenu = false"
            >
              <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />
              <div
                class="relative bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl overflow-hidden w-[520px] max-h-[480px] flex flex-col"
                @click.stop
              >
                <!-- Header -->
                <div class="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
                  <span class="text-[11px] font-black uppercase tracking-widest text-white">Import Pattern</span>
                  <button
                    @click="showImportMenu = false"
                    class="p-1 rounded-lg hover:bg-neutral-800 text-neutral-500 hover:text-white transition-colors"
                  >
                    <X class="w-4 h-4" />
                  </button>
                </div>

                <!-- Body: two columns -->
                <div class="flex flex-1 overflow-hidden">
                  <!-- Left column: categories -->
                  <div class="w-1/2 border-r border-neutral-800 overflow-y-auto custom-scrollbar">
                    <button
                      v-for="cat in sortedImportCats"
                      :key="cat"
                      @click="selectCategory(cat)"
                      :class="[
                        'block w-full text-left px-4 py-2.5 text-[11px] font-bold transition-colors border-b border-neutral-800/50',
                        selectedCategory === cat
                          ? 'bg-cyan-600/20 text-cyan-300 border-l-2 border-l-cyan-400'
                          : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
                      ]"
                    >
                      <span>{{ cat }}</span>
                      <span class="ml-1.5 text-[9px] font-mono text-neutral-600">({{ drumStore.IMPORTED_PATTERNS[cat].length }})</span>
                    </button>
                  </div>

                  <!-- Right column: patterns -->
                  <div class="w-1/2 overflow-y-auto custom-scrollbar">
                    <button
                      v-for="(p, idx) in currentCatPatterns"
                      :key="idx"
                      @click="selectedPattern = idx"
                      :class="[
                        'block w-full text-left px-4 py-2 text-[10px] font-medium transition-colors border-b border-neutral-800/30',
                        selectedPattern === idx
                          ? 'bg-cyan-600/15 text-cyan-200 border-l-2 border-l-cyan-400'
                          : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200'
                      ]"
                    >
                      <span>{{ p.title }}</span>
                      <span class="ml-1.5 text-[8px] font-mono text-neutral-700">{{ p.signature }}</span>
                    </button>
                    <div v-if="currentCatPatterns.length === 0" class="p-4 text-[10px] text-neutral-600 text-center">
                      No patterns
                    </div>
                  </div>
                </div>

                <!-- Footer -->
                <div class="flex items-center justify-between px-4 py-3 border-t border-neutral-800 bg-neutral-900">
<span class="text-[9px] text-neutral-600 font-mono">
  {{ currentCatPatterns.length }} pattern{{ currentCatPatterns.length !== 1 ? 's' : '' }} · {{ sortedImportCats.reduce((a, c) => a + (drumStore.IMPORTED_PATTERNS[c]?.length || 0), 0) }} total
</span>
                  <div class="flex items-center gap-2">
                    <button
                      @click="showImportMenu = false"
                      class="px-3 py-1.5 rounded-lg border border-neutral-700 text-neutral-400 text-[10px] font-bold hover:bg-neutral-800 hover:text-white transition-colors"
                    >Cancel</button>
                    <button
                      @click="loadSelectedPattern"
                      class="px-3 py-1.5 rounded-lg border border-cyan-600 bg-cyan-600/20 text-cyan-300 text-[10px] font-bold hover:bg-cyan-600/40 transition-colors"
                    >
                      <Layers class="w-3 h-3 inline mr-1" />
                      Load
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </Teleport>
        </div>

        <div class="flex-1" />

        <!-- Presets button -->
        <button
          @click.stop="showPresets = !showPresets"
          :class="[
            'flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold transition-colors',
            showPresets
              ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
              : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-white'
          ]"
          title="Patterns"
        >
          <FolderOpen class="w-2.5 h-2.5" />
          Patterns
        </button>

        <!-- Kits button -->
        <button
          @click.stop="showKits = !showKits"
          :class="[
            'flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold transition-colors',
            showKits
              ? 'bg-amber-600/30 border-amber-500 text-amber-300'
              : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-white'
          ]"
          title="Drum Kits — save/load sound assignments"
        >
          <Save class="w-2.5 h-2.5" />
          Kits
        </button>

        <!-- Bassline toggle -->
        <button
          @click.stop="toggleShowBassline"
          :class="[
            'flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold transition-colors',
            showBassline
              ? 'bg-violet-600/30 border-violet-500 text-violet-300'
              : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-white'
          ]"
          title="Bassline — melodic sample sequencer (uses slots 8-10)"
        >
          <Music2 class="w-2.5 h-2.5" />
          Bass
        </button>

        <!-- Copy pattern -->
        <div class="relative" title="Copy pattern">
          <button
            v-if="!copySourceSeq"
            @click.stop="copySourceSeq = drumStore.activeSequence"
            class="p-1.5 text-neutral-500 hover:text-white transition-colors rounded-full hover:bg-white/5"
            title="Copy current sequence"
          >
            <Copy class="w-3.5 h-3.5" />
          </button>
          <div v-else class="flex items-center gap-1" @click.stop>
            <span class="text-[9px] text-amber-400 font-mono">Paste to:</span>
            <button
              v-for="seq in SEQUENCES.filter(s => s !== copySourceSeq)"
              :key="seq"
              @click="drumStore.copyPattern(copySourceSeq, seq); copySourceSeq = null"
              class="w-5 h-5 text-[9px] font-black rounded border border-amber-500 bg-amber-600/20 text-amber-300 hover:bg-amber-600/40"
            >{{ seq }}</button>
            <button @click="copySourceSeq = null" class="p-0.5 text-neutral-500 hover:text-white">
              <X class="w-3 h-3" />
            </button>
          </div>
        </div>

        <!-- Copy sounds -->
        <div class="relative" title="Copy sounds to another slot">
          <button
            v-if="!copySoundsSourceSeq"
            @click.stop="copySoundsSourceSeq = drumStore.activeSequence"
            class="p-1.5 text-neutral-500 hover:text-sky-300 transition-colors rounded-full hover:bg-sky-500/10"
            title="Copy sounds to another slot"
          >
            <Music2 class="w-3.5 h-3.5" />
          </button>
          <div v-else class="flex items-center gap-1" @click.stop>
            <span class="text-[9px] text-sky-400 font-mono">Sounds to:</span>
            <button
              v-for="seq in SEQUENCES.filter(s => s !== copySoundsSourceSeq)"
              :key="seq"
              @click="copySoundsTo(seq)"
              class="w-5 h-5 text-[9px] font-black rounded border border-sky-500 bg-sky-600/20 text-sky-300 hover:bg-sky-600/40"
            >{{ seq }}</button>
            <button @click="copySoundsSourceSeq = null" class="p-0.5 text-neutral-500 hover:text-white">
              <X class="w-3 h-3" />
            </button>
          </div>
        </div>

        <!-- Clear pattern -->
        <button
          @click.stop="drumStore.clearPattern()"
          class="p-1.5 text-neutral-500 hover:text-red-400 transition-colors rounded-full hover:bg-red-500/10"
          title="Clear current pattern"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>

        <!-- Init (clear everything) -->
        <div class="flex items-center gap-1" @click.stop>
          <template v-if="!initConfirm">
            <button
              @click="initConfirm = true"
              class="px-2 py-0.5 rounded border border-neutral-700 bg-neutral-800 text-neutral-500 text-[9px] font-black uppercase tracking-widest hover:border-red-600 hover:text-red-400 transition-colors"
              title="Init: clear all sequences and sounds"
            >Init</button>
          </template>
          <template v-else>
            <span class="text-[9px] text-red-400 font-bold">Clear all?</span>
            <button
              @click="drumStore.initDrumMachine(); initConfirm = false"
              class="px-2 py-0.5 rounded border border-red-600 bg-red-600/20 text-red-300 text-[9px] font-black hover:bg-red-600/40 transition-colors"
            >Yes</button>
            <button
              @click="initConfirm = false"
              class="px-2 py-0.5 rounded border border-neutral-700 bg-neutral-800 text-neutral-400 text-[9px] font-black hover:text-white transition-colors"
            >No</button>
          </template>
        </div>

        <MacOsButtons @close="uiStore.isDrumMachineOpen = false" @minimize="toggleMinimize" @maximize="maximize" />
      </div>

      <!-- ── Preset panel ───────────────────────────────────────────────────── -->
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="opacity-0 -translate-y-1"
        leave-active-class="transition-all duration-150 ease-in"
        leave-to-class="opacity-0 -translate-y-1"
      >
        <div v-if="showPresets" class="shrink-0 border-b border-neutral-800 bg-neutral-900/80 px-4 py-3 space-y-2" @click.stop>
          <!-- Save row -->
          <div class="flex items-center gap-2">
            <input
              v-model="newPresetName"
              placeholder="Pattern name…"
              class="flex-1 bg-black/40 border border-neutral-700 rounded-lg px-3 py-1.5 text-[10px] text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 font-mono"
              @keydown.enter="handleSavePreset"
            />
            <button
              @click="handleSavePreset"
              class="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-emerald-600 bg-emerald-600/20 text-emerald-300 text-[10px] font-bold hover:bg-emerald-600/40 transition-colors shrink-0"
            >
              <Save class="w-2.5 h-2.5" />
              Save
            </button>
          </div>

          <!-- Preset list -->
          <div v-if="drumStore.presets.length" class="space-y-1 max-h-36 overflow-y-auto custom-scrollbar pr-1">
            <div
              v-for="preset in [...drumStore.presets].reverse()"
              :key="preset.id"
              class="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-neutral-800/50 border border-neutral-800 hover:border-neutral-700 group"
            >
              <span class="flex-1 text-[10px] font-bold text-white truncate">{{ preset.name }}</span>
              <span class="text-[8px] font-mono text-neutral-600 shrink-0">
                {{ new Date(preset.savedAt).toLocaleDateString() }}
              </span>
              <button
                @click="handleLoadPreset(preset)"
                title="Load patterns"
                class="shrink-0 px-2 py-0.5 rounded border border-emerald-700 bg-emerald-700/20 text-emerald-300 text-[8px] font-bold hover:bg-emerald-700/40 transition-colors"
              >Load</button>
              <button
                @click="overwritePresetWithToast(preset.id)"
                class="shrink-0 p-0.5 text-amber-600 hover:text-amber-300 transition-colors opacity-0 group-hover:opacity-100"
                title="Overwrite with current patterns"
              >
                <Save class="w-3 h-3" />
              </button>
              <button
                @click="drumStore.deletePreset(preset.id)"
                class="shrink-0 p-0.5 text-neutral-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
              >
                <X class="w-3 h-3" />
              </button>
            </div>
          </div>
          <p v-else class="text-[9px] text-neutral-600 font-mono text-center py-1">No patterns saved yet</p>
        </div>
      </Transition>

      <!-- ── Drum Kit panel ───────────────────────────────────────────────── -->
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="opacity-0 -translate-y-1"
        leave-active-class="transition-all duration-150 ease-in"
        leave-to-class="opacity-0 -translate-y-1"
      >
        <div v-if="showKits" class="shrink-0 border-b border-neutral-800 bg-neutral-900/80 px-4 py-3 space-y-2" @click.stop>
          <!-- Save row -->
          <div class="flex items-center gap-2">
            <input
              v-model="newKitName"
              placeholder="Kit name…"
              class="flex-1 bg-black/40 border border-neutral-700 rounded-lg px-3 py-1.5 text-[10px] text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500 font-mono"
              @keydown.enter="handleSaveKit"
            />
            <button
              @click="handleSaveKit"
              class="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-amber-600 bg-amber-600/20 text-amber-300 text-[10px] font-bold hover:bg-amber-600/40 transition-colors shrink-0"
            >
              <Save class="w-2.5 h-2.5" />
              Save Kit
            </button>
          </div>

          <!-- Kit list -->
          <div v-if="drumStore.drumKits.length" class="space-y-1 max-h-36 overflow-y-auto custom-scrollbar pr-1">
            <div
              v-for="kit in [...drumStore.drumKits].reverse()"
              :key="kit.id"
              class="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-neutral-800/50 border border-neutral-800 hover:border-neutral-700 group"
            >
              <span class="flex-1 text-[10px] font-bold text-white truncate">{{ kit.name }}</span>
              <span class="text-[8px] font-mono text-neutral-600 shrink-0">
                {{ new Date(kit.savedAt).toLocaleDateString() }}
              </span>
              <button
                @click="handleApplyKit(kit.id)"
                class="shrink-0 px-2 py-0.5 rounded border border-amber-700 bg-amber-700/20 text-amber-300 text-[8px] font-bold hover:bg-amber-700/40 transition-colors"
              >Load</button>
              <button
                @click="overwriteKitWithToast(kit.id)"
                class="shrink-0 p-0.5 text-amber-600 hover:text-amber-300 transition-colors opacity-0 group-hover:opacity-100"
                title="Overwrite with current sound assignments"
              >
                <Save class="w-3 h-3" />
              </button>
              <button
                @click="drumStore.deleteDrumKit(kit.id)"
                class="shrink-0 p-0.5 text-neutral-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
              >
                <X class="w-3 h-3" />
              </button>
            </div>
          </div>
          <p v-else class="text-[9px] text-neutral-600 font-mono text-center py-1">No kits saved yet</p>
        </div>
      </Transition>

      <!-- ── Step ruler ─────────────────────────────────────────────────────── -->
      <div class="shrink-0 flex items-center gap-2 px-3 pt-1.5 pb-0.5">
        <div style="width: 92px" class="shrink-0" />
        <div class="flex flex-col shrink-0"><div class="w-5 h-1" /><div class="w-5 h-1" /></div>
        <div class="relative shrink-0"><div class="w-12 h-1" /></div>
        <div class="flex flex-col shrink-0"><div class="w-6 h-1" /><div class="w-6 h-1" /><div class="w-6 h-1" /></div>
        <div class="flex-1 flex gap-2">
          <div v-for="g in 4" :key="g" class="flex-1 grid grid-cols-4 gap-1.5">
            <div
              v-for="l in 4" :key="l"
              :class="[
                'text-center text-[8px] font-mono leading-none select-none',
                drumStore.isPlaying && drumStore.currentStep === (g-1)*4+(l-1)
                  ? 'text-white font-bold'
                  : l === 1 ? 'text-neutral-400' : 'text-neutral-700'
              ]"
            >{{ (g-1)*4+l }}</div>
          </div>
        </div>
      </div>

      <!-- ── Kit name header ─────────────────────────────────────────────────── -->
      <div v-if="drumStore.currentKitName" class="shrink-0 px-3 pt-1.5 pb-0.5">
        <div class="flex items-center gap-1.5" style="width: 92px;">
          <span class="text-[8px] font-mono font-bold uppercase tracking-widest text-amber-500/80 truncate" :title="'DrumKit:' + drumStore.currentKitName">{{ drumStore.currentKitName }}</span>
        </div>
      </div>

      <!-- ── Track grid ──────────────────────────────────────────────────────── -->
      <div class="flex-1 overflow-y-auto custom-scrollbar px-3 py-2 space-y-1 min-h-0">
        <div
          v-for="(track, trackIdx) in drumStore.currentPattern"
          :key="trackIdx"
          v-show="!(hideBasslineSlots && [8, 9, 10].includes(trackIdx))"
          class="flex flex-col rounded bg-neutral-900/50 transition-colors"
        >
        <div class="flex items-center gap-2">
          <!-- Track label + load sample -->
          <div
            class="relative flex items-center gap-1 shrink-0 p-1 rounded-lg"
            style="width: 92px;"
            @dragover.prevent
            @drop="handleTrackUrlDrop(trackIdx, $event)"
            @contextmenu.prevent="openMenu($event, { name: 'dm_pad_' + trackIdx, label: 'Drum Machine: ' + track.label })"
            :class="mappingStore.mappedParams.has('dm_pad_' + trackIdx) ? 'ring-1 ring-amber-500/60' : ''"
          >
            <label
              @click.stop="openFolderBrowserForTrack(trackIdx)"
              :title="drumStore.resolveTrackSound(trackIdx)?.soundLabel
                ? `${track.label}: ${drumStore.resolveTrackSound(trackIdx)?.soundLabel}`
                : `Load sample for ${track.label}`"
              class="flex-1 min-w-0 cursor-pointer hover:text-purple-300 hover:bg-indigo-800/70 bg-indigo-800/30 p-1 rounded transition-colors"
            >
              <div class="text-[11px] font-bold text-neutral-300 truncate leading-none">{{ track.label }}</div>
              <div
                
                v-if="drumStore.resolveTrackSound(trackIdx)?.soundLabel"
                :class="[
                  'text-[9px] truncate leading-none mt-0.5',
                  drumStore.resolveTrackSound(trackIdx)?.own ? 'text-purple-400' : 'text-neutral-500'
                ]"
              >{{ drumStore.resolveTrackSound(trackIdx)?.soundLabel }}</div>
              <!-- <input type="file" accept="audio/*" class="hidden" @change="handleTrackFileLoad(trackIdx, $event)" /> -->
            </label>
            <button
              @click.stop="openFolderBrowserForTrack(trackIdx)"
              class="shrink-0 w-3.5 h-3.5 flex items-center justify-center text-neutral-500 hover:text-purple-300 transition-colors"
              title="Browse sound folder"
            >
              <FolderOpen class="w-2.5 h-2.5" />
            </button>
            <button
              v-if="drumStore.resolveTrackSound(trackIdx)?.soundId"
              @click.stop="previewPad(trackIdx)"
              class="shrink-0 w-3.5 h-3.5 flex items-center justify-center hover:text-purple-200 transition-colors"
              :class="drumStore.resolveTrackSound(trackIdx)?.own ? 'text-purple-400' : 'text-neutral-500'"
              title="Preview sample"
            >
              <svg viewBox="0 0 8 8" class="w-2 h-2 fill-current"><polygon points="0,0 8,4 0,8"/></svg>
            </button>
            <div
              v-else
              class="w-1.5 h-1.5 rounded-full shrink-0 border bg-neutral-700 border-neutral-600"
              title="No sample loaded"
            />
            <span
              v-if="mappingStore.learningParamName === ('dm_pad_' + trackIdx)"
              class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none z-50"
            />
          </div>

          <!-- Mute / Solo -->
          <div class="flex flex-col items-center gap-1">
            <button
              @click.stop="drumStore.toggleTrackMute(trackIdx)"
              :class="[
                'shrink-0 w-5 h-5 rounded border text-[8px] font-black transition-colors',
                track.muted
                  ? 'bg-red-600/30 border-red-500 text-red-300'
                  : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:text-white hover:border-neutral-500'
              ]"
              title="Mute"
            >M</button>

            <!-- Solo -->
            <button
              @click.stop="drumStore.toggleTrackSolo(trackIdx)"
              :class="[
                'shrink-0 w-5 h-5 rounded border text-[8px] font-black transition-colors',
                track.solo
                  ? 'bg-amber-500/30 border-amber-400 text-amber-300'
                  : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:text-white hover:border-neutral-500'
              ]"
              title="Solo"
            >S</button>
          </div>
          <!-- Volume knob (compact fader) -->
          <div
            class="flex flex-col relative shrink-0 gap-2"
            :class="mappingStore.mappedParams.has('dm_vol_' + trackIdx) ? 'ring-1 ring-amber-500/60 rounded' : ''"
            @contextmenu.prevent="openMenu($event, { name: 'dm_vol_' + trackIdx, label: 'Drum Machine: ' + track.label + ' Vol' })"
          >
            <input
              type="range"
              min="0" max="1" step="0.01"
              :value="track.volume"
              @input="drumStore.setTrackVolume(trackIdx, parseFloat($event.target.value))"
              class="w-12 h-1 accent-purple-500 cursor-pointer"
              title="Volume"
            />
            <span
              v-if="mappingStore.learningParamName === ('dm_vol_' + trackIdx)"
              class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none z-50"
            />
            <!-- FX toggle -->
            <button
              @click.stop="showFx[trackIdx] = !showFx[trackIdx]"
              :class="[
                'shrink-0 w-10 h-5 text-center rounded border text-[8px] font-black transition-colors',
                showFx[trackIdx]
                  ? 'bg-violet-600/30 border-violet-500 text-violet-300'
                  : trackHasFx(track)
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 hover:bg-cyan-500/30'
                    : 'bg-neutral-800 border-neutral-700 text-neutral-600 hover:border-violet-600 hover:text-violet-400'
              ]"
              title="Toggle FX strip"
            >FX</button>
          </div>
          <div class="flex flex-col items-center gap-1">
            <!-- Randomize velocity for this row -->
            <button
              @click.stop="drumStore.randomizeVelocity(trackIdx)"
              class="shrink-0 w-6 h-5 flex items-center justify-center rounded border border-neutral-700 bg-neutral-800 text-neutral-600 hover:text-purple-300 hover:border-purple-500 transition-colors"
              title="Randomize velocity"
            >
              <Shuffle class="w-2.5 h-2.5" />
            </button>
            <!-- Step count (1-16) -->
            <button
              @click.stop="drumStore.setTrackLength(trackIdx, track.length < 16 ? track.length + 1 : 1)"
              @contextmenu.prevent="drumStore.setTrackLength(trackIdx, track.length > 1 ? track.length - 1 : 16)"
              @wheel.prevent="drumStore.setTrackLength(trackIdx, Math.max(1, Math.min(16, track.length - Math.sign($event.deltaY))))"
              class="shrink-0 w-6 h-5 text-center bg-neutral-800 border border-neutral-700 rounded text-[9px] font-mono hover:border-purple-500 transition-colors"
              :class="track.length < 16 ? 'text-purple-400 border-purple-700' : 'text-neutral-500'"
              title="Steps per bar · click +1 · right-click −1 · scroll"
            >{{ track.length }}</button>
            
          </div>
          <!-- Step buttons -->
          <div class="flex-1 flex gap-2">
            <div v-for="g in 4" :key="g" class="flex-1 grid grid-cols-4 gap-1.5">
              <button
                v-for="l in 4" :key="l"
                :class="[
                  'relative h-12 rounded-sm border text-[7px] font-bold transition-colors focus:outline-none',
                  stepClass(track.steps[(g-1)*4+(l-1)], (g-1)*4+(l-1), drumStore.currentStep === (g-1)*4+(l-1), track.length),
                ]"
                @click.stop="(g-1)*4+(l-1) < track.length && drumStore.toggleStep(trackIdx, (g-1)*4+(l-1))"
                @contextmenu="(g-1)*4+(l-1) < track.length && openStepContext(trackIdx, (g-1)*4+(l-1), $event)"
              >
                <span
                  v-if="track.steps[(g-1)*4+(l-1)].active && track.steps[(g-1)*4+(l-1)].ratchet > 1 && (g-1)*4+(l-1) < track.length"
                  class="absolute top-0 right-0 text-[6px] leading-none font-black text-white bg-purple-800 rounded-bl px-0.5"
                >{{ track.steps[(g-1)*4+(l-1)].ratchet }}</span>
                <span
                  v-if="track.steps[(g-1)*4+(l-1)].active && track.steps[(g-1)*4+(l-1)].tie > 0 && (g-1)*4+(l-1) < track.length"
                  class="absolute bottom-0 right-0 text-[6px] leading-none font-black text-white bg-cyan-800 rounded-tl px-0.5"
                >T{{ track.steps[(g-1)*4+(l-1)].tie }}</span>
                <span
                  v-if="l === 1 && (g-1)*4 < track.length"
                  class="absolute bottom-0 left-0 w-full h-px bg-white/20"
                />
              </button>
            </div>
          </div>
        </div>

          <!-- FX strip -->
          <div v-if="showFx[trackIdx]" class="flex items-center gap-3 px-2 py-1.5 border-t border-violet-900/40 bg-violet-700/70">
            <span class="text-[9px] font-black uppercase tracking-widest text-white-400 shrink-0 w-4">FX</span>
            <!-- Pan -->
            <div class="flex items-center gap-1">
              <span class="text-[9px] text-neutral-400 shrink-0">Pan</span>
              <input type="range" min="-1" max="1" step="0.01"
                :value="track.pan ?? 0"
                @input="drumStore.setTrackFx(trackIdx, 'pan', parseFloat($event.target.value)); drumEngine.setPadPan(trackIdx, parseFloat($event.target.value))"
                class="w-16 h-1 accent-violet-500 cursor-pointer"
                title="Pan (-1 left → +1 right)"
              />
              <span class="text-[9px] font-mono text-neutral-400 w-6 text-right">{{ ((track.pan ?? 0) * 100).toFixed(0) }}</span>
            </div>
            <!-- Pitch -->
            <div class="flex items-center gap-1">
              <span class="text-[9px] text-neutral-400 shrink-0">Pitch</span>
              <input type="range" min="-12" max="12" step="1"
                :value="track.pitch ?? 0"
                @input="drumStore.setTrackFx(trackIdx, 'pitch', parseInt($event.target.value)); drumEngine.setPadPitch(trackIdx, parseInt($event.target.value))"
                class="w-14 h-1 accent-violet-500 cursor-pointer"
                title="Pitch (semitones)"
              />
              <span class="text-[9px] font-mono text-neutral-400 w-6 text-right">{{ (track.pitch ?? 0) > 0 ? '+' : '' }}{{ track.pitch ?? 0 }}st</span>
            </div>
            <!-- Filter -->
            <div class="flex items-center gap-1">
              <span class="text-[9px] text-neutral-400 shrink-0">Tone</span>
              <input type="range" min="200" max="20000" step="100"
                :value="track.filterFreq ?? 20000"
                @input="drumStore.setTrackFx(trackIdx, 'filterFreq', parseInt($event.target.value)); drumEngine.setPadFilter(trackIdx, parseInt($event.target.value))"
                class="w-16 h-1 accent-violet-500 cursor-pointer"
                title="Low-pass filter frequency"
              />
              <span class="text-[9px] font-mono text-neutral-400 w-10 text-right">{{ (track.filterFreq ?? 20000) >= 1000 ? ((track.filterFreq ?? 20000)/1000).toFixed(1)+'k' : (track.filterFreq ?? 20000) }}Hz</span>
            </div>
            <!-- Reverb send -->
            <div class="flex items-center gap-1">
              <span class="text-[9px] text-neutral-400 shrink-0">Rev</span>
              <input type="range" min="0" max="1" step="0.01"
                :value="track.reverbSend ?? 0"
                @input="drumStore.setTrackFx(trackIdx, 'reverbSend', parseFloat($event.target.value)); drumEngine.setPadReverbSend(trackIdx, parseFloat($event.target.value))"
                class="w-14 h-1 accent-cyan-500 cursor-pointer"
                title="Reverb send amount"
              />
              <span class="text-[9px] font-mono text-neutral-400 w-5 text-right">{{ Math.round((track.reverbSend ?? 0) * 100) }}</span>
            </div>
            <!-- Delay send -->
            <div class="flex items-center gap-1">
              <span class="text-[9px] text-neutral-400 shrink-0">Dly</span>
              <input type="range" min="0" max="1" step="0.01"
                :value="track.delaySend ?? 0"
                @input="drumStore.setTrackFx(trackIdx, 'delaySend', parseFloat($event.target.value)); drumEngine.setPadDelaySend(trackIdx, parseFloat($event.target.value))"
                class="w-14 h-1 accent-cyan-500 cursor-pointer"
                title="Delay send amount (1/8-note BPM-synced)"
              />
              <span class="text-[9px] font-mono text-neutral-400 w-5 text-right">{{ Math.round((track.delaySend ?? 0) * 100) }}</span>
            </div>
            <!-- FX copy / paste -->
            <div class="flex items-center gap-1 ml-auto shrink-0">
              <button
                @click.stop="copyTrackFx(track)"
                class="px-1.5 h-4 text-[8px] font-black rounded border border-neutral-600 bg-neutral-800 text-neutral-400 hover:border-cyan-500 hover:text-cyan-300 transition-colors"
                title="Copy FX settings"
              >COPY FX</button>
              <template v-if="fxClipboard">
                <button
                  v-for="seq in ['A','B','C','D','E','F']"
                  :key="seq"
                  @click.stop="pasteTrackFxTo(trackIdx, seq)"
                  :class="[
                    'w-4 h-4 text-[7px] font-black rounded border transition-colors',
                    seq === drumStore.activeSequence
                      ? 'border-cyan-400 bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/40'
                      : 'border-neutral-600 bg-neutral-800 text-neutral-400 hover:border-cyan-500 hover:text-cyan-300'
                  ]"
                  :title="'Paste FX to pattern ' + seq"
                >{{ seq }}</button>
                <button
                  @click.stop="['A','B','C','D','E','F'].forEach(s => pasteTrackFxTo(trackIdx, s))"
                  class="px-1 h-4 text-[7px] font-black rounded border border-cyan-600 bg-cyan-900/30 text-cyan-400 hover:bg-cyan-500/30 hover:text-cyan-200 transition-colors"
                  title="Paste FX to all patterns"
                >ALL</button>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Bassline section ────────────────────────────────────────────────── -->
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="opacity-0 -translate-y-1"
        leave-active-class="transition-all duration-150 ease-in"
        leave-to-class="opacity-0 -translate-y-1"
      >
        <div v-if="showBassline" class="shrink-0 border-t border-violet-900/30 bg-violet-950/20">
          <!-- Header bar -->
          <div class="flex items-center gap-2 px-4 py-1.5 border-b border-violet-900/20">
            <Music2 class="w-3 h-3 text-violet-400" />
            <span class="text-[10px] font-black uppercase tracking-widest text-violet-300">Bassline</span>
            <span class="text-[8px] font-mono text-violet-600">slots {{ drumStore.basslineSourceSlots.join(', ') }}</span>
            <button
              @click.stop="hideBasslineSlots = !hideBasslineSlots"
              :class="[
                'px-1.5 py-0.5 rounded border text-[8px] font-black transition-colors',
                hideBasslineSlots
                  ? 'border-violet-600 bg-violet-600/20 text-violet-300'
                  : 'border-neutral-700 bg-neutral-800 text-neutral-500 hover:border-violet-600 hover:text-violet-300'
              ]"
              :title="hideBasslineSlots ? 'Show drum tracks 8-10' : 'Hide drum tracks 8-10'"
            >{{ hideBasslineSlots ? 'Show slots' : 'Hide slots' }}</button>
            <div class="flex-1" />
            <label class="flex items-center gap-1 text-[8px] text-neutral-500 cursor-pointer select-none">
              <input type="checkbox" v-model="drumStore.basslineActive" class="w-3 h-3 accent-violet-500 cursor-pointer" />
              Active
            </label>
            <button
              @click.stop="clearBasslinePattern"
              class="px-1.5 py-0.5 rounded border border-neutral-700 bg-neutral-800 text-neutral-500 text-[8px] font-black hover:border-red-600 hover:text-red-400 transition-colors"
              title="Clear bassline pattern"
            >CLR</button>
            <div class="flex items-center gap-1">
              <span class="text-[8px] font-mono text-violet-600">Root</span>
              <input
                v-model.number="basslineRootNote"
                type="number" min="12" max="60"
                @change="basslineRootNote = Math.max(12, Math.min(60, basslineRootNote || 24))"
                class="w-8 text-center text-[9px] font-bold bg-neutral-800 border border-neutral-700 rounded px-0.5 py-0.5 text-violet-300 focus:outline-none focus:border-violet-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                title="Root MIDI note (12 = C1, 24 = C2, 36 = C3, 48 = C4, 60 = C5)"
              />
            </div>
            <button
              @click.stop="drumStore.generateBassline(basslineRootNote)"
              class="flex items-center gap-1 px-2 py-0.5 rounded-lg border border-violet-600 bg-violet-600/20 text-violet-300 text-[9px] font-bold hover:bg-violet-600/40 transition-colors"
            >
              <Zap class="w-2.5 h-2.5 text-violet-300" />
              Generate
            </button>
          </div>

          <!-- Voice rows -->
          <div class="max-h-[200px] overflow-y-auto custom-scrollbar px-3 py-1.5 space-y-1">
            <div
              v-for="(voice, vi) in drumStore.currentBasslinePattern"
              :key="vi"
              class="flex items-center gap-2 rounded bg-violet-900/10 px-2 py-1"
            >
              <!-- Voice label + source slot -->
              <div class="shrink-0 flex items-center gap-1" style="width: 86px;">
                <span class="text-[10px] font-bold text-violet-300 truncate leading-none">{{ drumStore.TRACK_LABELS[drumStore.basslineSourceSlots[vi]] }} ({{ drumStore.basslineSourceSlots[vi] }})</span>
              </div>

              <!-- Mute / Solo -->
              <div class="flex flex-col items-center gap-1">
                <button
                  @click.stop="drumStore.toggleBasslineVoiceMute(vi)"
                  :class="[
                    'shrink-0 w-5 h-5 rounded border text-[11px] font-black transition-colors',
                    voice.muted
                      ? 'bg-red-600/30 border-red-500 text-red-300'
                      : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:text-white'
                  ]"
                  title="Mute"
                >M</button>
                <button
                  @click.stop="drumStore.toggleBasslineVoiceSolo(vi)"
                  :class="[
                    'shrink-0 w-5 h-5 rounded border text-[11px] font-black transition-colors',
                    voice.solo
                      ? 'bg-amber-500/30 border-amber-400 text-amber-300'
                      : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:text-white'
                  ]"
                  title="Solo"
                >S</button>
              </div>

              <!-- Pitch 0..24 -->
              <div class="flex flex-col items-center gap-1">
                <span class="text-[9px] font-mono text-violet-300 truncate leading-none">Pitch</span>
                <div class="flex items-center gap-1 shrink-0">
                  <button
                    @click.stop="drumStore.setBasslineVoicePitch(vi, (voice.pitch ?? 0) >= 24 ? 0 : (voice.pitch ?? 0) + 1)"
                    @contextmenu.prevent="drumStore.setBasslineVoicePitch(vi, Math.max(0, (voice.pitch ?? 0) - 1))"
                    @wheel.prevent="drumStore.setBasslineVoicePitch(vi, Math.max(0, Math.min(24, (voice.pitch ?? 0) - Math.sign($event.deltaY))))"
                    class="shrink-0 w-7 h-5 text-center bg-neutral-800 border border-neutral-700 rounded text-[11px] font-mono hover:border-violet-500 transition-colors"
                    :class="(voice.pitch ?? 0) > 0 ? 'text-violet-400 border-violet-700' : 'text-neutral-500'"
                    :title="'Pitch: +' + (voice.pitch ?? 0) + ' semitones · click +1 · right-click −1 · scroll'"
                  >+{{ voice.pitch ?? 0 }}</button>
                </div>
              </div>
              <!-- Steps -->
              <div class="flex flex-col items-center gap-1">
                <span class="text-[9px] font-mono text-violet-300 truncate leading-none">Steps</span>
              <button
                @click.stop="drumStore.setBasslineVoiceLength(vi, voice.length < 16 ? voice.length + 1 : 1)"
                @contextmenu.prevent="drumStore.setBasslineVoiceLength(vi, voice.length > 1 ? voice.length - 1 : 16)"
                class="shrink-0 w-7 h-5 text-center bg-neutral-800 border border-neutral-700 rounded text-[11px] font-mono hover:border-violet-500 transition-colors"
                :class="voice.length < 16 ? 'text-violet-400 border-violet-700' : 'text-neutral-500'"
                :title="'Steps: ' + voice.length"
              >{{ voice.length }}</button>
            </div>
              <!-- Step grid -->
              <div class="flex-1 flex gap-1 ml-3.5">
                <div v-for="g in 4" :key="g" class="flex-1 grid grid-cols-4 gap-0.5">
                  <button
                    v-for="l in 4" :key="l"
                    :class="[
                      'relative h-12 rounded-sm border text-[11px] font-mono transition-colors focus:outline-none',
                      (g-1)*4+(l-1) < voice.length ? '' : 'bg-neutral-900/60 border-neutral-800/40 opacity-30 cursor-not-allowed',
                      (g-1)*4+(l-1) < voice.length && drumStore.currentBasslinePattern[vi]?.steps[(g-1)*4+(l-1)]?.active
                        ? 'bg-amber-600/40 border-amber-400 shadow-[0_0_6px_rgba(139,92,246,0.4)]'
                        : 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700'
                    ]"
                    @click.stop="(g-1)*4+(l-1) < voice.length && drumStore.toggleBasslineStep(vi, (g-1)*4+(l-1))"
                    @contextmenu="(g-1)*4+(l-1) < voice.length && openBasslineStepContext(vi, (g-1)*4+(l-1), $event)"
                    @wheel.prevent="(g-1)*4+(l-1) < voice.length && onBasslineStepWheel(vi, (g-1)*4+(l-1), $event)"
                    @dblclick.stop="(g-1)*4+(l-1) < voice.length && captureBasslineMidiNote(vi, (g-1)*4+(l-1))"
                    :title="basslineStepTitle(vi, (g-1)*4+(l-1))"
                  >
                    <span v-if="(g-1)*4+(l-1) < voice.length && drumStore.currentBasslinePattern[vi]?.steps[(g-1)*4+(l-1)]?.active">
                      {{ midiNoteName(drumStore.currentBasslinePattern[vi]?.steps[(g-1)*4+(l-1)]?.note ?? 36) }}
                    </span>
                    <span
                      v-if="basslineMidiCapture === vi * 16 + (g-1)*4+(l-1)"
                      class="absolute inset-0 flex items-center justify-center text-[6px] font-black text-orange-400 bg-orange-500/20 rounded-sm"
                    >MIDI</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>

      <div class="flex items-center gap-2 px-3 py-2 border-t border-neutral-800 bg-neutral-900/40">
        <!-- Sequence tabs A-F -->
        <div class="flex items-center gap-1 ml-3 mb-2">
          <div
            v-for="seq in SEQUENCES"
            :key="seq"
            class="relative"
            :class="mappingStore.mappedParams.has('dm_seq_' + seq.toLowerCase()) ? 'ring-1 ring-amber-500/60 rounded' : ''"
          >
            <button
              @click.stop="clickSequenceTab(seq)"
              @contextmenu.prevent="openMenu($event, { name: 'dm_seq_' + seq.toLowerCase(), label: 'Drum Machine: Seq ' + seq })"
              :class="[
                'w-8 h-8 text-[11px] font-black rounded border transition-colors',
                drumStore.activeSequence === seq
                  ? 'bg-sky-900 border-sky-400 text-white'
                  : pendingSequence === seq
                    ? 'bg-neutral-800 border-sky-400/60 text-purple-300 animate-pulse'
                    : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-sky-500 hover:text-amber-300'
              ]"
              :title="pendingSequence === seq ? ('Switching to ' + seq + ' at next bar…') : seq"
            >{{ seq }}</button>
            <span
              v-if="mappingStore.learningParamName === ('dm_seq_' + seq.toLowerCase())"
              class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none z-50"
            />
          </div>
        </div>

        <!-- Sync Retrig -->
        <label
          class="flex items-center gap-1.5 mb-2 cursor-pointer select-none"
          title="TRUE = switch pattern on next first beat. FALSE = switch pattern immediately on click."
        >
          <input type="checkbox" v-model="syncRetrig" class="w-3 h-3 accent-sky-500 cursor-pointer" />
          <span class="text-[8px] font-mono uppercase tracking-widest text-neutral-400">Sync Retrig</span>
        </label>

        <!-- Chain ON -->
        <!-- <label class="flex items-center gap-1 mb-2 cursor-pointer select-none" title="Enable chain playback">
          <input type="checkbox" v-model="chainEnabled" class="w-3 h-3 accent-sky-500 cursor-pointer" />
          <span class="text-[8px] font-mono uppercase tracking-widest" :class="chainEnabled ? 'text-sky-400' : 'text-neutral-500'">Chain ON</span>
        </label> -->

        <!-- Chain panel toggle -->
        <button
          @click.stop="showChain = chainEnabled;chainEnabled = !chainEnabled"
          :class="[
            'flex items-center gap-1 px-2 py-1 mb-2 rounded-lg border text-[10px] font-bold transition-colors',
            chainEnabled
              ? 'bg-sky-600/30 border-sky-500 text-sky-300'
              : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-sky-500 hover:text-sky-300'
          ]"
          title="Pattern chain"
        >
          <Layers class="w-3.5 h-3.5" />
          Chain
        </button>

        <!-- Autofill -->
        <label class="flex items-center gap-1 mb-2 cursor-pointer select-none" title="Auto-generate and trigger a fill every N measures">
          <!-- <input type="checkbox" v-model="autofillEnabled" class="w-3 h-3 accent-cyan-500 cursor-pointer" /> -->
          <button @click.stop="autofillEnabled=!autofillEnabled" 
            :class="[
            'flex items-center gap-1 px-2 py-1  rounded-lg border text-[10px] font-bold transition-colors',
            autofillEnabled
              ? 'bg-sky-600/30 border-sky-500 text-sky-300'
              : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-sky-500 hover:text-sky-300'
          ]"
          title="Auto-generate and trigger a fill every N measures"
          ><Drum class="w-3.5 h-3.5" />Auto Fill</button>
          <!-- <span class="text-[8px] font-mono uppercase tracking-widest" :class="autofillEnabled ? 'text-cyan-400' : 'text-neutral-500'">Autofill</span> -->
          <input
            v-if="autofillEnabled"
            type="number"
            v-model.number="autofillEvery"
            min="1" max="128"
            @change="autofillEvery = Math.max(1, Math.min(128, autofillEvery || 1))"
            class="w-8 text-center text-[11px] font-bold bg-neutral-800 border border-neutral-700 rounded px-0.5 py-0.5 ml-1 text-neutral-400 focus:outline-none focus:border-cyan-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            title="Trigger fill every N measures"
          />
        </label>

        

        <!-- Play / Stop -->
        <div class="relative ml-3 mb-2" :class="mappingStore.mappedParams.has('dm_play_stop') ? 'ring-1 ring-amber-500/60 rounded-lg' : ''">
          <button
            @click.stop="handlePlayStop"
            @contextmenu.prevent="openMenu($event, { name: 'dm_play_stop', label: 'Drum Machine: Play/Stop' })"
            :class="[
              'flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-colors',
              pendingStop
                ? 'bg-orange-600/30 border-orange-400 text-orange-300 animate-pulse hover:bg-orange-600/50'
                : drumStore.isPlaying
                  ? 'bg-red-600/30 border-red-500 text-red-300 hover:bg-red-600/50'
                  : 'bg-purple-600/20 border-purple-500 text-purple-300 hover:bg-purple-600/40'
            ]"
          >
            <Square v-if="drumStore.isPlaying" class="w-2.5 h-2.5" />
            <Play v-else class="w-3.5 h-3.5" />
            <span>{{ pendingStop ? 'ENDING…' : drumStore.isPlaying ? 'STOP' : 'PLAY' }}</span>
          </button>
          <span
            v-if="mappingStore.learningParamName === 'dm_play_stop'"
            class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none z-50"
          />
        </div>

        <!-- Stop at end options -->
        <div class="flex flex-col gap-0.5 mb-2">
          <label class="flex items-center gap-1 cursor-pointer select-none" title="Let the current pattern finish before stopping">
            <input type="checkbox" v-model="stopAtEnd" class="w-3 h-3 accent-red-500 cursor-pointer" />
            <span class="text-[8px] font-mono uppercase tracking-widest" :class="stopAtEnd ? 'text-red-400' : 'text-neutral-500'">Stop@end</span>
          </label>
          <label v-if="stopAtEnd" class="flex items-center gap-1 cursor-pointer select-none" title="Play a fill on the last bar before stopping">
            <input type="checkbox" v-model="endWithFill" class="w-3 h-3 accent-cyan-500 cursor-pointer" />
            <span class="text-[8px] font-mono uppercase tracking-widest" :class="endWithFill ? 'text-cyan-400' : 'text-neutral-500'">+Fill</span>
          </label>
        </div>

        <!-- REC SYNC -->
        <div class="flex items-center gap-1 mb-2">
          <button
            @click.stop="toggleRecSync"
            :class="[
              'flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold transition-colors',
              recSyncActive
                ? 'bg-red-600/40 border-red-400 text-red-300 animate-pulse'
                : recSyncArmed
                  ? 'bg-orange-600/30 border-orange-400 text-orange-300 animate-pulse'
                  : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-red-500 hover:text-red-400'
            ]"
            :title="recSyncActive ? `Recording ${16 * recSyncMultiplier} steps — click to stop` : recSyncArmed ? 'Waiting for bar start — click to cancel' : `Rec Sync: record ${16 * recSyncMultiplier} steps from next bar`"
          >
            <span class="w-3 h-3 rounded-full shrink-0" :class="recSyncActive ? 'bg-red-400' : recSyncArmed ? 'bg-orange-400' : 'bg-neutral-600'" />
            {{ recSyncActive ? 'REC' : recSyncArmed ? 'ARMED' : 'REC' }}
          </button>
          <input
            type="number"
            v-model.number="recSyncMultiplier"
            min="1"
            max="24"
            :disabled="recSyncArmed || recSyncActive"
            class="w-8 text-center text-[10px] font-bold bg-neutral-800 border border-neutral-700 rounded px-0.5 py-0.5 text-neutral-400 disabled:opacity-40 focus:outline-none focus:border-red-500"
            title="Bars to record (1–24) — total steps = 16 × bars"
          />
        </div>

        <div v-if="drumStore.currentPresetName" class="ml-auto flex items-center gap-1 min-w-0">
          <span
            class="text-[9px] font-mono text-neutral-500 truncate max-w-[120px]"
            :title="drumStore.currentPresetName"
          >{{ drumStore.currentPresetName }}</span>
          <button
            @click.stop="overwritePresetWithToast(currentPresetId)"
            class="p-1 rounded text-neutral-600 hover:text-amber-400 hover:bg-amber-500/10 transition-colors shrink-0"
            title="Save (overwrite preset)"
          >
            <Save class="w-3 h-3" />
          </button>
        </div>

      </div>

      <!-- ── Chain row ─────────────────────────────────────────────────────── -->
      <div v-if="chainEnabled" class="shrink-0 flex items-center gap-2 px-3 py-1.5 border-t border-neutral-800 bg-neutral-900/60">
        <div class="flex gap-1">
          <button
            v-for="(slot, i) in chain"
            :key="i"
            @click.stop="cycleChainSlot(i)"
            @contextmenu.prevent="chain[i] = null"
            :class="[
              'w-7 h-6 rounded border text-[10px] font-black transition-colors',
              chainEnabled && chainSlotRef === i && drumStore.isPlaying
                ? 'bg-sky-500/40 border-sky-400 text-white ring-1 ring-sky-400'
                : slot
                  ? 'bg-sky-900/40 border-sky-700 text-sky-300 hover:border-sky-500'
                  : 'bg-neutral-800 border-neutral-700 text-neutral-600 hover:border-neutral-500 hover:text-neutral-400'
            ]"
            :title="'Slot ' + (i + 1) + ': ' + (slot ?? 'empty') + ' — click to cycle, right-click to clear'"
          >{{ slot ?? '–' }}</button>
        </div>
        <button
          @click.stop="chain = Array(chainLength).fill(null)"
          class="px-1.5 py-0.5 text-[8px] font-black rounded border border-neutral-700 bg-neutral-800 text-neutral-500 hover:border-red-600 hover:text-red-400 transition-colors shrink-0"
          title="Clear all chain slots"
        >CLR</button>
        <div class="flex items-center gap-0.5 ml-1">
          <button
@click.stop="resizeChain(chainLength - 1)"
             class="w-5 h-5 flex items-center justify-center rounded border border-neutral-700 bg-neutral-800 text-neutral-500 hover:text-white hover:border-neutral-500 transition-colors text-[11px] font-black"
             title="Decrease chain length"
           >–</button>
           <span class="w-6 text-center text-[9px] font-mono text-neutral-500">{{ chainLength }}</span>
           <button
             @click.stop="resizeChain(chainLength + 1)"
            class="w-5 h-5 flex items-center justify-center rounded border border-neutral-700 bg-neutral-800 text-neutral-500 hover:text-white hover:border-neutral-500 transition-colors text-[11px] font-black"
            title="Increase chain length"
          >+</button>
        </div>
        <span v-if="chainEnabled && drumStore.isPlaying && chainSlotRef >= 0" class="text-[8px] font-mono text-sky-400 ml-1">
          slot {{ chainSlotRef + 1 }}
        </span>
      </div>

      <!-- ── Footer ─────────────────────────────────────────────────────────── -->
      <div class="shrink-0 flex items-center gap-4 px-4 py-2 border-t border-neutral-800 bg-neutral-900/40">
        <!-- Swing -->
        <div class="flex items-center gap-2">
          <span class="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Swing</span>
          <input
            type="range" min="0" max="80" step="1"
            :value="drumStore.swing"
            @input="drumStore.swing = parseInt($event.target.value)"
            class="w-20 h-1 accent-purple-500 cursor-pointer"
          />
          <span class="text-[9px] font-mono text-neutral-400 w-6 text-right">{{ drumStore.swing }}%</span>
        </div>

        <div class="w-px h-4 bg-neutral-800 shrink-0" />

        <!-- Master Volume -->
        <div
          class="relative flex items-center gap-2"
          :class="mappingStore.mappedParams.has('dm_level_master') ? 'ring-1 ring-amber-500/60 rounded' : ''"
          @contextmenu.prevent="openMenu($event, { name: 'dm_level_master', label: 'Drum Machine: Master Volume' })"
        >
          <span class="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Vol</span>
          <input
            type="range" min="0" max="1" step="0.01"
            :value="mixer.drumsLevelVol"
            @input="_setMasterVolume(parseFloat($event.target.value))"
            class="w-20 h-1 accent-purple-500 cursor-pointer"
            title="Master volume for all tracks"
          />
          <span class="text-[9px] font-mono text-neutral-400 w-6 text-right">{{ Math.round(mixer.drumsLevelVol * 100) }}</span>
          <span
            v-if="mappingStore.learningParamName === 'dm_level_master'"
            class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none z-50"
          />
        </div>

        <div class="w-px h-4 bg-neutral-800 shrink-0" />

        <!-- Repeater -->
        <div class="flex items-center gap-2">
          <div class="relative -mt-1" :class="mappingStore.mappedParams.has('dm_repeat') ? 'ring-1 ring-amber-500/60 rounded' : ''">
            <button
              @click.stop="drumStore.repeaterActive = !drumStore.repeaterActive"
              @contextmenu.prevent="openMenu($event, { name: 'dm_repeat', label: 'Drum Machine: Repeat' })"
              :class="[
                'px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-widest transition-colors',
                drumStore.repeaterActive
                  ? 'bg-orange-500/30 border-orange-400 text-orange-300'
                  : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:text-white hover:border-neutral-500'
              ]"
            >Repeat</button>
            <span
              v-if="mappingStore.learningParamName === 'dm_repeat'"
              class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none z-50"
            />
          </div>

          <div class="flex gap-0.5">
            <button
              v-for="div in [2, 3, 4]"
              :key="div"
              @click.stop="drumStore.repeaterDivision = div"
              :class="[
                'w-7 h-5 rounded border text-[8px] font-black transition-colors',
                drumStore.repeaterDivision === div && drumStore.repeaterActive
                  ? 'bg-orange-500/30 border-orange-400 text-orange-300'
                  : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:text-white'
              ]"
            >÷{{ div }}</button>
          </div>
        </div>

        <div class="flex-1" />

        <div class="w-px h-4 bg-neutral-800 shrink-0" />

        <!-- Fill -->
        <div class="flex items-center gap-1">
          <div class="relative" :class="mappingStore.mappedParams.has('dm_fill') ? 'ring-1 ring-amber-500/60 rounded' : ''">
            <button
              @click.stop="triggerFill"
              @contextmenu.prevent="openMenu($event, { name: 'dm_fill', label: 'Drum Machine: Fill' })"
              :class="[
                'flex items-center gap-1 px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-widest transition-colors',
                fillActive
                  ? 'bg-cyan-500/30 border-cyan-400 text-cyan-300 animate-pulse'
                  : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-cyan-500 hover:text-cyan-300'
              ]"
              title="Trigger fill for one bar"
            >
              <Layers class="w-2.5 h-2.5" />
              Fill
            </button>
            <span
              v-if="mappingStore.learningParamName === 'dm_fill'"
              class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none z-50"
            />
          </div>
          <button
            @click.stop="generateFill"
            class="px-2 py-0.5 rounded border border-neutral-700 bg-neutral-800 text-neutral-500 text-[9px] font-black uppercase tracking-widest hover:border-neutral-500 hover:text-white transition-colors"
            title="Generate new fill pattern"
          >Gen</button>
          <div class="flex items-center gap-0.5">
            <input
              v-model.number="fillSaveFrom"
              type="number" min="1" max="16"
              @change="fillSaveFrom = Math.max(1, Math.min(16, fillSaveFrom))"
              class="w-7 h-5 text-center bg-neutral-800 border border-neutral-700 rounded text-[9px] font-mono text-neutral-400 focus:border-amber-500 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              title="Save from step"
            />
            <span class="text-[8px] text-neutral-600">–</span>
            <input
              v-model.number="fillSaveTo"
              type="number" min="1" max="16"
              @change="fillSaveTo = Math.max(fillSaveFrom, Math.min(16, fillSaveTo))"
              class="w-7 h-5 text-center bg-neutral-800 border border-neutral-700 rounded text-[9px] font-mono text-neutral-400 focus:border-amber-500 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              title="Save to step"
            />
            <button
              @click.stop="saveFillToPattern"
              class="flex items-center justify-center w-6 h-5 rounded border border-neutral-700 bg-neutral-800 text-neutral-500 hover:border-amber-500 hover:text-amber-300 transition-colors"
              title="Save fill steps to current pattern"
            ><Save class="w-2.5 h-2.5" /></button>
          </div>
        </div>

        <div class="w-px h-4 bg-neutral-800 shrink-0" />

        <span class="text-[9px] font-mono text-neutral-700 uppercase tracking-widest w-24 text-center">
          {{ drumStore.activeSequence }} · {{ drumStore.currentStep >= 0 ? drumStore.currentStep + 1 : '--' }}/16
        </span>
      </div>

      <!-- Resize handles -->
      <div @mousedown.stop="e => onResizeStart(e, 'n')"  class="absolute top-0    left-3 right-3  h-1  cursor-n-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 's')"  class="absolute bottom-0 left-3 right-3  h-1  cursor-s-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'e')"  class="absolute top-3 bottom-3 right-0   w-1  cursor-e-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'w')"  class="absolute top-3 bottom-3 left-0    w-1  cursor-w-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'ne')" class="absolute top-0    right-0  w-3 h-3 cursor-ne-resize z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'nw')" class="absolute top-0    left-0   w-3 h-3 cursor-nw-resize z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'sw')" class="absolute bottom-0 left-0   w-3 h-3 cursor-sw-resize z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'se')" class="absolute bottom-1 right-1  w-3 h-3 cursor-se-resize z-50 opacity-40 hover:opacity-80" style="background:radial-gradient(circle,#aaa 1px,transparent 1px) 0 0/3px 3px" />
    </div>

    <!-- ── Step context menu ───────────────────────────────────────────────── -->
    <Transition name="sy-modal">
      <div
        v-if="stepContextMenu"
        class="fixed z-[500] bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl p-3 space-y-3 min-w-[160px]"
        :style="{ left: stepContextMenu.x + 'px', top: stepContextMenu.y + 'px' }"
        @click.stop
      >
        <div class="text-[9px] font-black uppercase tracking-widest text-neutral-500 mb-1">
          Track {{ stepContextMenu.trackIdx + 1 }} · Step {{ stepContextMenu.stepIdx + 1 }}
        </div>

        <!-- Velocity -->
        <div>
          <div class="flex justify-between mb-1">
            <span class="text-[9px] text-neutral-400 font-bold">Velocity</span>
            <span class="text-[9px] font-mono text-purple-300">
              {{ drumStore.currentPattern[stepContextMenu.trackIdx].steps[stepContextMenu.stepIdx].velocity }}
            </span>
          </div>
          <input
            type="range" min="1" max="127" step="1"
            :value="drumStore.currentPattern[stepContextMenu.trackIdx].steps[stepContextMenu.stepIdx].velocity"
            @input="setContextVelocity($event.target.value)"
            class="w-full h-1 accent-purple-500 cursor-pointer"
          />
        </div>

        <!-- Accent -->
        <div class="flex items-center justify-between">
          <span class="text-[9px] text-neutral-400 font-bold">Accent</span>
          <button
            @click="setContextAccent(!drumStore.currentPattern[stepContextMenu.trackIdx].steps[stepContextMenu.stepIdx].accent)"
            :class="[
              'w-7 h-4 rounded border text-[8px] font-black transition-colors',
              drumStore.currentPattern[stepContextMenu.trackIdx].steps[stepContextMenu.stepIdx].accent
                ? 'bg-yellow-400/30 border-yellow-400 text-yellow-300'
                : 'bg-neutral-800 border-neutral-700 text-neutral-500'
            ]"
          >
            {{ drumStore.currentPattern[stepContextMenu.trackIdx].steps[stepContextMenu.stepIdx].accent ? 'ON' : 'OFF' }}
          </button>
        </div>

        <!-- Ratchet -->
        <div>
          <span class="text-[9px] text-neutral-400 font-bold block mb-1">Ratchet</span>
          <div class="flex gap-1">
            <button
              v-for="r in [1, 2, 3, 4]"
              :key="r"
              @click="setContextRatchet(r)"
              :class="[
                'flex-1 h-5 rounded border text-[8px] font-black transition-colors',
                drumStore.currentPattern[stepContextMenu.trackIdx].steps[stepContextMenu.stepIdx].ratchet === r
                  ? 'bg-purple-600/40 border-purple-400 text-purple-300'
                  : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:text-white'
              ]"
            >{{ r }}</button>
          </div>
        </div>

        <!-- Tie -->
        <div>
          <span class="text-[9px] text-neutral-400 font-bold block mb-1">Tie steps</span>
          <div class="flex gap-1">
            <button
              v-for="t in [0, 1, 2, 4, 8, 16]"
              :key="t"
              @click="setContextTie(t)"
              :class="[
                'flex-1 h-5 rounded border text-[8px] font-black transition-colors',
                drumStore.currentPattern[stepContextMenu.trackIdx].steps[stepContextMenu.stepIdx].tie === t
                  ? 'bg-cyan-600/40 border-cyan-400 text-cyan-300'
                  : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:text-white'
              ]"
            >{{ t || '–' }}</button>
          </div>
        </div>

        <button @click="closeStepContext" class="w-full text-[9px] text-neutral-600 hover:text-neutral-400 text-center pt-1">Close</button>
      </div>
    </Transition>

    <!-- ── Bassline step context menu ───────────────────────────────────────── -->
    <Transition name="sy-modal">
      <div
        v-if="basslineStepContextMenu"
        class="fixed z-[500] bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl p-3 space-y-3 min-w-[180px]"
        :style="{ left: basslineStepContextMenu.x + 'px', top: basslineStepContextMenu.y + 'px' }"
        @click.stop
      >
        <div class="text-[9px] font-black uppercase tracking-widest text-neutral-500 mb-1">
          Voice {{ basslineStepContextMenu.voiceIdx + 1 }} · Step {{ basslineStepContextMenu.stepIdx + 1 }}
        </div>

        <!-- Velocity -->
        <div>
          <div class="flex justify-between mb-1">
            <span class="text-[9px] text-neutral-400 font-bold">Velocity</span>
            <span class="text-[9px] font-mono text-purple-300">
              {{ drumStore.currentBasslinePattern[basslineStepContextMenu.voiceIdx]?.steps[basslineStepContextMenu.stepIdx]?.velocity }}
            </span>
          </div>
          <input
            type="range" min="1" max="127" step="1"
            :value="drumStore.currentBasslinePattern[basslineStepContextMenu.voiceIdx]?.steps[basslineStepContextMenu.stepIdx]?.velocity"
            @input="setBasslineContextVelocity($event.target.value)"
            class="w-full h-1 accent-purple-500 cursor-pointer"
          />
        </div>

        <!-- Note/Pitch -->
        <div>
          <div class="flex justify-between mb-1">
            <span class="text-[9px] text-neutral-400 font-bold">Note</span>
            <span class="text-[9px] font-mono text-violet-300">
              {{ midiNoteName(drumStore.currentBasslinePattern[basslineStepContextMenu.voiceIdx]?.steps[basslineStepContextMenu.stepIdx]?.note ?? 36) }}
              ({{ drumStore.currentBasslinePattern[basslineStepContextMenu.voiceIdx]?.steps[basslineStepContextMenu.stepIdx]?.note ?? 36 }})
            </span>
          </div>
          <input
            type="range" min="24" max="60" step="1"
            :value="drumStore.currentBasslinePattern[basslineStepContextMenu.voiceIdx]?.steps[basslineStepContextMenu.stepIdx]?.note ?? 36"
            @input="setBasslineContextNote($event.target.value)"
            class="w-full h-1 accent-violet-500 cursor-pointer"
          />
        </div>

        <!-- Accent -->
        <div class="flex items-center justify-between">
          <span class="text-[9px] text-neutral-400 font-bold">Accent</span>
          <button
            @click="setBasslineContextAccent(!drumStore.currentBasslinePattern[basslineStepContextMenu.voiceIdx]?.steps[basslineStepContextMenu.stepIdx]?.accent)"
            :class="[
              'w-7 h-4 rounded border text-[8px] font-black transition-colors',
              drumStore.currentBasslinePattern[basslineStepContextMenu.voiceIdx]?.steps[basslineStepContextMenu.stepIdx]?.accent
                ? 'bg-yellow-400/30 border-yellow-400 text-yellow-300'
                : 'bg-neutral-800 border-neutral-700 text-neutral-500'
            ]"
          >
            {{ drumStore.currentBasslinePattern[basslineStepContextMenu.voiceIdx]?.steps[basslineStepContextMenu.stepIdx]?.accent ? 'ON' : 'OFF' }}
          </button>
        </div>

        <!-- Ratchet -->
        <div>
          <span class="text-[9px] text-neutral-400 font-bold block mb-1">Ratchet</span>
          <div class="flex gap-1">
            <button
              v-for="r in [1, 2, 3, 4]"
              :key="r"
              @click="setBasslineContextRatchet(r)"
              :class="[
                'flex-1 h-5 rounded border text-[8px] font-black transition-colors',
                drumStore.currentBasslinePattern[basslineStepContextMenu.voiceIdx]?.steps[basslineStepContextMenu.stepIdx]?.ratchet === r
                  ? 'bg-purple-600/40 border-purple-400 text-purple-300'
                  : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:text-white'
              ]"
            >{{ r }}</button>
          </div>
        </div>

        <!-- Tie -->
        <div>
          <span class="text-[9px] text-neutral-400 font-bold block mb-1">Tie steps</span>
          <div class="flex gap-1">
            <button
              v-for="t in [0, 1, 2, 4, 8, 16]"
              :key="t"
              @click="setBasslineContextTie(t)"
              :class="[
                'flex-1 h-5 rounded border text-[8px] font-black transition-colors',
                drumStore.currentBasslinePattern[basslineStepContextMenu.voiceIdx]?.steps[basslineStepContextMenu.stepIdx]?.tie === t
                  ? 'bg-cyan-600/40 border-cyan-400 text-cyan-300'
                  : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:text-white'
              ]"
            >{{ t || '–' }}</button>
          </div>
        </div>

        <button @click="closeBasslineStepContext" class="w-full text-[9px] text-neutral-600 hover:text-neutral-400 text-center pt-1">Close</button>
      </div>
    </Transition>

    <!-- FX copied toast -->
    <Transition name="fade">
      <div v-if="fxCopiedToast" class="fixed bottom-10 left-1/2 -translate-x-1/2 z-[600] pointer-events-none">
        <div class="flex items-center gap-2 bg-cyan-950/90 border border-cyan-700 text-cyan-300 px-4 py-2 rounded-lg text-sm font-medium shadow-xl">
          <span>FX COPIED</span>
        </div>
      </div>
    </Transition>

    <!-- Preset saved toast -->
    <Transition name="fade">
      <div v-if="presetSavedToast" class="fixed bottom-10 left-1/2 -translate-x-1/2 z-[600] pointer-events-none">
        <div class="flex items-center gap-2 bg-emerald-950/90 border border-emerald-800 text-emerald-300 px-4 py-2 rounded-lg text-sm font-medium shadow-xl">
          <Save class="w-4 h-4" />
          <span>PRESET SAVED</span>
        </div>
      </div>
    </Transition>

    <!-- Kit saved toast -->
    <Transition name="fade">
      <div v-if="kitSavedToast" class="fixed bottom-16 left-1/2 -translate-x-1/2 z-[600] pointer-events-none">
        <div class="flex items-center gap-2 bg-amber-950/90 border border-amber-800 text-amber-300 px-4 py-2 rounded-lg text-sm font-medium shadow-xl">
          <Save class="w-4 h-4" />
          <span>KIT SAVED</span>
        </div>
      </div>
    </Transition>

    <!-- Kit overwrite toast -->
    <Transition name="fade">
      <div v-if="kitOverwriteToast" class="fixed bottom-16 left-1/2 -translate-x-1/2 z-[600] pointer-events-none">
        <div class="flex items-center gap-2 bg-amber-950/90 border border-amber-800 text-amber-300 px-4 py-2 rounded-lg text-sm font-medium shadow-xl">
          <Save class="w-4 h-4" />
          <span>KIT OVERWRITTEN</span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to       { opacity: 0; }
</style>
