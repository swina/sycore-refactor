<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { Activity, X, Mic, MicOff, Volume2, SlidersHorizontal, RotateCcw, GripVertical } from 'lucide-vue-next'
import { useUiStore } from '@/stores/useUiStore'
import { useDraggable } from '@/composables/useDraggable'
import { useResizable } from '@/composables/useResizable'
import { useLocalStorage } from '@/composables/useLocalStorage'

const uiStore = useUiStore()

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_EQ = [
  { label: 'LOW',    type: 'lowshelf',  freq: 80,   gain: 0, q: 0.7, freqMin: 20,   freqMax: 500   },
  { label: 'LO-MID', type: 'peaking',   freq: 400,  gain: 0, q: 1.0, freqMin: 100,  freqMax: 2000  },
  { label: 'HI-MID', type: 'peaking',   freq: 2500, gain: 0, q: 1.0, freqMin: 800,  freqMax: 10000 },
  { label: 'HIGH',   type: 'highshelf', freq: 8000, gain: 0, q: 0.7, freqMin: 2000, freqMax: 20000 },
]
const MODE_BTNS = [
  { id: 'scope', label: '~' }, { id: 'both', label: '÷' }, { id: 'spectrum', label: '|||' },
]

function fmtHz(hz) {
  return hz >= 1000 ? `${(hz / 1000).toFixed(hz % 1000 === 0 ? 0 : 1)}k` : `${hz}`
}
function fmtGain(db) { return `${db >= 0 ? '+' : ''}${db.toFixed(1)}` }

// ── Reactive state ────────────────────────────────────────────────────────────
const isActive        = ref(false)
const mode            = ref('both')
const error           = ref(null)
const devices         = ref([])
const { state: selectedDeviceId } = useLocalStorage('S1_VISUALIZER_DEVICE', 'default')
const volume          = ref(1)
const showEq          = ref(false)
const eqBands         = ref(DEFAULT_EQ.map(b => ({ ...b })))

const { x, y, startDrag } = useDraggable(
  Math.max(8, (window.innerWidth - 480) / 2),
  window.innerHeight - 450,
  'S1_VISUALIZER_POS'
)

const { width, height, startResize } = useResizable(
  480, 
  320, 
  'S1_VISUALIZER_SIZE'
)
const scopeAmpZoom    = ref(1)
const scopeTimeZoom   = ref(1)

// ── DOM refs ──────────────────────────────────────────────────────────────────
const canvasRef   = ref(null)
const eqCurveRef  = ref(null)
const levelBarRef = ref(null)

// ── Plain mutable (Web Audio nodes) ──────────────────────────────────────────
let ctxRef      = null
let analyserRef = null
let gainNodeRef = null
let eqNodesRef  = []
let sourceRef   = null
let streamRef   = null
let rafRef      = null
let peakRef     = null

// ── Computed ──────────────────────────────────────────────────────────────────
const scopeZoomed  = computed(() => scopeAmpZoom.value !== 1 || scopeTimeZoom.value !== 1)
const scopeVisible = computed(() => mode.value !== 'spectrum')
const volDb = computed(() => volume.value > 0 ? `${(20 * Math.log10(volume.value)).toFixed(1)} dB` : '-∞ dB')

// ── Device enumeration ────────────────────────────────────────────────────────
async function refreshDevices() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices()
    devices.value = all.filter(d => d.kind === 'audioinput')
  } catch { /* ignore until permission granted */ }
}

// ── Stop / cleanup ────────────────────────────────────────────────────────────
function stop() {
  if (rafRef) { cancelAnimationFrame(rafRef); rafRef = null }
  if (sourceRef) { sourceRef.disconnect(); sourceRef = null }
  if (streamRef) { streamRef.getTracks().forEach(t => t.stop()); streamRef = null }
  eqNodesRef.forEach(n => { try { n.disconnect() } catch {} })
  eqNodesRef = []
  if (gainNodeRef) { gainNodeRef.disconnect(); gainNodeRef = null }
  if (ctxRef) { ctxRef.close(); ctxRef = null }
  analyserRef = null
  isActive.value = false
  if (levelBarRef.value) levelBarRef.value.style.width = '0%'
}

