<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { getTransport, getDraw, start as toneStart, now as toneNow } from 'tone'
import { Drum, Play, Square, X, Minus, ChevronDown, Copy, Trash2, Zap, Save, FolderOpen, Shuffle, Layers } from 'lucide-vue-next'
import { useUiStore } from '@/stores/useUiStore'
import { useDrumMachineStore, DRUM_STYLE_NAMES } from '@/stores/useDrumMachineStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useArpStore } from '@/stores/useArpStore'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import { useFreesoundCache } from '@/composables/useFreesoundCache'
import * as drumEngine from '@/lib/drum-engine'

const uiStore        = useUiStore()
const drumStore      = useDrumMachineStore()
const mappingStore   = useMappingStore()
const arpStore       = useArpStore()
const { openMenu }   = useMidiContextMenu()
const { cacheFileBlob, resolveUrl } = useFreesoundCache()

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront } =
  useDraggableResizable({
    storageKey:    'S1_DRUM_MACHINE_DR',
    minimizeLabel: 'Drum Machine',
    initialWidth:  960,
    initialHeight: 520,
    minWidth:      720,
    minHeight:     380,
    zIndex:        210,
  })

watch(() => uiStore.isDrumMachineOpen, v => { if (v) bringToFront() })

// ── Local UI state ─────────────────────────────────────────────────────────────
const selectedStyle   = ref('House')
const showStyleMenu   = ref(false)
const generateAsFill  = ref(false)
const masterVolume    = ref(0.85)
const copySourceSeq   = ref(null)
const stepContextMenu = ref(null) // { trackIdx, stepIdx, x, y }

// Preset panel
const showPresets    = ref(false)
const newPresetName  = ref('')

// Init confirmation
const initConfirm     = ref(false)
const presetSavedToast  = ref(false)
const fxCopiedToast    = ref(false)
let _toastTimer    = null
let _fxToastTimer  = null

function overwritePresetWithToast(id) {
  drumStore.overwritePreset(id)
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
  Array(8).fill(null).map(() => Array(16).fill(null).map(() => ({ active: false, velocity: 100, accent: false, ratchet: 1 })))
)

// REC SYNC — arms at bar start, records 16 steps, auto-stops
let _recSyncArmed     = false
let _recSyncRecording = false
const recSyncArmed  = ref(false)
const recSyncActive = ref(false)

// ── Sync BPM from arpStore (global BPM) ───────────────────────────────────────
watch(() => arpStore.arpBpm, v => { drumStore.bpm = v }, { immediate: true })
watch(() => drumStore.bpm, v => drumEngine.setDelayTime(v))
watch(masterVolume, v => drumEngine.setMasterVolume(v))

// ── FX strip visibility per track ─────────────────────────────────────────────
const showFx = ref(Array(8).fill(false))

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

function buildPlayState() {
  return {
    tracks: drumStore.currentPattern.map(t => ({
      muted:  t.muted,
      solo:   t.solo,
      volume: t.volume,
      length: t.length ?? 16,
      steps:  t.steps.map(s => ({ ...s })),
    })),
    bpm:              drumStore.bpm,
    swing:            drumStore.swing,
    repeaterActive:   drumStore.repeaterActive,
    repeaterDivision: drumStore.repeaterDivision,
    fillActive:       fillActive.value,
    fillSteps:        fillPattern.value.map(steps => steps.map(s => ({ ...s }))),
  }
}

const hasSolo = computed(() =>
  drumStore.currentPattern.some(t => t.solo)
)

