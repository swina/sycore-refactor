<script setup>
import { ref, watch, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { X, Minus, Download, RotateCcw, Play, Square, Scissors, SendHorizonal, Trash2, Magnet, Music, Repeat } from 'lucide-vue-next'
import { buildMidiFile } from '@/lib/midi-file'
import { storeToRefs } from 'pinia'
import { useMidiStore } from '@/stores/useMidiStore'
import { useCaptureStore } from '@/stores/useCaptureStore'
import { midiService } from '@/core/midi/MidiService'
import { useDraggableResizable } from '@/composables/useDraggableResizable'

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront } = useDraggableResizable({
  storageKey: 'SYCORE_POS_MIDI_CAPTURE',
  minimizeLabel: 'MIDI Capture',
  initialWidth: 920,
  initialHeight: 720,
  minHeight: 500,
  zIndex: 100,
})

const props = defineProps({
  isOpen: Boolean,
  notesRef: Object,
  noteCount: Number,
  captureEnabled: Boolean,
  bpm: { type: Number, default: 120 },
})
const emit = defineEmits(['close', 'reset', 'update:captureEnabled', 'sendToSequencer'])

const midiStore = useMidiStore()
const captureStore = useCaptureStore()

// ── Persistent state (survives panel close — cleared only by user reset) ──────
const { frozenNotes, phase, rangeStartMs, rangeEndMs } = storeToRefs(captureStore)

const canvasRef = ref(null)
const rulerCanvasRef = ref(null)
const noteLabelsRef = ref(null)
const scrollWrapRef = ref(null)
let animFrameId = null

const PX_PER_SIXTEENTH = 20 // pixels per 1/16 note at zoomX=1
const NOTE_H = 18           // fixed pixels per pitch lane (3× base scale)
const VISIBLE_PITCHES = 24  // minimum pitch lanes shown (2 octaves)
const RULER_H = 16          // pixels reserved at top of canvas for the measure/beat ruler

const zoomX = ref(1)        // horizontal (time) zoom multiplier

// Interaction state
const ctxMenu = ref(null)        // { x, y, noteIdx }
const selectedNoteIdx = ref(null) // index of selected note (shown red in piano roll)
const inlineEdit = ref(null)     // { pitch, velocity, duration } — live copy for the edit panel
const isLooping = ref(false)
const drag = ref(null) // { type, noteIdx?, startX, startY, origStartTime?, origPitch?, origMs? }

// ── Timeline ──────────────────────────────────────────────────────
const timelineMeasures = ref(4)
const timelineProgress = ref(0)
const timelineActive = ref(false)
let timelineRaf = null
let timelineStartTime = 0

function getBarProgress(idx) {
  const pctPerBar = 100 / timelineMeasures.value
  const barStart = idx * pctPerBar
  const progress = timelineProgress.value
  if (progress <= barStart) return 0
  if (progress >= barStart + pctPerBar) return 100
  return ((progress - barStart) / pctPerBar) * 100
}

function isBarActive(idx) {
  if (!timelineActive.value) return false
  const pctPerBar = 100 / timelineMeasures.value
  const barStart = idx * pctPerBar
  if (idx === 0 && timelineProgress.value === 0) return true
  return timelineProgress.value >= barStart && timelineProgress.value < barStart + pctPerBar
}

function startTimelineLoop() {
  if (timelineRaf) cancelAnimationFrame(timelineRaf)
  timelineStartTime = performance.now()
  const tick = () => {
    if (!timelineActive.value) { timelineProgress.value = 0; return }
    const totalSecs = timelineMeasures.value * 4 * (60 / (props.bpm || 120))
    if (totalSecs > 0) {
      const elapsed = (performance.now() - timelineStartTime) / 1000
      timelineProgress.value = ((elapsed % totalSecs) / totalSecs) * 100
    }
    timelineRaf = requestAnimationFrame(tick)
  }
  timelineRaf = requestAnimationFrame(tick)
}

function stopTimelineLoop() {
  if (timelineRaf) { cancelAnimationFrame(timelineRaf); timelineRaf = null }
  timelineProgress.value = 0
}

watch(timelineActive, active => active ? startTimelineLoop() : stopTimelineLoop())

// ── Independent note capture ──────────────────────────────────────
// MidiCapture registers its own listener (separate from the background
// composable) so it can filter by input device and avoid echoes.
const selectedInputId = ref('all')
const midiInputs = computed(() => midiStore.inputs || [])

// Live-apply inlineEdit changes to frozenNotes (no dialog confirm needed)
let inlineEditPaused = false
watch(inlineEdit, (val) => {
  if (inlineEditPaused || val === null || selectedNoteIdx.value === null) return
  const idx = selectedNoteIdx.value
  const notes = [...frozenNotes.value]
  if (!notes[idx]) return
  notes[idx] = { ...notes[idx], pitch: val.pitch, velocity: val.velocity, duration: val.duration }
  frozenNotes.value = notes
  nextTick(() => drawReviewPianoRoll())
}, { deep: true })

let previewTimeout = null  // note-off timer for note-select preview
let captureListener = null
let localNotes = []
const localActiveMap = new Map()
let recordingStartTs = 0
// Live pitch range — only expands, never shrinks, so canvas height is stable during recording
let livePMin = 48  // C3
let livePMax = 71  // B4 — 24 notes default range
// Dedup: tracks note-on timestamps keyed by inputId+chan+note to detect hardware octave-duplicates.
// Window is 2ms — tight enough to catch hardware echoes (typically < 1ms apart) but loose enough
// to allow legitimate chord notes on the same keyboard (arrive 2ms+ apart due to key scanning).
const recentNoteTs = new Map()

function startCaptureListener() {
  stopCaptureListener()
  localNotes = []
  localActiveMap.clear()
  recentNoteTs.clear()
  recordingStartTs = 0  // set on first note-on so recording is time-synced to first input
  livePMin = 48
  livePMax = 71
  captureListener = midiService.addNoteListener((type, note, velocity, chan, inputId) => {
    if (selectedInputId.value !== 'all' && inputId !== selectedInputId.value) return
    const now = Date.now()
    const key = `${chan}-${note}`
    if (type === 'on' && velocity > 0) {
      // Filter hardware octave-duplicate: if note-12 from the SAME input arrived within 2ms,
      // this note is almost certainly a hardware echo at +1 octave (e.g. Roland S-1 quirk).
      const lowerKey = `${inputId}:${chan}:${note - 12}`
      const lowerTs = recentNoteTs.get(lowerKey)
      if (lowerTs !== undefined && now - lowerTs < 2) return
      recentNoteTs.set(`${inputId}:${chan}:${note}`, now)

      // Sync start time to first note so there is no leading silence
      if (!recordingStartTs) recordingStartTs = now

      // Expand live pitch range if needed (only grows, never shrinks — keeps canvas height stable)
      if (note < livePMin) livePMin = Math.max(0,   note - 3)
      if (note > livePMax) livePMax = Math.min(127, note + 3)
      // Always keep at least VISIBLE_PITCHES lanes
      if (livePMax - livePMin + 1 < VISIBLE_PITCHES) livePMax = Math.min(127, livePMin + VISIBLE_PITCHES - 1)

      localActiveMap.set(key, now)
      localNotes.push({ pitch: note, velocity, channel: chan, startTime: now, duration: 0 })
    } else {
      const st = localActiveMap.get(key)
      if (st !== undefined) {
        const idx = localNotes.findLastIndex(n => n.pitch === note && n.channel === chan && n.startTime === st)
        if (idx >= 0) localNotes[idx] = { ...localNotes[idx], duration: now - st }
        localActiveMap.delete(key)
      }
    }
  })
}

function stopCaptureListener() {
  if (captureListener) { captureListener(); captureListener = null }
}

// ── Playback ──────────────────────────────────────────────────────
const isPlayingBack = ref(false)
const selectedOutputId = ref('all')
const playbackChannel = ref(1)
let playbackTimeouts = []

