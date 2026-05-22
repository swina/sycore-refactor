<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { X, Play, Square, Settings, ChevronUp, ChevronDown, ListMusic } from 'lucide-vue-next'
import { midiService, MidiSource } from '@/core/midi/MidiService'
import { useArpStore, ARP_SUBDIVISIONS } from '@/stores/useArpStore'
import { useMidiStore } from '@/stores/useMidiStore'

const props = defineProps({
  isOpen:       { type: Boolean, default: false },
  channel:      { type: Number, default: 0 },
  inputChannel: { type: Number, default: -1 },
})
const emit = defineEmits(['close'])

const arpStore  = useArpStore()
const midiStore = useMidiStore()

let arpTimer = null
let lastArpNote = null
let currentArpIndex = -1
let arpDirection = 1
const physicalKeysHeld = ref(0)
const arpModes = ref([
  'up',
  'down',
  'up-down',
  'down-up',
  'converge',
  'diverge',
  'pinky-up',
  'thumb-up',
  'random',
  'random-other',
])

/**
 * Check if the given input device ID is routed to the arpeggiator
 * @param {string} inputId - The MIDI input device ID
 * @returns {boolean} True if the device is routed to arpeggiator
 */
function isInputDeviceRoutedToArpeggiator(inputId) {
  // If no inputId, we can't verify routing - allow by default for backward compatibility
  if (!inputId) return true

  try {
    // Get the MIDI access to look up the device name by ID
    const midiAccess = midiService.midiAccess
    if (!midiAccess) return true
    const inputDevice = midiAccess.inputs.get(inputId)
    if (!inputDevice) return true
    
    const inputName = inputDevice.name
    if (!inputName) return true
    
    // Check if this input device is configured to route to the arpeggiator
    const routingMatrix = midiStore.routingMatrix
    const targetArray = routingMatrix[inputName]
    return targetArray.some( t => routingMatrix[MidiSource.ARP].includes(t))  
  } catch (error) {
    // If anything goes wrong, allow the note through to avoid blocking all input
    console.warn('[Arpeggiator] Error checking input routing:', error)
    return true
  }
}

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
  
  // Teniamo traccia della direzione per stili complessi (up-down, down-up, converge, diverge)
  let subIndex = 0 

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
      currentArpIndex = 0
      subIndex = 0
      return
    }

    // Se l'indice memorizzato è fuori dai limiti (es. sono state rilasciate delle note), resetta
    if (currentArpIndex >= notesArray.length) {
      currentArpIndex = 0
      subIndex = 0
    }

    let nextIndex = 0
    const len = notesArray.length

    // --- LOGICA DEGLI STILI DI ABLETON LIVE ---
    if (arpStore.arpMode === 'up') {
      nextIndex = (currentArpIndex + 1) % len

    } else if (arpStore.arpMode === 'down') {
      nextIndex = currentArpIndex - 1
      if (nextIndex < 0) nextIndex = len - 1

    } else if (arpStore.arpMode === 'up-down') {
      // Ableton ripete la prima e l'ultima nota nel ciclo completo
      nextIndex = currentArpIndex + arpDirection
      if (nextIndex >= len) {
        nextIndex = len - 1
        arpDirection = -1
      } else if (nextIndex < 0) {
        nextIndex = 0
        arpDirection = 1
      }

    } else if (arpStore.arpMode === 'down-up') {
      nextIndex = currentArpIndex + arpDirection
      if (nextIndex >= len) {
        nextIndex = len - 1
        arpDirection = 1
      } else if (nextIndex < 0) {
        nextIndex = 0
        arpDirection = -1
      }

    } else if (arpStore.arpMode === 'converge') {
      // Alterna estremo basso ed estremo alto stringendo verso il centro
      // subIndex tiene traccia del progresso [0, 1, 2, 3...]
      subIndex = (subIndex + 1) % len
      const step = Math.floor(subIndex / 2)
      if (subIndex % 2 === 0) {
        nextIndex = step // Basso sale
      } else {
        nextIndex = (len - 1) - step // Alto scende
      }

    } else if (arpStore.arpMode === 'diverge') {
      // Parte dal centro e si allarga verso gli estremi
      subIndex = (subIndex + 1) % len
      const mid = Math.floor((len - 1) / 2)
      const step = Math.floor((subIndex + 1) / 2)
      if (subIndex === 0) {
        nextIndex = mid
      } else if (subIndex % 2 === 1) {
        nextIndex = mid + step
        if (nextIndex >= len) nextIndex = len - 1
      } else {
        nextIndex = mid - step
        if (nextIndex < 0) nextIndex = 0
      }

    } else if (arpStore.arpMode === 'pinky-up') {
      // Alterna la nota più alta (len-1) con le altre note che salgono
      if (currentArpIndex === len - 1) {
        nextIndex = subIndex
        subIndex = (subIndex + 1) % (len - 1)
      } else {
        nextIndex = len - 1
      }

    } else if (arpStore.arpMode === 'thumb-up') {
      // Alterna la nota più bassa (0) con le altre note che salgono
      if (currentArpIndex === 0) {
        nextIndex = subIndex
        if (subIndex === 0) subIndex = 1
        subIndex = (subIndex + 1) % len
        if (subIndex === 0) subIndex = 1
      } else {
        nextIndex = 0
      }

    } else if (arpStore.arpMode === 'random') {
      nextIndex = Math.floor(Math.random() * len)

    } else if (arpStore.arpMode === 'random-other') {
      // Evita di ripetere la stessa nota consecutivamente
      do {
        nextIndex = Math.floor(Math.random() * len)
      } while (nextIndex === currentArpIndex)
    }

    // Aggiorna lo stato degli indici
    currentArpIndex = nextIndex
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
    // Filter by input channel if specified
    if (props.inputChannel !== undefined && props.inputChannel !== -1 && chan !== props.inputChannel) return

    // Filter by input device routing to arpeggiator
    if (!isInputDeviceRoutedToArpeggiator(inputId)) return

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
            :class="['w-12 h-6 rounded-full transition-all relative', arpStore.arpEnabled ? 'bg-synth-neon' : 'bg-neutral-800']"
          >
            <div :class="['absolute top-1 w-4 h-4 rounded-full bg-white transition-all', arpStore.arpEnabled ? 'left-7' : 'left-1']" />
          </button>
        </div>

        <!-- Mode & Subdivision Grid -->
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-2">
            <span class="text-[8px] font-mono text-neutral-500 uppercase">Mode</span>
            <select v-model="arpStore.arpMode" class="bg-black border border-neutral-800 text-[10px] text-white rounded-lg px-2 py-2 outline-none focus:border-synth-neon">
              <option v-for="mode in arpModes" :key="mode" :value="mode">{{ mode }}</option>
            </select>
          </div>
          <div class="flex flex-col gap-2">
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
            :class="['px-4 py-1 rounded-lg text-[10px] font-black transition-all border', arpStore.arpHold ? 'bg-synth-neon text-black border-synth-neon' : 'bg-black text-neutral-500 border-neutral-800']"
          >
            {{ arpStore.arpHold ? 'ON' : 'OFF' }}
          </button>
        </div>

        <!-- BPM Control -->
        <div class="flex flex-col gap-2">
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
        <div class="flex flex-col gap-2">
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