// ── Connect stream ────────────────────────────────────────────────────────────
async function connectStream(deviceId) {
  if (sourceRef) { sourceRef.disconnect(); sourceRef = null }
  if (streamRef) { streamRef.getTracks().forEach(t => t.stop()); streamRef = null }
  
  let stream = null
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId !== 'default' ? { exact: deviceId } : undefined,
        echoCancellation: false, noiseSuppression: false, autoGainControl: false,
      },
      video: false,
    })
  } catch (e) {
    if (deviceId !== 'default') {
      console.warn('[AudioVisualizer] Selected audio device failed, falling back to default...', e)
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false, noiseSuppression: false, autoGainControl: false,
          },
          video: false,
        })
        selectedDeviceId.value = 'default'
      } catch (fallbackErr) {
        throw fallbackErr
      }
    } else {
      throw e
    }
  }

  streamRef = stream
  const src = ctxRef.createMediaStreamSource(stream)
  sourceRef = src
  src.connect(gainNodeRef)
}

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  error.value = null
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    const audioCtx = new AudioCtx()
    ctxRef = audioCtx

    const gain = audioCtx.createGain()
    gain.gain.value = volume.value
    gainNodeRef = gain

    const eqNodes = eqBands.value.map(b => {
      const f = audioCtx.createBiquadFilter()
      f.type = b.type
      f.frequency.value = b.freq
      f.gain.value = b.gain
      f.Q.value = b.q
      return f
    })
    eqNodesRef = eqNodes

    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 4096
    analyser.smoothingTimeConstant = 0.75
    analyserRef = analyser

    gain.connect(eqNodes[0])
    for (let i = 0; i < eqNodes.length - 1; i++) eqNodes[i].connect(eqNodes[i + 1])
    eqNodes[eqNodes.length - 1].connect(analyser)

    await connectStream(selectedDeviceId.value)
    await refreshDevices()
    isActive.value = true
  } catch (e) {
    if (ctxRef) { ctxRef.close(); ctxRef = null }
    error.value = e?.message?.includes('denied')
      ? 'Microphone access denied.'
      : (e?.message ?? 'Audio capture failed.')
    refreshDevices()
  }
}

// ── Device hot-swap ───────────────────────────────────────────────────────────
async function handleDeviceChange(id) {
  selectedDeviceId.value = id
  if (!isActive.value) return
  try { await connectStream(id) }
  catch (e) { error.value = e?.message ?? 'Failed to switch device.' }
}

// ── Volume ────────────────────────────────────────────────────────────────────
function handleVolumeChange(v) {
  volume.value = v
  if (gainNodeRef) gainNodeRef.gain.value = v
}

// ── EQ ────────────────────────────────────────────────────────────────────────
function handleEqChange(idx, field, value) {
  eqBands.value = eqBands.value.map((b, i) => i === idx ? { ...b, [field]: value } : b)
  const node = eqNodesRef[idx]
  if (!node) return
  if (field === 'freq') node.frequency.value = value
  if (field === 'gain') node.gain.value = value
  if (field === 'q') node.Q.value = value
}

function resetEq() {
  eqBands.value = eqBands.value.map(b => ({ ...b, gain: 0 }))
  eqNodesRef.forEach(n => { if (n) n.gain.value = 0 })
}

