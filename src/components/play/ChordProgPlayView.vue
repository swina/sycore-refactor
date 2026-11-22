<script setup>
// Chord Prog's play view (Performance): its slots and the chords of the slot playing, the chord
// sounding lit (stopped: the chord played on its own, e.g. from a controller), each with its length
// (1/1 = a bar, 1/4…). Display only — the Rig plays it.
import { computed } from 'vue'
import { useChordProgStore, DURATION_LABELS } from '@/stores/useChordProgStore'
import { chordSnapshot, rigReports, rigArmed } from '@/lib/rig-live'
import PlaySlots from './PlaySlots.vue'
import PlayChain from './PlayChain.vue'

const store = useChordProgStore()
const snap = computed(() => chordSnapshot(store.slots, store.activeSlotIndex, store.playingSlotIndex, store.isPlaying, rigReports.queued.chord ?? rigArmed.chord))
const steps = computed(() => store.steps.slice(0, store.numSteps))
const chainEntries = computed(() => store.chain.map(i => (i >= 0 ? 'ABCDEFGH'[i] : null)))
// stopped, a chord played on its own (a controller's MIDI Learn, a click in the panel) is lit too
const sounding = (i) => store.isPlaying
  ? store.activeSlotIndex === store.playingSlotIndex && i === store.currentStep
  : !!store.playingChordName && i === store.currentStep
</script>

<template>
  <div class="flex flex-col gap-3 p-3 min-h-0">
    <!-- Chain mode on: the slots narrow, the chain on their right -->
    <div class="flex items-center gap-3 min-w-0">
      <PlaySlots accent="purple" :snap="snap" :compact="store.chainEnabled" :class="store.chainEnabled ? '' : 'flex-1'" />
      <PlayChain v-if="store.chainEnabled" class="flex-1" :entries="chainEntries" :current="store.isPlaying ? store.playingChainPos : -1" />
    </div>
    <!-- the chords: for reference (the one sounding is in Rig Controls' Now), kept low -->
    <div class="grid grid-cols-8 gap-1 content-start">
      <div v-for="(st, i) in steps" :key="i" data-cp-chord
           class="h-8 rounded border flex flex-col items-center justify-center px-1 font-mono font-bold leading-none min-w-0"
           :class="sounding(i) ? 'bg-purple-400 border-purple-200 text-black'
             : st.active ? 'bg-neutral-900 border-neutral-700 text-neutral-200' : 'bg-neutral-950 border-neutral-900 text-neutral-700'">
        <template v-if="st.active">
          <span class="text-[11px] truncate max-w-full">{{ st.chordName }}</span>
          <span class="text-[9px] font-medium" :class="sounding(i) ? 'text-black/70' : 'text-neutral-500'">{{ DURATION_LABELS[st.duration] ?? st.duration }}</span>
        </template>
      </div>
    </div>
  </div>
</template>
