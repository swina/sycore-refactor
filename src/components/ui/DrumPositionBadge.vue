<script setup>
// Toolbar badge: the Drum Machine's bar.beat while it plays. Its own component so the
// once-per-beat update re-renders only this span, not the whole AppFooter.
import { computed } from 'vue'
import { Drum } from 'lucide-vue-next'
import { useDrumMachineStore } from '@/stores/useDrumMachineStore'
import { drumPosition, formatDrumPosition } from '@/lib/drum-position'

const drumStore = useDrumMachineStore()
const label = computed(() => drumStore.isPlaying ? formatDrumPosition(drumPosition.value) : '')
</script>

<template>
  <span v-if="label" class="flex items-center gap-1 text-[12px] font-mono font-bold text-orange-300 bg-orange-400/10 px-1.5 rounded shrink-0 tabular-nums" title="Drum Machine — bar.beat">
    <Drum class="w-3 h-3" />{{ label }}
  </span>
</template>
