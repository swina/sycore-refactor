<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { Mic, Circle, Square, Download, X, Minus, Play, Pause, RotateCcw, FileAudio, ListPlus, Repeat, Zap, Upload, Magnet } from 'lucide-vue-next'
import { useUiStore } from '@/stores/useUiStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import { Mp3Encoder } from '@breezystack/lamejs'
import { midiService } from '@/core/midi/MidiService'
import { looperEngine } from '@/lib/looper-engine'
import { useLooperStore } from '@/stores/useLooperStore'

const props = defineProps({
  hasBackingTrack: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const uiStore      = useUiStore()
const midiStore    = useMidiStore()
const mappingStore = useMappingStore()
const looperStore  = useLooperStore()
const { openMenu } = useMidiContextMenu()

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront } = useDraggableResizable({
  storageKey: 'S1_CAPTURE_DR',
  minimizeLabel: 'Audio Capture',
  initialWidth: 950,
  initialHeight: 720,
  minWidth: 700,
  minHeight: 500,
  zIndex: 100,
})
watch(() => uiStore.isAudioCaptureOpen, (v) => { if (v) bringToFront() })

// ── Reactive state ────────────────────────────────────────────────────────────
const devices          = ref([])
const selectedDeviceId = ref(localStorage.getItem('S1_CAPTURE_DEVICE') || 'default')
const isMonitoring     = ref(false)
const isRecording      = ref(false)
const recSecs          = ref(0)
const recordedBlob     = ref(null)
const isPlaying        = ref(false)
const isExportingMp3   = ref(false)
const isNormalizing    = ref(false)
const normalizeDbLimit = ref(-3.0)
const normalizeGateDb  = ref(-60)
const isImporting      = ref(false)
const toPlaylist       = ref(localStorage.getItem('S1_CAPTURE_TO_PLAYLIST') === '1')
const appendMode       = ref(localStorage.getItem('S1_CAPTURE_APPEND') === '1')
const error            = ref(null)

const selectedLooperTrack = ref(1)
const isSendingToLooper   = ref(false)

const isLooping           = ref(false)
const audioDuration       = ref(0)
const loopStart           = ref(0)
const loopEnd             = ref(0)
const playbackStart       = ref(0)
const loopCrossfadeDur    = ref(0.5)
const currentPlaybackTime = ref(0)
const waveformPeaks = ref([])
const zoomX = ref(1.0)
const zoomY = ref(1.0)
const panOffset = ref(0.0)

// ── Timeline State & Loop ──────────────────────────────────────────────────
const timelineMeasures = ref(parseInt(localStorage.getItem('S1_CAPTURE_TIMELINE_MEASURES') || '4', 10))
const timelineMode     = ref(localStorage.getItem('S1_CAPTURE_TIMELINE_MODE') || 'synced')
const timelineProgress = ref(0)
const timelineActive   = ref(false)

watch(timelineMeasures, (val) => {
  localStorage.setItem('S1_CAPTURE_TIMELINE_MEASURES', val.toString())
})

watch(timelineMode, (val) => {
  localStorage.setItem('S1_CAPTURE_TIMELINE_MODE', val)
})

// ── Snap to Grid State & Functions ───────────────────────────────────────────
const snapEnabled = ref(localStorage.getItem('S1_CAPTURE_SNAP_GRID') === '1')

watch(snapEnabled, (val) => {
  localStorage.setItem('S1_CAPTURE_SNAP_GRID', val ? '1' : '0')
  if (val) {
    snapToBarDivisions()
  }
})

// ── MIDI Sync Recording State ────────────────────────────────────────────────
const midiTriggerEnabled = ref(localStorage.getItem('S1_CAPTURE_MIDI_TRIGGER') === '1')
const isArmed = ref(false)
const midiPulse = ref(false)
let midiCleanup = null

watch(midiTriggerEnabled, (val) => {
  localStorage.setItem('S1_CAPTURE_MIDI_TRIGGER', val ? '1' : '0')
  if (!val) {
    isArmed.value = false
  }
})

const playlistRepeat = ref(1)

function snapValue(val, barSecs, anchor = 0) {
  if (barSecs <= 0) return val
  const snapped = anchor + Math.round((val - anchor) / barSecs) * barSecs
  return Math.max(0, Math.min(audioDuration.value, snapped))
}

function snapToBarDivisions() {
  const bpm = midiStore.currentBpm || 120
  const barSecs = 4 * (60 / bpm)
  if (barSecs <= 0 || audioDuration.value <= 0) return

  const anchor = playbackStart.value
  loopStart.value = snapValue(loopStart.value, barSecs, anchor)
  
  let snappedEnd = snapValue(loopEnd.value, barSecs, anchor)
  if (snappedEnd <= loopStart.value) {
    snappedEnd = Math.min(audioDuration.value, loopStart.value + barSecs)
  }
  loopEnd.value = snappedEnd
}

let timelineRaf = null
let timelineStartTime = 0

function startTimelineLoop() {
  if (timelineRaf) cancelAnimationFrame(timelineRaf)
  timelineStartTime = performance.now()
  
  const tick = () => {
    if (!timelineActive.value) {
      timelineProgress.value = 0
      return
    }
    const bpm = midiStore.currentBpm || 120
    const totalSeconds = timelineMeasures.value * 4 * (60 / bpm)
    if (totalSeconds > 0) {
      if (timelineMode.value === 'synced' && isPlaying.value) {
        // Sync timeline sweep progress directly with playhead relative to playbackStart
        const elapsedSecs = currentPlaybackTime.value - playbackStart.value
        timelineProgress.value = (((elapsedSecs % totalSeconds) + totalSeconds) % totalSeconds) / totalSeconds * 100
      } else {
        const elapsedMs = performance.now() - timelineStartTime
        const elapsedSecs = elapsedMs / 1000
        timelineProgress.value = ((elapsedSecs % totalSeconds) / totalSeconds) * 100
      }
    } else {
      timelineProgress.value = 0
    }
    timelineRaf = requestAnimationFrame(tick)
  }
  timelineRaf = requestAnimationFrame(tick)
}

function stopTimelineLoop() {
  if (timelineRaf) {
    cancelAnimationFrame(timelineRaf)
    timelineRaf = null
  }
  timelineProgress.value = 0
}

watch(timelineActive, (active) => {
  if (active) {
    startTimelineLoop()
  } else {
    stopTimelineLoop()
  }
})

watch([isRecording, isPlaying, timelineMode], ([rec, play, mode]) => {
  if (mode === 'synced') {
    timelineActive.value = !!(rec || play)
  } else {
    timelineActive.value = false
  }
})

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

async function generateWaveformPeaks(blob) {
  try {
    const arrayBuffer = await blob.arrayBuffer()
    const audioCtxClass = window.OfflineAudioContext || window.webkitOfflineAudioContext
    const tempCtx = new audioCtxClass(1, 1, 44100)
    
    const decoded = await new Promise((resolve, reject) => {
      tempCtx.decodeAudioData(
        arrayBuffer,
        (buffer) => resolve(buffer),
        (err) => reject(err || new Error('Failed to decode audio data'))
      )
    })
    
    const channelData = decoded.getChannelData(0)
    const numPoints = 160
    const step = Math.ceil(channelData.length / numPoints)
    const peaks = []
    
    for (let i = 0; i < numPoints; i++) {
      const start = i * step
      let maxVal = 0
      for (let j = 0; j < step && (start + j) < channelData.length; j++) {
        const val = Math.abs(channelData[start + j])
        if (val > maxVal) maxVal = val
      }
      peaks.push(maxVal)
    }
    waveformPeaks.value = peaks
  } catch (e) {
    console.error('Failed to generate waveform peaks', e)
    waveformPeaks.value = []
  }
}

watch(recordedBlob, async (newBlob) => {
  if (newBlob) {
    await generateWaveformPeaks(newBlob)
  } else {
    waveformPeaks.value = []
  }
})

// ── DOM refs ──────────────────────────────────────────────────────────────────
const canvasRef   = ref(null)
const levelBarRef = ref(null)
const audioRef1   = ref(null)
const audioRef2   = ref(null)
const fileInputRef = ref(null)

// ── Plain mutable (Web Audio nodes) ──────────────────────────────────────────
let streamRef      = null
let ctxRef         = null
let analyserRef    = null
let recorderRef    = null
let chunksRef      = []
let timerRef       = null
let rafRef         = null
let blobUrlRef     = null
let isRecordingRef = false
let toPlaylistRef  = toPlaylist.value
let prevBlobRef    = null

watch(toPlaylist, v => {
  toPlaylistRef = v
  localStorage.setItem('S1_CAPTURE_TO_PLAYLIST', v ? '1' : '0')
})

watch(appendMode, v => {
  localStorage.setItem('S1_CAPTURE_APPEND', v ? '1' : '0')
})

watch(loopStart, (ns) => {
  if (snapEnabled.value) {
    const bpm = midiStore.currentBpm || 120
    const barSecs = 4 * (60 / bpm)
    const anchor = playbackStart.value
    const snapped = snapValue(ns, barSecs, anchor)
    if (Math.abs(loopStart.value - snapped) > 0.001) {
      loopStart.value = snapped
      return
    }
  }

  if (ns >= loopEnd.value) {
    const bpm = midiStore.currentBpm || 120
    const barSecs = 4 * (60 / bpm)
    const offset = snapEnabled.value ? barSecs : 0.05
    loopEnd.value = Math.min(audioDuration.value, ns + offset)
  }
})

watch(loopEnd, (ne) => {
  if (snapEnabled.value) {
    const bpm = midiStore.currentBpm || 120
    const barSecs = 4 * (60 / bpm)
    const anchor = playbackStart.value
    const snapped = snapValue(ne, barSecs, anchor)
    if (Math.abs(loopEnd.value - snapped) > 0.001) {
      loopEnd.value = snapped
      return
    }
  }

  if (ne <= loopStart.value) {
    const bpm = midiStore.currentBpm || 120
    const barSecs = 4 * (60 / bpm)
    const offset = snapEnabled.value ? barSecs : 0.05
    loopStart.value = Math.max(0, ne - offset)
  }
})

watch(playbackStart, (ns) => {
  if (ns > audioDuration.value) {
    playbackStart.value = audioDuration.value
  } else if (ns < 0) {
    playbackStart.value = 0
  }
  
  if (snapEnabled.value) {
    snapToBarDivisions()
  }
})

function handleLoadedMetadata() {
  if (audioRef1.value) {
    const dur = audioRef1.value.duration
    if (dur && isFinite(dur)) {
      audioDuration.value = dur
      loopStart.value = 0
      loopEnd.value = dur
      playbackStart.value = 0
    }
  }
}

function handleTimeUpdate() {
  if (audioRef.value) {
    currentPlaybackTime.value = audioRef.value.currentTime || 0
  }
}

function formatTimeSecs(val) {
  const v = typeof val === 'object' ? val.value : val
  return `${v.toFixed(2)}s`
}

// ── Device enumeration ────────────────────────────────────────────────────────
async function refreshDevices() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices()
    devices.value = all.filter(d => d.kind === 'audioinput')
  } catch {}
}

