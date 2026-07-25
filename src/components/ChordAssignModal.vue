<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { X } from 'lucide-vue-next'
import { midiService, MidiSource } from '@/core/midi/midi-service'
import { useMidiStore } from '@/stores/useMidiStore'
import { detectChord, noteLabel } from '@/lib/chord-detector'
import VirtualKeyboard from './VirtualKeyboard.vue'

const props = defineProps({
  stepIdx:      { type: Number, required: true },
  currentNotes: { type: Array,  default: () => [] },
  currentName:  { type: String, default: '' },
})
const emit = defineEmits(['assign', 'close'])

const midiStore = useMidiStore()

const activeTab    = ref('midi')  // 'midi' | 'vk'
const heldNotes    = ref(new Set())
const lastSnapshot = ref([])       // last non-empty chord held (persists after key release)
const isListening  = ref(false)
const customName   = ref(props.currentName)

let _unsubNote = null

// Keep lastSnapshot updated whenever heldNotes has content
watch(heldNotes, (held) => {
  if (held.size > 0) {
    lastSnapshot.value = [...held].sort((a, b) => a - b)
  }
}, { deep: true })

// capturedNotes = live held notes if any, else the last snapshot
const capturedNotes = computed(() =>
  heldNotes.value.size > 0
    ? [...heldNotes.value].sort((a, b) => a - b)
    : lastSnapshot.value
)

const detectedChord = computed(() => detectChord(capturedNotes.value))

// Auto-fill name from detection
watch(detectedChord, (chord) => {
  if (chord) customName.value = chord.name
  else if (capturedNotes.value.length === 0) customName.value = ''
})

const noteLabels = computed(() => capturedNotes.value.map(n => noteLabel(n)))

// ── MIDI IN ────────────────────────────────────────────────────────────────────

function toggleListening() {
  isListening.value ? stopListening() : startListening()
}

function startListening() {
  if (_unsubNote) return
  isListening.value = true
  _unsubNote = midiService.addNoteListener((type, note, velocity) => {
    if (type === 'on' && velocity > 0) {
      heldNotes.value = new Set(heldNotes.value).add(note)
    } else {
      const next = new Set(heldNotes.value)
      next.delete(note)
      heldNotes.value = next
    }
  })
}

function stopListening() {
  if (_unsubNote) { _unsubNote(); _unsubNote = null }
  isListening.value = false
}

// ── Virtual Keyboard ───────────────────────────────────────────────────────────

function onVkNoteOn(note) {
  heldNotes.value = new Set(heldNotes.value).add(note)
}

function onVkNoteOff(note) {
  const next = new Set(heldNotes.value)
  next.delete(note)
  heldNotes.value = next
}

// ── Tab switch ────────────────────────────────────────────────────────────────

function setTab(tab) {
  stopListening()
  clearNotes()
  activeTab.value = tab
}

// ── Actions ───────────────────────────────────────────────────────────────────

function clearNotes() {
  heldNotes.value = new Set()
  lastSnapshot.value = []
  customName.value = ''
}

let _previewTimeouts = []
function previewChord() {
  _previewTimeouts.forEach(id => clearTimeout(id))
  _previewTimeouts = []
  const channel = midiStore.midiChannel
  capturedNotes.value.forEach(note => {
    midiStore.sendNoteOn(note, 90, channel, MidiSource.CHORD_PROG)
    const id = setTimeout(() => midiStore.sendNoteOff(note, 0, channel, MidiSource.CHORD_PROG), 500)
    _previewTimeouts.push(id)
  })
}

function assign() {
  if (capturedNotes.value.length === 0) return
  emit('assign', { notes: capturedNotes.value, name: customName.value || 'Custom' })
}

onUnmounted(() => {
  stopListening()
  _previewTimeouts.forEach(id => clearTimeout(id))
})
</script>

