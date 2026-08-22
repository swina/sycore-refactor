<script setup>
import { computed } from 'vue'
import { Drum, X, ExternalLink, Layers, Shuffle, Play, Square } from 'lucide-vue-next'
import { useDrumMachineStore } from '@/stores/useDrumMachineStore'
import { useUiStore } from '@/stores/useUiStore'

const emit = defineEmits(['close'])

const drumStore = useDrumMachineStore()
const uiStore = useUiStore()

const BANKS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

const patternName = computed(() => drumStore.currentPresetName || `Pattern ${drumStore.activeSequence}`)

function openPanel() {
  uiStore.openPanel('drum-machine')
}

// Simple direct toggle — same as the "stopAtEnd" bypass DrumMachine.vue's own
// dm_play_stop MIDI Learn field already uses; the panel's own PLAY/STOP
// button additionally supports a "stop at end of pattern" queue, but that's
// local UI state (pendingStop) this card doesn't have access to.
function togglePlay() {
  drumStore.isPlaying = !drumStore.isPlaying
}
</script>

<template>
  <div class="flex flex-col h-full min-h-0 text-[9px] font-mono">
    <div class="flex items-center justify-between shrink-0 mb-1.5">
      <span class="flex items-center gap-1.5 text-synth-neon font-black uppercase tracking-widest text-[10px]">
        <Drum class="w-3 h-3" /> Drum Machine
      </span>
      <div class="flex items-center gap-1">
        <button @click="togglePlay" :title="drumStore.isPlaying ? 'Stop' : 'Play'"
          class="flex items-center gap-1 px-2 py-1 rounded-lg border text-[9px] font-bold uppercase tracking-wider transition-colors"
          :class="drumStore.isPlaying
            ? 'bg-red-600/30 border-red-500 text-red-300 hover:bg-red-600/50'
            : 'bg-purple-600/20 border-purple-500 text-purple-300 hover:bg-purple-600/40'"
        >
          <Square v-if="drumStore.isPlaying" class="w-2.5 h-2.5" />
          <Play v-else class="w-2.5 h-2.5" />
          {{ drumStore.isPlaying ? 'Stop' : 'Play' }}
        </button>
        <button @click="openPanel" title="Open Drum Machine"
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
      <!-- Quick-launch: Generate / Import / Euclidean — same colors as the Drum Machine's own buttons -->
      <div class="flex justify-center gap-1.5 mb-4 text-[11px]">
        <button @click="openPanel" title="Generate a style-based pattern"
          class="w-22 flex items-center justify-center gap-0.5 py-1.5 rounded-lg border font-bold transition-colors border-amber-600 bg-amber-600/20 text-amber-300 hover:bg-amber-600/40"
        >
          Generate
        </button>
        <button @click="openPanel" title="Import a pattern"
          class="w-22 flex items-center justify-center gap-0.5 py-1.5 rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300 font-bold hover:border-neutral-500 transition-colors"
        >
          <Layers class="w-3 h-3 text-cyan-400" /> Import
        </button>
        <button @click="openPanel" title="Euclidean rhythm generator"
          class="w-22 flex items-center justify-center gap-0.5 py-1.5 rounded-lg border bg-neutral-800 border-neutral-700 text-neutral-400 font-bold hover:border-neutral-500 hover:text-white transition-colors"
        >
          <Shuffle class="w-3 h-3 text-green-400" /> Euclidean
        </button>
      </div>

      <div class="flex justify-center items-center text-[11px]">
        <p class="text-neutral-600 uppercase tracking-widest m-1">Patterns</p>
        <div class="flex gap-1">
          <!-- Patterns A-F — same colors as the Drum Machine's own sequence tabs -->
          <button v-for="key in BANKS" :key="key"
            @click="drumStore.swapSequence(key)"
            class="w-10 py-1 rounded border text-[10px] font-bold transition-colors"
            :class="drumStore.activeSequence === key
              ? 'bg-sky-900 border-sky-400 text-white'
              : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:border-sky-500 hover:text-amber-300'"
          >
            {{ key }}
          </button>

          <!-- AutoFill / Chain — same colors as the Drum Machine's own toggle buttons -->
          <button @click="drumStore.autofillEnabled = !drumStore.autofillEnabled"
            class="flex px-2 py-1 items-center gap-1 ml-5 rounded-lg border font-bold transition-colors"
            :class="drumStore.autofillEnabled
              ? 'bg-sky-600/30 border-sky-500 text-sky-300'
              : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-sky-500 hover:text-sky-300'"
          >
            <Drum class="w-3 h-3" /> AutoFill {{ drumStore.autofillEnabled ? 'ON' : 'OFF' }}
          </button>
          <button @click="drumStore.chainEnabled = !drumStore.chainEnabled"
            class="flex px-2 py-1 items-center gap-1 ml-5 rounded-lg border font-bold transition-colors"
            :class="drumStore.chainEnabled
              ? 'bg-sky-600/30 border-sky-500 text-sky-300'
              : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-sky-500 hover:text-sky-300'"
          >
            <Layers class="w-3 h-3" /> Chain {{ drumStore.chainEnabled ? 'ON' : 'OFF' }}
          </button>
        </div>
      </div>

      

      <!-- Readouts — same treatment as the Drum Machine's own preset/kit labels -->
      <div class="mt-auto pt-1.5 border-t border-neutral-800 flex flex-col gap-1">
        <div class="flex items-center justify-between">
          <span class="text-neutral-600 uppercase tracking-widest">Pattern</span>
          <span class="font-mono text-violet-300 bg-violet-600 rounded px-2 truncate max-w-[60%]" :title="patternName">{{ patternName }}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-neutral-600 uppercase tracking-widest">Kit</span>
          <span class="truncate max-w-[60%] font-bold uppercase tracking-widest"
            :class="drumStore.currentKitName ? 'text-amber-500/80' : 'text-neutral-700 italic'"
            :title="drumStore.currentKitName"
          >
            {{ drumStore.currentKitName || 'No kit' }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