// ── Stop / cleanup ────────────────────────────────────────────────────────────
function stopAll(keepBlob = false) {
  if (rafRef) { cancelAnimationFrame(rafRef); rafRef = null }
  if (timerRef) { clearInterval(timerRef); timerRef = null }
  if (recorderRef && recorderRef.state !== 'inactive') recorderRef.stop()
  recorderRef = null
  if (streamRef) { streamRef.getTracks().forEach(t => t.stop()); streamRef = null }
  if (ctxRef) { ctxRef.close().catch(() => {}); ctxRef = null }
  analyserRef = null
  isRecordingRef = false
  isMonitoring.value = false
  isRecording.value = false
  isPlaying.value = false
  isArmed.value = false

  cleanupWebAudio()

  if (audioRef1.value) {
    audioRef1.value.pause()
    if (!keepBlob) audioRef1.value.src = ''
  }
  if (audioRef2.value) {
    audioRef2.value.pause()
    if (!keepBlob) audioRef2.value.src = ''
  }

  if (!keepBlob) {
    recordedBlob.value = null
    recSecs.value = 0
    if (blobUrlRef) { URL.revokeObjectURL(blobUrlRef); blobUrlRef = null }
    zoomX.value = 1.0
    zoomY.value = 1.0
    panOffset.value = 0.0
  }
  if (levelBarRef.value) levelBarRef.value.style.width = '0%'
}

// ── Start monitoring ──────────────────────────────────────────────────────────
async function startMonitor(deviceId) {
  error.value = null
  let stream = null
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId !== 'default' ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    })
  } catch (e) {
    if (deviceId !== 'default') {
      console.warn('[AudioCapture] Selected audio device failed, falling back to default...', e)
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
          video: false,
        })
        selectedDeviceId.value = 'default'
        localStorage.setItem('S1_CAPTURE_DEVICE', 'default')
      } catch (fallbackErr) {
        handleMonitorError(fallbackErr)
        return
      }
    } else {
      handleMonitorError(e)
      return
    }
  }

  try {
    streamRef = stream
    const actx = new AudioContext()
    ctxRef = actx
    const src = actx.createMediaStreamSource(stream)
    const analyser = actx.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.8
    src.connect(analyser)
    analyserRef = analyser
    await refreshDevices()
    isMonitoring.value = true
  } catch (e) {
    handleMonitorError(e)
  }
}

function handleMonitorError(e) {
  const msg = e?.message ?? ''
  error.value = msg.toLowerCase().includes('denied') || msg.toLowerCase().includes('permission')
    ? 'Microphone access denied.'
    : msg || 'Audio input failed.'
  refreshDevices()
}

// ── Panel open / close ────────────────────────────────────────────────────────
watch(() => uiStore.isAudioCaptureOpen, (open) => {
  if (open) startMonitor(selectedDeviceId.value)
  else stopAll(true)
})

// ── Device hot-swap ───────────────────────────────────────────────────────────
async function handleDeviceChange(id) {
  selectedDeviceId.value = id
  localStorage.setItem('S1_CAPTURE_DEVICE', id)
  if (!isMonitoring.value) return
  if (rafRef) { cancelAnimationFrame(rafRef); rafRef = null }
  if (streamRef) { streamRef.getTracks().forEach(t => t.stop()); streamRef = null }
  if (ctxRef) { ctxRef.close().catch(() => {}); ctxRef = null }
  analyserRef = null
  isMonitoring.value = false
  await startMonitor(id)
}

// ── Append helper ─────────────────────────────────────────────────────────────
async function mergeBlobs(blobA, blobB) {
  const [bufA, bufB] = await Promise.all([blobA.arrayBuffer(), blobB.arrayBuffer()])
  const AudioCtxClass = window.AudioContext || window.webkitAudioContext
  const ctx = new AudioCtxClass()
  const [decA, decB] = await Promise.all([
    ctx.decodeAudioData(bufA),
    ctx.decodeAudioData(bufB),
  ])
  await ctx.close()
  const numChannels = Math.max(decA.numberOfChannels, decB.numberOfChannels)
  const sampleRate  = decA.sampleRate
  const combined = new AudioBuffer({
    numberOfChannels: numChannels,
    length: decA.length + decB.length,
    sampleRate,
  })
  for (let c = 0; c < numChannels; c++) {
    const chanA = c < decA.numberOfChannels ? decA.getChannelData(c) : new Float32Array(decA.length)
    const chanB = c < decB.numberOfChannels ? decB.getChannelData(c) : new Float32Array(decB.length)
    const out = combined.getChannelData(c)
    out.set(chanA, 0)
    out.set(chanB, decA.length)
  }
  return audioBufferToWav(combined)
}

// ── Recording ────────────────────────────────────────────────────────────────
function startRecording() {
  if (!streamRef || isRecording.value) return

  // Save existing capture for append, or discard
  prevBlobRef = (appendMode.value && recordedBlob.value) ? recordedBlob.value : null

  recordedBlob.value = null
  isPlaying.value = false
  if (blobUrlRef) { URL.revokeObjectURL(blobUrlRef); blobUrlRef = null }
  chunksRef = []
  recSecs.value = 0

  audioDuration.value = 0
  loopStart.value = 0
  loopEnd.value = 0
  playbackStart.value = 0
  zoomX.value = 1.0
  zoomY.value = 1.0
  panOffset.value = 0.0

  const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg']
    .find(t => MediaRecorder.isTypeSupported(t)) ?? ''

  const recorder = new MediaRecorder(streamRef, mimeType ? { mimeType } : undefined)
  recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.push(e.data) }
  recorder.onstop = async () => {
    const newBlob = new Blob(chunksRef, { type: recorder.mimeType || 'audio/webm' })

    let finalBlob = newBlob
    let finalDuration = recSecs.value

    if (prevBlobRef) {
      try {
        finalBlob = await mergeBlobs(prevBlobRef, newBlob)
        const ab  = await finalBlob.arrayBuffer()
        const tmp = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 44100)
        const dec = await new Promise((res, rej) => tmp.decodeAudioData(ab, res, rej))
        finalDuration = dec.duration
      } catch (e) {
        console.error('[AudioCapture] Append merge failed, using new blob only', e)
        finalBlob = newBlob
        finalDuration = recSecs.value
      }
      prevBlobRef = null
    }

    recordedBlob.value = finalBlob
    const previewUrl = URL.createObjectURL(finalBlob)
    blobUrlRef = previewUrl
    if (audioRef1.value && audioRef2.value) {
      audioRef1.value.src = previewUrl
      audioRef2.value.src = previewUrl
      audioRef1.value.load()
      audioRef2.value.load()
    }

    audioDuration.value = finalDuration
    loopStart.value = 0
    loopEnd.value = finalDuration
    playbackStart.value = 0

    if (toPlaylistRef) {
      const d = new Date()
      const pad = n => String(n).padStart(2, '0')
      const ts = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
      const playlistUrl = URL.createObjectURL(finalBlob)
      window.dispatchEvent(new CustomEvent('playlist-add-from-capture', {
        detail: {
          url: playlistUrl,
          label: `REC ${ts}`,
          duration: finalDuration,
          bpm: midiStore.currentBpm
        }
      }))
    }
  }
  recorder.start(100)
  recorderRef = recorder
  isRecordingRef = true
  timerRef = window.setInterval(() => recSecs.value++, 1000)
  isRecording.value = true

  if (props.hasBackingTrack) {
    window.dispatchEvent(new CustomEvent('toggle-backing-track', { detail: { play: true, restart: true } }))
  }
}

function stopRecording() {
  if (timerRef) { clearInterval(timerRef); timerRef = null }
  if (recorderRef && recorderRef.state !== 'inactive') recorderRef.stop()
  isRecordingRef = false
  isRecording.value = false
}

function handleRecordClick() {
  if (!isRecording.value && !isArmed.value) {
    if (midiTriggerEnabled.value) {
      isArmed.value = true
    } else {
      startRecording()
    }
  } else if (isArmed.value) {
    isArmed.value = false
  } else {
    stopRecording()
  }
}

function handleReset() {
  stopAll(false)
  startMonitor(selectedDeviceId.value)
}

// ── Download helpers ──────────────────────────────────────────────────────────
function getTimestamp() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Audio Cropping & WAV Encoding Helpers ─────────────────────────────────────
function audioBufferToWav(buffer) {
  const numOfChan = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const format = 1 // Raw PCM
  const bitDepth = 16
  
  let result
  if (numOfChan === 2) {
    result = interleave(buffer.getChannelData(0), buffer.getChannelData(1))
  } else {
    result = buffer.getChannelData(0)
  }
  
  const bufferLength = result.length * 2
  const wavBuffer = new ArrayBuffer(44 + bufferLength)
  const view = new DataView(wavBuffer)
  
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + bufferLength, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, format, true)
  view.setUint16(22, numOfChan, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numOfChan * (bitDepth / 8), true)
  view.setUint16(32, numOfChan * (bitDepth / 8), true)
  view.setUint16(34, bitDepth, true)
  writeString(view, 36, 'data')
  view.setUint32(40, bufferLength, true)
  
  floatTo16BitPCM(view, 44, result)
  return new Blob([view], { type: 'audio/wav' })
}

