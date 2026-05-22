<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { X, Download, RotateCcw } from 'lucide-vue-next'
import { useMidiStore } from '@/stores/useMidiStore'
import { buildMidiFile } from '@/lib/midi-file'

const props = defineProps({
  isOpen: Boolean,
  notesRef: Object,     // plain object with .current
  noteCount: Number,
})
const emit = defineEmits(['close', 'reset'])

const midiStore = useMidiStore()
const canvasRef = ref(null)
const isPlaying = ref(false)
const isRendering = ref(false)
const selectedOutput = ref(0)

const notes = ref([])

watch(() => props.noteCount, () => {
  if (props.notesRef?.current) {
    notes.value = props.notesRef.current
  }
})

let animationFrameId = null

function drawPianoRoll() {
  if (!canvasRef.value) return

  const ctx = canvasRef.value.getContext('2d')
  const width = canvasRef.value.width
  const height = canvasRef.value.height
  const noteHeight = height / 128

  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = '#262626'
  ctx.lineWidth = 1
  for (let i = 0; i < 128; i++) {
    const y = i * noteHeight
    ctx.strokeRect(0, y, width, noteHeight)
  }

  // Draw notes
  const now = Date.now()
  const viewportMs = 5000
  const pixelsPerMs = width / viewportMs

  notes.value.forEach(note => {
    const ageMs = now - note.startTime
    if (ageMs < -1000 || ageMs > viewportMs) return

    const x = (note.startTime + viewportMs - ageMs) * pixelsPerMs
    const noteWidth = (note.duration || 100) * pixelsPerMs
    const y = (127 - note.pitch) * noteHeight

    ctx.fillStyle = `hsla(${note.velocity * 2}, 80%, 50%, 0.8)`
    ctx.fillRect(x, y, noteWidth, noteHeight)

    ctx.strokeStyle = '#00ffcc'
    ctx.lineWidth = 0.5
    ctx.strokeRect(x, y, noteWidth, noteHeight)
  })

  // Playhead
  ctx.strokeStyle = '#ff0000'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(width - 2, 0)
  ctx.lineTo(width - 2, height)
  ctx.stroke()

  if (props.isOpen) {
    animationFrameId = requestAnimationFrame(drawPianoRoll)
  }
}

onMounted(() => {
  watch(() => props.isOpen, (open) => {
    if (open) {
      animationFrameId = requestAnimationFrame(drawPianoRoll)
    } else if (animationFrameId) {
      cancelAnimationFrame(animationFrameId)
    }
  }, { immediate: true })
})

onUnmounted(() => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId)
})

function exportMidi() {
  if (!props.notesRef?.current || notes.value.length === 0) return
  const midiData = buildMidiFile(notes.value, 120)
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

function reset() {
  emit('reset')
}
</script>

<template>
  <Transition name="sy-modal" appear>
    <div v-if="isOpen"
      class="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div class="bg-neutral-950 border border-neutral-800 rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col shadow-2xl">

        <!-- Header -->
        <div class="p-4 border-b border-neutral-900 flex justify-between items-center">
          <h2 class="text-lg font-black uppercase tracking-widest text-white">MIDI Capture</h2>
          <button @click="emit('close')" class="p-1 text-neutral-400 hover:text-white transition-colors">
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Canvas -->
        <div class="flex-1 overflow-hidden bg-black">
          <canvas ref="canvasRef" width="800" height="400" class="w-full h-full block" />
        </div>

        <!-- Controls -->
        <div class="p-4 border-t border-neutral-900 bg-neutral-900/50 flex justify-between items-center gap-4">
          <div class="text-xs font-mono text-neutral-400">
            {{ noteCount }} notes captured
          </div>
          <div class="flex gap-2">
            <button @click="reset" class="px-4 py-2 bg-neutral-800 text-neutral-400 rounded-lg hover:bg-neutral-700 hover:text-white transition-all font-bold text-sm uppercase tracking-widest flex items-center gap-2">
              <RotateCcw class="w-4 h-4" /> Reset
            </button>
            <button @click="exportMidi" :disabled="noteCount === 0" class="px-4 py-2 bg-synth-neon text-black rounded-lg hover:bg-white transition-all font-bold text-sm uppercase tracking-widest flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
              <Download class="w-4 h-4" /> Export MIDI
            </button>
          </div>
        </div>

      </div>
    </div>
  </Transition>
</template>
