<script setup>
// The Sequencer play view's View selector (in the panel's header): Notes, or the lanes at 4 / 8 / 16
// steps (the button sets Steps); any other length is set with the STEPS slider (max 16 in lanes).
import { useSequencerEngine } from '@/core/engines/sequencer'
import { seqPlayView, setSeqPlayView } from '@/lib/seq-play-view'

const { numSteps } = useSequencerEngine()
const OPTS = [['notes', 'Notes'], [4, '4'], [8, '8'], [16, '16']]
function pick(v) {
  if (v === 'notes') { setSeqPlayView('notes'); return }
  setSeqPlayView('lanes')
  numSteps.value = v
}
const on = (v) => (v === 'notes' ? seqPlayView.value === 'notes' : seqPlayView.value === 'lanes' && numSteps.value === v)
</script>

<template>
  <div class="flex items-center gap-1 text-[10px] font-mono" @pointerdown.stop @mousedown.stop
       title="Step view: note names, or the steps as bars at their pitch — 4 / 8 / 16 set Steps (other lengths: the STEPS slider, max 16) · drag a bar up / down to change its note, drag the meter under it for the velocity, M mutes the step">
    <span class="text-[9px] text-neutral-500 uppercase">View</span>
    <div class="flex rounded bg-black/40 border border-neutral-800 p-0.5">
      <button v-for="o in OPTS" :key="o[0]" type="button" data-view-opt
              class="px-1.5 font-bold" :class="on(o[0]) ? 'bg-amber-600 text-black' : 'text-neutral-500 hover:text-neutral-300'"
              @click="pick(o[0])">{{ o[1] }}</button>
    </div>
  </div>
</template>
