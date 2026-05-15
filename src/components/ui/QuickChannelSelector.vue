<script setup>
import { computed } from 'vue'
import { useMidiStore } from '@/stores/useMidiStore'
import { ChevronUp, ChevronDown, Layers } from 'lucide-vue-next'
import Tooltip from '@/components/Tooltip.vue'

const midiStore = useMidiStore()

const currentChannel = computed(() => midiStore.midiChannel)

function nextChannel() {
  const next = currentChannel.value >= 16 ? 1 : currentChannel.value + 1
  midiStore.setMidiChannel(next)
}

function prevChannel() {
  const prev = currentChannel.value <= 1 ? 16 : currentChannel.value - 1
  midiStore.setMidiChannel(prev)
}

function setChannel(ch) {
  midiStore.setMidiChannel(ch)
}
</script>

<template>
  <div class="flex items-center gap-2 bg-neutral-900/60 border border-neutral-800 rounded-full px-3 py-1 group hover:border-emerald-500/30 transition-all">
    <div class="flex items-center gap-2 pr-2 border-r border-neutral-800">
      <Layers class="w-3 h-3 text-emerald-500" />
      <span class="text-[9px] font-black text-neutral-500 uppercase tracking-tighter">PART</span>
    </div>
    
    <div class="flex items-center gap-3">
      <button @click="prevChannel" class="text-neutral-600 hover:text-white transition-colors">
        <ChevronDown class="w-3 h-3" />
      </button>
      
      <div class="relative flex items-center justify-center w-6 h-4 overflow-hidden">
        <Transition name="slide-up" mode="out-in">
          <span :key="currentChannel" class="text-[11px] font-mono font-bold text-emerald-400">
            {{ currentChannel }}
          </span>
        </Transition>
      </div>
      
      <button @click="nextChannel" class="text-neutral-600 hover:text-white transition-colors">
        <ChevronUp class="w-3 h-3" />
      </button>
    </div>

    <!-- Quick Dropdown / Matrix (Optional Expansion) -->
    <div class="hidden group-hover:flex items-center gap-1 pl-2 border-l border-neutral-800 animate-in fade-in slide-in-from-left-2 duration-300">
      <button 
        v-for="ch in [1, 2, 3, 4, 5, 6, 7,8,9,10,11,12,13,14,15,16]" :key="ch"
        @click="setChannel(ch)"
        :class="[
          'w-4 h-4 rounded-sm flex items-center justify-center text-[8px] font-bold transition-all',
          currentChannel === ch ? 'bg-emerald-500 text-black shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-neutral-800 text-neutral-500 hover:bg-neutral-700'
        ]"
        :title="`Switch to Ch ${ch}`"
      >
        {{ ch }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.2s ease;
}
.slide-up-enter-from {
  opacity: 0;
  transform: translateY(5px);
}
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}
</style>