const midiOutputs = computed(() => {
  const regs = midiStore.routingConfig?.registrations ?? {}
  return (midiStore.outputs || []).filter(o => {
    const reg = regs[o.name]
    return reg && reg.outEnabled && reg.notes
  })
})

function sendNoteOn(pitch, velocity, ch) {
  const outId = selectedOutputId.value === 'all' ? null : selectedOutputId.value
  midiService.sendRawNote(outId, 'noteon', pitch, velocity, (ch - 1) & 0xF)
}

function sendNoteOff(pitch, ch) {
  const outId = selectedOutputId.value === 'all' ? null : selectedOutputId.value
  midiService.sendRawNote(outId, 'noteoff', pitch, 0, (ch - 1) & 0xF)
}

let playbackRaf = null
let playbackStartWall = 0
const playbackPos = ref(0) // ms elapsed since playback start

function stopPlayback() {
  isPlayingBack.value = false
  if (playbackRaf) { cancelAnimationFrame(playbackRaf); playbackRaf = null }
  playbackPos.value = 0
  playbackTimeouts.forEach(t => clearTimeout(t))
  playbackTimeouts = []
  const usedPitches = new Set(croppedNotes.value.map(n => n.pitch))
  usedPitches.forEach(p => sendNoteOff(p, playbackChannel.value))
  nextTick(() => drawReviewPianoRoll())
}

function startPlayback() {
  if (!croppedNotes.value.length) return
  stopPlayback()
  isPlayingBack.value = true
  playbackStartWall = performance.now()
  playbackPos.value = 0

  const ch = playbackChannel.value
  const notes = [...croppedNotes.value].sort((a, b) => a.startTime - b.startTime)
  const minTime = notes[0].startTime

  notes.forEach(note => {
    const delay = note.startTime - minTime
    const dur = Math.max(50, note.duration || 100)
    const tOn = setTimeout(() => {
      if (!isPlayingBack.value) return
      sendNoteOn(note.pitch, note.velocity, ch)
    }, delay)
    const tOff = setTimeout(() => sendNoteOff(note.pitch, ch), delay + dur)
    playbackTimeouts.push(tOn, tOff)
  })

  const totalDur = Math.max(...notes.map(n => (n.startTime - minTime) + Math.max(n.duration || 100, 50)))
  const tDone = setTimeout(() => {
    playbackTimeouts = []
    if (isLooping.value) {
      startPlayback()
    } else {
      isPlayingBack.value = false
    }
  }, totalDur + 150)
  playbackTimeouts.push(tDone)

  // RAF loop to animate playhead on the piano roll
  const loop = () => {
    if (!isPlayingBack.value) { drawReviewPianoRoll(); return }
    playbackPos.value = performance.now() - playbackStartWall
    drawReviewPianoRoll()
    playbackRaf = requestAnimationFrame(loop)
  }
  playbackRaf = requestAnimationFrame(loop)
}

function togglePlayback() {
  if (isPlayingBack.value) stopPlayback()
  else startPlayback()
}

// Sync playback channel to the routing registration when the output device changes
watch(selectedOutputId, (id) => {
  if (id === 'all') return
  const output = (midiStore.outputs || []).find(o => o.id === id)
  if (!output) return
  const reg = midiStore.routingConfig?.registrations?.[output.name]
  if (reg && reg.outChannel >= 0) {
    playbackChannel.value = reg.outChannel + 1  // registration is 0-based, selector is 1-based
  }
})

// Timeline: active while capturing OR playing back
watch([() => phase.value, isPlayingBack], ([p, playing]) => {
  timelineActive.value = p === 'capturing' || playing
})

// ── Derived ──────────────────────────────────────────────────────

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
function noteName(pitch) {
  return NOTE_NAMES[pitch % 12] + (Math.floor(pitch / 12) - 1)
}

const t0 = computed(() =>
  frozenNotes.value.length ? Math.min(...frozenNotes.value.map(n => n.startTime)) : 0
)
const tEnd = computed(() =>
  frozenNotes.value.length
    ? Math.max(...frozenNotes.value.map(n => n.startTime + Math.max(n.duration, 50)))
    : 0
)

const sixteenthMs = computed(() => (60000 / props.bpm) / 4)

const reviewPxPerMs = computed(() => (PX_PER_SIXTEENTH * zoomX.value) / sixteenthMs.value)
// 4 empty bars appended after the last event (for visual breathing room)
const tailMs        = computed(() => 16 * sixteenthMs.value)  // 1 bar tail after last event

const durationDivisions = computed(() => {
  const beat = 60000 / props.bpm
  const base = [
    { label: '1/64', ms: beat / 16 },
    { label: '1/32', ms: beat / 8 },
    { label: '1/16', ms: beat / 4 },
    { label: '1/8',  ms: beat / 2 },
    { label: '1/4',  ms: beat },
    { label: '1/2',  ms: beat * 2 },
    { label: '1/1',  ms: beat * 4 },
    { label: '2/1',  ms: beat * 8 },
    { label: '4/1',  ms: beat * 16 },
    { label: '8/1',  ms: beat * 32 },
  ]
  // Each row: [normal, dotted (×1.5), triplet (×2/3)]
  return base.map(d => [
    { label: d.label,       ms: Math.round(d.ms) },
    { label: d.label + '·', ms: Math.round(d.ms * 1.5) },
    { label: d.label + 'T', ms: Math.round(d.ms * 2 / 3) },
  ])
})

const velocitySliderStyle = computed(() => {
  const v = inlineEdit.value?.velocity ?? 64
  const pct = ((v - 1) / 126) * 100
  const color = `hsl(${v * 2}, 80%, 55%)`
  return {
    background: `linear-gradient(to right, ${color} ${pct}%, #2a2a2a ${pct}%)`,
  }
})

function isDivisionSelected(ms) {
  if (!inlineEdit.value) return false
  return Math.abs(inlineEdit.value.duration - ms) <= 5
}

const pitchMin = computed(() => {
  if (!frozenNotes.value.length) return 36
  return Math.max(0, Math.min(...frozenNotes.value.map(n => n.pitch)) - 3)
})
const pitchMax = computed(() => {
  if (!frozenNotes.value.length) return 36 + VISIBLE_PITCHES - 1
  const pMin = pitchMin.value
  const raw = Math.min(127, Math.max(...frozenNotes.value.map(n => n.pitch)) + 3)
  return Math.max(raw, pMin + VISIBLE_PITCHES - 1)
})

const croppedNotes = computed(() => {
  if (!frozenNotes.value.length) return []
  const rs = t0.value + rangeStartMs.value
  const re = t0.value + rangeEndMs.value
  return frozenNotes.value.filter(n => n.startTime >= rs && n.startTime < re)
})

const reviewCanvasWidth = computed(() => {
  if (!frozenNotes.value.length) return 800
  const contentMs = Math.max(tEnd.value - t0.value, sixteenthMs.value * 16) + tailMs.value
  const containerW = scrollWrapRef.value?.clientWidth || 800
  return Math.max(containerW, contentMs * reviewPxPerMs.value)
})

const rangeStartLabel = computed(() => {
  const beats = rangeStartMs.value / (sixteenthMs.value * 4)
  return `${(beats + 1).toFixed(2)}`
})
const rangeEndLabel = computed(() => {
  const beats = rangeEndMs.value / (sixteenthMs.value * 4)
  return `${(beats + 1).toFixed(2)}`
})

// ── Drawing ──────────────────────────────────────────────────────

