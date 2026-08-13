<script setup>
import { onMounted, onUnmounted, watch } from 'vue'
import { X, Lock } from 'lucide-vue-next'
import { midiService, MidiSource } from '@/core/midi/midi-service'
import { useMidiStore } from '@/stores/useMidiStore'
import { useNoteLatchStore } from '@/stores/useNoteLatchStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import { useDraggable } from '@/composables/useDraggable'

const props = defineProps({
  isOpen: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const midiStore = useMidiStore()
const store = useNoteLatchStore()
const mappingStore = useMappingStore()
const { openMenu } = useMidiContextMenu()
const { x, y, startDrag } = useDraggable(
  window.innerWidth - 360,
  100,
  'SYCORE_POS_NOTE_LATCH'
)

// Notes currently held, keyed by `${note}:${channel}` (channel 0-based, as
// delivered by the note listeners below). A plain Map — not reactive — so
// rapid MIDI events don't thrash Vue's reactivity; store.latchedCount is the
// reactive readout, updated after every mutation. Map preserves insertion
// order, which FIFO eviction below relies on.
const latchedNotes = new Map()

function forwardNoteOn(note, velocity, channel) {
  midiStore.sendNoteOn(note, velocity, channel + 1, MidiSource.NOTE_LATCH)
}
function forwardNoteOff(note, channel) {
  midiStore.sendNoteOff(note, 0, channel + 1, MidiSource.NOTE_LATCH)
}

// Same concept as a device's own per-registration latch (latchEnabled/
// latchMaxNotes/latchReplace — see MidiWizardFlow.vue's card and
// midi-smart-latch.ts's SmartLatch class), reimplemented independently here
// because that one gates notes per destination device at send time; this
// app instead gates them once at the source, then forwards through the
// normal MIDI FLOW OUT port — so a single latch can feed several
// instruments (real or virtual) without touching any of their own latch
// buttons, and turning it off releases every note through that one OUT
// instead of requiring each destination to be un-latched individually.
function handleNoteOn(note, velocity, channel) {
  if (!store.enabled) {
    forwardNoteOn(note, velocity, channel)
    return
  }
  const key = `${note}:${channel}`
  // Retrigger: drop and re-add so it moves to the newest end of Map order.
  if (latchedNotes.has(key)) latchedNotes.delete(key)
  latchedNotes.set(key, { note, velocity, channel })

  if (latchedNotes.size > store.maxNotes) {
    if (store.replace) {
      // FIFO: release the oldest held note to make room for this one.
      const oldestKey = latchedNotes.keys().next().value
      const oldest = latchedNotes.get(oldestKey)
      latchedNotes.delete(oldestKey)
      forwardNoteOff(oldest.note, oldest.channel)
    } else {
      // BLOCK: reject the new note outright, don't forward it.
      latchedNotes.delete(key)
      store.latchedCount = latchedNotes.size
      return
    }
  }
  forwardNoteOn(note, velocity, channel)
  store.latchedCount = latchedNotes.size
}

function handleNoteOff(note, channel) {
  if (!store.enabled) {
    forwardNoteOff(note, channel)
    return
  }
  const key = `${note}:${channel}`
  if (!latchedNotes.has(key)) {
    // Already released (evicted by FIFO or never held due to BLOCK) — let
    // the real release through normally instead of swallowing it.
    forwardNoteOff(note, channel)
    return
  }
  // Latched: block the release, note stays held until eviction or Off.
}

function releaseAll() {
  latchedNotes.forEach(n => forwardNoteOff(n.note, n.channel))
  latchedNotes.clear()
  store.latchedCount = 0
}

// Switching the master latch off is the whole point of this app existing
// separately from the per-device latch: it releases every held note through
// this one OUT (reaching everything cabled to it) in a single action.
watch(() => store.enabled, (enabled) => {
  if (!enabled) releaseAll()
})

let unsubNote = null
let unsubAppNote = null

function onHeaderMouseDown(e) {
  if (e.target.closest('button, input, select, a, [role="button"]')) return
  startDrag(e)
}

onMounted(() => {
  // MIDI FLOW device→app input routing. Requires an explicit cable to this
  // node (no broadcast-mode fail-open) — same convention as Arpeggiator/
  // ChordProgSequencer/DrumMachine, since an unwired latch reacting to every
  // device by default would be surprising for a node meant to sit deliberately
  // between a controller and its instruments.
  unsubNote = midiService.addNoteListener((type, note, velocity, chan, inputId) => {
    const inputDevice = midiService.getInputs().find(i => i.id === inputId)
    const sourceKey = inputDevice?.name
    if (!midiStore.hasExplicitInputRouting(sourceKey)) return
    if (!midiStore.isDeviceRoutedToApp(sourceKey, MidiSource.NOTE_LATCH, note)) return
    if (type === 'on' && velocity > 0) handleNoteOn(note, velocity, chan)
    else handleNoteOff(note, chan)
  })

  // MIDI FLOW app-to-app routing (e.g. Chord Sequencer OUT → Note Latch IN).
  // Must ignore this app's own notes — sendNoteOn/Off above broadcasts
  // through the same app-note channel this listens on, and without the
  // MidiSource.NOTE_LATCH filter every latched note would feed straight
  // back in as if a performer had played it (the exact self-feedback bug
  // fixed on StepSequencer.vue's own app-note listener).
  unsubAppNote = midiStore.addAppNoteListener((type, note, velocity, chan, sourceApp) => {
    if (sourceApp === MidiSource.NOTE_LATCH) return
    if (!midiStore.hasExplicitInputRouting(sourceApp)) return
    if (!midiStore.isDeviceRoutedToApp(sourceApp, MidiSource.NOTE_LATCH, note)) return
    if (type === 'on' && velocity > 0) handleNoteOn(note, velocity, chan)
    else handleNoteOff(note, chan)
  })
})

onUnmounted(() => {
  unsubNote?.()
  unsubAppNote?.()
  releaseAll()
})
</script>

<template>
  <Transition name="sy-modal">
    <div v-if="isOpen" class="fixed top-20 right-4 w-80 z-[600] bg-neutral-950/95 backdrop-blur-xl border border-neutral-800 rounded-2xl shadow-2xl p-4" :style="{ left: x + 'px', top: y + 'px' }">
      <div class="flex flex-col gap-6">

        <!-- Header -->
        <div class="flex items-center justify-between cursor-grab active:cursor-grabbing select-none" @mousedown="onHeaderMouseDown">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-cyan-500/10 rounded-lg">
              <Lock class="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 class="text-xs font-black text-white uppercase tracking-wider">Note Latch</h3>
              <p class="text-[8px] font-mono text-neutral-500 uppercase tracking-tighter">Hold Notes · Multi-Output</p>
            </div>
          </div>
          <button @click="emit('close')" class="p-1 text-neutral-500 hover:text-white transition-colors">
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Master Switch -->
        <div class="flex items-center justify-between p-3 bg-neutral-900/50 rounded-xl border border-neutral-800">
          <span class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Latch</span>
          <button
            @click="store.enabled = !store.enabled"
            @contextmenu.prevent="openMenu($event, { name: 'note_latch_enabled', label: 'Note Latch: On/Off' })"
            :class="['relative w-12 h-6 rounded-full transition-all', store.enabled ? 'bg-cyan-500' : 'bg-neutral-800']"
            title="Hold notes after key release. Right-click to MIDI Learn"
          >
            <span v-if="mappingStore.learningParamName === 'note_latch_enabled'" class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] animate-pulse z-50 pointer-events-none" />
            <div :class="['absolute top-1 w-4 h-4 rounded-full bg-white transition-all', store.enabled ? 'left-7' : 'left-1']" />
          </button>
        </div>

        <!-- Max Notes -->
        <div class="flex flex-col gap-2 relative" @contextmenu.prevent="openMenu($event, { name: 'note_latch_maxnotes', label: 'Note Latch: Max Notes' })">
          <span v-if="mappingStore.learningParamName === 'note_latch_maxnotes'" class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] animate-pulse z-50 pointer-events-none" />
          <div class="flex justify-between items-center">
            <span class="text-[8px] font-mono text-neutral-500 uppercase">Max Notes</span>
            <span class="text-[10px] font-mono text-cyan-400">{{ store.maxNotes }}</span>
          </div>
          <input
            v-model.number="store.maxNotes"
            type="range" min="1" max="16"
            class="h-1 accent-cyan-500 bg-neutral-800 rounded-full appearance-none cursor-pointer"
            title="Max notes held simultaneously (1–16). Right-click to MIDI Learn"
          />
        </div>

        <!-- FIFO / BLOCK mode -->
        <div class="flex items-center justify-between p-3 bg-neutral-900/50 rounded-xl border border-neutral-800">
          <span class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Mode</span>
          <button
            @click="store.replace = !store.replace"
            @contextmenu.prevent="openMenu($event, { name: 'note_latch_replace', label: 'Note Latch: FIFO/Block' })"
            :class="['relative px-4 py-1 rounded-lg text-[10px] font-black transition-all border', store.replace ? 'bg-amber-500 text-black border-amber-500' : 'bg-black text-neutral-500 border-neutral-800']"
            title="FIFO: oldest note dropped when full. BLOCK: new notes rejected. Right-click to MIDI Learn"
          >
            <span v-if="mappingStore.learningParamName === 'note_latch_replace'" class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] animate-pulse z-50 pointer-events-none" />
            {{ store.replace ? 'FIFO' : 'BLOCK' }}
          </button>
        </div>

        <!-- Held notes readout -->
        <div class="flex items-center justify-between px-1">
          <span class="text-[8px] font-mono text-neutral-600 uppercase tracking-widest">Held Notes</span>
          <span class="text-[10px] font-mono" :class="store.latchedCount > 0 ? 'text-cyan-400' : 'text-neutral-600'">{{ store.latchedCount }} / {{ store.maxNotes }}</span>
        </div>

      </div>
    </div>
  </Transition>
</template>