function _scheduleCallback(time) {
  let state = playStateRef.current
  if (!state) return

  // Global 16-step position drives the bar boundary and UI highlight.
  // Each track uses its own length for wrapping (per-track polymetry).
  const globalStep = stepCounter % 16

  // ── Bar boundary (step 0): pending sequence swap + fill auto-stop ──
  if (globalStep === 0) {
    if (_pendingSequence !== null) {
      drumStore.swapSequence(_pendingSequence)
      _pendingSequence = null
      playStateRef.current = buildPlayState()
      state = playStateRef.current
      getDraw().schedule(() => { pendingSequence.value = null }, time)
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
      _recSyncRecording = false
      getDraw().schedule(() => {
        window.dispatchEvent(new CustomEvent('capture-stop-rec'))
        recSyncActive.value = false
      }, time)
    }
    if (_recSyncArmed) {
      _recSyncArmed = false
      _recSyncRecording = true
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

    // Each track wraps at its own length
    const trackStep = stepCounter % (track.length || 16)
    let step = track.steps[trackStep]
    if (state.fillActive && state.fillSteps?.[trackIdx]?.[trackStep]?.active) {
      step = state.fillSteps[trackIdx][trackStep]
    }
    if (!step.active) return

    drumEngine.setPadVolume(trackIdx, track.volume)

    const divisions = state.repeaterActive
      ? state.repeaterDivision
      : step.ratchet

    if (divisions <= 1) {
      drumEngine.triggerPad(trackIdx, { velocity: step.velocity, accent: step.accent, time: fireTime })
    } else {
      drumEngine.triggerRatchet(trackIdx, stepTimeSec, divisions, {
        velocity: step.velocity,
        accent:   step.accent,
        baseTime: fireTime,
      })
    }
  })

  getDraw().schedule(() => { drumStore.currentStep = globalStep }, time)
  stepCounter++ // no wrap — each track uses its own modulo
}