// Draws the measure/beat ruler at the top of the canvas.
// xOfBeat(beatIdx) must map beat index (0-based from recording start) → canvas x pixel.
function drawRuler(ctx, W, xOfBeat, pxPerBeat) {
  // Background
  ctx.fillStyle = '#0d0d0d'
  ctx.fillRect(0, 0, W, RULER_H)
  ctx.strokeStyle = '#2a2a2a'
  ctx.lineWidth = 0.5
  ctx.beginPath(); ctx.moveTo(0, RULER_H); ctx.lineTo(W, RULER_H); ctx.stroke()

  const showBeats = pxPerBeat >= 28   // show sub-beat labels only when there's room

  // Estimate how many beats fit
  const totalBeats = Math.ceil(W / pxPerBeat) + 1

  ctx.textBaseline = 'middle'
  ctx.font = 'bold 8px monospace'

  for (let b = 0; b <= totalBeats; b++) {
    const x = xOfBeat(b)
    if (x < 0 || x > W) continue

    const measure = Math.floor(b / 4) + 1  // 1-based measure
    const beat    = (b % 4) + 1            // 1-based beat within measure

    const isMeasureStart = beat === 1

    // Tick
    ctx.strokeStyle = isMeasureStart ? '#666' : '#3e3e3e'
    ctx.lineWidth = isMeasureStart ? 1 : 0.5
    const tickTop = RULER_H - (isMeasureStart ? 10 : 6)
    ctx.beginPath(); ctx.moveTo(x, tickTop); ctx.lineTo(x, RULER_H); ctx.stroke()

    // Label
    if (isMeasureStart || showBeats) {
      const label = `${measure}.${beat}`
      ctx.fillStyle = isMeasureStart ? '#888' : '#444'
      ctx.fillText(label, x + 2, RULER_H / 2)
    }
  }
}

function drawFixedRuler(pxPerBeat) {
  const ruler = rulerCanvasRef.value
  if (!ruler) return
  const scrollLeft = scrollWrapRef.value?.scrollLeft ?? 0
  const cw = Math.round(ruler.getBoundingClientRect().width) || scrollWrapRef.value?.clientWidth || 800
  ruler.width = cw
  ruler.height = RULER_H
  const ctx = ruler.getContext('2d')

  ctx.fillStyle = '#0d0d0d'
  ctx.fillRect(0, 0, cw, RULER_H)
  ctx.strokeStyle = '#2a2a2a'
  ctx.lineWidth = 0.5
  ctx.beginPath(); ctx.moveTo(0, RULER_H); ctx.lineTo(cw, RULER_H); ctx.stroke()

  const showBeats = pxPerBeat >= 28
  const firstBeat = Math.floor(scrollLeft / pxPerBeat)
  const lastBeat  = Math.ceil((scrollLeft + cw) / pxPerBeat) + 1

  ctx.textBaseline = 'middle'
  ctx.font = 'bold 8px monospace'

  for (let b = firstBeat; b <= lastBeat; b++) {
    const sx = b * pxPerBeat - scrollLeft
    if (sx < -20 || sx > cw + 20) continue

    const measure = Math.floor(b / 4) + 1
    const beat    = (b % 4) + 1
    const isMeasureStart = beat === 1

    ctx.strokeStyle = isMeasureStart ? '#666' : '#3e3e3e'
    ctx.lineWidth = isMeasureStart ? 1 : 0.5
    const tickTop = RULER_H - (isMeasureStart ? 10 : 6)
    ctx.beginPath(); ctx.moveTo(sx, tickTop); ctx.lineTo(sx, RULER_H); ctx.stroke()

    if (isMeasureStart || showBeats) {
      ctx.fillStyle = isMeasureStart ? '#888' : '#444'
      ctx.fillText(`${measure}.${beat}`, sx + 2, RULER_H / 2)
    }
  }
}

function drawNoteLabels(pMin, pMax) {
  const labels = noteLabelsRef.value
  if (!labels || phase.value === 'idle') return
  const scrollTop = scrollWrapRef.value?.scrollTop ?? 0
  const clientH   = scrollWrapRef.value?.clientHeight ?? 390
  const visH      = Math.max(1, clientH - RULER_H)

  labels.width  = 36
  labels.height = visH
  labels.style.height = visH + 'px'

  const ctx = labels.getContext('2d')
  const noteH = NOTE_H

  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(0, 0, 36, visH)
  ctx.strokeStyle = '#252525'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(35.5, 0); ctx.lineTo(35.5, visH); ctx.stroke()

  ctx.font = 'bold 9px monospace'
  ctx.textBaseline = 'middle'

  for (let p = pMax; p >= pMin; p--) {
    const canvasY = (pMax - p) * noteH + RULER_H
    const screenY = canvasY - scrollTop - RULER_H
    if (screenY + noteH <= 0 || screenY >= visH) continue

    const isBlack = [1, 3, 6, 8, 10].includes(p % 12)
    const isC     = p % 12 === 0

    ctx.fillStyle = isBlack ? '#0c0c0c' : '#111'
    ctx.fillRect(0, screenY, 35, noteH)

    if (isC || noteH >= 14) {
      ctx.fillStyle = isC ? '#999' : '#3a3a3a'
      ctx.fillText(noteName(p), 2, screenY + noteH / 2)
    }

    if (isC) {
      ctx.strokeStyle = '#2a2a2a'
      ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(0, screenY); ctx.lineTo(35, screenY); ctx.stroke()
    }
  }
}

function drawLivePianoRoll() {
  const canvas = canvasRef.value
  if (!canvas || phase.value !== 'capturing') return
  const ctx = canvas.getContext('2d')
  const now = Date.now()
  const notes = localNotes
  const sixteenth = sixteenthMs.value
  const pxPerMs = (PX_PER_SIXTEENTH * zoomX.value) / sixteenth

  // Use stable live pitch range (only expands when new notes arrive, never shrinks mid-frame)
  const pMin = livePMin
  const pMax = livePMax
  const numPitches = pMax - pMin + 1
  const noteH = NOTE_H

  // Grow canvas dimensions as recording progresses
  const elapsedMs = recordingStartTs ? now - recordingStartTs : 0
  const neededWidth  = Math.max(800, Math.ceil((elapsedMs + sixteenth * 8) * pxPerMs))
  const neededHeight = noteH * numPitches + RULER_H
  if (canvas.width !== neededWidth)   canvas.width  = neededWidth
  if (canvas.height !== neededHeight) canvas.height = neededHeight

  const W = canvas.width
  const H = canvas.height

  function msToX(absMs) { return (absMs - recordingStartTs) * pxPerMs }
  function pitchToY(p) { return (pMax - p) * noteH + RULER_H }

  // Background (pitch area only — ruler is drawn separately)
  ctx.fillStyle = '#080808'
  ctx.fillRect(0, RULER_H, W, H - RULER_H)

  // Pitch lanes (black/white key rows)
  for (let p = pMin; p <= pMax; p++) {
    const isBlack = [1,3,6,8,10].includes(p % 12)
    ctx.fillStyle = isBlack ? '#0c0c0c' : '#101010'
    ctx.fillRect(0, pitchToY(p), W, noteH)
    if (p % 12 === 0) {
      ctx.strokeStyle = '#3a3a3a'
      ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(0, pitchToY(p)); ctx.lineTo(W, pitchToY(p)); ctx.stroke()
    }
  }

  // 1/16 vertical grid
  let gridT = 0; let stepIdx = 0
  while (gridT * pxPerMs <= W) {
    const x = gridT * pxPerMs
    const isBeat = stepIdx % 4 === 0
    const isBar = stepIdx % 16 === 0
    ctx.strokeStyle = isBar ? '#4a4a4a' : isBeat ? '#303030' : '#222222'
    ctx.lineWidth = isBar ? 1 : 0.5
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
    gridT += sixteenth; stepIdx++
  }

  // Notes
  notes.forEach(note => {
    const x = msToX(note.startTime)
    const noteDur = note.duration > 0 ? note.duration : Math.max(50, now - note.startTime)
    const w = Math.max(2, noteDur * pxPerMs)
    const y = pitchToY(note.pitch)
    ctx.fillStyle = `hsla(${note.velocity * 2}, 80%, 55%, 0.9)`
    ctx.fillRect(x, y, w, noteH - 0.5)
    if (w >= 14 && noteH >= 7) {
      const fs = Math.min(9, noteH - 2)
      ctx.save()
      ctx.fillStyle = 'rgba(0,0,0,0.8)'
      ctx.font = `bold ${fs}px monospace`
      ctx.textBaseline = 'middle'
      ctx.fillText(noteName(note.pitch), x + 2, y + noteH / 2)
      ctx.restore()
    }
  })

  // Playhead at current time
  const playheadX = elapsedMs * pxPerMs
  ctx.strokeStyle = '#ff3333'
  ctx.lineWidth = 2
  ctx.shadowColor = '#ff333388'
  ctx.shadowBlur = 6
  ctx.beginPath(); ctx.moveTo(playheadX, RULER_H); ctx.lineTo(playheadX, H); ctx.stroke()
  ctx.shadowBlur = 0

  const pxPerBeat = pxPerMs * sixteenth * 4
  drawFixedRuler(pxPerBeat)
  drawNoteLabels(livePMin, livePMax)

  // Auto-scroll to follow playhead (keep it at ~80% from left)
  if (scrollWrapRef.value) {
    const cw = scrollWrapRef.value.clientWidth
    const targetLeft = playheadX - cw * 0.8
    if (targetLeft > scrollWrapRef.value.scrollLeft) {
      scrollWrapRef.value.scrollLeft = targetLeft
    }
  }

  if (phase.value === 'capturing' && props.isOpen) {
    animFrameId = requestAnimationFrame(drawLivePianoRoll)
  }
}

