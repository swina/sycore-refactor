<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { Mic, Circle, Square, Download, X, Play, Pause, RotateCcw, FileAudio, ListPlus, GripVertical, Repeat } from 'lucide-vue-next'
import { useUiStore } from '@/stores/useUiStore'
import { useDraggable } from '@/composables/useDraggable'
import { Mp3Encoder } from '@breezystack/lamejs'

const props = defineProps({
  hasBackingTrack: { type: Boolean, default: false },
})

const uiStore = useUiStore()

const { x, y, startDrag } = useDraggable(
  Math.max(8, (window.innerWidth - 480) / 2),
  window.innerHeight - 320,
  'S1_CAPTURE_POS'
)

// ── Reactive state ────────────────────────────────────────────────────────────
const devices          = ref([])
const selectedDeviceId = ref(localStorage.getItem('S1_CAPTURE_DEVICE') || 'default')
const isMonitoring     = ref(false)
const isRecording      = ref(false)
const recSecs          = ref(0)
const recordedBlob     = ref(null)
const isPlaying        = ref(false)
const isExportingMp3   = ref(false)
const toPlaylist       = ref(localStorage.getItem('S1_CAPTURE_TO_PLAYLIST') === '1')
const error            = ref(null)

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

watch(toPlaylist, v => {
  toPlaylistRef = v
  localStorage.setItem('S1_CAPTURE_TO_PLAYLIST', v ? '1' : '0')
})

watch(loopStart, (ns) => {
  if (ns >= loopEnd.value) {
    loopEnd.value = Math.min(audioDuration.value, ns + 0.05)
  }
})

watch(loopEnd, (ne) => {
  if (ne <= loopStart.value) {
    loopStart.value = Math.max(0, ne - 0.05)
  }
})

watch(playbackStart, (ns) => {
  if (ns > audioDuration.value) {
    playbackStart.value = audioDuration.value
  } else if (ns < 0) {
    playbackStart.value = 0
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

// ── Recording ────────────────────────────────────────────────────────────────
function startRecording() {
  if (!streamRef || isRecording.value) return
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
  recorder.onstop = () => {
    const blob = new Blob(chunksRef, { type: recorder.mimeType || 'audio/webm' })
    recordedBlob.value = blob
    const previewUrl = URL.createObjectURL(blob)
    blobUrlRef = previewUrl
    if (audioRef1.value && audioRef2.value) {
      audioRef1.value.src = previewUrl
      audioRef2.value.src = previewUrl
      audioRef1.value.load()
      audioRef2.value.load()
    }
    
    // Explicitly initialize loop range to full recording duration
    audioDuration.value = recSecs.value
    loopStart.value = 0
    loopEnd.value = recSecs.value
    playbackStart.value = 0

    if (toPlaylistRef) {
      const d = new Date()
      const pad = n => String(n).padStart(2, '0')
      const ts = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
      const playlistUrl = URL.createObjectURL(blob)
      window.dispatchEvent(new CustomEvent('playlist-add-from-capture', { detail: { url: playlistUrl, label: `REC ${ts}`, duration: recSecs.value } }))
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
        duration: duration
      }
    }))
  } catch (e) {
    console.error('Failed to add cropped audio to playlist', e)
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

watch([loopStart, loopEnd, playbackStart, currentPlaybackTime, isLooping, zoomX, zoomY, panOffset], () => {
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
let resizeObserver = null

onMounted(async () => {
  await refreshDevices()
  navigator.mediaDevices?.addEventListener('devicechange', refreshDevices)
  if (uiStore.isAudioCaptureOpen) startMonitor(selectedDeviceId.value)
  
  _recToggleHandler = () => {
    if (isRecording.value) stopRecording()
    else startRecording()
  }
  window.addEventListener('capture-rec-toggle', _recToggleHandler)

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
  if (playbackRafRef) {
    cancelAnimationFrame(playbackRafRef)
    playbackRafRef = null
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  navigator.mediaDevices?.removeEventListener('devicechange', refreshDevices)
  window.removeEventListener('capture-rec-toggle', _recToggleHandler)
})
</script>

<template>
  <Transition name="capture">
    <div
      v-show="uiStore.isAudioCaptureOpen"
      class="fixed z-[1000] min-w-[892px] min-h-[420px] bg-neutral-950 border border-neutral-800 rounded-xl shadow-2xl shadow-black/60 flex flex-col resize overflow-hidden"
      :style="{ left: x + 'px', top: y + 'px' }"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-2 bg-neutral-900 border-b border-neutral-800 shrink-0">
        <div class="flex items-center gap-2">
          <div @mousedown="startDrag" class="cursor-grab active:cursor-grabbing p-1 -ml-2 text-neutral-600 hover:text-neutral-400">
            <GripVertical class="w-3.5 h-3.5" />
          </div>
          <Mic :class="['w-3.5 h-3.5', isRecording ? 'text-red-400' : 'text-synth-neon']" />
          <span :class="['text-[10px] font-black uppercase tracking-widest', isRecording ? 'text-red-400' : 'text-synth-neon']">
            Audio Capture
          </span>
          <span v-if="isRecording" class="flex items-center gap-1 text-[8px] font-mono px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30">
            <span class="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            REC {{ fmtTime(recSecs) }}
          </span>
          <span v-else-if="recordedBlob" class="text-[8px] font-mono text-neutral-500 px-1.5 py-0.5 rounded bg-neutral-800">
            {{ fmtTime(recSecs) }} captured
          </span>
          <span v-else-if="!isMonitoring && !error" class="text-[8px] font-mono text-neutral-600">connecting…</span>
        </div>
        <button @click="uiStore.isAudioCaptureOpen = false" class="text-neutral-600 hover:text-white transition-colors">
          <X class="w-3.5 h-3.5" />
        </button>
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

      <!-- Waveform canvas -->
      <div class="relative bg-[#080808] flex-1 min-h-[60px]">
        <canvas ref="canvasRef" class="w-full h-full block" />
        
        <!-- Playback Time overlay in bottom-left corner of the canvas -->
        <div v-if="recordedBlob" class="absolute bottom-2 left-2 bg-black/75 px-1.5 py-0.5 rounded border border-neutral-800 text-synth-neon text-[18px] font-mono tracking-wider shadow-md pointer-events-none z-10">
          {{ formatMmSs(currentPlaybackTime) }} / {{ formatMmSs(audioDuration) }}
        </div>

        <div v-if="!isMonitoring" class="absolute inset-0 flex flex-col items-center justify-center gap-2">
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

        <div class="flex-1" />

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

        <!-- Record / Stop -->
        <button
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
        </button>

        <!-- Playback preview -->
        <button
          v-if="recordedBlob && !isRecording"
          @click="togglePlay"
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
        <button
          v-if="recordedBlob && !isRecording"
          @click="handleAddToPlaylist"
          title="Send cropped audio to Playlist"
          class="flex items-center gap-1.5 text-[9px] font-bold uppercase px-3 py-1.5 rounded border text-neutral-300 border-neutral-700 hover:border-synth-neon/40 hover:text-synth-neon transition-colors"
        >
          <ListPlus class="w-3 h-3" />
          +PL
        </button>

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
            <span class="text-[8px] font-mono text-synth-neon w-16">PLAY START</span>
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

          <div v-if="isLooping" class="flex flex-col gap-1.5 mt-1">
            <!-- Loop Start Slider -->
            <div class="flex items-center gap-3">
              <span class="text-[8px] font-mono text-neutral-400 w-16">LOOP START</span>
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
            <div class="flex items-center gap-3">
              <span class="text-[8px] font-mono text-neutral-400 w-16">LOOP END</span>
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
