<script setup>
import { computed } from 'vue'
import { Music2, X, ExternalLink } from 'lucide-vue-next'
import { useChordProgStore, DURATION_LABELS } from '@/stores/useChordProgStore'
import { useUiStore } from '@/stores/useUiStore'

const emit = defineEmits(['close'])

const store = useChordProgStore()
const uiStore = useUiStore()

const SLOT_LETTERS = Array.from({ length: 8 }, (_, i) => String.fromCharCode(65 + i))

// store.steps/store.currentStep always track whatever is actually sounding —
// ChordProgSequencer.vue calls slotLoad() on every chain slot-boundary
// crossing specifically so these stay valid even during chain playback
// (see its buildPlayState/_lastFollowedSlot logic), so no extra store
// wiring is needed here.
const currentStepData = computed(() => store.isPlaying ? (store.steps[store.currentStep] ?? null) : null)
const nextStepData = computed(() => {
  if (!store.isPlaying) return null
  const n = store.numSteps
  if (!n) return null
  const nextIdx = (store.currentStep + 1) % n
  return store.steps[nextIdx] ?? null
})

// Same guard as ChordProgSequencer.vue's own isCurrentPlayingStep — only the
// sounding step should get the "now playing" highlight, not merely whichever
// step index matches while the user is looking at a slot that isn't the one
// actually chained/playing.
function isCurrentPlayingStep(idx) {
  return idx === store.currentStep && store.isPlaying && store.activeSlotIndex === store.playingSlotIndex
}

const progressionSteps = computed(() => store.steps.slice(0, store.numSteps))

// Mirrors ChordProgSequencer.vue's own handleSlotSelect — save the current
// editing buffer into its slot before switching, so unsaved edits aren't lost.
function selectSlot(idx) {
  if (store.activeSlotIndex !== idx) {
    store.slotSave(store.activeSlotIndex)
    store.slotLoad(idx)
  }
}

function openPanel() {
  uiStore.openPanel('chord-prog')
}
</script>

<template>
  <div class="flex flex-col h-full min-h-0 text-[9px] font-mono">
    <div class="flex items-center justify-between shrink-0 mb-1.5">
      <span class="flex items-center gap-1.5 text-synth-neon font-black uppercase tracking-widest text-[10px]">
        <Music2 class="w-3 h-3" /> Chord Prog
      </span>
      <div class="flex items-center gap-1">
        <button @click="openPanel" title="Open Chord Prog Sequencer"
          class="p-1 rounded border border-neutral-700 text-neutral-400 hover:text-synth-neon hover:border-synth-neon/50 transition-colors"
        >
          <ExternalLink class="w-3 h-3" />
        </button>
        <button @click="emit('close')" title="Back"
          class="p-1 rounded border border-neutral-700 text-neutral-400 hover:text-rose-400 hover:border-rose-500/50 transition-colors"
        >
          <X class="w-3 h-3" />
        </button>
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-2.5">
      <div class="flex items-center gap-1.5 mb-1.5 justify-center">
        <!-- Slots A-H — same colors as the Chord Prog Sequencer's own slot selector -->
        <p class="text-neutral-600 uppercase tracking-widest mb-1">Slots</p>
        <div class="flex gap-1 p-1">
          <button v-for="(letter, idx) in SLOT_LETTERS" :key="letter"
            @click="selectSlot(idx)"
            class="w-10 relative py-1 rounded text-[10px] font-bold font-mono transition-colors"
            :class="store.activeSlotIndex === idx
              ? 'bg-purple-700 text-white ring-1 ring-purple-400'
              : 'bg-neutral-900 text-neutral-400 hover:text-white hover:bg-purple-400/40'"
          >
            {{ letter }}
            <span v-if="store.playingSlotIndex === idx" class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-yellow-400 ring-1 ring-neutral-900 animate-pulse"></span>
          </button>
        </div>
        <!-- Chain — same colors as the Chord Prog Sequencer's own chain toggle -->
      <button @click="store.chainEnabled = !store.chainEnabled"
        class="w-16 py-1 rounded font-bold uppercase tracking-widest border transition-colors"
        :class="store.chainEnabled
          ? 'border-cyan-600 text-cyan-400 bg-cyan-950/40'
          : 'border-neutral-700 text-neutral-500 hover:text-neutral-300'"
      >
        Chain {{ store.chainEnabled ? 'ON' : 'OFF' }}
      </button>
      </div>

      

      <!-- Chord progression — same per-step colors as the Chord Prog Sequencer's own step grid -->
      <div class="flex flex-col gap-1.5 justify-center">
        <p class="text-neutral-600 uppercase tracking-widest text-center">Progression</p>
        <div class="flex gap-1 flex-wrap justify-center">
          <div v-for="(step, idx) in progressionSteps" :key="idx"
            class="rounded w-16 px-1 py-1 text-center border"
            :class="step.active ? 'border-purple-700/60 bg-purple-950/40' : 'border-neutral-800 bg-neutral-950/60'"
          >
            <span class="block text-[8px]" :class="step.active ? 'text-purple-400' : 'text-neutral-600'">{{ idx + 1 }}</span>
            <span class="block truncate text-[10px] font-bold"
              :class="step.active ? (isCurrentPlayingStep(idx) ? 'text-yellow-300' : 'text-white') : 'text-neutral-600'"
            >{{ step.chordName }}</span>
            <span class="block text-[8px]" :class="step.active ? 'text-purple-300' : 'text-neutral-700'">{{ DURATION_LABELS[step.duration] }}</span>
          </div>
        </div>
      </div>

      <!-- Now playing / next chord — same yellow "now playing" treatment as the Chord Prog Sequencer's own step grid -->
      <div v-if="store.isPlaying" class="flex items-center justify-center gap-3 py-1">
        <div class="flex flex-col items-center bg-cyan-800 px-2 w-24 py-1 rounded border border-neutral-800">
          <span class="text-neutral-300 uppercase tracking-widest text-[8px]">Now</span>
          <span class="text-yellow-300 font-mono font-bold text-[16px] leading-tight">{{ currentStepData?.chordName ?? '—' }}</span>
          <span class="text-neutral-300 text-[8px]">{{ currentStepData ? DURATION_LABELS[currentStepData.duration] : '' }}</span>
        </div>
        <span class="text-neutral-700">→</span>
        <div class="flex flex-col items-center bg-neutral-900 px-2 w-24 py-1 rounded border border-neutral-800">
          <span class="text-neutral-600 uppercase tracking-widest text-[8px]">Next</span>
          <span class="text-purple-300 font-mono font-bold text-[16px] leading-tight">{{ nextStepData?.chordName ?? '—' }}</span>
          <span class="text-neutral-500 text-[8px]">{{ nextStepData ? DURATION_LABELS[nextStepData.duration] : '' }}</span>
        </div>
      </div>

      <!-- Readout -->
      <!-- <div class="mt-auto pt-1.5 border-t border-neutral-800 flex items-center justify-between">
        <span class="text-neutral-600 uppercase tracking-widest">Slot</span>
        <span class="text-neutral-300">{{ SLOT_LETTERS[store.activeSlotIndex] }}</span>
      </div> -->
    </div>
  </div>
</template>
