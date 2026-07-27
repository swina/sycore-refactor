<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { Mic, MicOff } from 'lucide-vue-next'
import { useUiStore } from '@/stores/useUiStore'
import { useLocalStorage } from '@/composables/useLocalStorage'

// A compact, chrome-free oscilloscope — the same getUserMedia + AnalyserNode
// + canvas draw-loop core as AudioVisualizer.vue, without its header, EQ
// panel, device picker, or floating window. Opt-in only (no auto mic prompt
// just from the cockpit being open), and shares the same input-device
// preference so it matches whatever the full visualizer is set to.
const uiStore = useUiStore()
const { state: selectedDeviceId } = useLocalStorage('S1_VISUALIZER_DEVICE', 'default')

const isActive = ref(false)
const error = ref(null)
const canvasRef = ref(null)
const mode = ref('scope')   // 'scope' | 'spectrum' — click the canvas to toggle

function toggleMode() {
  mode.value = mode.value === 'scope' ? 'spectrum' : 'scope'
}

let ctxRef = null
let analyserRef = null
let sourceRef = null
let streamRef = null
let rafRef = null
let peakRef = null

function stop() {
  if (rafRef) { cancelAnimationFrame(rafRef); rafRef = null }
  if (sourceRef) { sourceRef.disconnect(); sourceRef = null }
  if (streamRef) { streamRef.getTracks().forEach(t => t.stop()); streamRef = null }
  if (ctxRef) { ctxRef.close(); ctxRef = null }
  analyserRef = null
  isActive.value = false
}

function startDrawLoop() {
  const canvas = canvasRef.value
  if (!canvas || !analyserRef) return
  const analyser = analyserRef
  const ctx2d = canvas.getContext('2d')
  const bufLen = analyser.frequencyBinCount
  const timeData = new Uint8Array(bufLen)
  const freqData = new Uint8Array(bufLen)
  const BARS = 24
  if (!peakRef || peakRef.length !== BARS) peakRef = new Float32Array(BARS)
  const peaks = peakRef
  const AIRA = '#00ff9d', BG = '#080808'

  const draw = () => {
    rafRef = requestAnimationFrame(draw)
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth * dpr, h = canvas.clientHeight * dpr
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }

    ctx2d.fillStyle = BG
    ctx2d.fillRect(0, 0, w, h)

    if (mode.value === 'spectrum') {
      analyser.getByteFrequencyData(freqData)
      const barW = w / BARS
      for (let i = 0; i < BARS; i++) {
        const binIdx = Math.min(bufLen - 1, Math.round(Math.pow(i / BARS, 1.7) * bufLen))
        const raw = freqData[binIdx] / 255
        peaks[i] = raw > peaks[i] ? raw : Math.max(0, peaks[i] - 0.03)
        const v = peaks[i]
        ctx2d.fillStyle = `hsl(${Math.round(142 - v * 142)},100%,${40 + v * 20}%)`
        ctx2d.fillRect(i * barW, h - v * h, barW - 1 * dpr, v * h)
      }
    } else {
      analyser.getByteTimeDomainData(timeData)
      const sw = w / bufLen, midY = h / 2

      ctx2d.beginPath()
      ctx2d.strokeStyle = AIRA
      ctx2d.lineWidth = 1.5 * dpr
      ctx2d.shadowColor = AIRA
      ctx2d.shadowBlur = 4
      for (let i = 0; i < bufLen; i++) {
        const norm = (timeData[i] / 128) - 1
        const y = Math.max(0, Math.min(h, midY - norm * midY * 0.9))
        i === 0 ? ctx2d.moveTo(0, y) : ctx2d.lineTo(i * sw, y)
      }
      ctx2d.stroke()
      ctx2d.shadowBlur = 0
    }
  }
  draw()
}

async function start() {
  error.value = null
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    const audioCtx = new AudioCtx()
    ctxRef = audioCtx

    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.75
    analyserRef = analyser

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: selectedDeviceId.value !== 'default' ? { exact: selectedDeviceId.value } : undefined,
        echoCancellation: false, noiseSuppression: false, autoGainControl: false,
      },
      video: false,
    })
    streamRef = stream
    const src = audioCtx.createMediaStreamSource(stream)
    sourceRef = src
    src.connect(analyser)

    isActive.value = true
    startDrawLoop()
  } catch (e) {
    error.value = e?.message?.includes('denied') ? 'Denied' : 'Failed'
    if (ctxRef) { ctxRef.close(); ctxRef = null }
  }
}

// Don't leave the mic hot in the background once the cockpit is hidden —
// this component stays mounted (parent uses v-show, not v-if).
watch(() => uiStore.isInstrumentCockpitOpen, (open) => { if (!open) stop() })

onUnmounted(stop)
</script>

<template>
  <div class="relative rounded-md overflow-hidden bg-[#080808] border border-neutral-900/80 h-full w-full">
    <canvas
      ref="canvasRef"
      class="w-full h-full block"
      :class="isActive ? 'cursor-pointer' : ''"
      :title="isActive ? (mode === 'scope' ? 'Click for spectrum' : 'Click for scope') : ''"
      @click="isActive && toggleMode()"
    />
    <button
      v-if="!isActive"
      @click="start"
      :title="error ? error : 'Start mic input scope'"
      class="absolute inset-0 flex items-center justify-center gap-1 text-[7px] font-mono uppercase transition-colors"
      :class="error ? 'text-rose-500' : 'text-neutral-600 hover:text-synth-neon'"
    >
      <Mic class="w-2.5 h-2.5" /> {{ error ?? 'Scope' }}
    </button>
    <button
      v-else
      @click="stop"
      title="Stop"
      class="absolute top-0.5 right-0.5 text-neutral-700 hover:text-rose-400 transition-colors"
    >
      <MicOff class="w-2 h-2" />
    </button>
  </div>
</template>
