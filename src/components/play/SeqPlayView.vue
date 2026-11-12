<script setup>
// The Sequencer's play view (Performance): its banks and the pattern on one row (each active step's
// note), the step sounding lit. Display only — the Rig plays it.
import { computed } from 'vue'
import { useStepSequencerStore } from '@/stores/useStepSequencerStore'
import { seqSnapshot, rigReports, rigArmed } from '@/lib/rig-live'
import { useSequencerEngine, NOTE_NAMES } from '@/core/engines/sequencer'
import PlaySlots from './PlaySlots.vue'

const seqStore = useStepSequencerStore()
const { steps, gridCurrentStep, isPlaying } = useSequencerEngine()
const snap = computed(() => seqSnapshot(seqStore.banks, seqStore.activeBankIndex, rigReports.seqPlaying, rigReports.queued.seq ?? rigArmed.seq))
const label = (s) => {
  if (!s?.active || !s.notes?.length) return ''
  const n = Math.min(...s.notes)
  return NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1) + (s.notes.length > 1 ? `+${s.notes.length - 1}` : '')
}
</script>

<template>
  <div class="flex flex-col gap-3 p-3 min-h-0">
    <PlaySlots :snap="snap" />
    <div class="grid gap-1 content-start" :style="{ gridTemplateColumns: `repeat(${Math.min(steps.length, 16)}, minmax(0, 1fr))` }">
      <div v-for="(s, i) in steps" :key="i"
           class="h-10 rounded border flex items-center justify-center text-[10px] font-mono font-bold truncate"
           :class="isPlaying && gridCurrentStep === i ? 'bg-amber-400 border-amber-200 text-black'
             : s.active ? 'bg-neutral-900 border-neutral-700 text-neutral-200' : 'bg-neutral-950 border-neutral-900 text-neutral-700'">
        {{ label(s) }}
      </div>
    </div>
  </div>
</template>