function interleave(inputL, inputR) {
  const length = inputL.length + inputR.length
  const result = new Float32Array(length)
  let index = 0
  let inputIndex = 0
  while (index < length) {
    result[index++] = inputL[inputIndex]
    result[index++] = inputR[inputIndex]
    inputIndex++
  }
  return result
}

function floatTo16BitPCM(output, offset, input) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, input[i]))
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
  }
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}


async function handleDownload() {
  if (!recordedBlob.value) return
  
  const hasCrop = (loopStart.value > 0 || loopEnd.value < audioDuration.value)
  if (hasCrop) {
    try {
      const arrayBuffer = await recordedBlob.value.arrayBuffer()
      const audioCtxClass = window.AudioContext || window.webkitAudioContext
      const audioCtx = new audioCtxClass()
      const decoded = await audioCtx.decodeAudioData(arrayBuffer)
      await audioCtx.close()
      
      const sampleRate = decoded.sampleRate
      const startSample = Math.floor(loopStart.value * sampleRate)
      const endSample = Math.floor(loopEnd.value * sampleRate)
      
      const croppedLength = endSample - startSample
      if (croppedLength <= 0) return
      
      const croppedBuffer = new AudioBuffer({
        numberOfChannels: decoded.numberOfChannels,
        length: croppedLength,
        sampleRate: sampleRate
      })
      
      for (let chan = 0; chan < decoded.numberOfChannels; chan++) {
        const channelData = decoded.getChannelData(chan)
        const croppedData = channelData.subarray(startSample, endSample)
        croppedBuffer.copyToChannel(croppedData, chan)
      }
      
      const croppedWav = audioBufferToWav(croppedBuffer)
      triggerDownload(croppedWav, `s1-audio-cropped-${getTimestamp()}.wav`)
    } catch (e) {
      console.error('Failed to download cropped audio', e)
    }
  } else {
    const ext = recordedBlob.value.type.includes('ogg') ? 'ogg' : 'webm'
    triggerDownload(recordedBlob.value, `s1-audio-${getTimestamp()}.${ext}`)
  }
}

function handleImportClick() {
  fileInputRef.value?.click()
}

async function handleFileImport(e) {
  const file = e.target?.files?.[0]
  if (!file) return
  isImporting.value = true
  try {
    // Read the file into a Blob
    const blob = new Blob([await file.arrayBuffer()], { type: file.type || 'audio/wav' })

    // Stop any current playback and monitoring
    stopAll(true)

    recordedBlob.value = blob
    recSecs.value = 0

    // Set up preview
    if (blobUrlRef) URL.revokeObjectURL(blobUrlRef)
    blobUrlRef = URL.createObjectURL(blob)
    if (audioRef1.value && audioRef2.value) {
      audioRef1.value.src = blobUrlRef
      audioRef2.value.src = blobUrlRef
      audioRef1.value.load()
      audioRef2.value.load()
    }

    // Decode to get actual duration
    try {
      const arrayBuffer = await blob.arrayBuffer()
      const audioCtxClass = window.OfflineAudioContext || window.webkitOfflineAudioContext
      const tempCtx = new audioCtxClass(1, 1, 44100)
      const decoded = await new Promise((resolve, reject) => {
        tempCtx.decodeAudioData(arrayBuffer, b => resolve(b), e => reject(e))
      })
      audioDuration.value = decoded.duration
      loopStart.value = 0
      loopEnd.value = decoded.duration
      playbackStart.value = 0
    } catch (decodeErr) {
      console.warn('Could not decode imported file for duration', decodeErr)
    }

    // Reset zoom/pan
    zoomX.value = 1.0
    zoomY.value = 1.0
    panOffset.value = 0.0

    // Restart mic monitoring so the level meter and new recordings work
    startMonitor(selectedDeviceId.value)
  } catch (err) {
    console.error('Import failed', err)
  } finally {
    isImporting.value = false
    // Reset the file input so the same file can be re-imported
    e.target.value = ''
  }
}

async function handleNormalize() {
  if (!recordedBlob.value || isNormalizing.value) return
  isNormalizing.value = true
  try {
    const arrayBuffer = await recordedBlob.value.arrayBuffer()
    const audioCtxClass = window.AudioContext || window.webkitAudioContext
    const audioCtx = new audioCtxClass()
    const decoded = await audioCtx.decodeAudioData(arrayBuffer)
    await audioCtx.close()

    // Apply noise gate: silence samples below the gate threshold
    const gateLinear = Math.pow(10, normalizeGateDb.value / 20)
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      const data = decoded.getChannelData(c)
      for (let i = 0; i < data.length; i++) {
        if (Math.abs(data[i]) < gateLinear) {
          data[i] = 0
        }
      }
    }

    // Find max peak across all channels (after gating)
    let maxPeak = 0
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      const data = decoded.getChannelData(c)
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i])
        if (abs > maxPeak) maxPeak = abs
      }
    }

    if (maxPeak > 0) {
      const linearLimit = Math.pow(10, normalizeDbLimit.value / 20)
      const gain = linearLimit / maxPeak
      for (let c = 0; c < decoded.numberOfChannels; c++) {
        const data = decoded.getChannelData(c)
        for (let i = 0; i < data.length; i++) {
          data[i] *= gain
        }
      }

      const normalizedWav = audioBufferToWav(decoded)
      recordedBlob.value = normalizedWav

      // Refresh preview URLs
      if (blobUrlRef) URL.revokeObjectURL(blobUrlRef)
      blobUrlRef = URL.createObjectURL(normalizedWav)
      if (audioRef1.value && audioRef2.value) {
        audioRef1.value.src = blobUrlRef
        audioRef2.value.src = blobUrlRef
        audioRef1.value.load()
        audioRef2.value.load()
      }
    }
  } catch (e) {
    console.error('Normalization failed', e)
  } finally {
    isNormalizing.value = false
  }
}

async function handleExportMp3() {
  if (!recordedBlob.value || isExportingMp3.value) return
  isExportingMp3.value = true
  try {
    const arrayBuffer = await recordedBlob.value.arrayBuffer()
    const audioCtxClass = window.AudioContext || window.webkitAudioContext
    const audioCtx = new audioCtxClass()
    const decoded = await audioCtx.decodeAudioData(arrayBuffer)
    await audioCtx.close()

    const numChannels = Math.min(decoded.numberOfChannels, 2)
    const sampleRate  = decoded.sampleRate
    const left  = decoded.getChannelData(0)
    const right = numChannels > 1 ? decoded.getChannelData(1) : left

    const startSample = Math.floor(loopStart.value * sampleRate)
    const endSample = Math.floor(loopEnd.value * sampleRate)

    const toInt16 = f32 => {
      const i16 = new Int16Array(f32.length)
      for (let i = 0; i < f32.length; i++) {
        const s = Math.max(-1, Math.min(1, f32[i]))
        i16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
      }
      return i16
    }

    const leftI16  = toInt16(left.subarray(startSample, endSample))
    const rightI16 = numChannels > 1 ? toInt16(right.subarray(startSample, endSample)) : leftI16
    const enc = new Mp3Encoder(numChannels, sampleRate, 192)
    const toAB = u => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength)
    const mp3Parts = []
    const blockSize = 1152

    for (let i = 0; i < leftI16.length; i += blockSize) {
      const lChunk = leftI16.subarray(i, i + blockSize)
      const rChunk = rightI16.subarray(i, i + blockSize)
      const buf = numChannels === 1 ? enc.encodeBuffer(lChunk) : enc.encodeBuffer(lChunk, rChunk)
      if (buf.length > 0) mp3Parts.push(toAB(buf))
    }
    const tail = enc.flush()
    if (tail.length > 0) mp3Parts.push(toAB(tail))

    triggerDownload(new Blob(mp3Parts, { type: 'audio/mpeg' }), `s1-audio-${getTimestamp()}.mp3`)
  } catch (e) {
    console.error('MP3 export failed', e)
  } finally {
    isExportingMp3.value = false
  }
}

async function handleAddToPlaylist() {
  if (!recordedBlob.value) return
  try {
    const arrayBuffer = await recordedBlob.value.arrayBuffer()
    const audioCtxClass = window.AudioContext || window.webkitAudioContext
    const audioCtx = new audioCtxClass()
    const decoded = await audioCtx.decodeAudioData(arrayBuffer)
    await audioCtx.close()
    
    const sampleRate = decoded.sampleRate
    const startSample = Math.floor(loopStart.value * sampleRate)
    const endSample = Math.floor(loopEnd.value * sampleRate)
    
    const croppedLength = endSample - startSample
    if (croppedLength <= 0) return
    
    const croppedBuffer = new AudioBuffer({
      numberOfChannels: decoded.numberOfChannels,
      length: croppedLength,
      sampleRate: sampleRate
    })
    
    for (let chan = 0; chan < decoded.numberOfChannels; chan++) {
      const channelData = decoded.getChannelData(chan)
      const croppedData = channelData.subarray(startSample, endSample)
      croppedBuffer.copyToChannel(croppedData, chan)
    }
    
    const croppedWav = audioBufferToWav(croppedBuffer)
    const playlistUrl = URL.createObjectURL(croppedWav)
    
    const d = new Date()
    const pad = n => String(n).padStart(2, '0')
    const ts = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    
    const duration = loopEnd.value - loopStart.value
    window.dispatchEvent(new CustomEvent('playlist-add-from-capture', {
      detail: {
        url: playlistUrl,
        label: `CROP ${ts}`,
        duration: duration,
        bpm: midiStore.currentBpm,
        repeats: playlistRepeat.value
      }
    }))
  } catch (e) {
    console.error('Failed to add cropped audio to playlist', e)
  }
}

