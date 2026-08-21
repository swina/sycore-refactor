<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { X } from 'lucide-vue-next'
import { midiService, MidiSource } from '@/core/midi/midi-service'
import { useMidiStore } from '@/stores/useMidiStore'
import { detectChord, noteLabel } from '@/lib/chord-detector'
import { useFavoriteChords } from '@/composables/useFavoriteChords'
import VirtualKeyboard from './VirtualKeyboard.vue'

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const CHORD_TEMPLATES = [
  { label: 'Major',  intervals: [0, 4, 7] },
  { label: 'Minor',  intervals: [0, 3, 7] },
  { label: 'dim',    intervals: [0, 3, 6] },
  { label: 'aug',    intervals: [0, 4, 8] },
  { label: 'sus2',   intervals: [0, 2, 7] },
  { label: 'sus4',   intervals: [0, 5, 7] },
  { label: '7',      intervals: [0, 4, 7, 10] },
  { label: 'maj7',   intervals: [0, 4, 7, 11] },
  { label: 'm7',     intervals: [0, 3, 7, 10] },
  { label: 'mMaj7',  intervals: [0, 3, 7, 11] },
  { label: 'dim7',   intervals: [0, 3, 6, 9] },
  { label: 'm7b5',   intervals: [0, 3, 6, 10] },
  { label: 'aug7',   intervals: [0, 4, 8, 10] },
  { label: '7sus4',  intervals: [0, 5, 7, 10] },
  { label: '6',      intervals: [0, 4, 7, 9] },
  { label: 'm6',     intervals: [0, 3, 7, 9] },
  { label: 'add9',   intervals: [0, 2, 4, 7] },
  { label: 'madd9',  intervals: [0, 2, 3, 7] },
]

const INVERSION_LABELS = ['Root', '1st', '2nd', '3rd']

const suggestedRoot = ref(0)
const suggestedOctave = ref(3)
const selectedTemplate = ref(null)
const selectedTemplateIndex = ref(-1)
const selectedInversion = ref(0)

const suggestedChordNotes = computed(() => {
  if (!selectedTemplate.value) return []
  const rootMidi = suggestedRoot.value + 12 * suggestedOctave.value
  const baseNotes = selectedTemplate.value.intervals.map(iv => rootMidi + iv)
  const inv = selectedInversion.value % baseNotes.length
  return [...baseNotes.slice(inv), ...baseNotes.slice(0, inv).map(n => n + 12)]
})

const suggestedChordName = computed(() => {
  if (!selectedTemplate.value) return ''
  const root = NOTE_NAMES[suggestedRoot.value]
  const t = selectedTemplate.value
  if (t.label === 'Major') return root
  if (t.label === 'Minor') return `${root}m`
  return `${root}${t.label}`
})

const suggestedChordLabels = computed(() => suggestedChordNotes.value.map(n => noteLabel(n)))

function applySuggestion() {
  const notes = suggestedChordNotes.value
  if (notes.length === 0) return
  lastSnapshot.value = [...notes]
  customName.value = suggestedChordName.value
  heldNotes.value = new Set()
}

function selectSuggestion(tpl, idx) {
  selectedTemplate.value = tpl
  selectedTemplateIndex.value = idx
  selectedInversion.value = 0
  applySuggestion()
}

function selectInversion(inv) {
  selectedInversion.value = inv
  applySuggestion()
}

const props = defineProps({
  stepIdx:      { type: Number, required: true },
  currentNotes: { type: Array,  default: () => [] },
  currentName:  { type: String, default: '' },
  prevNotes:    { type: Array,  default: () => [] },
  prevName:     { type: String, default: '' },
})
const emit = defineEmits(['assign', 'close'])

const midiStore = useMidiStore()
const { favoriteChords, loadFavorites, addFavorite, removeFavorite } = useFavoriteChords()

const activeTab    = ref('suggest')  // 'suggest' | 'favorites' | 'midi' | 'vk'
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
function playChord(notes, durationMs) {
  const channel = midiStore.midiChannel
  notes.forEach(note => {
    midiStore.sendNoteOn(note, 90, channel, MidiSource.CHORD_PROG)
    const id = setTimeout(() => midiStore.sendNoteOff(note, 0, channel, MidiSource.CHORD_PROG), durationMs)
    _previewTimeouts.push(id)
  })
}

function previewChord() {
  _previewTimeouts.forEach(id => clearTimeout(id))
  _previewTimeouts = []
  playChord(capturedNotes.value, 500)
}

function previewNotes(notes, durationMs) {
  _previewTimeouts.forEach(id => clearTimeout(id))
  _previewTimeouts = []
  playChord(notes, durationMs || 500)
}

