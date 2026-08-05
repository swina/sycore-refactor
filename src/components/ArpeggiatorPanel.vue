<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { X, Play, Square, Settings, ChevronUp, ChevronDown, ListMusic } from 'lucide-vue-next'
import { midiService, MidiSource } from '@/core/midi/midi-service'
import { useArpStore, ARP_SUBDIVISIONS } from '@/stores/useArpStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import { ARP_MODES, nextArpIndex, defaultArpPatternState } from '@/lib/arp-patterns'

const props = defineProps({
  isOpen:       { type: Boolean, default: false },
  channel:      { type: Number, default: 0 },
})
const emit = defineEmits(['close'])

const arpStore  = useArpStore()
const midiStore = useMidiStore()
const mappingStore = useMappingStore()
const { openMenu } = useMidiContextMenu()

let arpTimer = null
let lastArpNote = null
let patternState = defaultArpPatternState()
const physicalKeysHeld = ref(0)
const arpModes = ref(ARP_MODES)

function calculateStepMs(bpm, subdivision) {
  const beatMs = 60000 / bpm
  const match = subdivision.match(/(\d+)\/(\d+)(d|t)?/)
  if (!match) return beatMs / 4

  const count = parseInt(match[1])
  const base = parseInt(match[2])
  const type = match[3]

  let ratio = count / base
  if (type === 'd') ratio *= 1.5
  if (type === 't') ratio *= (2/3)

  return beatMs * 4 * ratio
}

// function startArpEngine() {
//   if (arpTimer) clearInterval(arpTimer)

//   const stepMs = calculateStepMs(arpStore.arpBpm, arpStore.arpSubdivision)
//   arpTimer = setInterval(() => {
//     const notesArray = Array.from(arpStore.getHeldNotes()).sort((a, b) => a - b)

//     if (notesArray.length === 0) {
//       if (lastArpNote !== null) {
//         midiStore.sendNoteOff(lastArpNote, 0, props.channel, MidiSource.ARP)
//         lastArpNote = null
//       }
//       return
//     }

//     if (notesArray.length === 1) {
//       if (lastArpNote !== notesArray[0]) {
//         if (lastArpNote !== null) midiStore.sendNoteOff(lastArpNote, 0, props.channel, MidiSource.ARP)
//         midiStore.sendNoteOn(notesArray[0], 100, props.channel, MidiSource.ARP)
//         lastArpNote = notesArray[0]
//       }
//       return
//     }

//     let nextIndex = 0
//     if (arpStore.arpMode === 'up') {
//       nextIndex = (currentArpIndex + 1) % notesArray.length
//     } else if (arpStore.arpMode === 'down') {
//       nextIndex = currentArpIndex - 1
//       if (nextIndex < 0) nextIndex = notesArray.length - 1
//     } else if (arpStore.arpMode === 'up-down') {
//       nextIndex = currentArpIndex + arpDirection
//       if (nextIndex >= notesArray.length) {
//         nextIndex = Math.max(0, notesArray.length - 2)
//         arpDirection = -1
//       } else if (nextIndex < 0) {
//         nextIndex = Math.min(1, notesArray.length - 1)
//         arpDirection = 1
//       }
//     } else if (arpStore.arpMode === 'random') {
//       nextIndex = Math.floor(Math.random() * notesArray.length)
//     }

//     currentArpIndex = nextIndex
//     const note = notesArray[nextIndex]

//     if (lastArpNote !== null) midiStore.sendNoteOff(lastArpNote, 0, props.channel, MidiSource.ARP)
//     midiStore.sendNoteOn(note, 100, props.channel, MidiSource.ARP)
//     lastArpNote = note

//     setTimeout(() => {
//       if (lastArpNote === note) {
//         midiStore.sendNoteOff(note, 0, props.channel, MidiSource.ARP)
//         lastArpNote = null
//       }
//     }, stepMs * 0.5)
//   }, stepMs)
// }

