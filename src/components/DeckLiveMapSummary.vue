<script setup>
// DECK summary of SY.CORE Map (P12): the compact LiveMapSection, with a button to the full panel.
import { SlidersHorizontal, X, ExternalLink } from 'lucide-vue-next'
import { useUiStore } from '@/stores/useUiStore'
import LiveMapSection from '@/components/LiveMapSection.vue'

const emit = defineEmits(['close'])
const uiStore = useUiStore()
function openPanel() { uiStore.openPanel('live-map') }
</script>

<template>
  <div class="flex flex-col gap-1.5 h-full">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
        <SlidersHorizontal class="w-3 h-3" /> Map · Live instruments
      </div>
      <div class="flex items-center gap-1">
        <button @click="openPanel" title="Open the Live Map panel" class="p-1 rounded hover:bg-white/10 text-neutral-400 hover:text-white">
          <ExternalLink class="w-3 h-3" />
        </button>
        <button @click="emit('close')" title="Back" class="p-1 rounded hover:bg-white/10 text-neutral-400 hover:text-rose-400">
          <X class="w-3 h-3" />
        </button>
      </div>
    </div>
    <LiveMapSection compact />
  </div>
</template>