<template>
  <!-- Overlay -->
  <div
    class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <!-- Panel -->
    <div class="bg-neutral-950 border border-neutral-800 rounded-xl shadow-2xl flex flex-col overflow-hidden"
         style="width: 680px; max-height: 90vh;">

      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-neutral-800 shrink-0">
        <div class="flex items-center gap-2">
          <span class="text-[11px] font-mono text-neutral-400 uppercase tracking-wider">Assign Chord</span>
          <span class="text-[10px] font-mono text-purple-400 bg-purple-900/30 border border-purple-800/50 rounded px-1.5 py-0.5">
            Step {{ stepIdx + 1 }}
          </span>
        </div>
        <button @click="emit('close')" class="text-neutral-600 hover:text-neutral-300 transition-colors">
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Tabs -->
      <div class="flex border-b border-neutral-800 shrink-0">
        <button
          v-for="tab in [{ key: 'midi', label: 'MIDI IN' }, { key: 'vk', label: 'Virtual Keyboard' }]"
          :key="tab.key"
          @click="setTab(tab.key)"
          :class="[
            'px-4 py-2 text-[11px] font-mono uppercase tracking-wider transition-colors',
            activeTab === tab.key
              ? 'text-purple-300 border-b-2 border-purple-500 bg-purple-900/10'
              : 'text-neutral-500 hover:text-neutral-300'
          ]"
        >{{ tab.label }}</button>
      </div>

      <!-- Tab content -->
      <div class="flex-1 overflow-auto">

        <!-- MIDI IN tab -->
        <div v-if="activeTab === 'midi'" class="p-4 flex flex-col gap-4">
          <p class="text-[11px] text-neutral-500 font-mono">
            Connect a MIDI keyboard, click <strong class="text-neutral-300">Start Listening</strong>, then play and hold a chord.
          </p>

          <!-- Listen toggle -->
          <button
            @click="toggleListening"
            :class="[
              'self-start px-4 py-1.5 rounded font-mono text-[11px] uppercase tracking-wider transition-colors border',
              isListening
                ? 'bg-purple-700/40 border-purple-600 text-purple-300 hover:bg-purple-700/60'
                : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500'
            ]"
          >
            <span v-if="isListening" class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-purple-400 animate-pulse inline-block" />
              Listening…
            </span>
            <span v-else>Start Listening</span>
          </button>

          <!-- Live note indicators (while listening) -->
          <div v-if="isListening && heldNotes.size > 0"
               class="flex flex-wrap gap-1">
            <span
              v-for="n in [...heldNotes].sort((a,b)=>a-b)"
              :key="n"
              class="text-[10px] font-mono px-1.5 py-0.5 bg-purple-700/50 border border-purple-600/50 rounded text-purple-200"
            >{{ noteLabel(n) }}</span>
          </div>
          <p v-else-if="isListening" class="text-[10px] text-neutral-600 font-mono italic">
            Play notes on your MIDI keyboard…
          </p>
        </div>

        <!-- Virtual Keyboard tab -->
        <div v-if="activeTab === 'vk'" class="p-4 flex flex-col gap-3">
          <p class="text-[11px] text-neutral-500 font-mono">
            Click keys to build a chord. Notes accumulate until you <strong class="text-neutral-300">Clear</strong>.
          </p>
          <div class="overflow-x-auto">
            <VirtualKeyboard
              :channel="midiStore.midiChannel"
              @note-on="onVkNoteOn"
              @note-off="onVkNoteOff"
              @close="() => {}"
            />
          </div>
        </div>

      </div>

      <!-- Chord display + actions bar -->
      <div class="shrink-0 border-t border-neutral-800 bg-black/40 p-4 flex flex-col gap-3">

        <!-- Detected chord + name editor -->
        <div class="flex items-center gap-3">
          <div class="flex flex-col gap-0.5 flex-1">
            <label class="text-[9px] font-mono text-neutral-600 uppercase">Chord Name</label>
            <input
              v-model="customName"
              type="text"
              placeholder="e.g. Cmaj7"
              class="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-purple-300 font-mono text-[13px] outline-none focus:border-purple-600 transition-colors w-full"
            />
          </div>

          <div class="flex flex-col gap-0.5">
            <label class="text-[9px] font-mono text-neutral-600 uppercase">Detected</label>
            <span class="text-[13px] font-mono font-bold px-2 py-1 rounded bg-neutral-900 border border-neutral-800 min-w-[80px]"
                  :class="detectedChord ? 'text-green-400' : 'text-neutral-600'">
              {{ detectedChord ? detectedChord.name : '—' }}
            </span>
          </div>
        </div>

        <!-- Note list -->
        <div class="flex flex-wrap gap-1 min-h-[22px]">
          <span
            v-for="label in noteLabels"
            :key="label"
            class="text-[10px] font-mono px-1.5 py-0.5 bg-neutral-800 border border-neutral-700 rounded text-neutral-300"
          >{{ label }}</span>
          <span v-if="noteLabels.length === 0" class="text-[10px] font-mono text-neutral-700 italic">
            No notes captured
          </span>
        </div>

        <!-- Action buttons -->
        <div class="flex items-center gap-2 justify-end">
          <button
            @click="clearNotes"
            class="px-3 py-1 text-[11px] font-mono rounded border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors"
          >Clear</button>
          <button
            @click="previewChord"
            :disabled="capturedNotes.length === 0"
            class="px-3 py-1 text-[11px] font-mono rounded border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >Preview</button>
          <button
            @click="assign"
            :disabled="capturedNotes.length === 0"
            class="px-4 py-1 text-[11px] font-mono rounded bg-purple-700 hover:bg-purple-600 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed font-bold"
          >
            Assign to Step {{ stepIdx + 1 }}
          </button>
        </div>

      </div>
    </div>
  </div>
</template>