function startArpEngine() {
  if (arpTimer) clearInterval(arpTimer)

  const stepMs = calculateStepMs(arpStore.arpBpm, arpStore.arpSubdivision)

  // currentIndex/direction persist across stop/start (matching the original
  // behavior); only subIndex resets on each new start.
  patternState.subIndex = 0

  arpTimer = setInterval(() => {
    // Build expanded note array based on octave setting
    const baseNotes = Array.from(arpStore.getHeldNotes())
    const octave = arpStore.arpOctave
    let expandedNotes = []
    if (octave === 0) {
      expandedNotes = [...baseNotes]
    } else if (octave > 0) {
      for (const note of baseNotes) {
        for (let k = 0; k <= octave; k++) {
          expandedNotes.push(note + k * 12)
        }
      }
    } else { // octave < 0
      for (const note of baseNotes) {
        for (let k = octave; k <= 0; k++) {
          expandedNotes.push(note + k * 12)
        }
      }
    }
    // Remove duplicates and sort
    const notesArray = [...new Set(expandedNotes)].sort((a, b) => a - b)

    if (notesArray.length === 0) {
      if (lastArpNote !== null) {
        midiStore.sendNoteOff(lastArpNote, 0, props.channel, MidiSource.ARP)
        lastArpNote = null
      }
      patternState.currentIndex = 0
      patternState.subIndex = 0
      return
    }

    const nextIndex = nextArpIndex(arpStore.arpMode, patternState, notesArray.length)
    const note = notesArray[nextIndex]

    // Riproduzione della nota MIDI
    if (lastArpNote !== null) midiStore.sendNoteOff(lastArpNote, 0, props.channel, MidiSource.ARP)
    midiStore.sendNoteOn(note, 100, props.channel, MidiSource.ARP)
    lastArpNote = note

    // Note-Off basata sulla durata del Gate (0.5 = 50% di stepMs)
    setTimeout(() => {
      if (lastArpNote === note) {
        midiStore.sendNoteOff(note, 0, props.channel, MidiSource.ARP)
        lastArpNote = null
      }
    }, stepMs * 0.5)
  }, stepMs)
}


function stopArpEngine() {
  if (arpTimer) {
    clearInterval(arpTimer)
    arpTimer = null
  }
  if (lastArpNote !== null) {
    midiStore.sendNoteOff(lastArpNote, 0, props.channel, MidiSource.ARP)
    lastArpNote = null
  }
}

let _unsubNote = null

onMounted(() => {
  _unsubNote = midiService.addNoteListener((type, note, velocity, chan, inputId) => {
    // MIDI Flow device→app input routing — same gate ChordProgSequencer.vue
    // uses. hasExplicitInputRouting requires an actual cable to the
    // Arpeggiator node before a controller can drive it (no fail-open for
    // unwired devices), and isDeviceRoutedToApp also enforces any per-cable
    // note-range filter (keyboard split) drawn on that cable.
    const inputDevice = midiService.getInputs().find(i => i.id === inputId)
    const sourceKey = inputDevice?.name
    if (!midiStore.hasExplicitInputRouting(sourceKey)) return
    if (!midiStore.isDeviceRoutedToApp(sourceKey, MidiSource.ARP, note)) return

    if (type === 'on' && velocity > 0) {
      if (arpStore.arpHold && physicalKeysHeld.value === 0) {
        arpStore.clearHeldNotes()
      }
      physicalKeysHeld.value++
      arpStore.pressNote(note)
    } else {
      physicalKeysHeld.value = Math.max(0, physicalKeysHeld.value - 1)
      if (!arpStore.arpHold || physicalKeysHeld.value === 0) {
        if (!arpStore.arpHold) {
          arpStore.releaseNote(note)
          if (physicalKeysHeld.value === 0) {
            arpStore.clearHeldNotes()
          }
        }
      }
    }
  })
})

onUnmounted(() => {
  _unsubNote?.()
  stopArpEngine()
})

watch(() => arpStore.arpEnabled, (enabled) => {
  if (enabled) startArpEngine()
  else {
    stopArpEngine()
    if (!arpStore.arpHold) {
      arpStore.clearHeldNotes()
    }
  }
})

watch(() => arpStore.arpHold, (held) => {
  if (!held && physicalKeysHeld.value === 0) {
    arpStore.clearHeldNotes()
  }
})

watch([() => arpStore.arpBpm, () => arpStore.arpSubdivision], () => {
  if (arpStore.arpEnabled) startArpEngine()
})
</script>