// ── EQ curve canvas ───────────────────────────────────────────────────────────
function drawEqCurve() {
  const canvas = eqCurveRef.value
  if (!canvas || !showEq.value) return
  const dpr = window.devicePixelRatio || 1
  canvas.width = canvas.offsetWidth * dpr
  canvas.height = canvas.offsetHeight * dpr
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height

  ctx.fillStyle = '#050505'
  ctx.fillRect(0, 0, W, H)
  ;[0, H * 0.25, H * 0.5, H * 0.75, H].forEach(y => {
    ctx.strokeStyle = y === H * 0.5 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
  })

  if (!eqNodesRef.length) {
    ctx.strokeStyle = 'rgba(0,255,157,0.25)'; ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke()
    ctx.setLineDash([])
    return
  }

  const freqs = new Float32Array(W)
  const combined = new Float32Array(W).fill(1)
  const mag = new Float32Array(W), ph = new Float32Array(W)
  for (let i = 0; i < W; i++) freqs[i] = 20 * Math.pow(1000, i / W)
  eqNodesRef.forEach(n => {
    n.getFrequencyResponse(freqs, mag, ph)
    for (let i = 0; i < W; i++) combined[i] *= mag[i]
  })

  const MAX_DB = 14
  const dbY = (i) => H / 2 - (20 * Math.log10(Math.max(combined[i], 1e-10)) / MAX_DB) * (H / 2) * 0.85

  ctx.beginPath()
  for (let i = 0; i < W; i++) i === 0 ? ctx.moveTo(i, dbY(i)) : ctx.lineTo(i, dbY(i))
  ctx.lineTo(W, H / 2); ctx.lineTo(0, H / 2); ctx.closePath()
  ctx.fillStyle = 'rgba(0,255,157,0.07)'; ctx.fill()

  ctx.beginPath()
  ctx.strokeStyle = '#00ff9d'; ctx.lineWidth = 1.5 * dpr
  ctx.shadowColor = '#00ff9d'; ctx.shadowBlur = 4
  for (let i = 0; i < W; i++) i === 0 ? ctx.moveTo(i, dbY(i)) : ctx.lineTo(i, dbY(i))
  ctx.stroke(); ctx.shadowBlur = 0

  ctx.fillStyle = 'rgba(255,255,255,0.2)'
  ctx.font = `${7 * dpr}px monospace`
  ;[100, 500, 1000, 5000, 10000].forEach(f => {
    const x = Math.log10(f / 20) / Math.log10(1000) * W
    ctx.fillText(fmtHz(f), x, H - 2)
  })
}