watch(() => drumStore.isPlaying, (playing) => {
  if (!playing) {
    if (repeatEventIdRef !== null) {
      getTransport().clear(repeatEventIdRef)
      repeatEventIdRef = null
    }
    getTransport().stop()
    stepCounter = 0
    drumStore.currentStep = -1
    // Cancel any pending or active rec sync
    if (_recSyncRecording) {
      window.dispatchEvent(new CustomEvent('capture-stop-rec'))
    }
    _recSyncArmed = false
    _recSyncRecording = false
    recSyncArmed.value  = false
    recSyncActive.value = false
    return
  }

  stepCounter = 0

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
  if (!resolved.soundId) return
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

// ── Master volume from mixer ───────────────────────────────────────────────────
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

onMounted(async () => {
  drumEngine.initDrumEngine()
  drumEngine.setDelayTime(drumStore.bpm)
  await loadAllSamples(drumStore.currentPattern)
  pushAllFxToEngine(drumStore.currentPattern)
  window.addEventListener('dm-master-volume',  _onMasterVolume)
  window.addEventListener('dm-trigger-fill',   _onMidiFill)
  window.addEventListener('dm-generate',       _onMidiGenerate)
  window.addEventListener('dm-seq-switch',     _onMidiSeqSwitch)
})

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

function previewPad(trackIdx) {
  drumEngine.triggerPad(trackIdx, { velocity: 100, accent: false, time: 0 })
}

// ── Preset save / load ────────────────────────────────────────────────────────
function handleSavePreset() {
  drumStore.savePreset(newPresetName.value)
  newPresetName.value = ''
}

async function handleLoadPreset(preset) {
  drumStore.loadPreset(preset)
  showPresets.value = false
  await nextTick()
  await loadAllSamples(drumStore.currentPattern)
}

// ── Quantized sequence switching ───────────────────────────────────────────────
function clickSequenceTab(seq) {
  if (drumStore.isPlaying && seq !== drumStore.activeSequence) {
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
  const rnd = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo
  const hit  = (vel) => ({ active: true, velocity: vel, accent: false, ratchet: 1 })
  const hitA = (vel) => ({ active: true, velocity: vel, accent: true,  ratchet: 1 })
  const off  = () => ({ active: false, velocity: 100, accent: false, ratchet: 1 })

  const fp = Array(8).fill(null).map(() => Array(16).fill(null).map(off))

  fp[0][0]  = hitA(rnd(100, 127))      // kick on 1
  fp[0][8]  = hit(rnd(80, 110))         // kick on 3
  fp[1][4]  = hit(rnd(90, 115))         // snare on 2
  fp[1][12] = hit(rnd(90, 115))         // snare on 4
  fp[1][13] = hit(rnd(80, 110))         // snare +1
  fp[1][14] = hit(rnd(90, 120))         // snare +2
  fp[1][15] = hitA(127)                  // accented final snare
  for (let s = 0; s < 8; s += 2)
    fp[2][s] = hit(rnd(50, 72))          // CHH 8th notes first half
  fp[5][8]  = hit(rnd(85, 110))          // tom1
  fp[5][10] = hit(rnd(85, 110))
  fp[6][11] = hit(rnd(85, 110))          // tom2
  fp[6][13] = hit(rnd(90, 115))
  fp[7][15] = hitA(rnd(100, 127))        // cymbal crash
  if (Math.random() > 0.5) fp[1][11] = hit(rnd(55, 78)) // ghost snare before roll
  if (Math.random() > 0.5) fp[5][14] = hit(rnd(80, 105))

  fillPattern.value = fp
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

// ── Step right-click context ───────────────────────────────────────────────────
function openStepContext(trackIdx, stepIdx, event) {
  event.preventDefault()
  stepContextMenu.value = { trackIdx, stepIdx, x: event.clientX, y: event.clientY }
}

function closeStepContext() {
  stepContextMenu.value = null
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
        <span class="ml-2 text-[10px] font-mono text-neutral-400">{{ drumStore.bpm }} BPM</span>

        

        
        <!-- Style generator -->
        <div class="relative ml-2">
          <button
            @click.stop="showStyleMenu = !showStyleMenu"
            class="flex items-center gap-1 px-2 py-1 rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:border-neutral-500 transition-colors"
          >
            <Zap class="w-2.5 h-2.5 text-amber-400" />
            {{ selectedStyle }}
            <ChevronDown class="w-2.5 h-2.5 ml-0.5" />
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
                'block w-full text-left px-3 py-1.5 text-[10px] font-bold transition-colors',
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
          <div class="relative">
            <button
              @click.stop="generatePattern"
              @contextmenu.prevent="openMenu($event, { name: 'dm_generate', label: 'Drum Machine: Generate' })"
              :class="[
                'px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-colors',
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
          title="Presets"
        >
          <FolderOpen class="w-2.5 h-2.5" />
          Presets
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

        <button @click.stop="toggleMinimize" class="p-1.5 text-neutral-500 hover:text-white transition-colors rounded-full hover:bg-white/5">
          <Minus class="w-3.5 h-3.5" />
        </button>
        <button @click.stop="uiStore.isDrumMachineOpen = false" class="p-1.5 text-neutral-500 hover:text-white transition-colors rounded-full hover:bg-white/5">
          <X class="w-3.5 h-3.5" />
        </button>
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
              placeholder="Preset name…"
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
          <div v-if="drumStore.presets.length" class="space-y-1 max-h-36 overflow-y-auto pr-1">
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
                class="shrink-0 px-2 py-0.5 rounded border border-emerald-700 bg-emerald-700/20 text-emerald-300 text-[8px] font-bold hover:bg-emerald-700/40 transition-colors"
              >Load</button>
              <button
                @click="overwritePresetWithToast(preset.id)"
                class="shrink-0 p-0.5 text-amber-600 hover:text-amber-300 transition-colors opacity-0 group-hover:opacity-100"
                title="Overwrite with current pattern"
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
          <p v-else class="text-[9px] text-neutral-600 font-mono text-center py-1">No presets saved yet</p>
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

      <!-- ── Track grid ──────────────────────────────────────────────────────── -->
      <div class="flex-1 overflow-y-auto custom-scrollbar px-3 py-2 space-y-1 min-h-0">
        <div
          v-for="(track, trackIdx) in drumStore.currentPattern"
          :key="trackIdx"
          class="flex flex-col rounded bg-neutral-900/50 transition-colors"
        >
        <div class="flex items-center gap-2">
          <!-- Track label + load sample -->
          <div
            class="flex items-center gap-1 shrink-0 p-1 rounded-lg"
            style="width: 92px;"
            @dragover.prevent
            @drop="handleTrackUrlDrop(trackIdx, $event)"
          >
            <label
              :title="drumStore.resolveTrackSound(trackIdx).soundLabel
                ? `${track.label}: ${drumStore.resolveTrackSound(trackIdx).soundLabel}`
                : `Load sample for ${track.label}`"
              class="flex-1 min-w-0 cursor-pointer hover:text-purple-300 hover:bg-indigo-800/70 bg-indigo-800/30 p-1 rounded transition-colors"
            >
              <div class="text-[11px] font-bold text-neutral-300 truncate leading-none">{{ track.label }}</div>
              <div
                v-if="drumStore.resolveTrackSound(trackIdx).soundLabel"
                :class="[
                  'text-[9px] truncate leading-none mt-0.5',
                  drumStore.resolveTrackSound(trackIdx).own ? 'text-purple-400' : 'text-neutral-500'
                ]"
              >{{ drumStore.resolveTrackSound(trackIdx).soundLabel }}</div>
              <input type="file" accept="audio/*" class="hidden" @change="handleTrackFileLoad(trackIdx, $event)" />
            </label>
            <button
              v-if="drumStore.resolveTrackSound(trackIdx).soundId"
              @click.stop="previewPad(trackIdx)"
              class="shrink-0 w-3.5 h-3.5 flex items-center justify-center hover:text-purple-200 transition-colors"
              :class="drumStore.resolveTrackSound(trackIdx).own ? 'text-purple-400' : 'text-neutral-500'"
              title="Preview sample"
            >
              <svg viewBox="0 0 8 8" class="w-2 h-2 fill-current"><polygon points="0,0 8,4 0,8"/></svg>
            </button>
            <div
              v-else
              class="w-1.5 h-1.5 rounded-full shrink-0 border bg-neutral-700 border-neutral-600"
              title="No sample loaded"
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
                  v-if="l === 1 && (g-1)*4 < track.length"
                  class="absolute bottom-0 left-0 w-full h-px bg-white/20"
                />
              </button>
            </div>
          </div>
        </div>

          <!-- FX strip -->
          <div v-if="showFx[trackIdx]" class="flex items-center gap-3 px-2 py-1.5 border-t border-violet-900/40 bg-black/20">
            <span class="text-[8px] font-black uppercase tracking-widest text-violet-400 shrink-0 w-4">FX</span>
            <!-- Pan -->
            <div class="flex items-center gap-1">
              <span class="text-[8px] text-neutral-500 shrink-0">Pan</span>
              <input type="range" min="-1" max="1" step="0.01"
                :value="track.pan ?? 0"
                @input="drumStore.setTrackFx(trackIdx, 'pan', parseFloat($event.target.value)); drumEngine.setPadPan(trackIdx, parseFloat($event.target.value))"
                class="w-16 h-1 accent-violet-500 cursor-pointer"
                title="Pan (-1 left → +1 right)"
              />
              <span class="text-[8px] font-mono text-neutral-600 w-6 text-right">{{ ((track.pan ?? 0) * 100).toFixed(0) }}</span>
            </div>
            <!-- Pitch -->
            <div class="flex items-center gap-1">
              <span class="text-[8px] text-neutral-500 shrink-0">Pitch</span>
              <input type="range" min="-12" max="12" step="1"
                :value="track.pitch ?? 0"
                @input="drumStore.setTrackFx(trackIdx, 'pitch', parseInt($event.target.value)); drumEngine.setPadPitch(trackIdx, parseInt($event.target.value))"
                class="w-14 h-1 accent-violet-500 cursor-pointer"
                title="Pitch (semitones)"
              />
              <span class="text-[8px] font-mono text-neutral-600 w-6 text-right">{{ (track.pitch ?? 0) > 0 ? '+' : '' }}{{ track.pitch ?? 0 }}st</span>
            </div>
            <!-- Filter -->
            <div class="flex items-center gap-1">
              <span class="text-[8px] text-neutral-500 shrink-0">Tone</span>
              <input type="range" min="200" max="20000" step="100"
                :value="track.filterFreq ?? 20000"
                @input="drumStore.setTrackFx(trackIdx, 'filterFreq', parseInt($event.target.value)); drumEngine.setPadFilter(trackIdx, parseInt($event.target.value))"
                class="w-16 h-1 accent-violet-500 cursor-pointer"
                title="Low-pass filter frequency"
              />
              <span class="text-[8px] font-mono text-neutral-600 w-10 text-right">{{ (track.filterFreq ?? 20000) >= 1000 ? ((track.filterFreq ?? 20000)/1000).toFixed(1)+'k' : (track.filterFreq ?? 20000) }}Hz</span>
            </div>
            <!-- Reverb send -->
            <div class="flex items-center gap-1">
              <span class="text-[8px] text-neutral-500 shrink-0">Rev</span>
              <input type="range" min="0" max="1" step="0.01"
                :value="track.reverbSend ?? 0"
                @input="drumStore.setTrackFx(trackIdx, 'reverbSend', parseFloat($event.target.value)); drumEngine.setPadReverbSend(trackIdx, parseFloat($event.target.value))"
                class="w-14 h-1 accent-cyan-500 cursor-pointer"
                title="Reverb send amount"
              />
              <span class="text-[8px] font-mono text-neutral-600 w-5 text-right">{{ Math.round((track.reverbSend ?? 0) * 100) }}</span>
            </div>
            <!-- Delay send -->
            <div class="flex items-center gap-1">
              <span class="text-[8px] text-neutral-500 shrink-0">Dly</span>
              <input type="range" min="0" max="1" step="0.01"
                :value="track.delaySend ?? 0"
                @input="drumStore.setTrackFx(trackIdx, 'delaySend', parseFloat($event.target.value)); drumEngine.setPadDelaySend(trackIdx, parseFloat($event.target.value))"
                class="w-14 h-1 accent-cyan-500 cursor-pointer"
                title="Delay send amount (1/8-note BPM-synced)"
              />
              <span class="text-[8px] font-mono text-neutral-600 w-5 text-right">{{ Math.round((track.delaySend ?? 0) * 100) }}</span>
            </div>
            <!-- FX copy / paste -->
            <div class="flex items-center gap-1 ml-auto shrink-0">
              <button
                @click.stop="copyTrackFx(track)"
                class="px-1.5 h-4 text-[7px] font-black rounded border border-neutral-600 bg-neutral-800 text-neutral-400 hover:border-cyan-500 hover:text-cyan-300 transition-colors"
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


      <div class="flex items-center gap-2 px-3 py-2 border-t border-neutral-800 bg-neutral-900/40">
        <!-- Sequence tabs A-F -->
        <div class="flex items-center gap-1 ml-3 mb-2">
          <div
            v-for="seq in SEQUENCES"
            :key="seq"
            class="relative"
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
        <!-- Play / Stop -->
        <div class="relative ml-3">
          <button
            @click.stop="drumStore.isPlaying = !drumStore.isPlaying"
            @contextmenu.prevent="openMenu($event, { name: 'dm_play_stop', label: 'Drum Machine: Play/Stop' })"
            :class="[
              'flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-colors',
              drumStore.isPlaying
                ? 'bg-red-600/30 border-red-500 text-red-300 hover:bg-red-600/50'
                : 'bg-purple-600/20 border-purple-500 text-purple-300 hover:bg-purple-600/40'
            ]"
          >
            <Square v-if="drumStore.isPlaying" class="w-2.5 h-2.5" />
            <Play v-else class="w-2.5 h-2.5" />
            <span>{{ drumStore.isPlaying ? 'STOP' : 'PLAY' }}</span>
          </button>
          <span
            v-if="mappingStore.learningParamName === 'dm_play_stop'"
            class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none z-50"
          />
        </div>

        <!-- REC SYNC -->
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
          :title="recSyncActive ? 'Recording 16 steps — click to stop' : recSyncArmed ? 'Waiting for bar start — click to cancel' : 'Rec Sync: record 16 steps from next bar'"
        >
          <span class="w-2 h-2 rounded-full shrink-0" :class="recSyncActive ? 'bg-red-400' : recSyncArmed ? 'bg-orange-400' : 'bg-neutral-600'" />
          {{ recSyncActive ? 'REC' : recSyncArmed ? 'ARMED' : 'REC' }}
        </button>

        <span
          v-if="drumStore.currentPresetName"
          class="ml-auto text-[9px] font-mono text-neutral-500 truncate max-w-[120px]"
          :title="drumStore.currentPresetName"
        >{{ drumStore.currentPresetName }}</span>

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
        <div class="flex items-center gap-2">
          <span class="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Vol</span>
          <input
            type="range" min="0" max="1" step="0.01"
            :value="masterVolume"
            @input="masterVolume = parseFloat($event.target.value)"
            class="w-20 h-1 accent-purple-500 cursor-pointer"
            title="Master volume for all tracks"
          />
          <span class="text-[9px] font-mono text-neutral-400 w-6 text-right">{{ Math.round(masterVolume * 100) }}</span>
        </div>

        <div class="w-px h-4 bg-neutral-800 shrink-0" />

        <!-- Repeater -->
        <div class="flex items-center gap-2">
          <div class="relative -mt-1">
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
          <div class="relative">
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

        <button @click="closeStepContext" class="w-full text-[9px] text-neutral-600 hover:text-neutral-400 text-center pt-1">Close</button>
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
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to       { opacity: 0; }
</style>
