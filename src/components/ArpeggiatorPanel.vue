<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
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

function startArpEngine() {
  if (arpTimer) clearInterval(arpTimer)

  const stepMs = calculateStepMs(arpStore.arpBpm, arpStore.arpSubdivision)
  arpTimer = setInterval(() => {
    const notesArray = Array.from(arpStore.getHeldNotes()).sort((a, b) => a - b)

    if (notesArray.length === 0) {
      if (lastArpNote !== null) {
        midiStore.sendNoteOff(lastArpNote, 0, props.channel, MidiSource.ARP)
        lastArpNote = null
      }
      return
    }

    if (notesArray.length === 1) {
      if (lastArpNote !== notesArray[0]) {
        if (lastArpNote !== null) midiStore.sendNoteOff(lastArpNote, 0, props.channel, MidiSource.ARP)
        midiStore.sendNoteOn(notesArray[0], 100, props.channel, MidiSource.ARP)
        lastArpNote = notesArray[0]
      }
      return
    }

    let nextIndex = 0
    if (arpStore.arpMode === 'up') {
      nextIndex = (currentArpIndex + 1) % notesArray.length
    } else if (arpStore.arpMode === 'down') {
      nextIndex = currentArpIndex - 1
      if (nextIndex < 0) nextIndex = notesArray.length - 1
    } else if (arpStore.arpMode === 'up-down') {
      nextIndex = currentArpIndex + arpDirection
      if (nextIndex >= notesArray.length) {
        nextIndex = Math.max(0, notesArray.length - 2)
        arpDirection = -1
      } else if (nextIndex < 0) {
        nextIndex = Math.min(1, notesArray.length - 1)
        arpDirection = 1
      }
    } else if (arpStore.arpMode === 'random') {
      nextIndex = Math.floor(Math.random() * notesArray.length)
    }

    currentArpIndex = nextIndex
    const note = notesArray[nextIndex]

    if (lastArpNote !== null) midiStore.sendNoteOff(lastArpNote, 0, props.channel, MidiSource.ARP)
    midiStore.sendNoteOn(note, 100, props.channel, MidiSource.ARP)
    lastArpNote = note

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
  _unsubNote = midiService.addNoteListener((type, note, velocity, chan) => {
    if (props.inputChannel !== undefined && props.inputChannel !== -1 && chan !== props.inputChannel) return

    if (type === 'on' && velocity > 0) {
      if (arpStore.arpEnabled) {
        if (arpStore.arpHold && physicalKeysHeld.value === 0) arpStore.clearHeldNotes()
        physicalKeysHeld.value++
        arpStore.pressNote(note)
      }
    } else {
      if (arpStore.arpEnabled) {
        physicalKeysHeld.value = Math.max(0, physicalKeysHeld.value - 1)
        if (!arpStore.arpHold || (physicalKeysHeld.value === 0 && arpStore.heldNoteCount <= 1)) {
          arpStore.releaseNote(note)
          if (arpStore.arpHold && physicalKeysHeld.value === 0 && arpStore.heldNoteCount <= 1) {
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
  else stopArpEngine()
})

watch([() => arpStore.arpBpm, () => arpStore.arpSubdivision], () => {
  if (arpStore.arpEnabled) startArpEngine()
})
</script>

<template>
  <Transition name="panel">
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
              <option value="up">Up</option>
              <option value="down">Down</option>
              <option value="up-down">Up/Down</option>
              <option value="random">Random</option>
            </select>
          </div>
          <div class="flex flex-col gap-2">
            <div class="flex justify-between items-center">
              <span class="text-[8px] font-mono text-neutral-500 uppercase">Rate</span>
              <span class="text-[10px] font-mono text-synth-neon">{{ arpStore.arpSubdivision }}</span>
            </div>
            <div class="px-1">
              <input 
                type="range" 
                :min="0" 
                :max="ARP_SUBDIVISIONS.length - 1" 
                :value="ARP_SUBDIVISIONS.indexOf(arpStore.arpSubdivision)"
                @input="arpStore.arpSubdivision = ARP_SUBDIVISIONS[$event.target.value]"
                class="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-synth-neon"
              />
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

      </div>
    </div>
  </Transition>
</template>