async function handleSendToLooper() {
  if (!recordedBlob.value || isSendingToLooper.value) return
  isSendingToLooper.value = true
  try {
    const arrayBuffer = await recordedBlob.value.arrayBuffer()
    const audioCtxClass = window.AudioContext || window.webkitAudioContext
    const audioCtx = new audioCtxClass()
    const decoded = await audioCtx.decodeAudioData(arrayBuffer)
    await audioCtx.close()

    const sampleRate = decoded.sampleRate
    const startSample = Math.floor(loopStart.value * sampleRate)
    const endSample = Math.floor(loopEnd.value * sampleRate)
    const croppedLength = endSample - startSample
    if (croppedLength <= 0) return

    const croppedBuffer = new AudioBuffer({
      numberOfChannels: decoded.numberOfChannels,
      length: croppedLength,
      sampleRate
    })
    for (let chan = 0; chan < decoded.numberOfChannels; chan++) {
      croppedBuffer.copyToChannel(decoded.getChannelData(chan).subarray(startSample, endSample), chan)
    }

    const croppedWav = audioBufferToWav(croppedBuffer)
    const trackIndex = selectedLooperTrack.value - 1
    const ok = await looperEngine.loadAudioBlob(trackIndex, croppedWav)
    if (ok && looperStore.takes[trackIndex]) {
      looperStore.takes[trackIndex].isEmpty = false
    }
  } catch (e) {
    console.error('Failed to send to looper', e)
  } finally {
    isSendingToLooper.value = false
  }
}

// ── Playback & Crossfading ────────────────────────────────────────────────────
let audioCtx = null
let sourceNode1 = null
let sourceNode2 = null
let gainNode1 = null
let gainNode2 = null
let activeAudio = null
let crossfadeTimeout = null
let playbackRafRef = null

watch(isPlaying, (playing) => {
  if (playing) {
    startPlaybackLoop()
  } else {
    if (playbackRafRef) {
      cancelAnimationFrame(playbackRafRef)
      playbackRafRef = null
    }
  }
})

function cleanupWebAudio() {
  if (crossfadeTimeout) {
    clearTimeout(crossfadeTimeout)
    crossfadeTimeout = null
  }
}

function destroyWebAudio() {
  cleanupWebAudio()
  if (audioCtx) {
    audioCtx.close().catch(() => {})
    audioCtx = null
  }
  sourceNode1 = null
  sourceNode2 = null
  gainNode1 = null
  gainNode2 = null
}

function initWebAudio() {
  if (audioCtx) return
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  audioCtx = new AudioContextClass()
  
  sourceNode1 = audioCtx.createMediaElementSource(audioRef1.value)
  sourceNode2 = audioCtx.createMediaElementSource(audioRef2.value)
  
  gainNode1 = audioCtx.createGain()
  gainNode2 = audioCtx.createGain()
  
  sourceNode1.connect(gainNode1)
  sourceNode2.connect(gainNode2)
  
  gainNode1.connect(audioCtx.destination)
  gainNode2.connect(audioCtx.destination)
}

function startPlaybackLoop() {
  if (playbackRafRef) cancelAnimationFrame(playbackRafRef)
  
  let isCrossfading = false
  
  const tick = () => {
    if (!isPlaying.value || !activeAudio) return
    playbackRafRef = requestAnimationFrame(tick)
    
    let time = activeAudio.currentTime || 0
    if (isLooping.value) {
      time = Math.min(loopEnd.value, time)
    }
    currentPlaybackTime.value = time
    
    if (!isLooping.value) {
      if (activeAudio.currentTime >= audioDuration.value) {
        isPlaying.value = false
        activeAudio.pause()
        activeAudio.currentTime = 0
        currentPlaybackTime.value = 0
        return
      }
    } else {
      const maxFade = (loopEnd.value - loopStart.value) / 2
      const fadeTime = Math.max(0, Math.min(loopCrossfadeDur.value, maxFade))
      
      if (!isCrossfading && activeAudio.currentTime >= (loopEnd.value - fadeTime)) {
        isCrossfading = true
        initWebAudio()
        if (audioCtx.state === 'suspended') {
          audioCtx.resume()
        }
        
        const nextAudio = activeAudio === audioRef1.value ? audioRef2.value : audioRef1.value
        const activeGain = activeAudio === audioRef1.value ? gainNode1 : gainNode2
        const nextGain = nextAudio === audioRef1.value ? gainNode1 : gainNode2
        
        nextAudio.currentTime = loopStart.value
        nextAudio.play().catch(() => {})
        
        const now = audioCtx.currentTime
        if (fadeTime > 0) {
          activeGain.gain.setValueAtTime(1, now)
          activeGain.gain.linearRampToValueAtTime(0, now + fadeTime)
          
          nextGain.gain.setValueAtTime(0, now)
          nextGain.gain.linearRampToValueAtTime(1, now + fadeTime)
        } else {
          activeGain.gain.setValueAtTime(0, now)
          nextGain.gain.setValueAtTime(1, now)
        }
        
        if (crossfadeTimeout) clearTimeout(crossfadeTimeout)
        crossfadeTimeout = setTimeout(() => {
          activeAudio.pause()
          activeAudio = nextAudio
          isCrossfading = false
        }, fadeTime * 1000)
      }
    }
  }
  tick()
}

function formatMmSs(s) {
  const secs = Math.floor(s)
  const mm = Math.floor(secs / 60).toString().padStart(2, '0')
  const ss = (secs % 60).toString().padStart(2, '0')
  return `${mm}:${ss}`
}

function togglePlay() {
  if (!audioRef1.value || !audioRef2.value || !blobUrlRef) return
  
  if (isPlaying.value) {
    isPlaying.value = false
    audioRef1.value.pause()
    audioRef2.value.pause()
    if (crossfadeTimeout) {
      clearTimeout(crossfadeTimeout)
      crossfadeTimeout = null
    }
  } else {
    initWebAudio()
    if (audioCtx.state === 'suspended') {
      audioCtx.resume()
    }
    
    gainNode1.gain.setValueAtTime(1, audioCtx.currentTime)
    gainNode2.gain.setValueAtTime(0, audioCtx.currentTime)
    
    activeAudio = audioRef1.value
    activeAudio.currentTime = playbackStart.value
    activeAudio.play().catch(() => {})
    
    isPlaying.value = true
  }
}

// ── rAF draw loop ─────────────────────────────────────────────────────────────
watch([isMonitoring, recordedBlob, isPlaying, () => uiStore.isAudioCaptureOpen], async () => {
  await nextTick()
  startDrawLoop()
}, { immediate: true })

watch([loopStart, loopEnd, playbackStart, currentPlaybackTime, isLooping, zoomX, zoomY, panOffset, () => midiStore.currentBpm], () => {
  if (!isPlaying.value && !isRecording.value && !isMonitoring.value) {
    drawSingleFrame()
  }
})

watch(zoomX, (newZoom) => {
  const maxPan = 1 - 1 / newZoom
  if (panOffset.value > maxPan) {
    panOffset.value = Math.max(0, maxPan)
  }
})

