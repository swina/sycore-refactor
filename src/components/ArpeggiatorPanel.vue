<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { ListTree, X } from 'lucide-vue-next'
import { midiService, MidiSource } from '@/core/midi/MidiService'
import { useArpStore } from '@/stores/useArpStore'

const props = defineProps({
  isOpen: Boolean,
  channel: Number,
  inputChannel: Number,
})
const emit = defineEmits(['close'])

const arpStore = useArpStore()

const physicalKeysHeld = ref(0)
let arpTimer = null
let lastArpNote = null
let currentArpIndex = 0
let arpDirection = 1

const subdivisions = [
  '1/4', '1/4d', '1/4t',
  '1/8', '1/8d', '1/8t',
  '1/16', '1/16d', '1/16t',
  '1/32', '1/32d', '1/32t',
]

function calculateStepMs(bpm, subdivision) {
  const beatMs = 60000 / bpm
  const map = {
    '1/4': beatMs,
    '1/4d': beatMs * 1.5,
    '1/4t': beatMs * (2 / 3),
    '1/8': beatMs * 0.5,
    '1/8d': beatMs * 0.75,
    '1/8t': beatMs * (1 / 3),
    '1/16': beatMs * 0.25,
    '1/16d': beatMs * 0.375,
    '1/16t': beatMs * (1 / 6),
    '1/32': beatMs * 0.125,
    '1/32d': beatMs * 0.1875,
    '1/32t': beatMs * (1 / 12),
  }
  return map[subdivision] ?? beatMs * 0.25
}

function startAprEngine() {
  if (arpTimer) clearInterval(arpTimer)

  const stepMs = calculateStepMs(arpStore.arpBpm, arpStore.arpSubdivision)
  arpTimer = setInterval(() => {
    const notesArray = Array.from(arpStore.getHeldNotes()).sort((a, b) => a - b)

    if (notesArray.length === 0) {
      if (lastArpNote !== null) {
        midiService.sendNoteOff(lastArpNote, 0, props.channel, MidiSource.ARP)
        lastArpNote = null
      }
      return
    }

    if (notesArray.length === 1) {
      if (lastArpNote !== notesArray[0]) {
        if (lastArpNote !== null) midiService.sendNoteOff(lastArpNote, 0, props.channel, MidiSource.ARP)
        midiService.sendNoteOn(notesArray[0], 100, props.channel, MidiSource.ARP)
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

    if (lastArpNote !== null) midiService.sendNoteOff(lastArpNote, 0, props.channel, MidiSource.ARP)
    midiService.sendNoteOn(note, 100, props.channel, MidiSource.ARP)
    lastArpNote = note

    setTimeout(() => {
      if (lastArpNote === note) {
        midiService.sendNoteOff(note, 0, props.channel, MidiSource.ARP)
        lastArpNote = null
      }
    }, stepMs * 0.5)
  }, stepMs)
}

function stopAprEngine() {
  if (arpTimer) {
    clearInterval(arpTimer)
    arpTimer = null
  }
  if (lastArpNote !== null) {
    midiService.sendNoteOff(lastArpNote, 0, props.channel, MidiSource.ARP)
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
      physicalKeysHeld.value = Math.max(0, physicalKeysHeld.value - 1)
      if (!arpStore.arpHold || (physicalKeysHeld.value === 0 && arpStore.heldNoteCount <= 1)) {
        arpStore.releaseNote(note)
        if (arpStore.arpHold && physicalKeysHeld.value === 0 && arpStore.heldNoteCount <= 1) {
          arpStore.clearHeldNotes()
        }
      }
    }
  })
})

watch(() => arpStore.arpEnabled, (enabled) => {
  if (enabled) startAprEngine()
  else stopAprEngine()
}, { immediate: true })

watch(() => [arpStore.arpBpm, arpStore.arpSubdivision, arpStore.arpMode], () => {
  if (arpStore.arpEnabled) startAprEngine()
}, { deep: true })

onUnmounted(() => {
  _unsubNote?.()
  stopAprEngine()
})

watch(() => arpStore.arpHold, (hold) => {
  if (!hold && physicalKeysHeld.value === 0) {
    arpStore.clearHeldNotes()
    if (arpStore.arpEnabled) {
      setTimeout(() => { arpStore.arpHold = true }, 150)
    }
  }
})
</script>

<template>
  <Transition name="panel" appear>
    <div v-if="isOpen"
      class="absolute top-16 right-4 md:right-32 w-[320px] bg-black/90 backdrop-blur-md border border-neutral-800 rounded-xl shadow-2xl p-4 z-[95] origin-top"
    >
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-[10px] font-black uppercase tracking-widest text-neutral-400 flex items-center gap-2">
          <ListTree class="w-3 h-3 text-synth-neon" /> Arpeggiator
        </h3>
        <div class="flex items-center gap-3">
          <button @click="arpStore.arpEnabled = !arpStore.arpEnabled"
            :class="['w-10 h-5 rounded-full relative transition-colors', arpStore.arpEnabled ? 'bg-synth-neon' : 'bg-neutral-800']"
          >
            <div :class="['absolute top-0.5 bottom-0.5 w-4 bg-white rounded-full transition-transform', arpStore.arpEnabled ? 'translate-x-5' : 'translate-x-0.5']" />
          </button>
          <button @click="emit('close')" class="text-neutral-600 hover:text-white transition-colors">
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>

      <div :class="['transition-opacity duration-200', arpStore.arpEnabled ? 'opacity-100 pointer-events-auto' : 'opacity-40 pointer-events-none']">
        <div class="space-y-4">
          <!-- Hold toggle -->
          <div class="flex flex-col gap-1.5">
            <div class="flex justify-between items-center mb-1">
              <span class="text-[8px] font-mono text-neutral-500 uppercase">Hold</span>
              <button @click="arpStore.arpHold = !arpStore.arpHold"
                :class="['w-8 h-4 rounded-full relative transition-colors', arpStore.arpHold ? 'bg-synth-neon' : 'bg-neutral-800']"
              >
                <div :class="['absolute top-[1px] bottom-[1px] w-3.5 bg-white rounded-full transition-transform', arpStore.arpHold ? 'translate-x-[18px]' : 'translate-x-[1px]']" />
              </button>
            </div>
          </div>

          <!-- Mode select -->
          <div class="flex flex-col gap-1.5">
            <label class="text-[8px] font-mono text-neutral-500 uppercase">Mode</label>
            <select v-model="arpStore.arpMode" class="bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1.5 text-[10px] text-neutral-300 focus:border-synth-neon outline-none font-mono">
              <option>up</option>
              <option>down</option>
              <option>up-down</option>
              <option>random</option>
            </select>
          </div>

          <!-- BPM slider -->
          <div class="flex flex-col gap-1.5">
            <div class="flex justify-between items-center">
              <label class="text-[8px] font-mono text-neutral-500 uppercase">BPM</label>
              <span class="text-[10px] font-mono text-synth-neon font-bold">{{ arpStore.arpBpm }}</span>
            </div>
            <input v-model.number="arpStore.arpBpm" type="range" min="20" max="300" class="w-full" />
          </div>

          <!-- Subdivision -->
          <div class="flex flex-col gap-1.5">
            <label class="text-[8px] font-mono text-neutral-500 uppercase">Subdivision</label>
            <select v-model="arpStore.arpSubdivision" class="bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1.5 text-[10px] text-neutral-300 focus:border-synth-neon outline-none font-mono">
              <option v-for="sub in subdivisions" :key="sub">{{ sub }}</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