function drawReviewPianoRoll() {
  const canvas = canvasRef.value
  if (!canvas || phase.value !== 'review') return
  const ctx = canvas.getContext('2d')

  const abs0 = t0.value
  const absEnd = Math.max(tEnd.value, abs0 + 1000) + tailMs.value
  const totalMs = absEnd - abs0
  if (totalMs <= 0) return

  const pMin = pitchMin.value
  const pMax = pitchMax.value
  const numPitches = pMax - pMin + 1
  const noteH = NOTE_H
  const pxPerMs = reviewPxPerMs.value

  // Set canvas dimensions (resizing clears the canvas — we redraw below)
  const targetW = reviewCanvasWidth.value
  const targetH = noteH * numPitches + RULER_H
  if (canvas.width  !== targetW) canvas.width  = targetW
  if (canvas.height !== targetH) canvas.height = targetH

  const W = canvas.width
  const H = canvas.height

  function msToX(absMs) { return (absMs - abs0) * pxPerMs }
  function pitchToY(pitch) { return (pMax - pitch) * noteH + RULER_H }

  // Background (pitch area only)
  ctx.fillStyle = '#080808'
  ctx.fillRect(0, RULER_H, W, H - RULER_H)

  // Pitch lanes
  for (let p = pMin; p <= pMax; p++) {
    const y = pitchToY(p)
    const isBlack = [1,3,6,8,10].includes(p % 12)
    ctx.fillStyle = isBlack ? '#0c0c0c' : '#101010'
    ctx.fillRect(0, y, W, noteH)
    if (p % 12 === 0) {
      ctx.strokeStyle = '#3a3a3a'
      ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
    }
  }

  // 1/16 vertical grid
  const sixteenth = sixteenthMs.value
  let gridT = abs0   // grid starts exactly at recording start so ruler & grid share the same origin
  let stepIdx = 0
  while (gridT <= absEnd) {
    const x = msToX(gridT)
    const isBeat = stepIdx % 4 === 0
    const isBar = stepIdx % 16 === 0
    ctx.strokeStyle = isBar ? '#4a4a4a' : isBeat ? '#303030' : '#222222'
    ctx.lineWidth = isBar ? 1 : 0.5
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
    gridT += sixteenth
    stepIdx++
  }

  // Out-of-range shading
  const rxStart = msToX(abs0 + rangeStartMs.value)
  const rxEnd = msToX(abs0 + rangeEndMs.value)
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  if (rxStart > 0) ctx.fillRect(0, 0, rxStart, H)
  if (rxEnd < W) ctx.fillRect(rxEnd, 0, W - rxEnd, H)

  // Notes
  frozenNotes.value.forEach((note, i) => {
    const x = msToX(note.startTime)
    const w = Math.max(2, Math.max(note.duration, 50) * pxPerMs)
    const y = pitchToY(note.pitch)
    const inRange = note.startTime >= abs0 + rangeStartMs.value && note.startTime < abs0 + rangeEndMs.value
    const isSelected = i === selectedNoteIdx.value

    ctx.fillStyle = isSelected
      ? 'hsla(0, 85%, 62%, 0.95)'
      : inRange
        ? `hsla(${note.velocity * 2}, 80%, 55%, 0.9)`
        : `hsla(${note.velocity * 2}, 25%, 35%, 0.5)`
    ctx.fillRect(x, y, w, noteH - 0.5)

    if (isSelected) {
      ctx.strokeStyle = '#ff6666'
      ctx.lineWidth = 1.5
      ctx.shadowColor = '#ff444466'
      ctx.shadowBlur = 4
      ctx.strokeRect(x, y, w, noteH - 0.5)
      ctx.shadowBlur = 0
    } else if (inRange) {
      ctx.strokeStyle = '#00ffcc55'
      ctx.lineWidth = 0.5
      ctx.strokeRect(x, y, w, noteH - 0.5)
    }

    if (w >= 14 && noteH >= 7) {
      const fs = Math.min(9, noteH - 2)
      ctx.save()
      ctx.fillStyle = isSelected ? 'rgba(255,255,255,0.95)' : inRange ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.25)'
      ctx.font = `bold ${fs}px monospace`
      ctx.textBaseline = 'middle'
      ctx.fillText(noteName(note.pitch), x + 2, y + noteH / 2)
      ctx.restore()
    }
  })

  // Range start handle
  ctx.strokeStyle = '#ffaa00'
  ctx.lineWidth = 2
  ctx.setLineDash([4, 3])
  ctx.beginPath(); ctx.moveTo(rxStart, RULER_H); ctx.lineTo(rxStart, H); ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#ffaa00'
  ctx.beginPath()
  ctx.moveTo(rxStart - 7, RULER_H); ctx.lineTo(rxStart + 7, RULER_H); ctx.lineTo(rxStart, RULER_H + 14)
  ctx.fill()

  // Range end handle
  ctx.strokeStyle = '#ff5500'
  ctx.lineWidth = 2
  ctx.setLineDash([4, 3])
  ctx.beginPath(); ctx.moveTo(rxEnd, RULER_H); ctx.lineTo(rxEnd, H); ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#ff5500'
  ctx.beginPath()
  ctx.moveTo(rxEnd - 7, RULER_H); ctx.lineTo(rxEnd + 7, RULER_H); ctx.lineTo(rxEnd, RULER_H + 14)
  ctx.fill()

  // Playback playhead + auto-scroll
  if (isPlayingBack.value) {
    const playheadMs = abs0 + rangeStartMs.value + playbackPos.value
    const px = msToX(playheadMs)
    if (px >= 0 && px <= W) {
      ctx.strokeStyle = '#ff007f'
      ctx.lineWidth = 2
      ctx.shadowColor = '#ff007f'
      ctx.shadowBlur = 8
      ctx.beginPath(); ctx.moveTo(px, RULER_H); ctx.lineTo(px, H); ctx.stroke()
      ctx.shadowBlur = 0
    }
    if (scrollWrapRef.value) {
      const cw = scrollWrapRef.value.clientWidth
      const targetLeft = px - cw * 0.35
      if (Math.abs(scrollWrapRef.value.scrollLeft - targetLeft) > 4) {
        scrollWrapRef.value.scrollLeft = Math.max(0, targetLeft)
      }
    }
  }

  const pxPerBeat = pxPerMs * sixteenthMs.value * 4
  drawFixedRuler(pxPerBeat)
  drawNoteLabels(pitchMin.value, pitchMax.value)
}

// ── Mouse helpers ─────────────────────────────────────────────────

function getMousePos(canvas, event) {
  const rect = canvas.getBoundingClientRect()
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  }
}