function drawSingleFrame() {
  const canvas = canvasRef.value
  if (!canvas) return

  const dpr = window.devicePixelRatio || 1
  const W = canvas.offsetWidth * dpr
  const H = canvas.offsetHeight * dpr
  if (W <= 0 || H <= 0) return

  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W
    canvas.height = H
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = '#080808'
  ctx.fillRect(0, 0, W, H)

  const midY = H / 2
  const monitoring = isMonitoring.value
  const hasRecording = !!recordedBlob.value
  const rec = isRecording.value

  if (hasRecording && !rec && waveformPeaks.value.length > 0) {
    const peaks = waveformPeaks.value
    const len = peaks.length

    // Draw middle grid line
    ctx.strokeStyle = 'rgba(255,255,255,0.03)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(W, midY); ctx.stroke()

    // Draw vertical bar divisions according to BPM/Tempo (light yellow dashed lines)
    const bpm = midiStore.currentBpm || 120
    const barSecs = 4 * (60 / bpm)
    if (barSecs > 0 && audioDuration.value > 0) {
      ctx.lineWidth = 1 * dpr
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.25)' // Light yellow with transparency (yellow-300)
      ctx.setLineDash([2 * dpr, 2 * dpr])
      
      const gridAnchor = playbackStart.value
      const minI = Math.ceil((0 - gridAnchor) / barSecs)
      const maxI = Math.floor((audioDuration.value - gridAnchor) / barSecs)
      
      for (let i = minI; i <= maxI; i++) {
        const barTime = gridAnchor + i * barSecs
        // Skip drawing exactly at the playback start to avoid overlapping with play start marker
        if (playbackStart.value > 0 && Math.abs(barTime - playbackStart.value) < 0.001) continue
        // Skip t = 0 if it's the anchor to keep it clean
        if (Math.abs(barTime) < 0.001) continue
        
        const barPct = barTime / audioDuration.value
        const barX = (barPct - panOffset.value) * zoomX.value * W
        
        if (barX >= 0 && barX <= W) {
          ctx.beginPath()
          ctx.moveTo(barX, 0)
          ctx.lineTo(barX, H)
          ctx.stroke()
        }
      }
      ctx.setLineDash([])
    }

    // Calculate loop pixel points with Zoom H and Pan
    const startPct = isLooping.value ? (loopStart.value / audioDuration.value) : 0
    const endPct = isLooping.value ? (loopEnd.value / audioDuration.value) : 1
    const startX = (startPct - panOffset.value) * zoomX.value * W
    const endX = (endPct - panOffset.value) * zoomX.value * W

    // Shade the loop area (clamped to visible range)
    if (isLooping.value) {
      ctx.fillStyle = 'rgba(0, 255, 157, 0.04)'
      const renderStartX = Math.max(0, startX)
      const renderEndX = Math.min(W, endX)
      if (renderEndX > renderStartX) {
        ctx.fillRect(renderStartX, 0, renderEndX - renderStartX, H)
      }
    }

    // Draw waveform bars
    const barWidth = Math.max(1.5, (W / len) * 0.6 * zoomX.value)
    const gap = ((W / len) * zoomX.value) - barWidth

    for (let i = 0; i < len; i++) {
      const t = i / len
      const x = (t - panOffset.value) * zoomX.value * W
      
      // Skip drawing if bar is completely out of visible canvas range
      if (x < -barWidth || x > W) continue

      const val = peaks[i]
      const amplitude = Math.max(3 * dpr, val * (H * 0.75) * zoomY.value)
      
      // Highlight active loop area vs outside loop area
      const inside = x >= startX && x <= endX
      if (inside) {
        ctx.fillStyle = '#00ff9d'
        ctx.shadowColor = 'rgba(0, 255, 157, 0.5)'
        ctx.shadowBlur = 1 * dpr
      } else {
        ctx.fillStyle = 'rgba(0, 255, 157, 0.22)'
        ctx.shadowBlur = 0
      }
      
      ctx.fillRect(x, midY - amplitude / 2, barWidth, amplitude)
    }
    ctx.shadowBlur = 0

    // Draw loop bounds vertical dashed lines
    if (isLooping.value) {
      ctx.lineWidth = 1 * dpr
      ctx.setLineDash([4 * dpr, 3 * dpr])
      
      // Start bound (Green)
      if (startX >= 0 && startX <= W) {
        ctx.strokeStyle = '#00ff9d'
        ctx.beginPath()
        ctx.moveTo(startX, 0); ctx.lineTo(startX, H)
        ctx.stroke()
      }

      // End bound (Red)
      if (endX >= 0 && endX <= W) {
        ctx.strokeStyle = '#ef4444'
        ctx.beginPath()
        ctx.moveTo(endX, 0); ctx.lineTo(endX, H)
        ctx.stroke()
      }
      
      ctx.setLineDash([])
    }

    // Draw playstart marker (Cyan dashed line)
    const playStartPct = playbackStart.value / audioDuration.value
    const playStartX = (playStartPct - panOffset.value) * zoomX.value * W

    if (playStartX >= 0 && playStartX <= W) {
      ctx.strokeStyle = '#00e5ff'
      ctx.lineWidth = 1 * dpr
      ctx.setLineDash([4 * dpr, 4 * dpr])
      ctx.beginPath()
      ctx.moveTo(playStartX, 0); ctx.lineTo(playStartX, H)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Draw playhead vertical cursor (neon pink with glow)
    const playPct = currentPlaybackTime.value / audioDuration.value
    const playX = (playPct - panOffset.value) * zoomX.value * W

    if (playX >= 0 && playX <= W) {
      ctx.strokeStyle = '#ff007f'
      ctx.lineWidth = 2 * dpr
      ctx.shadowColor = '#ff007f'
      ctx.shadowBlur = 8 * dpr
      ctx.beginPath()
      ctx.moveTo(playX, 0); ctx.lineTo(playX, H)
      ctx.stroke()
      ctx.shadowBlur = 0
    }
  } else if (monitoring) {
    const analyser = analyserRef
    if (!analyser) return

    const bufLen = analyser.frequencyBinCount
    const data = new Uint8Array(bufLen)
    analyser.getByteTimeDomainData(data)

    let rms = 0
    for (let i = 0; i < bufLen; i++) rms += ((data[i] / 128) - 1) ** 2
    rms = Math.sqrt(rms / bufLen)
    if (levelBarRef.value) {
      const pct = Math.min(100, rms * 400)
      levelBarRef.value.style.width = `${pct}%`
      levelBarRef.value.style.background = pct > 85 ? '#ef4444' : pct > 55 ? '#fbbf24' : '#00ff9d'
    }

    const color = rec ? '#ef4444' : '#00ff9d'

    ctx.strokeStyle = 'rgba(255,255,255,0.05)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(W, midY); ctx.stroke()

    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5 * dpr
    ctx.shadowColor = color
    ctx.shadowBlur = rec ? 7 * dpr : 3 * dpr
    for (let i = 0; i < W; i++) {
      const idx = Math.min(bufLen - 1, Math.floor((i / W) * bufLen))
      const y = midY + ((data[idx] / 128) - 1) * midY * 2.2
      i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y)
    }
    ctx.stroke()
    ctx.shadowBlur = 0

    if (rec) {
      ctx.fillStyle = '#ef4444'
      ctx.shadowColor = '#ef4444'
      ctx.shadowBlur = 10 * dpr
      ctx.beginPath()
      ctx.arc(W - 11 * dpr, 11 * dpr, 4 * dpr, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
    }
  }
}

function startDrawLoop() {
  if (rafRef) { cancelAnimationFrame(rafRef); rafRef = null }
  
  const draw = () => {
    const monitoring = isMonitoring.value
    const rec = isRecording.value
    const playing = isPlaying.value
    const needsAnimation = monitoring || rec || playing

    drawSingleFrame()

    if (needsAnimation) {
      rafRef = requestAnimationFrame(draw)
    } else {
      rafRef = null
    }
  }
  
  draw()
}

function fmtTime(s) {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
let _recToggleHandler = null
let _startRecHandler = null
let _stopRecHandler = null
let _recMidiUnsub = null
let resizeObserver = null

onMounted(async () => {
  await refreshDevices()
  navigator.mediaDevices?.addEventListener('devicechange', refreshDevices)
  if (uiStore.isAudioCaptureOpen) startMonitor(selectedDeviceId.value)
  
  _recToggleHandler = () => {
    handleRecordClick()
  }
  window.addEventListener('capture-rec-toggle', _recToggleHandler)

  _startRecHandler = (e) => {
    const background = e?.detail?.background === true
    if (!background && !uiStore.isAudioCaptureOpen) {
      uiStore.isAudioCaptureOpen = true
    }
    if (background && !isMonitoring.value) {
      startMonitor(selectedDeviceId.value)
    }
    let retries = 0
    const checkAndStart = () => {
      if (isMonitoring.value && streamRef) {
        if (!isRecording.value) {
          isArmed.value = false
          startRecording()
        }
      } else if (retries < 50 && (uiStore.isAudioCaptureOpen || background)) {
        retries++
        setTimeout(checkAndStart, 100)
      }
    }
    checkAndStart()
  }

  _stopRecHandler = () => {
    if (isRecording.value) {
      stopRecording()
    }
  }

  window.addEventListener('capture-start-rec', _startRecHandler)
  window.addEventListener('capture-stop-rec', _stopRecHandler)

  midiService.reScanInputs()
  if (!midiService.isReady) {
    setTimeout(() => midiService.reScanInputs(), 1000)
  }

  _recMidiUnsub = midiService.addRawListener((event) => {
    if (!event.data || event.data.length < 3) return
    const status  = event.data[0]
    const type    = status & 0xF0
    const channel = status & 0x0F
    const byte1   = event.data[1]
    const byte2   = event.data[2]
    const isCC    = type === 0xB0 && byte2 > 0
    const isNote  = type === 0x90 && byte2 > 0
    if (!isCC && !isNote) return
    const inputPort = midiService.getInputs().find(i => i.id === event.target?.id)
    const device    = inputPort?.name || null
    const keyParts  = []
    if (device) keyParts.push(device)
    keyParts.push(`CH${channel + 1}`)
    keyParts.push(isNote ? `NOTE${byte1}` : `CC${byte1}`)
    const mapping   = mappingStore.midiMappings[keyParts.join(':')]
    if (!mapping) return
    const paramName = typeof mapping === 'object' ? mapping.paramName : mapping
    if (paramName === 'audioCapture_record') handleRecordClick()
  })
  midiCleanup = midiService.addGlobalNoteOnListener((note, velocity) => {
    midiPulse.value = true
    setTimeout(() => midiPulse.value = false, 100)

    if (midiTriggerEnabled.value && isArmed.value && !isRecording.value) {
      isArmed.value = false
      startRecording()
    }
  })

  if (canvasRef.value) {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          drawSingleFrame()
        }
      }
    })
    resizeObserver.observe(canvasRef.value)
  }
})