<template>
  <Transition name="sy-modal">
    <div v-if="isOpen" class="fixed top-20 right-4 w-80 z-[600] bg-neutral-950/95 backdrop-blur-xl border border-neutral-800 rounded-2xl shadow-2xl p-4">
      <div class="flex flex-col gap-6">
        
        <!-- Header -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-synth-neon/10 rounded-lg">
              <ListMusic class="w-5 h-5 text-synth-neon" />
            </div>
            <div>
              <h3 class="text-xs font-black text-white uppercase tracking-wider">Arpeggiator</h3>
              <p class="text-[8px] font-mono text-neutral-500 uppercase tracking-tighter">Neural Pattern Engine</p>
            </div>
          </div>
          <button @click="emit('close')" class="p-1 text-neutral-500 hover:text-white transition-colors">
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Master Switch -->
        <div class="flex items-center justify-between p-3 bg-neutral-900/50 rounded-xl border border-neutral-800">
          <span class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Active</span>
          <button
            @click="arpStore.arpEnabled = !arpStore.arpEnabled"
            @contextmenu.prevent="openMenu($event, { name: 'arp_active', label: 'Arp Active' })"
            :class="['relative w-12 h-6 rounded-full transition-all', arpStore.arpEnabled ? 'bg-synth-neon' : 'bg-neutral-800']"
          >
            <span v-if="mappingStore.learningParamName === 'arp_active'" class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] animate-pulse z-50 pointer-events-none" />
            <div :class="['absolute top-1 w-4 h-4 rounded-full bg-white transition-all', arpStore.arpEnabled ? 'left-7' : 'left-1']" />
          </button>
        </div>

        <!-- Mode & Subdivision Grid -->
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-2 relative" @contextmenu.prevent="openMenu($event, { name: 'arp_mode', label: 'Arp Mode' })">
            <span v-if="mappingStore.learningParamName === 'arp_mode'" class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] animate-pulse z-50 pointer-events-none" />
            <span class="text-[8px] font-mono text-neutral-500 uppercase">Mode</span>
            <select v-model="arpStore.arpMode" class="bg-black border border-neutral-800 text-[10px] text-white rounded-lg px-2 py-2 outline-none focus:border-synth-neon">
              <option v-for="mode in arpModes" :key="mode" :value="mode">{{ mode }}</option>
            </select>
          </div>
          <div class="flex flex-col gap-2 relative" @contextmenu.prevent="openMenu($event, { name: 'arp_rate', label: 'Arp Rate' })">
            <span v-if="mappingStore.learningParamName === 'arp_rate'" class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] animate-pulse z-50 pointer-events-none" />
            <div class="flex justify-between items-center">
              <span class="text-[8px] font-mono text-neutral-500 uppercase">Rate</span>
              <span class="text-[10px] font-mono text-synth-neon">{{ arpStore.arpSubdivision }}</span>
            </div>
            <div class="px-1 relative group/slider">
              <input
                type="range"
                :min="0"
                :max="ARP_SUBDIVISIONS.length - 1"
                :value="ARP_SUBDIVISIONS.indexOf(arpStore.arpSubdivision)"
                @input="arpStore.arpSubdivision = ARP_SUBDIVISIONS[$event.target.value]"
                class="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-synth-neon hover:accent-synth-neon/80 transition-all"
              />
              <!-- Visual markers for subdivisions -->
              <div class="flex justify-between px-0.5 mt-1 pointer-events-none">
                <div v-for="i in 5" :key="i" class="w-0.5 h-1 bg-neutral-800 rounded-full"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Hold Switch -->
        <div class="flex items-center justify-between p-3 bg-neutral-900/50 rounded-xl border border-neutral-800">
          <span class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Hold</span>
          <button
            @click="arpStore.arpHold = !arpStore.arpHold"
            @contextmenu.prevent="openMenu($event, { name: 'arp_hold', label: 'Arp Hold' })"
            :class="['relative px-4 py-1 rounded-lg text-[10px] font-black transition-all border', arpStore.arpHold ? 'bg-synth-neon text-black border-synth-neon' : 'bg-black text-neutral-500 border-neutral-800']"
          >
            <span v-if="mappingStore.learningParamName === 'arp_hold'" class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] animate-pulse z-50 pointer-events-none" />
            {{ arpStore.arpHold ? 'ON' : 'OFF' }}
          </button>
        </div>

        <!-- BPM Control -->
        <div class="flex flex-col gap-2 relative" @contextmenu.prevent="openMenu($event, { name: 'arp_bpm', label: 'Arp BPM' })">
          <span v-if="mappingStore.learningParamName === 'arp_bpm'" class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] animate-pulse z-50 pointer-events-none" />
          <div class="flex justify-between items-center">
            <span class="text-[8px] font-mono text-neutral-500 uppercase">Arp BPM</span>
            <span class="text-[10px] font-mono text-synth-neon">{{ arpStore.arpBpm }}</span>
          </div>
          <input
            v-model.number="arpStore.arpBpm"
            type="range" min="40" max="250"
            class="h-1 accent-synth-neon bg-neutral-800 rounded-full appearance-none cursor-pointer"
          />
        </div>

        <!-- Octave Control -->
        <div class="flex flex-col gap-2 relative" @contextmenu.prevent="openMenu($event, { name: 'arp_octave', label: 'Arp Octave' })">
          <span v-if="mappingStore.learningParamName === 'arp_octave'" class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] animate-pulse z-50 pointer-events-none" />
          <div class="flex justify-between items-center">
            <span class="text-[8px] font-mono text-neutral-500 uppercase">Octave</span>
            <span class="text-[10px] font-mono text-synth-neon">{{ arpStore.arpOctave }}</span>
          </div>
          <input
            v-model.number="arpStore.arpOctave"
            type="range" min="-3" max="3"
            class="h-1 accent-synth-neon bg-neutral-800 rounded-full appearance-none cursor-pointer"
          />
        </div>

      </div>
    </div>
  </Transition>
</template>