function getNoteAtPos(x, y) {
  if (!canvasRef.value) return -1
  const abs0 = t0.value
  const pxPerMs = reviewPxPerMs.value
  const pMax = pitchMax.value
  const noteH = NOTE_H

  for (let i = frozenNotes.value.length - 1; i >= 0; i--) {
    const note = frozenNotes.value[i]
    const nx = (note.startTime - abs0) * pxPerMs
    const nw = Math.max(2, Math.max(note.duration, 50) * pxPerMs)
    const ny = (pMax - note.pitch) * noteH + RULER_H
    if (x >= nx && x <= nx + nw && y >= ny && y <= ny + noteH) return i
  }
  return -1
}

function addNoteAtPos(x, y) {
  const pxPerMs  = reviewPxPerMs.value
  const sixteenth = sixteenthMs.value
  // Snap x to nearest 1/16 grid
  const rawMs    = x / pxPerMs
  const snappedMs = Math.round(rawMs / sixteenth) * sixteenth
  const startTime = t0.value + Math.max(0, snappedMs)
  const pitch     = Math.max(0, Math.min(127, pitchMax.value - Math.floor((y - RULER_H) / NOTE_H)))
  const duration  = inlineEdit.value?.duration ?? sixteenth * 4
  const velocity  = inlineEdit.value?.velocity ?? 100

  const notes = [...frozenNotes.value, { pitch, velocity, duration, startTime, channel: 1 }]
  notes.sort((a, b) => a.startTime - b.startTime)
  frozenNotes.value = notes

  const newIdx = notes.findIndex(n => n.startTime === startTime && n.pitch === pitch && n.velocity === velocity)
  nextTick(() => {
    drawReviewPianoRoll()
    if (newIdx >= 0) selectNote(newIdx)
  })
}

function onCanvasMouseDown(event) {
  if (phase.value !== 'review') return
  ctxMenu.value = null
  const canvas = canvasRef.value
  const { x, y } = getMousePos(canvas, event)
  const pxPerMs = reviewPxPerMs.value

  if (event.ctrlKey && event.button === 0) {
    addNoteAtPos(x, y)
    return
  }

  const rxStart = rangeStartMs.value * pxPerMs
  const rxEnd   = rangeEndMs.value   * pxPerMs

  if (Math.abs(x - rxStart) <= 10) {
    drag.value = { type: 'rangeStart', startX: x, origMs: rangeStartMs.value }
    return
  }
  if (Math.abs(x - rxEnd) <= 10) {
    drag.value = { type: 'rangeEnd', startX: x, origMs: rangeEndMs.value }
    return
  }

  const noteIdx = getNoteAtPos(x, y)
  if (noteIdx < 0) {
    // Click on empty space: deselect
    selectedNoteIdx.value = null
    inlineEdit.value = null
    nextTick(() => drawReviewPianoRoll())
    return
  }

  selectNote(noteIdx)

  if (event.button === 2) {
    ctxMenu.value = { x: event.clientX, y: event.clientY, noteIdx }
    event.preventDefault()
    return
  }

  const note = frozenNotes.value[noteIdx]
  drag.value = {
    type: 'note',
    noteIdx,
    startX: x,
    startY: y,
    origStartTime: note.startTime,
    origPitch: note.pitch,
  }
}

function onCanvasMouseMove(event) {
  if (!drag.value || phase.value !== 'review') return
  const canvas = canvasRef.value
  const { x, y } = getMousePos(canvas, event)
  const pxPerMs = reviewPxPerMs.value
  const noteH = NOTE_H
  const totalMs = (Math.max(tEnd.value, t0.value + 1000) + tailMs.value) - t0.value

  if (drag.value.type === 'rangeStart') {
    const dxMs = (x - drag.value.startX) / pxPerMs
    rangeStartMs.value = Math.max(0, Math.min(rangeEndMs.value - sixteenthMs.value, drag.value.origMs + dxMs))
  } else if (drag.value.type === 'rangeEnd') {
    const dxMs = (x - drag.value.startX) / pxPerMs
    rangeEndMs.value = Math.max(
      rangeStartMs.value + sixteenthMs.value,
      Math.min(totalMs, drag.value.origMs + dxMs)
    )
  } else if (drag.value.type === 'note') {
    const dxMs = (x - drag.value.startX) / pxPerMs
    const dyPitch = -Math.round((y - drag.value.startY) / noteH)
    const notes = [...frozenNotes.value]
    notes[drag.value.noteIdx] = {
      ...notes[drag.value.noteIdx],
      startTime: Math.round(drag.value.origStartTime + dxMs),
      pitch: Math.max(0, Math.min(127, drag.value.origPitch + dyPitch)),
    }
    frozenNotes.value = notes
  }

  drawReviewPianoRoll()
}

function onCanvasMouseUp() {
  if (drag.value?.type === 'note' && drag.value.noteIdx === selectedNoteIdx.value) {
    const note = frozenNotes.value[selectedNoteIdx.value]
    if (note && inlineEdit.value && note.pitch !== inlineEdit.value.pitch) {
      inlineEditPaused = true
      inlineEdit.value = { ...inlineEdit.value, pitch: note.pitch }
      nextTick(() => { inlineEditPaused = false })
    }
  }
  drag.value = null
}

function onCanvasContextMenu(event) {
  event.preventDefault()
}

// ── Actions ───────────────────────────────────────────────────────

function toggleCapture() {
  if (phase.value === 'capturing') {
    // STOP → freeze the independently captured notes
    stopCaptureListener()
    emit('update:captureEnabled', false)
    frozenNotes.value = localNotes
      .map(n => ({ ...n, duration: n.duration || 100 }))
      .sort((a, b) => a.startTime - b.startTime)
    if (frozenNotes.value.length > 0) {
      const abs0 = Math.min(...frozenNotes.value.map(n => n.startTime))
      const absEnd = Math.max(...frozenNotes.value.map(n => n.startTime + Math.max(n.duration, 50)))
      rangeStartMs.value = 0
      rangeEndMs.value = absEnd - abs0 + tailMs.value
    }
    cancelAnimationFrame(animFrameId)
    phase.value = 'review'
    nextTick(() => drawReviewPianoRoll())
  } else {
    // START
    frozenNotes.value = []
    ctxMenu.value = null
    selectedNoteIdx.value = null
    inlineEdit.value = null
    drag.value = null
    startCaptureListener()
    emit('update:captureEnabled', true)
    phase.value = 'capturing'
    animFrameId = requestAnimationFrame(drawLivePianoRoll)
  }
}

function cropToRange() {
  const abs0 = t0.value
  const rs = abs0 + rangeStartMs.value
  const re = abs0 + rangeEndMs.value
  frozenNotes.value = frozenNotes.value.filter(n => n.startTime >= rs && n.startTime < re)
  if (frozenNotes.value.length > 0) {
    rangeStartMs.value = 0
    const newAbs0 = Math.min(...frozenNotes.value.map(n => n.startTime))
    const newAbsEnd = Math.max(...frozenNotes.value.map(n => n.startTime + Math.max(n.duration, 50)))
    rangeEndMs.value = newAbsEnd - newAbs0
  }
  nextTick(() => drawReviewPianoRoll())
}

function quantizeNotes() {
  if (!frozenNotes.value.length) return
  const abs0 = t0.value
  const sixteenth = sixteenthMs.value
  frozenNotes.value = frozenNotes.value.map(n => {
    const rel = n.startTime - abs0
    const quantized = Math.round(rel / sixteenth) * sixteenth
    return { ...n, startTime: abs0 + quantized }
  })
  nextTick(() => drawReviewPianoRoll())
}

function selectNote(idx) {
  selectedNoteIdx.value = idx
  const note = frozenNotes.value[idx]
  if (note) {
    inlineEditPaused = true
    inlineEdit.value = { pitch: note.pitch, velocity: note.velocity, duration: note.duration || 100 }
    nextTick(() => { inlineEditPaused = false })

    // Preview: send note-on immediately, note-off after capped duration
    if (previewTimeout) { clearTimeout(previewTimeout); previewTimeout = null }
    const ch = playbackChannel.value
    sendNoteOn(note.pitch, note.velocity, ch)
    previewTimeout = setTimeout(() => {
      sendNoteOff(note.pitch, ch)
      previewTimeout = null
    }, Math.min(note.duration || 200, 500))
  }
  ctxMenu.value = null
  nextTick(() => drawReviewPianoRoll())
}