function assign() {
  if (capturedNotes.value.length === 0) return
  emit('assign', { notes: capturedNotes.value, name: customName.value || 'Custom' })
}

function assignFavorite(chord) {
  lastSnapshot.value = [...chord.notes]
  customName.value = chord.name
  heldNotes.value = new Set()
  assign()
}

onMounted(() => {
  loadFavorites()
})

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
          <span class="text-[14px] font-mono text-neutral-400 uppercase tracking-wider">Assign Chord</span>
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
          v-for="tab in [{ key: 'suggest', label: 'Chord Builder' }, { key: 'favorites', label: 'Favorites' }, { key: 'midi', label: 'MIDI IN' }, { key: 'vk', label: 'Virtual Keyboard' }]"
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

        <!-- Suggest tab -->
        <div v-if="activeTab === 'suggest'" class="p-4 flex flex-col gap-4">
          <p class="text-[11px] text-neutral-500 font-mono">
            Pick a root note and a chord type to build a chord. Use inversions to change the bass note.
          </p>

          <!-- Root note selector -->
          <div class="flex flex-col gap-1.5">
            <label class="text-[9px] font-mono text-neutral-600 uppercase">Root</label>
            <div class="flex flex-wrap gap-1">
              <button
                v-for="(name, idx) in NOTE_NAMES"
                :key="idx"
                @click="suggestedRoot = idx; selectedTemplateIndex >= 0 && selectSuggestion(CHORD_TEMPLATES[selectedTemplateIndex], selectedTemplateIndex)"
                :class="[
                  'w-10 h-8 rounded text-[11px] font-mono font-bold transition-colors',
                  suggestedRoot === idx
                    ? 'bg-purple-700 text-white ring-1 ring-purple-400'
                    : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white'
                ]"
              >{{ name }}</button>
            </div>
          </div>

          <!-- Octave selector -->
          <div class="flex flex-col gap-1.5">
            <label class="text-[9px] font-mono text-neutral-600 uppercase">Octave</label>
            <div class="flex items-center gap-1">
              <button
                @click="suggestedOctave = Math.max(0, suggestedOctave - 1); selectedTemplateIndex >= 0 && selectSuggestion(CHORD_TEMPLATES[selectedTemplateIndex], selectedTemplateIndex)"
                class="w-6 h-7 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[11px]"
              >−</button>
              <span class="text-[13px] font-mono font-bold text-purple-300 w-6 text-center">{{ suggestedOctave }}</span>
              <button
                @click="suggestedOctave = Math.min(9, suggestedOctave + 1); selectedTemplateIndex >= 0 && selectSuggestion(CHORD_TEMPLATES[selectedTemplateIndex], selectedTemplateIndex)"
                class="w-6 h-7 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[11px]"
              >+</button>
            </div>
          </div>

          <!-- Chord type grid -->
          <div class="flex flex-col gap-1.5">
            <label class="text-[9px] font-mono text-neutral-600 uppercase">Type</label>
            <div class="flex flex-wrap gap-1">
              <button
                v-for="(tpl, tplIdx) in CHORD_TEMPLATES"
                :key="tpl.label"
                @click="selectSuggestion(tpl, tplIdx)"
                :class="[
                  'px-2.5 py-1.5 rounded text-[10px] font-mono font-bold transition-colors border',
                  selectedTemplateIndex === tplIdx
                    ? 'bg-purple-700/80 border-purple-400 text-white ring-1 ring-purple-400'
                    : 'bg-neutral-800/60 border-neutral-700/60 text-neutral-400 hover:bg-neutral-700 hover:text-white hover:border-neutral-500'
                ]"
              >{{ NOTE_NAMES[suggestedRoot] }}{{ tpl.label === 'Major' ? '' : tpl.label === 'Minor' ? 'm' : tpl.label }}</button>
            </div>
          </div>

          <!-- Inversions -->
          <div v-if="selectedTemplate" class="flex flex-col gap-1.5">
            <label class="text-[9px] font-mono text-neutral-600 uppercase">Inversion</label>
            <div class="flex gap-1">
              <button
                v-for="(label, inv) in INVERSION_LABELS.slice(0, selectedTemplate.intervals.length)"
                :key="inv"
                @click="selectInversion(inv)"
                :class="[
                  'px-3 py-1.5 rounded text-[10px] font-mono transition-colors',
                  selectedInversion === inv
                    ? 'bg-cyan-700/40 border border-cyan-500 text-cyan-200'
                    : 'bg-neutral-800/60 border border-neutral-700/60 text-neutral-400 hover:bg-neutral-700 hover:text-white'
                ]"
              >{{ label }}</button>
            </div>
          </div>

          <!-- Suggested chord preview -->
          <div v-if="selectedTemplate" class="flex flex-col gap-1.5">
            <label class="text-[9px] font-mono text-neutral-600 uppercase">Result</label>
            <div class="flex items-center gap-2">
              <span class="text-[14px] font-mono font-bold text-purple-300">{{ suggestedChordName }}</span>
              <span class="text-[10px] text-neutral-600 font-mono">—</span>
              <span
                v-for="label in suggestedChordLabels"
                :key="label"
                class="text-[10px] font-mono px-1.5 py-0.5 bg-neutral-800 border border-neutral-700 rounded text-neutral-300"
              >{{ label }}</span>
            </div>
          </div>
        </div>

        <!-- Favorites tab -->
        <div v-if="activeTab === 'favorites'" class="p-4 flex flex-col gap-3">
          <p class="text-[11px] text-neutral-500 font-mono">
            Your saved chords. Click to preview, then assign to the current step.
          </p>
          <div v-if="favoriteChords.length === 0" class="text-[10px] text-neutral-700 italic font-mono py-6 text-center">
            No favorite chords yet — build one in the Chord Builder tab and click Favorite.
          </div>
          <div v-else class="flex flex-col gap-1">
            <div
              v-for="chord in favoriteChords"
              :key="chord.id"
              class="flex items-center gap-2 px-3 py-2 rounded border border-neutral-800 hover:bg-neutral-800/50 group"
            >
              <span
                @click="previewNotes(chord.notes, 500)"
                class="text-[13px] font-mono font-bold text-purple-300 cursor-pointer hover:text-purple-100 min-w-[80px]"
                title="Click to preview"
              >{{ chord.name }}</span>
              <span class="text-[9px] text-neutral-600 font-mono">Oct {{ chord.octave }}</span>
              <span class="flex-1 flex flex-wrap gap-0.5">
                <span
                  v-for="n in chord.notes"
                  :key="n"
                  class="text-[9px] font-mono px-1 py-0.5 bg-neutral-800 rounded text-neutral-500"
                >{{ noteLabel(n) }}</span>
              </span>
              <button
                @click="previewNotes(chord.notes, 500)"
                class="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded text-[9px] font-mono border border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-white transition-all"
                title="Preview"
              >Play</button>
              <button
                @click="assignFavorite(chord)"
                class="opacity-0 group-hover:opacity-100 px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-purple-700 hover:bg-purple-600 text-white transition-all"
                title="Assign to step"
              >Assign</button>
              <button
                @click="removeFavorite(chord.id)"
                class="opacity-0 group-hover:opacity-100 px-1 py-0.5 rounded text-[9px] font-mono text-neutral-600 hover:text-red-400 transition-all"
                title="Remove from favorites"
              >✕</button>
            </div>
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
            @click="previewChord"
            :disabled="capturedNotes.length === 0"
            class="px-3 py-1 text-[11px] font-mono rounded border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >Preview</button>
          <button
            @click="clearNotes"
            class="px-3 py-1 text-[11px] font-mono rounded border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors"
          >Clear</button>
          <button
            @click="assign"
            :disabled="capturedNotes.length === 0"
            class="px-4 py-1 text-[11px] font-mono rounded bg-purple-700 hover:bg-purple-600 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed font-bold"
          >
            Assign to Step {{ stepIdx + 1 }}
          </button>
        </div>
        <div v-if="props.prevNotes.length || props.currentNotes.length" class="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
          <span class="text-neutral-600">Click to preview:</span>
          <span
            v-if="props.prevNotes.length"
            @click="previewNotes(props.prevNotes, 400)"
            class="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-400 hover:bg-amber-900/40 hover:border-amber-600 hover:text-amber-300 cursor-pointer transition-colors"
            title="Click to preview previous step chord"
          >{{ props.prevName || 'Prev' }}</span>
          <span
            v-if="props.currentNotes.length"
            @click="previewNotes(props.currentNotes, 400)"
            class="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-amber-900/40 hover:border-amber-600 hover:text-amber-300 cursor-pointer transition-colors"
            title="Click to preview current step chord"
          >{{ props.currentName || 'Current' }}</span>
          <span
            @click="previewChord"
            class="px-1.5 py-0.5 rounded bg-purple-900/40 border border-purple-700/60 text-purple-200 hover:bg-purple-700/60 hover:border-purple-400 cursor-pointer transition-colors"
            title="Click to preview new chord"
          >New</span>
        </div>

      </div>
    </div>
  </div>
</template>
