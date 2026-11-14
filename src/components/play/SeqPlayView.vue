<script setup>
// The Sequencer's play view (Performance): its banks and the pattern on one row (each active step's
// note), the step sounding lit; Steps, Time and Direction can be set here (right-click: MIDI Learn,
// same targets as the edit panel: seq_steps, seq_time, seq_direction). Otherwise the Rig plays it.
import { computed } from 'vue'
import { useStepSequencerStore } from '@/stores/useStepSequencerStore'
import { seqSnapshot, rigReports, rigArmed } from '@/lib/rig-live'
import { useSequencerEngine, NOTE_NAMES } from '@/core/engines/sequencer'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import PlaySlots from './PlaySlots.vue'
import PlayChain from './PlayChain.vue'

const seqStore = useStepSequencerStore()
const { steps, gridCurrentStep, isPlaying, numSteps, tempoMultiplier, sequenceDirection, TEMPO_MULTIPLIERS, SEQ_DIRECTIONS } = useSequencerEngine()
const { openMenu } = useMidiContextMenu()
const DIR_ICON = { up: '↑', down: '↓', 'up-down': '↕', random: 'R' }
const snap = computed(() => seqSnapshot(seqStore.banks, seqStore.activeBankIndex, rigReports.seqPlaying, rigReports.queued.seq ?? rigArmed.seq))
const chainEntries = computed(() => seqStore.chain.map(i => (i !== null && i >= 0 ? 'ABCDEFGH'[i] : null)))
const label = (s) => {
  if (!s?.active || !s.notes?.length) return ''
  const n = Math.min(...s.notes)
  return NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1) + (s.notes.length > 1 ? `+${s.notes.length - 1}` : '')
}
</script>

<template>
  <div class="flex flex-col gap-3 p-3 min-h-0">
    <PlaySlots :snap="snap" />
    <PlayChain v-if="seqStore.chainEnabled" :entries="chainEntries" :current="isPlaying ? (seqStore.playingChainIndex ?? -1) : -1" />
    <div class="flex flex-wrap items-center gap-3 text-[10px] font-mono">
      <div class="flex items-center gap-1.5" title="Steps (right-click: MIDI Learn)"
           @contextmenu.prevent="openMenu($event, { name: 'seq_steps', label: 'Sequencer: Steps' })">
        <span class="text-neutral-500 uppercase">Steps</span>
        <input v-model.number="numSteps" type="range" min="2" max="16"
               class="w-20 h-1 accent-amber-500 bg-neutral-800 rounded-lg appearance-none cursor-pointer" />
        <span class="w-5 text-right font-bold text-amber-400">{{ numSteps }}</span>
      </div>
      <div class="flex items-center gap-1.5" title="Time: steps per beat (right-click: MIDI Learn)"
           @contextmenu.prevent="openMenu($event, { name: 'seq_time', label: 'Sequencer: Time' })">
        <span class="text-neutral-500 uppercase">Time</span>
        <select v-model="tempoMultiplier"
                class="bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 font-bold text-amber-400 outline-none cursor-pointer [color-scheme:dark]">
          <option v-for="opt in TEMPO_MULTIPLIERS" :key="opt.label" :value="opt">{{ opt.label }}</option>
        </select>
      </div>
      <div class="flex items-center gap-1.5" title="Direction (right-click: MIDI Learn)"
           @contextmenu.prevent="openMenu($event, { name: 'seq_direction', label: 'Sequencer: Direction' })">
        <span class="text-neutral-500 uppercase">Dir</span>
        <div class="flex items-center gap-0.5 rounded bg-black/40 border border-neutral-800 p-0.5">
          <button v-for="dir in SEQ_DIRECTIONS" :key="dir" :title="`Direction: ${dir}`" @click="sequenceDirection = dir"
                  class="px-1.5 rounded font-bold"
                  :class="sequenceDirection === dir ? 'bg-amber-600 text-black' : 'text-neutral-500 hover:text-neutral-300'">{{ DIR_ICON[dir] }}</button>
        </div>
      </div>
    </div>
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
