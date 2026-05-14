<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { Mic, Circle, Square, Download, X, Play, Pause, RotateCcw, FileAudio, ListPlus, GripVertical } from 'lucide-vue-next'
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
const selectedDeviceId = ref('default')
const isMonitoring     = ref(false)
const isRecording      = ref(false)
const recSecs          = ref(0)
const recordedBlob     = ref(null)
const isPlaying        = ref(false)
const isExportingMp3   = ref(false)
const toPlaylist       = ref(localStorage.getItem('S1_CAPTURE_TO_PLAYLIST') === '1')
const error            = ref(null)

// ── DOM refs ──────────────────────────────────────────────────────────────────
const canvasRef   = ref(null)
const levelBarRef = ref(null)
const audioRef    = ref(null)

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
  if (!keepBlob) {
    recordedBlob.value = null
    recSecs.value = 0
    if (blobUrlRef) { URL.revokeObjectURL(blobUrlRef); blobUrlRef = null }
  }
  if (levelBarRef.value) levelBarRef.value.style.width = '0%'
}

// ── Start monitoring ──────────────────────────────────────────────────────────
async function startMonitor(deviceId) {
  error.value = null
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId !== 'default' ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    })
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
    const msg = e?.message ?? ''
    error.value = msg.toLowerCase().includes('denied') || msg.toLowerCase().includes('permission')
      ? 'Microphone access denied.'
      : msg || 'Audio input failed.'
  }
}

// ── Panel open / close ────────────────────────────────────────────────────────
watch(() => uiStore.isAudioCaptureOpen, (open) => {
  if (open) startMonitor(selectedDeviceId.value)
  else stopAll()
})

// ── Device hot-swap ───────────────────────────────────────────────────────────
async function handleDeviceChange(id) {
  selectedDeviceId.value = id
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

  const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg']
    .find(t => MediaRecorder.isTypeSupported(t)) ?? ''

  const recorder = new MediaRecorder(streamRef, mimeType ? { mimeType } : undefined)
  recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.push(e.data) }
  recorder.onstop = () => {
    const blob = new Blob(chunksRef, { type: recorder.mimeType || 'audio/webm' })
    recordedBlob.value = blob
    const previewUrl = URL.createObjectURL(blob)
    blobUrlRef = previewUrl
    if (audioRef.value) { audioRef.value.src = previewUrl; audioRef.value.load() }
    if (toPlaylistRef) {
      const d = new Date()
      const pad = n => String(n).padStart(2, '0')
      const ts = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
      const playlistUrl = URL.createObjectURL(blob)
      window.dispatchEvent(new CustomEvent('playlist-add-from-capture', { detail: { url: playlistUrl, label: `REC ${ts}` } }))
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

function handleDownload() {
  if (!recordedBlob.value) return
  const ext = recordedBlob.value.type.includes('ogg') ? 'ogg' : 'webm'
  triggerDownload(recordedBlob.value, `s1-audio-${getTimestamp()}.${ext}`)
}

async function handleExportMp3() {
  if (!recordedBlob.value || isExportingMp3.value) return
  isExportingMp3.value = true
  try {
    const arrayBuffer = await recordedBlob.value.arrayBuffer()
    const audioCtx = new AudioContext()
    const decoded = await audioCtx.decodeAudioData(arrayBuffer)
    await audioCtx.close()

    const numChannels = Math.min(decoded.numberOfChannels, 2)
    const sampleRate  = decoded.sampleRate
    const left  = decoded.getChannelData(0)
    const right = numChannels > 1 ? decoded.getChannelData(1) : left

    const toInt16 = f32 => {
      const i16 = new Int16Array(f32.length)
      for (let i = 0; i < f32.length; i++) {
        const s = Math.max(-1, Math.min(1, f32[i]))
        i16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
      }
      return i16
    }

    const leftI16  = toInt16(left)
    const rightI16 = numChannels > 1 ? toInt16(right) : leftI16
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

// ── Playback ──────────────────────────────────────────────────────────────────
function togglePlay() {
  if (!audioRef.value || !blobUrlRef) return
  if (isPlaying.value) audioRef.value.pause()
  else audioRef.value.play()
}

// ── rAF draw loop ─────────────────────────────────────────────────────────────
watch(isMonitoring, async (active) => {
  if (!active) return
  await nextTick()
  startDrawLoop()
})

function startDrawLoop() {
  if (rafRef) { cancelAnimationFrame(rafRef); rafRef = null }
  const canvas = canvasRef.value
  if (!canvas) return

  const draw = () => {
    rafRef = requestAnimationFrame(draw)
    const analyser = analyserRef
    if (!analyser) return

    const dpr = window.devicePixelRatio || 1
    const W = canvas.offsetWidth * dpr
    const H = canvas.offsetHeight * dpr
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H }

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

    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#080808'
    ctx.fillRect(0, 0, W, H)

    const rec   = isRecordingRef
    const color = rec ? '#ef4444' : '#00ff9d'
    const midY  = H / 2

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
  draw()
}

function fmtTime(s) {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
let _recToggleHandler = null

onMounted(() => {
  navigator.mediaDevices?.addEventListener('devicechange', refreshDevices)
  if (uiStore.isAudioCaptureOpen) startMonitor(selectedDeviceId.value)
  
  _recToggleHandler = () => {
    if (isRecording.value) stopRecording()
    else startRecording()
  }
  window.addEventListener('capture-rec-toggle', _recToggleHandler)
})

onUnmounted(() => {
  stopAll()
  navigator.mediaDevices?.removeEventListener('devicechange', refreshDevices)
  window.removeEventListener('capture-rec-toggle', _recToggleHandler)
})
</script>

<template>
  <Transition name="capture">
    <div
      v-if="uiStore.isAudioCaptureOpen"
      class="fixed z-[1000] min-w-[480px] min-h-[280px] bg-neutral-950 border border-neutral-800 rounded-xl shadow-2xl shadow-black/60 flex flex-col resize overflow-hidden"
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

        <!-- Save (original format) -->
        <button
          @click="handleDownload"
          :disabled="!recordedBlob"
          title="Save recording (original format)"
          :class="['flex items-center gap-1.5 text-[9px] font-bold uppercase px-3 py-1.5 rounded border transition-colors',
            recordedBlob
              ? 'text-neutral-300 border-neutral-700 hover:border-synth-neon/40 hover:text-synth-neon'
              : 'text-neutral-700 border-neutral-800 cursor-default']"
        >
          <Download class="w-3 h-3" />
          Save
        </button>
      </div>
    </div>
  </Transition>

  <!-- Hidden audio element for playback preview -->
  <audio
    ref="audioRef"
    @play="isPlaying = true"
    @pause="isPlaying = false"
    @ended="isPlaying = false"
    class="hidden"
  />
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