// ── Main draw loop ────────────────────────────────────────────────────────────
function startDrawLoop() {
  if (rafRef) { cancelAnimationFrame(rafRef); rafRef = null }
  if (!isActive.value || !analyserRef || !canvasRef.value) return

  const analyser = analyserRef
  const canvas = canvasRef.value
  const ctx2d = canvas.getContext('2d')
  const bufLen = analyser.frequencyBinCount
  const timeData = new Uint8Array(bufLen), freqData = new Uint8Array(bufLen)
  const BARS = 120
  if (!peakRef || peakRef.length !== BARS) peakRef = new Float32Array(BARS)
  const peaks = peakRef
  const AIRA = '#00ff9d', BG = '#080808'

  const draw = () => {
    rafRef = requestAnimationFrame(draw)
    const dpr = window.devicePixelRatio || 1
    const W = width.value * dpr, H = height.value * dpr
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H }

    ctx2d.fillStyle = BG; ctx2d.fillRect(0, 0, W, H)
    ctx2d.strokeStyle = 'rgba(255,255,255,0.03)'; ctx2d.lineWidth = 1
    for (let gx = 0; gx <= W; gx += W / 8) { ctx2d.beginPath(); ctx2d.moveTo(gx, 0); ctx2d.lineTo(gx, H); ctx2d.stroke() }
    for (let gy = 0; gy <= H; gy += H / 4) { ctx2d.beginPath(); ctx2d.moveTo(0, gy); ctx2d.lineTo(W, gy); ctx2d.stroke() }

    const m = mode.value
    const scopeH = m === 'both' ? H * 0.47 : (m === 'scope' ? H : 0)
    const specTop = m === 'both' ? H * 0.53 : 0
    const specH   = m === 'both' ? H * 0.47 : (m === 'spectrum' ? H : 0)

    if (m !== 'spectrum') {
      analyser.getByteTimeDomainData(timeData)
      let rms = 0
      for (let i = 0; i < bufLen; i++) rms += ((timeData[i] / 128) - 1) ** 2
      rms = Math.sqrt(rms / bufLen)
      if (levelBarRef.value) {
        levelBarRef.value.style.width = `${Math.min(100, rms * 500)}%`
        levelBarRef.value.style.background = rms > 0.35 ? '#ff4444' : rms > 0.15 ? '#fbbf24' : AIRA
      }

      const ampZoom = scopeAmpZoom.value, timeZoom = scopeTimeZoom.value
      const visible = Math.max(1, Math.floor(bufLen / timeZoom))
      const sw = W / visible, midY = scopeH / 2

      ctx2d.save()
      ctx2d.beginPath()
      ctx2d.strokeStyle = AIRA; ctx2d.lineWidth = 1.5 * dpr
      ctx2d.shadowColor = AIRA; ctx2d.shadowBlur = 5
      for (let i = 0; i < visible; i++) {
        const norm = (timeData[i] / 128) - 1
        const y = Math.max(0, Math.min(scopeH, midY - norm * midY * ampZoom))
        i === 0 ? ctx2d.moveTo(0, y) : ctx2d.lineTo(i * sw, y)
      }
      ctx2d.stroke(); ctx2d.restore()

      ctx2d.strokeStyle = 'rgba(0,255,157,0.08)'; ctx2d.lineWidth = 1
      ctx2d.beginPath(); ctx2d.moveTo(0, midY); ctx2d.lineTo(W, midY); ctx2d.stroke()

      ctx2d.fillStyle = 'rgba(0,255,157,0.22)'; ctx2d.font = `${8 * dpr}px monospace`
      const zoomLabel = ampZoom !== 1 || timeZoom !== 1
        ? `  AMP ${ampZoom.toFixed(1)}×  TIME ${timeZoom.toFixed(1)}×` : ''
      ctx2d.fillText(`OSCILLOSCOPE${zoomLabel}`, 6 * dpr, 11 * dpr)
    }

    if (m === 'both') {
      ctx2d.strokeStyle = 'rgba(255,255,255,0.06)'; ctx2d.lineWidth = 1
      ctx2d.beginPath(); ctx2d.moveTo(0, H * 0.5); ctx2d.lineTo(W, H * 0.5); ctx2d.stroke()
    }

    if (m !== 'scope') {
      analyser.getByteFrequencyData(freqData)
      const barW = W / BARS
      for (let i = 0; i < BARS; i++) {
        const binIdx = Math.min(bufLen - 1, Math.round(Math.pow(i / BARS, 1.7) * bufLen))
        const raw = freqData[binIdx] / 255
        peaks[i] = raw > peaks[i] ? raw : Math.max(0, peaks[i] - 0.012)
        const v = peaks[i]
        ctx2d.fillStyle = `hsl(${Math.round(142 - v * 142)},100%,${40 + v * 20}%)`
        ctx2d.fillRect(i * barW, specTop + specH - v * specH, barW - 1, v * specH)
        if (v > 0.04) {
          ctx2d.fillStyle = 'rgba(255,255,255,0.55)'
          ctx2d.fillRect(i * barW, specTop + specH - v * specH - 2 * dpr, barW - 1, 2 * dpr)
        }
      }
      const labels = ['50', '200', '500', '1k', '2k', '5k', '10k', '20k']
      ctx2d.fillStyle = 'rgba(255,255,255,0.18)'; ctx2d.font = `${7 * dpr}px monospace`
      labels.forEach((l, idx) => ctx2d.fillText(l, (idx / (labels.length - 1)) * (W - 20 * dpr), specTop + specH - 2 * dpr))
      ctx2d.fillStyle = 'rgba(251,191,36,0.22)'; ctx2d.font = `${8 * dpr}px monospace`
      ctx2d.fillText('SPECTRUM', 6 * dpr, specTop + 11 * dpr)
    }
  }
  draw()
}