function deselectNote() {
  if (previewTimeout) { clearTimeout(previewTimeout); previewTimeout = null }
  selectedNoteIdx.value = null
  inlineEdit.value = null
  nextTick(() => drawReviewPianoRoll())
}

function deleteNote(idx) {
  const notes = [...frozenNotes.value]
  notes.splice(idx, 1)
  frozenNotes.value = notes
  ctxMenu.value = null
  if (selectedNoteIdx.value === idx) {
    selectedNoteIdx.value = null
    inlineEdit.value = null
  } else if (selectedNoteIdx.value !== null && selectedNoteIdx.value > idx) {
    selectedNoteIdx.value = selectedNoteIdx.value - 1
  }
  nextTick(() => drawReviewPianoRoll())
}

function sendToSequencer() {
  const notes = croppedNotes.value
  if (!notes.length) return

  const abs0 = t0.value
  const rs = abs0 + rangeStartMs.value
  const re = abs0 + rangeEndMs.value
  const duration = re - rs
  const sixteenth = sixteenthMs.value

  const rawSteps = duration / sixteenth
  const numSteps = Math.min(64, Math.max(16, Math.ceil(rawSteps / 16) * 16))
  const stepMs = duration / numSteps

  const steps = Array.from({ length: numSteps }, (_, i) => {
    const stepStart = rs + i * stepMs
    const stepEnd = stepStart + stepMs
    const stepNotes = notes.filter(n => n.startTime >= stepStart && n.startTime < stepEnd)

    if (!stepNotes.length) {
      return { active: false, notes: [60], velocity: 100, gate: 50, tieSteps: 0, param1Value: 64, param2Value: 64, edited: false }
    }

    const pitches = [...new Set(stepNotes.map(n => n.pitch))]
    const avgVel = Math.round(stepNotes.reduce((s, n) => s + n.velocity, 0) / stepNotes.length)
    const avgDur = stepNotes.reduce((s, n) => s + (n.duration || 100), 0) / stepNotes.length
    const gate = Math.min(100, Math.max(5, Math.round((avgDur / stepMs) * 100)))

    return {
      active: true,
      notes: pitches,
      velocity: avgVel,
      gate,
      tieSteps: 0,
      param1Value: 64,
      param2Value: 64,
      edited: true,
      explicitNotes: true,
    }
  })

  emit('sendToSequencer', {
    numSteps,
    steps,
    param1CC: 74,
    param2CC: 71,
    param1Variation: 0,
    param2Variation: 0,
    transpose: 0,
    selectedOctave: 4,
    octaveRange: 0,
  })
}

