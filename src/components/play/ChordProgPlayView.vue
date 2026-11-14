<script setup>
// Chord Prog's play view (Performance): its slots and the chords of the slot playing, the chord
// sounding lit, each with its length (1/1 = a bar, 1/4…). Display only — the Rig plays it.
import { computed } from 'vue'
import { useChordProgStore, DURATION_LABELS } from '@/stores/useChordProgStore'
import { chordSnapshot, rigReports, rigArmed } from '@/lib/rig-live'
import PlaySlots from './PlaySlots.vue'
import PlayChain from './PlayChain.vue'

const store = useChordProgStore()
const snap = computed(() => chordSnapshot(store.slots, store.activeSlotIndex, store.playingSlotIndex, store.isPlaying, rigReports.queued.chord ?? rigArmed.chord))
const steps = computed(() => store.steps.slice(0, store.numSteps))
const chainEntries = computed(() => store.chain.map(i => (i >= 0 ? 'ABCDEFGH'[i] : null)))
const sounding = (i) => store.isPlaying && store.activeSlotIndex === store.playingSlotIndex && i === store.currentStep
</script>

<template>
  <div class="flex flex-col gap-3 p-3 min-h-0">
    <PlaySlots :snap="snap" />
    <PlayChain v-if="store.chainEnabled" :entries="chainEntries" :current="store.isPlaying ? store.playingChainPos : -1" />
    <div class="grid grid-cols-8 gap-1.5 content-start">
      <div v-for="(st, i) in steps" :key="i"
           class="h-14 rounded border flex flex-col items-center justify-center px-1 font-mono font-bold leading-tight min-w-0"
           :class="sounding(i) ? 'bg-amber-400 border-amber-200 text-black'
             : st.active ? 'bg-neutral-900 border-neutral-700 text-neutral-200' : 'bg-neutral-950 border-neutral-900 text-neutral-700'">
        <template v-if="st.active">
          <span class="text-[13px] truncate max-w-full">{{ st.chordName }}</span>
          <span class="text-[10px] font-medium" :class="sounding(i) ? 'text-black/70' : 'text-neutral-500'">{{ DURATION_LABELS[st.duration] ?? st.duration }}</span>
        </template>
      </div>
    </div>
  </div>
</template>
