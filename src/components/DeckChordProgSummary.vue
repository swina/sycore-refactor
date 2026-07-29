<script setup>
import { Music2, X, ExternalLink } from 'lucide-vue-next'
import { useChordProgStore } from '@/stores/useChordProgStore'
import { useUiStore } from '@/stores/useUiStore'

const emit = defineEmits(['close'])

const store = useChordProgStore()
const uiStore = useUiStore()

const SLOT_LETTERS = Array.from({ length: 8 }, (_, i) => String.fromCharCode(65 + i))

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
      <!-- Slots A-H — same colors as the Chord Prog Sequencer's own slot selector -->
      <div>
        <p class="text-neutral-600 uppercase tracking-widest mb-1">Slots</p>
        <div class="grid grid-cols-4 gap-1">
          <button v-for="(letter, idx) in SLOT_LETTERS" :key="letter"
            @click="selectSlot(idx)"
            class="relative py-1 rounded text-[10px] font-bold font-mono transition-colors"
            :class="store.activeSlotIndex === idx
              ? 'bg-purple-700 text-white ring-1 ring-purple-400'
              : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700'"
          >
            {{ letter }}
            <span v-if="store.playingSlotIndex === idx" class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-yellow-400 ring-1 ring-neutral-900 animate-pulse"></span>
          </button>
        </div>
      </div>

      <!-- Chain — same colors as the Chord Prog Sequencer's own chain toggle -->
      <button @click="store.chainEnabled = !store.chainEnabled"
        class="py-1 rounded font-bold uppercase tracking-widest border transition-colors"
        :class="store.chainEnabled
          ? 'border-cyan-600 text-cyan-400 bg-cyan-950/40'
          : 'border-neutral-700 text-neutral-500 hover:text-neutral-300'"
      >
        Chain {{ store.chainEnabled ? 'ON' : 'OFF' }}
      </button>

      <!-- Readout -->
      <div class="mt-auto pt-1.5 border-t border-neutral-800 flex items-center justify-between">
        <span class="text-neutral-600 uppercase tracking-widest">Slot</span>
        <span class="text-neutral-300">{{ SLOT_LETTERS[store.activeSlotIndex] }}</span>
      </div>
    </div>
  </div>
</template>