function exportMidi() {
  const notes = croppedNotes.value
  if (!notes.length) return
  const minTime = Math.min(...notes.map(n => n.startTime))
  const normalized = notes.map(n => ({ ...n, startTime: n.startTime - minTime }))
  const midiData = buildMidiFile(normalized, props.bpm)
  const blob = new Blob([midiData], { type: 'audio/midi' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `S1CORE_Capture_${new Date().toISOString().slice(0, 10)}.mid`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function doReset() {
  stopPlayback()
  stopTimelineLoop()
  stopCaptureListener()
  if (props.captureEnabled) emit('update:captureEnabled', false)
  cancelAnimationFrame(animFrameId)
  captureStore.clear()
  ctxMenu.value = null
  selectedNoteIdx.value = null
  inlineEdit.value = null
  drag.value = null
  zoomX.value = 1
  emit('reset')
}

function onScrollWrap() {
  if (phase.value === 'review') {
    const pxPerBeat = reviewPxPerMs.value * sixteenthMs.value * 4
    drawFixedRuler(pxPerBeat)
    drawNoteLabels(pitchMin.value, pitchMax.value)
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────

watch(reviewCanvasWidth, () => {
  if (phase.value === 'review') nextTick(() => drawReviewPianoRoll())
})

watch(zoomX, () => {
  if (phase.value === 'review') nextTick(() => drawReviewPianoRoll())
})

watch(() => props.isOpen, (open) => {
  if (!open) {
    cancelAnimationFrame(animFrameId)
    ctxMenu.value = null
  } else {
    bringToFront()
    if (phase.value === 'capturing') {
      cancelAnimationFrame(animFrameId)
      animFrameId = requestAnimationFrame(drawLivePianoRoll)
    } else if (phase.value === 'review') {
      nextTick(() => drawReviewPianoRoll())
    }
  }
})

onMounted(() => {
  // Restore the last capture when the panel is reopened (canvas is a fresh DOM element)
  if (phase.value === 'review' && frozenNotes.value.length) {
    nextTick(() => drawReviewPianoRoll())
  }
})

onUnmounted(() => {
  cancelAnimationFrame(animFrameId)
  if (playbackRaf) cancelAnimationFrame(playbackRaf)
  if (previewTimeout) clearTimeout(previewTimeout)
  stopPlayback()
  stopTimelineLoop()
  stopCaptureListener()
})
</script>

<template>
  <div v-if="isOpen" @click.self="ctxMenu = null">
      <div class="bg-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden flex flex-col shadow-[0_0_10px_rgba(0,255,204,0.15)]" :style="panelStyle" v-show="!isMinimized">

        <!-- Header -->
        <div class="px-5 py-3 border-b border-neutral-900 flex justify-between items-center bg-gradient-to-r from-cyan-950/40 to-transparent flex-shrink-0 cursor-grab active:cursor-grabbing select-none" @mousedown="onDragStart">
          <div class="flex items-center gap-3">
            <Music class="w-5 h-5 text-neutral-500" />
            <h2 class="text-sm font-black uppercase tracking-widest text-white">MIDI Capture</h2>
            <span
              class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-widest"
              :class="phase === 'capturing' ? 'bg-red-500/20 text-red-400 animate-pulse' : phase === 'review' ? 'bg-neutral-700 text-neutral-300' : 'bg-neutral-800 text-neutral-500'"
            >
              {{ phase === 'capturing' ? 'REC' : phase === 'review' ? `${frozenNotes.length} notes` : 'IDLE' }}
            </span>
          </div>
          <div class="flex items-center gap-1">
            <button @click="toggleMinimize" title="Minimize"
              class="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-500 hover:text-yellow-400 transition-colors">
              <Minus class="w-3.5 h-3.5" />
            </button>
            <button @click="emit('close')" class="p-1 text-neutral-500 hover:text-white transition-colors">
              <X class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Capture controls bar -->
        <div class="px-5 py-2.5 border-b border-neutral-900 flex items-center gap-3 flex-shrink-0 bg-neutral-900/40">
          <!-- Input device selector -->
          <select
            v-model="selectedInputId"
            :disabled="phase === 'capturing'"
            class="bg-black border border-neutral-800 text-neutral-400 text-[10px] font-mono rounded px-2 py-1 outline-none focus:border-synth-neon/50 shrink-0 max-w-[160px] disabled:opacity-50"
            title="MIDI input to capture from"
          >
            <option value="all">All inputs</option>
            <option v-for="i in midiInputs" :key="i.id" :value="i.id">{{ i.name }}</option>
          </select>

          <!-- START / STOP capture -->
          <button
            @click="toggleCapture"
            class="flex items-center gap-2 px-4 py-1.5 rounded-lg font-bold text-xs uppercase tracking-widest transition-all shrink-0"
            :class="phase === 'capturing'
              ? 'bg-red-500 text-white hover:bg-red-400 shadow-lg shadow-red-500/30'
              : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white'"
          >
            <Square v-if="phase === 'capturing'" class="w-3 h-3" />
            <Play v-else class="w-3 h-3" />
            {{ phase === 'capturing' ? 'Stop' : 'Capture' }}
          </button>

          <!-- 4-bar timeline -->
          <div class="flex-1 flex flex-col justify-center min-w-0">
            <div class="flex justify-between px-0.5 mb-0.5">
              <span v-for="m in timelineMeasures" :key="m" class="text-[7px] font-black text-neutral-600 uppercase">{{ m }}</span>
            </div>
            <div class="flex gap-1 w-full">
              <div
                v-for="idx in timelineMeasures" :key="idx"
                class="h-2.5 flex-1 bg-black/60 rounded border border-neutral-900/80 p-px relative overflow-hidden flex items-center"
              >
                <div
                  class="h-full bg-gradient-to-r from-violet-600 via-cyan-500 to-emerald-400 rounded-sm transition-all duration-75 ease-linear"
                  :style="{ width: getBarProgress(idx - 1) + '%' }"
                />
                <div
                  v-if="isBarActive(idx - 1)"
                  class="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_5px_white] z-10"
                  :style="{ left: `calc(${getBarProgress(idx - 1)}% - 0.25px)` }"
                />
              </div>
            </div>
          </div>

          <!-- Bars selector -->
          <div class="flex items-center gap-1 shrink-0">
            <span class="text-[8px] font-black uppercase text-neutral-600 tracking-wider">Bars</span>
            <div class="flex p-0.5 bg-neutral-900 border border-neutral-800 rounded-lg h-6">
              <button
                v-for="m in [1, 2, 4, 8]" :key="m"
                @click="timelineMeasures = m"
                :class="['px-1.5 text-[8px] font-mono font-bold rounded transition-all', timelineMeasures === m ? 'bg-synth-neon/20 text-synth-neon' : 'text-neutral-500 hover:text-white']"
              >{{ m }}</button>
            </div>
          </div>

          <button @click="doReset" class="p-1.5 text-neutral-600 hover:text-neutral-300 transition-colors shrink-0" title="Reset">
            <RotateCcw class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Device / channel / info row (review only) -->
        <div v-if="phase === 'review'" class="px-5 py-2 border-b border-neutral-900 bg-neutral-900/20 flex items-center gap-3 flex-shrink-0">
          <Music class="w-3 h-3 text-neutral-500 shrink-0" />
          <!-- Output device -->
          <select
            v-model="selectedOutputId"
            class="bg-black border border-neutral-800 text-neutral-300 text-[10px] font-mono rounded px-2 py-1 outline-none focus:border-synth-neon/50 flex-1 min-w-0"
          >
            <option value="all">All outputs (MIDI routing)</option>
            <option v-for="o in midiOutputs" :key="o.id" :value="o.id">{{ o.name }}</option>
          </select>
          <!-- Channel -->
          <div class="flex items-center gap-1.5 shrink-0">
            <span class="text-[9px] font-black uppercase text-neutral-500 tracking-wider">CH</span>
            <select
              v-model.number="playbackChannel"
              class="bg-black border border-neutral-800 text-neutral-300 text-[10px] font-mono rounded px-2 py-1 outline-none focus:border-synth-neon/50 w-14"
            >
              <option v-for="ch in 16" :key="ch" :value="ch">{{ ch }}</option>
            </select>
          </div>
          <!-- Info -->
          <span class="text-[9px] font-mono text-neutral-500 shrink-0">
            BPM {{ bpm }} · 1/16 = {{ Math.round(sixteenthMs) }}ms · {{ croppedNotes.length }} notes
          </span>
        </div>

        <!-- Piano Roll canvas -->
        <div
          class="flex-1 bg-black relative select-none flex flex-col overflow-hidden"
          :class="phase === 'review' ? 'cursor-crosshair' : ''"
          style="min-height:390px"
        >
          <!-- Idle placeholder -->
          <div v-if="phase === 'idle'" class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-neutral-700">
            <Play class="w-10 h-10 opacity-30" />
            <p class="text-xs font-mono uppercase tracking-widest">Press Capture to start recording MIDI notes</p>
          </div>

          <!-- Zoom controls -->
          <div v-if="phase !== 'idle'" class="absolute top-4 right-2 z-10 flex items-center gap-1 bg-black/70 border border-neutral-800 rounded px-1.5 py-0.5 pointer-events-auto">
            <span class="text-[7px] font-black uppercase text-neutral-600 tracking-wider">Zoom</span>
            <button @click="zoomX = Math.max(0.25, parseFloat((zoomX - 0.25).toFixed(2)))"
              class="w-4 h-4 flex items-center justify-center text-neutral-500 hover:text-white text-[10px] font-bold rounded hover:bg-neutral-800 transition-colors">−</button>
            <span class="text-[9px] font-mono text-neutral-400 w-7 text-center">{{ zoomX }}x</span>
            <button @click="zoomX = Math.min(8, parseFloat((zoomX + 0.25).toFixed(2)))"
              class="w-4 h-4 flex items-center justify-center text-neutral-500 hover:text-white text-[10px] font-bold rounded hover:bg-neutral-800 transition-colors">+</button>
          </div>

          <!-- Fixed ruler overlay (never scrolls) — starts after the 36px note-label column -->
          <canvas
            v-show="phase !== 'idle'"
            ref="rulerCanvasRef"
            height="16"
            class="absolute top-0 pointer-events-none z-10 block"
            style="left:36px; height:16px; width:calc(100% - 36px)"
          />

          <!-- Fixed note-name labels (scrolls vertically in sync, never horizontally) -->
          <canvas
            v-show="phase !== 'idle'"
            ref="noteLabelsRef"
            width="36"
            height="374"
            class="absolute left-0 pointer-events-none z-10 block"
            style="top:16px"
          />

          <!-- Scrollable piano roll — offset by 36px so the note-label column is a distinct layer -->
          <div
            ref="scrollWrapRef"
            class="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar"
            style="margin-left:36px"
            @scroll="onScrollWrap"
          >
            <canvas
              v-show="phase !== 'idle'"
              ref="canvasRef"
              width="800"
              height="390"
              class="block"
              @mousedown="onCanvasMouseDown"
              @mousemove="onCanvasMouseMove"
              @mouseup="onCanvasMouseUp"
              @mouseleave="onCanvasMouseUp"
              @contextmenu="onCanvasContextMenu"
            />
          </div>

          <!-- Review mode hint overlay -->
          <div v-if="phase === 'review'" class="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
            <span class="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">
              Ctrl+Click to add · Click to select · Drag to move · Right-click to delete · Drag handles to set range
            </span>
          </div>
        </div>

        <!-- Inline Note Editor — shown when a note is selected in review mode -->
        <div
          v-if="phase === 'review' && selectedNoteIdx !== null && inlineEdit"
          class="px-5 py-2.5 border-t border-red-900/40 bg-red-950/10 flex-shrink-0"
        >
          <div class="flex gap-4 items-stretch">

            <!-- Left column: Pitch + Velocity sliders -->
            <div class="flex flex-col gap-2 flex-1 min-w-0">
              <div class="flex items-center gap-1.5 mb-0.5">
                <div class="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_#ef4444] shrink-0" />
                <span class="text-[8px] font-black uppercase tracking-widest text-neutral-600">Note</span>
              </div>

              <!-- Pitch -->
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-[9px] font-black uppercase tracking-widest text-red-400/70 shrink-0 w-7">Pitch</span>
                <span class="text-[10px] font-mono font-bold text-red-300 w-8 shrink-0">{{ noteName(inlineEdit.pitch) }}</span>
                <input type="range" min="0" max="127" v-model.number="inlineEdit.pitch"
                  class="flex-1 accent-red-500 min-w-0 h-1" />
              </div>

              <!-- Velocity -->
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-[9px] font-black uppercase tracking-widest text-neutral-500 shrink-0 w-7">Vel</span>
                <span class="text-[10px] font-mono font-bold w-8 shrink-0"
                  :style="{ color: `hsl(${inlineEdit.velocity * 2}, 80%, 65%)` }">{{ inlineEdit.velocity }}</span>
                <input type="range" min="1" max="127" v-model.number="inlineEdit.velocity"
                  class="vel-slider flex-1 min-w-0"
                  :style="velocitySliderStyle" />
              </div>
            </div>

            <!-- Divider -->
            <div class="w-px bg-neutral-800 self-stretch shrink-0" />

            <!-- Right column: Duration divisions -->
            <div class="flex flex-col gap-1.5 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-[8px] font-black uppercase tracking-widest text-neutral-600 shrink-0">Dur</span>
                <div class="flex items-center gap-1 ml-auto">
                  <input type="number" min="10" max="60000" step="1"
                    v-model.number="inlineEdit.duration"
                    class="w-16 bg-neutral-900 border border-neutral-700 text-white text-[10px] font-mono px-2 py-0.5 rounded text-right focus:outline-none focus:border-synth-neon" />
                  <span class="text-[9px] text-neutral-600 font-mono">ms</span>
                </div>
              </div>

              <!-- Division grid -->
              <div class="overflow-x-auto custom-scrollbar pb-0.5">
                <div class="flex gap-1" style="min-width: max-content">
                  <div v-for="(row, ri) in durationDivisions" :key="ri" class="flex flex-col gap-0.5">
                    <button
                      v-for="(div, ci) in row" :key="div.label"
                      @click="inlineEdit.duration = div.ms"
                      :class="[
                        'w-10 py-0.5 rounded text-[8px] font-mono font-bold border transition-all',
                        isDivisionSelected(div.ms)
                          ? ci === 0 ? 'bg-synth-neon/20 border-synth-neon/60 text-synth-neon'
                            : ci === 1 ? 'bg-yellow-500/20 border-yellow-500/60 text-yellow-400'
                            : 'bg-purple-500/20 border-purple-500/60 text-purple-400'
                          : 'border-neutral-800 text-neutral-600 hover:border-neutral-600 hover:text-neutral-300 bg-transparent'
                      ]"
                    >{{ div.label }}</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex flex-col justify-start gap-1 shrink-0">
              <button @click="deleteNote(selectedNoteIdx)"
                class="p-1.5 text-red-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-all" title="Delete note">
                <Trash2 class="w-3.5 h-3.5" />
              </button>
              <button @click="deselectNote"
                class="p-1.5 text-neutral-600 hover:text-neutral-400 rounded transition-all" title="Deselect">
                <X class="w-3 h-3" />
              </button>
            </div>

          </div>
        </div>

        <!-- Bottom action bar -->
        <div class="px-5 py-2.5 border-t border-neutral-900 bg-neutral-900/50 flex justify-between items-center gap-2 flex-shrink-0">
          <div class="flex items-center gap-3">
            <div class="text-[10px] font-mono text-neutral-500">
              <template v-if="phase === 'review'">{{ frozenNotes.length }} total / {{ croppedNotes.length }} in range</template>
              <template v-else-if="phase === 'capturing'">{{ noteCount }} captured</template>
            </div>
            <!-- Range + Crop (review only) -->
            <template v-if="phase === 'review'">
              <div class="w-px h-4 bg-neutral-700 shrink-0" />
              <span class="text-[10px] font-mono text-yellow-500/80">IN: beat {{ rangeStartLabel }}</span>
              <span class="text-[10px] font-mono text-orange-500/80">OUT: beat {{ rangeEndLabel }}</span>
              <button
                @click="cropToRange"
                :disabled="croppedNotes.length === 0"
                class="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 text-neutral-400 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-neutral-700 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Scissors class="w-3 h-3" /> Crop
              </button>
            </template>
          </div>

          <div class="flex gap-2 text-[9px] flex-wrap justify-end">
            <!-- Loop toggle -->
            <button
              v-if="phase === 'review'"
              @click="isLooping = !isLooping"
              :disabled="croppedNotes.length === 0"
              :class="['p-2 text-sm rounded-lg border transition-all disabled:opacity-40 disabled:cursor-not-allowed',
                isLooping
                  ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.3)]'
                  : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:text-neutral-300']"
              title="Loop playback"
            >
              <Repeat class="w-3.5 h-3.5" />
            </button>

            <!-- Play / Stop playback -->
            <button
              v-if="phase === 'review'"
              @click="togglePlayback"
              :disabled="croppedNotes.length === 0"
              class="px-3 py-1.5 rounded-lg font-bold text-[9px] uppercase tracking-widest flex items-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              :class="isPlayingBack
                ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
                : 'bg-neutral-800 text-neutral-300 border border-neutral-700 hover:bg-neutral-700 hover:text-white'"
            >
              <Square v-if="isPlayingBack" class="w-3 h-3 fill-current" />
              <Play v-else class="w-3 h-3" />
              {{ isPlayingBack ? 'Stop' : 'Play' }}
            </button>

            <!-- Quantize -->
            <button
              v-if="phase === 'review'"
              @click="quantizeNotes"
              :disabled="frozenNotes.length === 0"
              class="px-3 py-1.5 bg-neutral-800 text-[9px] text-neutral-300 border border-neutral-700 rounded-lg hover:bg-neutral-700 hover:text-white transition-all font-bold text-xs uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Snap all notes to nearest 1/16"
            >
              <Magnet class="w-3 h-3" /> 1/16
            </button>

            <!-- Send to Sequencer -->
            <button
              v-if="phase === 'review'"
              @click="sendToSequencer"
              :disabled="croppedNotes.length === 0"
              class="px-3 py-1.5 bg-purple-600 text-[9px]text-white rounded-lg hover:bg-purple-500 transition-all font-bold text-xs uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <SendHorizonal class="w-3 h-3" /> Sequencer
            </button>

            <!-- Export MIDI -->
            <button
              v-if="phase === 'review'"
              @click="exportMidi"
              :disabled="croppedNotes.length === 0"
              class="px-3 py-1.5 bg-synth-neon text-[9px] text-black rounded-lg hover:bg-white transition-all font-bold text-xs uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download class="w-3 h-3" /> MIDI
            </button>
          </div>
        </div>

      <!-- resize handles -->
      <div @mousedown.stop="e => onResizeStart(e, 'n')"  class="absolute top-0    left-3 right-3 h-1   cursor-n-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 's')"  class="absolute bottom-0 left-3 right-3 h-1   cursor-s-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'e')"  class="absolute top-3 bottom-3 right-0  w-1   cursor-e-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'w')"  class="absolute top-3 bottom-3 left-0   w-1   cursor-w-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'ne')" class="absolute top-0    right-0  w-3 h-3 cursor-ne-resize z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'nw')" class="absolute top-0    left-0   w-3 h-3 cursor-nw-resize z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'sw')" class="absolute bottom-0 left-0   w-3 h-3 cursor-sw-resize z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'se')" class="absolute bottom-1 right-1  w-3 h-3 cursor-se-resize z-50 opacity-40 hover:opacity-80" style="background:radial-gradient(circle,#aaa 1px,transparent 1px) 0 0/3px 3px" />
      </div>
  </div>

  <!-- Context Menu (right-click → delete) -->
  <Teleport to="body">
    <div
      v-if="ctxMenu"
      class="fixed z-[200] bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl py-1 min-w-[120px]"
      :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
      @click.stop
    >
      <button
        @click="deleteNote(ctxMenu.noteIdx)"
        class="w-full text-left px-4 py-2 text-xs font-bold uppercase tracking-widest text-red-400 hover:text-red-300 hover:bg-neutral-800 transition-colors flex items-center gap-2"
      >
        <Trash2 class="w-3 h-3" /> Delete
      </button>
    </div>
  </Teleport>

  <!-- Dismiss context menu on outside click -->
  <Teleport to="body">
    <div
      v-if="ctxMenu"
      class="fixed inset-0 z-[199]"
      @click="ctxMenu = null"
      @contextmenu.prevent="ctxMenu = null"
    />
  </Teleport>

</template>

<style scoped>
.vel-slider {
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}
.vel-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  cursor: pointer;
  box-shadow: 0 0 4px rgba(0,0,0,0.6);
}
.vel-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  border: none;
  cursor: pointer;
  box-shadow: 0 0 4px rgba(0,0,0,0.6);
}
</style>
