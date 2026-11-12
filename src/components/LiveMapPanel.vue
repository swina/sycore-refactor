<script setup>
import ResizeHandles from '@/components/ui/ResizeHandles.vue'
// Live Map panel: the floating window around LiveMapSection (SY.CORE Map, P12) — the instrument the
// SY.CORE Map device in Live drives, its 16 slots, the track, the Rack's Macro Variations. The DECK
// shows the same view, compact (DeckLiveMapSummary).
import { SlidersHorizontal } from 'lucide-vue-next'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'
import LiveMapSection from '@/components/LiveMapSection.vue'
import PlayPanelHeader from '@/components/play/PlayPanelHeader.vue'
import { usePlayView } from '@/composables/usePlayView'

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
// Performance: the players' slim header (name, window buttons), the section without its title and hints
const { playViews } = usePlayView('live-map')
</script>

<template>
  <div class="bg-neutral-950 border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden relative" :style="panelStyle" v-show="!isMinimized" @mousedown.capture="bringToFront">
    <PlayPanelHeader v-if="playViews" title="Map · Live Instruments" panel-id="live-map" :edit="false" accent="text-emerald-300"
                     @pointerdown="onDragStart" @close="emit('close')" @minimize="toggleMinimize" @maximize="maximize" />
    <div v-else class="flex items-center justify-between gap-3 px-4 py-2 bg-gradient-to-b from-white/5 to-transparent shrink-0 cursor-grab active:cursor-grabbing select-none" @mousedown="onDragStart">
      <div class="flex items-center gap-3">
        <div class="p-1.5 bg-emerald-500/20 rounded-lg border border-emerald-500/20">
          <SlidersHorizontal class="w-4 h-4 text-emerald-400" />
        </div>
        <h2 class="text-sm font-black text-white tracking-[0.1em] uppercase">Map · Live Instruments</h2>
      </div>
      <div @mousedown.stop><MacOsButtons @close="emit('close')" @minimize="toggleMinimize" @maximize="maximize" /></div>
    </div>
    <div class="flex-1 min-h-0 overflow-y-auto" :class="playViews ? 'p-1.5' : 'p-3'">
      <LiveMapSection :title="!playViews" :hints="!playViews" />
    </div>
    <ResizeHandles :start="onResizeStart" />
  </div>
</template>