// ── Watchers ──────────────────────────────────────────────────────────────────
watch([isActive, mode], () => nextTick(startDrawLoop), { flush: 'post' })
watch([eqBands, showEq, isActive], () => nextTick(drawEqCurve), { deep: true, flush: 'post' })
watch(() => uiStore.isVisualizerOpen, async (open) => {
  if (open) {
    await refreshDevices()
    const exists = selectedDeviceId.value === 'default' || devices.value.some(d => d.deviceId === selectedDeviceId.value)
    if (exists && !isActive.value) {
      start()
    }
  } else {
    stop()
  }
})

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(async () => {
  await refreshDevices()
  navigator.mediaDevices?.addEventListener('devicechange', refreshDevices)
  
  // If it's already open at mount (e.g. page refresh), try to refresh and auto-start
  if (uiStore.isVisualizerOpen) {
    const exists = selectedDeviceId.value === 'default' || devices.value.some(d => d.deviceId === selectedDeviceId.value)
    if (exists && !isActive.value) {
      start()
    }
  }
})
onUnmounted(() => {
  stop()
  navigator.mediaDevices?.removeEventListener('devicechange', refreshDevices)
})
</script>

<template>
  <Transition name="capture">
  <div v-if="uiStore.isVisualizerOpen" 
    class="fixed z-[300] bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl shadow-black/60 flex flex-col"
    :style="{ 
      left: x + 'px', 
      top: y + 'px',
      width: width + 'px',
      height: height + 'px'
    }"
  >

    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-2 bg-neutral-900 border-b border-neutral-800 shrink-0">
      <div class="flex items-center gap-2">
        <div @mousedown="startDrag" class="cursor-grab active:cursor-grabbing p-1 -ml-2 text-neutral-600 hover:text-neutral-400">
          <GripVertical class="w-3.5 h-3.5" />
        </div>
        <Activity class="w-3.5 h-3.5 text-synth-neon" />
        <span class="text-[10px] font-black uppercase tracking-widest text-synth-neon">Audio Visualizer</span>
        <span class="text-[8px] font-mono text-neutral-600 px-1.5 py-0.5 bg-neutral-800 rounded">EXPERIMENTAL</span>
      </div>
      <div class="flex items-center gap-1.5">
        <button
          v-for="btn in MODE_BTNS" :key="btn.id"
          @click="mode = btn.id"
          :class="['text-[10px] font-bold px-2 py-0.5 rounded transition-colors', mode === btn.id ? 'bg-synth-neon/20 text-synth-neon border border-synth-neon/30' : 'text-neutral-500 hover:text-neutral-300 border border-transparent']"
        >{{ btn.label }}</button>
        <button @click="uiStore.isVisualizerOpen = false" class="ml-1 text-neutral-600 hover:text-white transition-colors">
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Settings strip -->
    <div class="flex items-center gap-3 px-4 py-2 bg-neutral-900/40 border-b border-neutral-800/60">
      <div class="flex items-center gap-2 flex-1 min-w-0">
        <Mic class="w-3 h-3 text-neutral-500 shrink-0" />
        <select :value="selectedDeviceId" @change="handleDeviceChange($event.target.value)"
          class="flex-1 min-w-0 bg-black border border-neutral-800 text-neutral-300 text-[10px] font-mono rounded px-2 py-1 outline-none focus:border-synth-neon/50 truncate">
          <option v-if="devices.length === 0" value="default">Default input</option>
          <option v-for="d in devices" :key="d.deviceId" :value="d.deviceId">
            {{ d.label || `Input ${d.deviceId.slice(0, 8)}` }}
          </option>
        </select>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <Volume2 class="w-3 h-3 text-neutral-500" />
        <input type="range" min="0" max="3" step="0.05" :value="volume"
          @input="handleVolumeChange(parseFloat($event.target.value))"
          class="w-20 accent-synth-neon h-1" :title="`Gain: ${volDb}`" />
        <span class="text-[9px] font-mono text-neutral-400 w-12 text-right">{{ volDb }}</span>
      </div>
      <button @click="showEq = !showEq"
        :class="['flex items-center gap-1 text-[9px] font-bold uppercase px-2 py-1 rounded border transition-colors shrink-0', showEq ? 'bg-synth-neon/15 text-synth-neon border-synth-neon/30' : 'text-neutral-500 border-neutral-800 hover:text-neutral-300']">
        <SlidersHorizontal class="w-3 h-3" />
        EQ
      </button>
    </div>

    <!-- Scope zoom strip -->
    <Transition name="collapse">
      <div v-if="scopeVisible" class="border-b border-neutral-800/40 overflow-hidden">
        <div class="flex items-center gap-3 px-4 py-1.5 bg-neutral-900/20">
          <span class="text-[8px] font-mono text-neutral-600 uppercase tracking-widest shrink-0">Scope</span>
          <div class="flex items-center gap-1.5 flex-1">
            <span class="text-[8px] font-mono text-neutral-500 shrink-0">AMP</span>
            <input type="range" min="1" max="8" step="0.25" :value="scopeAmpZoom"
              @input="scopeAmpZoom = parseFloat($event.target.value)"
              class="flex-1 accent-synth-neon h-1" />
            <span class="text-[8px] font-mono text-synth-neon w-7 text-right shrink-0">
              {{ scopeAmpZoom.toFixed(2).replace(/\.?0+$/, '') }}×
            </span>
          </div>
          <div class="flex items-center gap-1.5 flex-1">
            <span class="text-[8px] font-mono text-neutral-500 shrink-0">TIME</span>
            <input type="range" min="1" max="32" step="0.5" :value="scopeTimeZoom"
              @input="scopeTimeZoom = parseFloat($event.target.value)"
              class="flex-1 accent-yellow-400 h-1" />
            <span class="text-[8px] font-mono text-yellow-400 w-7 text-right shrink-0">
              {{ scopeTimeZoom.toFixed(1).replace(/\.0$/, '') }}×
            </span>
          </div>
          <button @click="scopeAmpZoom = 1; scopeTimeZoom = 1" :title="'Reset zoom'"
            :class="['text-[8px] font-mono uppercase shrink-0 transition-colors', scopeZoomed ? 'text-neutral-400 hover:text-white' : 'text-neutral-700 cursor-default']">
            <RotateCcw class="w-3 h-3" />
          </button>
        </div>
      </div>
    </Transition>

    <!-- EQ Panel -->
    <Transition name="collapse">
      <div v-if="showEq" class="border-b border-neutral-800/60 overflow-hidden">
        <div class="px-4 pt-2 pb-1">
          <canvas ref="eqCurveRef" class="w-full rounded" style="height: 52px; display: block;" />
        </div>
        <div class="grid grid-cols-4 gap-px bg-neutral-800/40 px-4 pb-2">
          <div v-for="(band, idx) in eqBands" :key="idx" class="bg-neutral-950 px-2 py-2 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-[9px] font-black uppercase tracking-widest text-synth-neon">{{ band.label }}</span>
              <span class="text-[7px] font-mono text-neutral-600 uppercase">
                {{ band.type === 'peaking' ? 'peak' : band.type === 'lowshelf' ? 'shelf↓' : 'shelf↑' }}
              </span>
            </div>
            <!-- Freq -->
            <div class="space-y-0.5">
              <div class="flex items-center justify-between">
                <span class="text-[7px] text-neutral-600 font-mono uppercase">Freq</span>
                <span class="text-[8px] font-mono text-neutral-400">{{ fmtHz(band.freq) }}Hz</span>
              </div>
              <input type="range" :min="band.freqMin" :max="band.freqMax"
                :step="band.freqMin < 200 ? 5 : band.freqMin < 1000 ? 10 : 50"
                :value="band.freq"
                @input="handleEqChange(idx, 'freq', parseInt($event.target.value))"
                class="w-full accent-neutral-400 h-1" />
            </div>
            <!-- Gain -->
            <div class="space-y-0.5">
              <div class="flex items-center justify-between">
                <span class="text-[7px] text-neutral-600 font-mono uppercase">Gain</span>
                <span :class="['text-[8px] font-mono font-bold', band.gain > 0 ? 'text-synth-neon' : band.gain < 0 ? 'text-rose-400' : 'text-neutral-500']">
                  {{ fmtGain(band.gain) }}
                </span>
              </div>
              <input type="range" min="-12" max="12" step="0.5" :value="band.gain"
                @input="handleEqChange(idx, 'gain', parseFloat($event.target.value))"
                class="w-full accent-synth-neon h-1" />
            </div>
            <!-- Q (peaking only) -->
            <div v-if="band.type === 'peaking'" class="space-y-0.5">
              <div class="flex items-center justify-between">
                <span class="text-[7px] text-neutral-600 font-mono uppercase">Q</span>
                <span class="text-[8px] font-mono text-neutral-400">{{ band.q.toFixed(1) }}</span>
              </div>
              <input type="range" min="0.1" max="10" step="0.1" :value="band.q"
                @input="handleEqChange(idx, 'q', parseFloat($event.target.value))"
                class="w-full accent-purple-500 h-1" />
            </div>
            <div v-else class="h-[22px]" />
          </div>
        </div>
        <div class="flex justify-end px-4 pb-2">
          <button @click="resetEq"
            class="flex items-center gap-1 text-[9px] font-bold uppercase text-neutral-500 hover:text-white transition-colors">
            <RotateCcw class="w-3 h-3" />
            Reset EQ
          </button>
        </div>
      </div>
    </Transition>

    <!-- Canvas -->
    <div class="relative bg-[#080808] flex-1 min-h-[100px]">
      <canvas ref="canvasRef" class="w-full h-full block" />
      <div v-if="!isActive" class="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm gap-3">
        <p v-if="error" class="text-red-400 text-[10px] font-mono px-4 text-center">{{ error }}</p>
        <p class="text-neutral-500 text-[10px] font-mono text-center px-6 leading-relaxed">
          Select the audio input above, then start capture.<br />
          Route S-1 output to your audio interface for best results.
        </p>
        <button @click="start"
          class="flex items-center gap-2 px-4 py-2 bg-synth-neon text-black font-black text-[10px] uppercase tracking-widest rounded-lg hover:bg-emerald-400 transition-colors">
          <Mic class="w-3.5 h-3.5" />
          Start Audio Capture
        </button>
      </div>
    </div>

    <!-- Level meter -->
    <div class="flex items-center gap-3 px-4 py-2 bg-neutral-900/60 border-t border-neutral-800">
      <span class="text-[8px] text-neutral-600 font-mono uppercase tracking-widest shrink-0">Level</span>
      <div class="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
        <div ref="levelBarRef" class="h-full rounded-full"
          style="width: 0%; background: #00ff9d; transition: width 60ms linear;" />
      </div>
      <button v-if="isActive" @click="stop"
        class="flex items-center gap-1.5 text-[9px] font-bold uppercase text-red-500 hover:text-red-400 transition-colors shrink-0">
        <MicOff class="w-3 h-3" />
        Stop
      </button>
    </div>

    <!-- Resize Handle -->
    <div 
      @mousedown="startResize"
      class="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-[400] flex items-center justify-center group"
    >
      <div class="w-1.5 h-1.5 border-r-2 border-b-2 border-neutral-700 group-hover:border-synth-neon transition-colors mr-0.5 mb-0.5"></div>
    </div>

  </div>
  </Transition>
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
.collapse-enter-active,
.collapse-leave-active {
  transition: max-height 0.2s ease, opacity 0.15s ease;
  overflow: hidden;
}
.collapse-enter-from,
.collapse-leave-to {
  max-height: 0;
  opacity: 0;
}
.collapse-enter-to,
.collapse-leave-from {
  max-height: 300px;
  opacity: 1;
}
</style>
