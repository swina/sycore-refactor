<script setup>
// Live Map panel: the floating window around LiveMapSection (SY.CORE Map, P12) — the instrument the
// SY.CORE Map device in Live drives, its 16 slots, the track, the Rack's Macro Variations. The DECK
// shows the same view, compact (DeckLiveMapSummary).
import { SlidersHorizontal } from 'lucide-vue-next'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'
import LiveMapSection from '@/components/LiveMapSection.vue'

const emit = defineEmits(['close'])

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } = useDraggableResizable({
  storageKey: 'SYCORE_POS_LIVE_MAP',
  minimizeLabel: 'Live Map',
  initialWidth: 720,
  initialHeight: 330,
  minWidth: 560,
  minHeight: 260,
  zIndex: 160,
  panelId: 'live-map',
})
</script>

<template>
  <div class="bg-neutral-950 border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden relative" :style="panelStyle" v-show="!isMinimized" @mousedown.capture="bringToFront">
    <div class="flex items-center justify-between gap-3 px-4 py-2 bg-gradient-to-b from-white/5 to-transparent shrink-0 cursor-grab active:cursor-grabbing select-none" @mousedown="onDragStart">
      <div class="flex items-center gap-3">
        <div class="p-1.5 bg-emerald-500/20 rounded-lg border border-emerald-500/20">
          <SlidersHorizontal class="w-4 h-4 text-emerald-400" />
        </div>
        <h2 class="text-sm font-black text-white tracking-[0.1em] uppercase">Map · Live Instruments</h2>
      </div>
      <div @mousedown.stop><MacOsButtons @close="emit('close')" @minimize="toggleMinimize" @maximize="maximize" /></div>
    </div>
    <div class="flex-1 min-h-0 overflow-y-auto p-3">
      <LiveMapSection />
    </div>
    <div @mousedown.stop="e => onResizeStart(e, 'se')" class="absolute bottom-1 right-1 w-3 h-3 cursor-se-resize z-50 opacity-40 hover:opacity-80" style="background:radial-gradient(circle,#aaa 1px,transparent 1px) 0 0/3px 3px" />
  </div>
</template>