onUnmounted(() => {
  stopAll()
  destroyWebAudio()
  if (midiCleanup) {
    midiCleanup()
    midiCleanup = null
  }
  if (playbackRafRef) {
    cancelAnimationFrame(playbackRafRef)
    playbackRafRef = null
  }
  if (timelineRaf) {
    cancelAnimationFrame(timelineRaf)
    timelineRaf = null
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  navigator.mediaDevices?.removeEventListener('devicechange', refreshDevices)
  window.removeEventListener('capture-rec-toggle', _recToggleHandler)
  window.removeEventListener('capture-start-rec', _startRecHandler)
  window.removeEventListener('capture-stop-rec', _stopRecHandler)
  if (_recMidiUnsub) _recMidiUnsub()
})
</script>

<template>
  <Transition name="capture">
    <div
      v-show="uiStore.isAudioCaptureOpen && !isMinimized"
      :style="panelStyle"
      class="bg-neutral-950 border border-cyan-500/30 rounded-xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden"
    >
      <!-- Resize handles -->
      <div @mousedown.stop="e => onResizeStart(e, 'n')"  class="absolute top-0    left-3 right-3  h-1  cursor-n-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 's')"  class="absolute bottom-0 left-3 right-3  h-1  cursor-s-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'e')"  class="absolute top-3 bottom-3 right-0   w-1  cursor-e-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'w')"  class="absolute top-3 bottom-3 left-0    w-1  cursor-w-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'se')" class="absolute bottom-0 right-0         w-4  h-4 cursor-se-resize z-50" />
      <!-- Header -->
      <div
        class="px-4 py-2 border-b border-neutral-800 flex items-center justify-between bg-gradient-to-r from-cyan-950/40 to-transparent shrink-0 cursor-grab active:cursor-grabbing select-none"
        @mousedown="onDragStart"
      >
        <div class="flex items-center gap-4">
          <div class="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
            <Mic :class="['w-5 h-5', isRecording ? 'text-red-400 animate-pulse' : 'text-cyan-400']" />
          </div>
          <div>
            <h2 class="text-sm font-black uppercase tracking-[0.2em] text-white leading-none mb-1">AUDIO CAPTURE</h2>
            <p v-if="isRecording" class="flex items-center gap-1 text-[9px] font-mono text-red-400">
              <span class="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block" />
              REC {{ fmtTime(recSecs) }}
            </p>
            <p v-else-if="recordedBlob" class="text-[9px] font-mono text-neutral-500">{{ fmtTime(recSecs) }} captured</p>
            <p v-else class="text-[9px] font-mono text-cyan-500/60 uppercase tracking-widest">Multi-format recording & monitoring</p>
          </div>
        </div>
        <div class="flex items-center gap-1">
          <button @click="toggleMinimize" title="Minimize"
            class="p-2 rounded-full hover:bg-white/5 text-neutral-500 hover:text-yellow-400 transition-colors">
            <Minus class="w-4 h-4" />
          </button>
          <button @click="emit('close')" class="p-2 text-neutral-500 hover:text-white transition-colors rounded-full hover:bg-white/5">
            <X class="w-5 h-5" />
          </button>
        </div>
      </div>

      <!-- Input device selector + playlist toggle -->
      <div class="flex items-center gap-2 px-4 py-1.5 bg-neutral-900/40 border-b border-neutral-800/60 shrink-0">
        <Mic class="w-3 h-3 text-neutral-500 shrink-0" />
        <select
          :value="selectedDeviceId"
          @change="handleDeviceChange($event.target.value)"
          :disabled="isRecording"
          class="flex-1 bg-black border border-neutral-800 text-neutral-300 text-[10px] font-mono rounded px-2 py-1 outline-none focus:border-synth-neon/50 disabled:opacity-50"
        >
          <option value="default">Default audio input</option>
          <option v-for="d in devices" :key="d.deviceId" :value="d.deviceId">
            {{ d.label || `Input ${d.deviceId.slice(0, 8)}` }}
          </option>
        </select>
        <button
          @click="toPlaylist = !toPlaylist"
          :title="toPlaylist ? 'Auto-add to Playlist: ON' : 'Auto-add to Playlist: OFF'"
          :class="['shrink-0 flex items-center gap-1 px-2 py-1 rounded border text-[8px] font-black uppercase tracking-wider transition-colors',
            toPlaylist
              ? 'bg-synth-neon/15 text-synth-neon border-synth-neon/40'
              : 'text-neutral-600 border-neutral-700 hover:text-neutral-400 hover:border-neutral-600']"
        >
          <ListPlus class="w-3 h-3" />
          PL
        </button>
      </div>
      <div class="flex">
        <!--- Controls Left Column -->
        <div class="w-[120px] flex flex-col p-2 gap-2 border-r border-neutral-900">
          <!-- Record / Stop / Armed -->
          <div class="relative">
            <span
              v-if="mappingStore.learningParamName === 'audioCapture_record'"
              class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] animate-pulse z-10 pointer-events-none"
            />
            <button
              v-if="!isRecording && !isArmed"
              @click="handleRecordClick"
              @contextmenu.prevent="openMenu($event, { name: 'audioCapture_record', label: 'Record' })"
              title="Start recording (right-click to MIDI map)"
              :disabled="!isMonitoring"
              :class="['w-full flex items-center gap-1.5 text-[9px] font-bold uppercase px-3 py-1.5 rounded border transition-colors',
                isMonitoring
                  ? 'text-synth-neon border-synth-neon/30 hover:bg-synth-neon/10'
                  : 'text-neutral-700 border-neutral-800 cursor-default']"
            >
              <Circle class="w-3 h-3 fill-current" />
              {{ hasBackingTrack ? 'Rec + Play' : 'Rec' }}
            </button>
            <button
              v-else-if="isArmed"
              @click="handleRecordClick"
              @contextmenu.prevent="openMenu($event, { name: 'audioCapture_record', label: 'Record' })"
              title="Armed: Waiting for MIDI note. Click to cancel. Right-click to MIDI map."
              class="w-full flex items-center gap-1.5 text-[9px] font-bold uppercase px-3 py-1.5 rounded border text-amber-400 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 animate-pulse transition-colors"
            >
              <Zap class="w-3 h-3 fill-current" />
              Armed...
            </button>
            <button
              v-else
              @click="handleRecordClick"
              @contextmenu.prevent="openMenu($event, { name: 'audioCapture_record', label: 'Record' })"
              title="Stop recording (right-click to MIDI map)"
              class="w-full flex items-center gap-1.5 text-[9px] font-bold uppercase px-3 py-1.5 rounded border text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-colors"
            >
              <Square class="w-3 h-3 fill-current" />
              Stop
            </button>
          </div>

          <!-- MIDI Sync Toggle -->
          <button
            @click="midiTriggerEnabled = !midiTriggerEnabled"
            :class="['flex items-center justify-between gap-1.5 text-[9px] font-bold uppercase px-3 py-1.5 rounded border transition-colors w-full text-left',
              midiTriggerEnabled 
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/40' 
                : 'text-neutral-500 border-neutral-800 hover:text-neutral-400 hover:border-neutral-700']"
            title="Sync recording start with first incoming MIDI note"
          >
            <span class="flex items-center gap-1">
              <Zap class="w-3 h-3" />
              MIDI Sync
            </span>
            <div 
              class="w-1.5 h-1.5 rounded-full transition-all" 
              :class="midiPulse ? 'bg-white shadow-[0_0_8px_white]' : (midiTriggerEnabled ? 'bg-amber-500/50' : 'bg-neutral-800')"
            ></div>
          </button>

          <!-- Append mode toggle -->
          <button
            @click="appendMode = !appendMode"
            :class="['flex items-center justify-between gap-1.5 text-[9px] font-bold uppercase px-3 py-1.5 rounded border transition-colors w-full text-left',
              appendMode
                ? 'bg-synth-neon/15 text-synth-neon border-synth-neon/40'
                : 'text-neutral-500 border-neutral-800 hover:text-neutral-400 hover:border-neutral-700']"
            title="When ON, new recordings are appended to the existing capture"
          >
            <span class="flex items-center gap-1">
              <ListPlus class="w-3 h-3" />
              Append
            </span>
            <div
              class="w-1.5 h-1.5 rounded-full transition-all"
              :class="appendMode ? 'bg-synth-neon shadow-[0_0_6px_rgba(0,255,157,0.6)]' : 'bg-neutral-800'"
            />
          </button>

          <!-- Playback preview -->
          <button
            v-if="recordedBlob && !isRecording"
            @click="togglePlay"
            title="Play/Pause recording"
            class="flex items-center gap-1.5 text-[9px] font-bold uppercase px-3 py-1.5 rounded border text-neutral-300 border-neutral-700 hover:border-synth-neon/40 hover:text-synth-neon transition-colors"
          >
            <Pause v-if="isPlaying" class="w-3 h-3" />
            <Play v-else class="w-3 h-3" />
            {{ isPlaying ? 'Pause' : 'Play' }}
          </button>

          <!-- Export MP3 -->
          <button
            @click="handleExportMp3"
            :disabled="!recordedBlob || isExportingMp3"
            title="Export as MP3 (192kbps)"
            :class="['flex items-center gap-1.5 text-[9px] font-bold uppercase px-3 py-1.5 rounded border transition-colors',
              recordedBlob && !isExportingMp3
                ? 'text-synth-neon border-synth-neon/30 hover:border-synth-neon/50 hover:text-white'
                : 'text-neutral-700 border-neutral-800 cursor-default']"
          >
            <FileAudio class="w-3 h-3" />
            {{ isExportingMp3 ? 'MP3…' : 'MP3' }}
          </button>

          <!-- Add to Playlist manually -->
          <div v-if="recordedBlob && !isRecording" class="flex items-center border border-neutral-700 rounded overflow-hidden">
            <button
              @click="handleAddToPlaylist"
              title="Send cropped audio to Playlist"
              class="flex-1 flex items-center justify-center gap-1 text-[9px] font-bold uppercase px-1.5 py-1.5 text-neutral-300 hover:text-synth-neon transition-colors min-w-0"
            >
              <ListPlus class="w-3.5 h-3.5 shrink-0" />
              +PL ({{ playlistRepeat }}x)
            </button>
            <div class="flex flex-col border-l border-neutral-700 bg-neutral-900/50 shrink-0">
              <button 
                @click="playlistRepeat = Math.min(99, playlistRepeat + 1)"
                class="px-1 text-[7px] font-bold text-neutral-500 hover:text-white leading-none border-b border-neutral-800"
              >+</button>
              <button 
                @click="playlistRepeat = Math.max(1, playlistRepeat - 1)"
                class="px-1 text-[7px] font-bold text-neutral-500 hover:text-white leading-none"
              >-</button>
            </div>
          </div>

          <!-- Send to Looper Track -->
          <div v-if="recordedBlob && !isRecording" class="flex flex-col gap-1 border border-neutral-700 rounded p-1.5">
            <span class="text-[7px] font-black uppercase tracking-widest text-neutral-500">→ Looper</span>
            <div class="flex items-center gap-1">
              <div class="flex gap-0.5 flex-wrap">
                <button
                  v-for="t in 8"
                  :key="t"
                  @click="selectedLooperTrack = t"
                  :class="['w-5 h-5 text-[7px] font-bold rounded border transition-colors',
                    selectedLooperTrack === t
                      ? 'bg-violet-500/30 text-violet-300 border-violet-500/50'
                      : 'text-neutral-600 border-neutral-800 hover:text-neutral-400']"
                >{{ t }}</button>
              </div>
            </div>
            <button
              @click="handleSendToLooper"
              :disabled="isSendingToLooper"
              class="flex items-center justify-center gap-1 text-[8px] font-bold uppercase px-2 py-1 rounded border text-violet-300 border-violet-500/40 hover:bg-violet-500/15 transition-colors"
            >
              {{ isSendingToLooper ? '…' : `T${selectedLooperTrack}` }}
            </button>
          </div>

          <!-- Save (original format / WAV cropped) -->
          <button
            @click="handleDownload"
            :disabled="!recordedBlob"
            title="Save recording (WAV if cropped, WebM if full)"
            :class="['flex items-center gap-1.5 text-[9px] font-bold uppercase px-3 py-1.5 rounded border transition-colors',
              recordedBlob
                ? 'text-neutral-300 border-neutral-700 hover:border-synth-neon/40 hover:text-synth-neon'
                : 'text-neutral-700 border-neutral-800 cursor-default']"
          >
            <Download class="w-3 h-3" />
            Save
          </button>  

           <!-- Import -->
          <button
            v-if="!isRecording"
            @click="handleImportClick"
            :disabled="isImporting"
            title="Import MP3/OGG/WAV file"
            class="flex items-center gap-1.5 text-[9px] font-bold uppercase px-3 py-1.5 rounded border text-neutral-500 border-neutral-700 hover:text-synth-neon hover:border-synth-neon/30 transition-colors"
          >
            <Upload class="w-3 h-3" />
            {{ isImporting ? '…' : 'Import' }}
          </button>

          <!-- Reset -->
          <button
            v-if="!isRecording"
            @click="handleReset"
            title="Reset capture"
            class="flex items-center gap-1.5 text-[9px] font-bold uppercase px-3 py-1.5 rounded border text-neutral-500 border-neutral-700 hover:text-synth-neon hover:border-synth-neon/30 transition-colors"
          >
            <RotateCcw class="w-3 h-3" />
            Reset
          </button>
        </div>
        <!-- Right Column: Timeline & Waveform canvas -->
        <div class="flex-1 flex flex-col min-h-0 bg-[#080808]">
          <!-- Timeline Control Bar -->
          <div class="flex items-center justify-between px-3 py-1.5 border-b border-neutral-900 bg-neutral-950/80 gap-4 select-none shrink-0">
            <!-- Left part: Mode + Play/Stop (if manual) -->
            <div class="flex items-center gap-2">
              <span class="text-[8px] font-black uppercase text-neutral-500 tracking-wider">Timeline</span>
              <div class="flex p-0.5 bg-neutral-900 border border-neutral-800 rounded-lg h-6">
                <button
                  @click="timelineMode = 'synced'"
                  :class="['px-2 text-[8px] font-black uppercase tracking-wider rounded transition-all', timelineMode === 'synced' ? 'bg-synth-neon/20 text-synth-neon shadow-sm' : 'text-neutral-500 hover:text-white']"
                >
                  Sync
                </button>
                <button
                  @click="timelineMode = 'manual'"
                  :class="['px-2 text-[8px] font-black uppercase tracking-wider rounded transition-all', timelineMode === 'manual' ? 'bg-synth-neon/20 text-synth-neon shadow-sm' : 'text-neutral-500 hover:text-white']"
                >
                  Manual
                </button>
              </div>
              
              <!-- Play/Stop button for Manual mode -->
              <button
                v-if="timelineMode === 'manual'"
                @click="timelineActive = !timelineActive"
                class="flex items-center justify-center w-6 h-6 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700 transition-colors"
                :title="timelineActive ? 'Stop Timeline' : 'Start Timeline'"
              >
                <Square v-if="timelineActive" class="w-2.5 h-2.5 fill-current text-red-500" />
                <Play v-else class="w-2.5 h-2.5 fill-current text-emerald-500" />
              </button>
            </div>

            <!-- Middle part: Bar Sweep Progress -->
            <div class="flex-1 flex flex-col justify-center px-1">
              <div class="flex justify-between px-0.5 mb-1">
                <span v-for="m in timelineMeasures" :key="m" class="text-[7px] font-black text-neutral-600 uppercase">Bar {{ m }}</span>
              </div>
              <div class="flex gap-1.5 w-full">
                <div v-for="idx in timelineMeasures" :key="idx"
                  class="h-3 flex-1 bg-black/60 rounded border border-neutral-900/80 p-0.5 relative overflow-hidden shadow-inner flex items-center">
                  <div class="h-full bg-gradient-to-r from-violet-600 via-cyan-500 to-emerald-400 rounded-sm transition-all duration-75 ease-linear"
                    :style="{ width: getBarProgress(idx - 1) + '%' }"></div>
                  <div v-if="isBarActive(idx - 1)" 
                    class="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_5px_white] z-10"
                    :style="{ left: `calc(${getBarProgress(idx - 1)}% - 0.25px)` }"></div>
                </div>
              </div>
            </div>

            <!-- Right part: Measures selector -->
            <div class="flex items-center gap-1.5 shrink-0">
              <span class="text-[8px] font-black uppercase text-neutral-500 tracking-wider">Bars</span>
              <div class="flex p-0.5 bg-neutral-900 border border-neutral-800 rounded-lg h-6">
                <button
                  v-for="m in [1, 2, 4, 8, 16]"
                  :key="m"
                  @click="timelineMeasures = m"
                  :class="['px-1.5 text-[8px] font-mono font-bold rounded transition-all', timelineMeasures === m ? 'bg-synth-neon/20 text-synth-neon shadow-sm' : 'text-neutral-500 hover:text-white']"
                >
                  {{ m }}
                </button>
              </div>
            </div>
          </div>
          
          <!-- Canvas container -->
          <div class="relative flex-1 min-h-[60px]">
            <canvas ref="canvasRef" class="w-full h-full block" />
            
            <!-- Playback Time overlay in bottom-left corner of the canvas -->
            <!-- <div v-if="recordedBlob" class="absolute bottom-2 left-2 bg-black/75 px-1.5 py-0.5 rounded border border-neutral-800 text-synth-neon text-[18px] font-mono tracking-wider shadow-md pointer-events-none z-10">
              {{ formatMmSs(currentPlaybackTime) }} / {{ formatMmSs(audioDuration) }}
            </div> -->

            <div v-if="!isMonitoring && !recordedBlob" class="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <template v-if="error">
                <p class="text-red-400 text-[10px] font-mono px-6 text-center">{{ error }}</p>
                <button
                  @click="startMonitor(selectedDeviceId)"
                  class="flex items-center gap-1.5 text-[9px] font-bold uppercase px-3 py-1.5 rounded border text-synth-neon border-synth-neon/30 hover:bg-synth-neon/10 transition-colors"
                >
                  <Mic class="w-3 h-3" /> Retry
                </button>
              </template>
              <p v-else class="text-neutral-700 text-[10px] font-mono">Requesting audio access…</p>
            </div>
          </div>
        </div>
      </div>
      <!-- Footer controls -->
      <div class="flex items-center gap-2 px-4 py-2 bg-neutral-900/60 border-t border-neutral-800 shrink-0">
        <!-- Level meter -->
        <div class="flex items-center gap-1.5 w-24 shrink-0">
          <span class="text-[8px] font-mono text-neutral-600">IN</span>
          <div class="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div
              ref="levelBarRef"
              class="h-full rounded-full"
              style="width: 0%; background: #00ff9d; transition: width 40ms linear;"
            />
          </div>
        </div>
        <!-- Normalize -->
        <button
          @click="handleNormalize"
          :disabled="!recordedBlob || isNormalizing"
          title="Normalize audio ceiling dBFS"
          :class="['flex items-center gap-1.5 text-[9px] font-bold uppercase px-3 py-1.5 rounded border transition-colors',
            recordedBlob && !isNormalizing
              ? 'text-synth-neon border-synth-neon/30 hover:border-synth-neon/50 hover:text-white'
              : 'text-neutral-700 border-neutral-800 cursor-default']"
        >
          <Zap class="w-3 h-3" />
          {{ isNormalizing ? 'Norm…' : 'Norm' }}
        </button>
        <!-- dBFS Ceiling + Gate sliders -->
        <div v-if="recordedBlob" class="flex items-center justify-between w-full">
          <div class="flex items-center gap-1.5">
            <span class="text-[8px] font-mono text-neutral-500">CEIL</span>
            <input
              v-model.number="normalizeDbLimit"
              title="dB Limit"
              type="range"
              min="-12"
              max="0"
              step="0.1"
              class="flex-1 h-1 accent-synth-neon bg-neutral-800 rounded appearance-none cursor-pointer"
            />
            <span class="text-[9px] font-mono text-synth-neon w-8 text-right">{{ normalizeDbLimit.toFixed(1) }}dB</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-[8px] font-mono text-neutral-500">GATE</span>
            <input
              v-model.number="normalizeGateDb"
              title="Gate treshold"
              type="range"
              min="-96"
              max="-12"
              step="1"
              class="flex-1 h-1 accent-synth-neon bg-neutral-800 rounded appearance-none cursor-pointer"
            />
            <span class="text-[9px] font-mono text-synth-neon w-8 text-right">{{ normalizeGateDb }}dB</span>
          </div>
          <!-- Playback Time overlay in bottom-left corner of the canvas -->
          <div v-if="recordedBlob" class="bg-black/75 px-1.5 py-0.5 rounded border border-neutral-800 text-synth-neon text-[18px] font-mono tracking-wider shadow-md pointer-events-none z-10">
            {{ formatMmSs(currentPlaybackTime) }} / {{ formatMmSs(audioDuration) }}
          </div>
        </div>

        <div class="flex-1" />

        <!-- Import -->
        <!-- <button
          v-if="!isRecording"
          @click="handleImportClick"
          :disabled="isImporting"
          title="Import MP3/OGG/WAV file"
          class="flex items-center gap-1.5 text-[9px] font-bold uppercase px-3 py-1.5 rounded border text-neutral-500 border-neutral-700 hover:text-synth-neon hover:border-synth-neon/30 transition-colors"
        >
          <Upload class="w-3 h-3" />
          {{ isImporting ? '…' : 'Import' }}
        </button> -->

        <!-- Reset -->
        <!-- <button
          v-if="!isRecording"
          @click="handleReset"
          title="Reset capture"
          class="flex items-center gap-1.5 text-[9px] font-bold uppercase px-3 py-1.5 rounded border text-neutral-500 border-neutral-700 hover:text-synth-neon hover:border-synth-neon/30 transition-colors"
        >
          <RotateCcw class="w-3 h-3" />
          Reset
        </button> -->

        <!-- Record / Stop -->
        <!-- <button
          v-if="!isRecording"
          @click="startRecording"
          :disabled="!isMonitoring"
          :class="['flex items-center gap-1.5 text-[9px] font-bold uppercase px-3 py-1.5 rounded border transition-colors',
            isMonitoring
              ? 'text-synth-neon border-synth-neon/30 hover:bg-synth-neon/10'
              : 'text-neutral-700 border-neutral-800 cursor-default']"
        >
          <Circle class="w-3 h-3 fill-current" />
          {{ hasBackingTrack ? 'Rec + Play' : 'Rec' }}
        </button>
        <button
          v-else
          @click="stopRecording"
          class="flex items-center gap-1.5 text-[9px] font-bold uppercase px-3 py-1.5 rounded border text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-colors"
        >
          <Square class="w-3 h-3 fill-current" />
          Stop
        </button> -->

        <!-- Playback preview -->
        <!-- <button
          v-if="recordedBlob && !isRecording"
          @click="togglePlay"
          class="flex items-center gap-1.5 text-[9px] font-bold uppercase px-3 py-1.5 rounded border text-neutral-300 border-neutral-700 hover:border-synth-neon/40 hover:text-synth-neon transition-colors"
        >
          <Pause v-if="isPlaying" class="w-3 h-3" />
          <Play v-else class="w-3 h-3" />
          {{ isPlaying ? 'Pause' : 'Play' }}
        </button> -->

        <!-- Normalize -->
        <!-- <button
          @click="handleNormalize"
          :disabled="!recordedBlob || isNormalizing"
          title="Normalize audio ceiling dBFS"
          :class="['flex items-center gap-1.5 text-[9px] font-bold uppercase px-3 py-1.5 rounded border transition-colors',
            recordedBlob && !isNormalizing
              ? 'text-synth-neon border-synth-neon/30 hover:border-synth-neon/50 hover:text-white'
              : 'text-neutral-700 border-neutral-800 cursor-default']"
        >
          <Zap class="w-3 h-3" />
          {{ isNormalizing ? 'Norm…' : 'Norm' }}
        </button> -->

        <!-- Export MP3 -->
        <!-- <button
          @click="handleExportMp3"
          :disabled="!recordedBlob || isExportingMp3"
          title="Export as MP3 (192kbps)"
          :class="['flex items-center gap-1.5 text-[9px] font-bold uppercase px-3 py-1.5 rounded border transition-colors',
            recordedBlob && !isExportingMp3
              ? 'text-synth-neon border-synth-neon/30 hover:border-synth-neon/50 hover:text-white'
              : 'text-neutral-700 border-neutral-800 cursor-default']"
        >
          <FileAudio class="w-3 h-3" />
          {{ isExportingMp3 ? 'MP3…' : 'MP3' }}
        </button> -->

        <!-- Add to Playlist manually -->
        <!-- <button
          v-if="recordedBlob && !isRecording"
          @click="handleAddToPlaylist"
          title="Send cropped audio to Playlist"
          class="flex items-center gap-1.5 text-[9px] font-bold uppercase px-3 py-1.5 rounded border text-neutral-300 border-neutral-700 hover:border-synth-neon/40 hover:text-synth-neon transition-colors"
        >
          <ListPlus class="w-3 h-3" />
          +PL
        </button> -->

        <!-- Save (original format / WAV cropped) -->
        <!-- <button
          @click="handleDownload"
          :disabled="!recordedBlob"
          title="Save recording (WAV if cropped, WebM if full)"
          :class="['flex items-center gap-1.5 text-[9px] font-bold uppercase px-3 py-1.5 rounded border transition-colors',
            recordedBlob
              ? 'text-neutral-300 border-neutral-700 hover:border-synth-neon/40 hover:text-synth-neon'
              : 'text-neutral-700 border-neutral-800 cursor-default']"
        >
          <Download class="w-3 h-3" />
          Save
        </button> -->
      </div>

      <!-- Loop settings area -->
      <div v-if="recordedBlob" class="px-4 py-2 bg-neutral-950 border-t border-neutral-900/60 flex flex-col gap-2 shrink-0">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <button
              @click="isLooping = !isLooping"
              :class="['flex items-center gap-1.5 text-[9px] font-bold uppercase px-2 py-1 rounded border transition-colors',
                isLooping 
                  ? 'bg-synth-neon/15 text-synth-neon border-synth-neon/40' 
                  : 'text-neutral-500 border-neutral-800 hover:text-neutral-400 hover:border-neutral-700']"
            >
              <Repeat class="w-3 h-3" />
              Loop {{ isLooping ? 'ON' : 'OFF' }}
            </button>
            <button
              @click="snapEnabled = !snapEnabled"
              :class="['flex items-center gap-1.5 text-[9px] font-bold uppercase px-2 py-1 rounded border transition-colors',
                snapEnabled 
                  ? 'bg-synth-neon/15 text-synth-neon border-synth-neon/40' 
                  : 'text-neutral-500 border-neutral-800 hover:text-neutral-400 hover:border-neutral-700']"
              title="Snap playback start, loop start, and loop end to bar divisions"
            >
              <Magnet class="w-3 h-3" />
              Snap {{ snapEnabled ? 'ON' : 'OFF' }}
            </button>
            <span class="text-[12px] font-mono text-neutral-500">
              Range: {{ formatTimeSecs(loopStart) }} - {{ formatTimeSecs(loopEnd) }} / {{ formatTimeSecs(audioDuration) }}
            </span>
          </div>
          <span class="text-[12px] font-mono text-synth-neon">
            Pos: {{ formatTimeSecs(currentPlaybackTime) }}
          </span>
        </div>

        <div class="flex flex-col gap-1.5 mt-1">
          <!-- Play Start Slider -->
          <div class="flex items-center gap-3">
            <span class="text-[8px] font-mono text-cyan-700 w-16">PLAY START</span>
            <input
              v-model.number="playbackStart"
              type="range"
              min="0"
              :max="audioDuration"
              step="0.01"
              class="flex-1 h-1 accent-synth-neon bg-neutral-800 rounded appearance-none cursor-pointer"
            />
            <span class="text-[9px] font-mono text-neutral-500 w-10 text-right">{{ formatTimeSecs(playbackStart) }}</span>
          </div>

          <div v-if="isLooping" class="flex flex-row gap-3 mt-1">
            <!-- Loop Start Slider -->
            <div class="flex items-center gap-3 w-1/2">
              <span class="text-[8px] font-mono text-synth-neon w-16">LOOP START</span>
              <input
                v-model.number="loopStart"
                type="range"
                min="0"
                :max="audioDuration"
                step="0.01"
                class="flex-1 h-1 accent-synth-neon bg-neutral-800 rounded appearance-none cursor-pointer"
              />
              <span class="text-[9px] font-mono text-neutral-500 w-10 text-right">{{ formatTimeSecs(loopStart) }}</span>
            </div>

            <!-- Loop End Slider -->
            <div class="flex items-center gap-3 w-1/2">
              <span class="text-[8px] font-mono text-red-400 w-16">LOOP END</span>
              <input
                v-model.number="loopEnd"
                type="range"
                min="0"
                :max="audioDuration"
                step="0.01"
                class="flex-1 h-1 accent-red-500 bg-neutral-800 rounded appearance-none cursor-pointer"
              />
              <span class="text-[9px] font-mono text-neutral-500 w-10 text-right">{{ formatTimeSecs(loopEnd) }}</span>
            </div>
          </div>
          <div class="flex flex-col">
            <!-- Zoom and Pan controls -->
            <div class="grid grid-cols-2 gap-4 mt-2 border-t border-neutral-900/60 pt-2 shrink-0">
              <!-- Left col: Zoom H / Pan -->
              <div class="flex flex-col gap-1.5">
                <!-- Zoom H -->
                <div class="flex items-center gap-3">
                  <span class="text-[8px] font-mono text-neutral-400 w-12">ZOOM H</span>
                  <input
                    v-model.number="zoomX"
                    type="range"
                    min="1"
                    max="10"
                    step="0.1"
                    class="flex-1 h-1 accent-synth-neon bg-neutral-800 rounded appearance-none cursor-pointer"
                  />
                  <span class="text-[9px] font-mono text-neutral-500 w-8 text-right">{{ zoomX.toFixed(1) }}x</span>
                </div>
                
                <!-- Pan -->
                <div class="flex items-center gap-3" :class="{ 'opacity-30 pointer-events-none': zoomX <= 1 }">
                  <span class="text-[8px] font-mono text-neutral-400 w-12">PAN</span>
                  <input
                    v-model.number="panOffset"
                    type="range"
                    min="0"
                    :max="Math.max(0, 1 - 1 / zoomX)"
                    step="0.001"
                    class="flex-1 h-1 accent-synth-neon bg-neutral-800 rounded appearance-none cursor-pointer"
                  />
                  <span class="text-[9px] font-mono text-neutral-500 w-8 text-right">{{ (panOffset * 100).toFixed(0) }}%</span>
                </div>
              </div>
              
              <!-- Right col: Zoom V / Crossfade -->
              <div class="flex flex-col gap-1.5">
                <!-- Zoom V -->
                <div class="flex items-center gap-3">
                  <span class="text-[8px] font-mono text-neutral-400 w-12">ZOOM V</span>
                  <input
                    v-model.number="zoomY"
                    type="range"
                    min="1"
                    max="10"
                    step="0.1"
                    class="flex-1 h-1 accent-synth-neon bg-neutral-800 rounded appearance-none cursor-pointer"
                  />
                  <span class="text-[9px] font-mono text-neutral-500 w-8 text-right">{{ zoomY.toFixed(1) }}x</span>
                </div>

                <!-- Crossfade Slider -->
                <div class="flex items-center gap-3" :class="{ 'opacity-30 pointer-events-none': !isLooping }">
                  <span class="text-[8px] font-mono text-neutral-400 w-12">CROSSFADE</span>
                  <input
                    v-model.number="loopCrossfadeDur"
                    type="range"
                    min="0"
                    max="5"
                    step="0.05"
                    class="flex-1 h-1 accent-synth-neon bg-neutral-800 rounded appearance-none cursor-pointer"
                  />
                  <span class="text-[9px] font-mono text-neutral-500 w-8 text-right">{{ formatTimeSecs(loopCrossfadeDur) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>

  <!-- Hidden audio elements for playback preview with crossfade -->
  <audio ref="audioRef1" @loadedmetadata="handleLoadedMetadata" class="hidden" />
  <audio ref="audioRef2" class="hidden" />
  <input ref="fileInputRef" type="file" accept=".mp3,.ogg,.wav,audio/*" @change="handleFileImport" class="hidden" />
</template>

<style scoped>
.capture-enter-active,
.capture-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.capture-enter-from,
.capture-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(16px);
}
</style>
