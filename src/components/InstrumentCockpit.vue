<script setup>
import { Piano } from 'lucide-vue-next'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import { useUiStore } from '@/stores/useUiStore'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'
import InstrumentCockpitPanel from '@/components/InstrumentCockpitPanel.vue'

const uiStore = useUiStore()

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } = useDraggableResizable({
  storageKey:    'SYCORE_POS_INSTRUMENT_COCKPIT',
  initialWidth:  980,
  initialHeight: 620,
  minWidth:      760,
  minHeight:     380,
  zIndex:        120,
  minimizeLabel: 'Instrument Cockpit',
  openRef:       () => uiStore.isInstrumentCockpitOpen,
  panelId:       'instrument-cockpit',
})
</script>

<template>
  <div v-show="uiStore.isInstrumentCockpitOpen && !isMinimized" class="fixed select-none" :style="panelStyle" @mousedown="bringToFront">
    <!-- Resize handles -->
    <div @mousedown.stop="e => onResizeStart(e, 'n')"  class="absolute top-0    left-3  right-3  h-1  cursor-n-resize  z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 's')"  class="absolute bottom-0 left-3  right-3  h-1  cursor-s-resize  z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 'e')"  class="absolute top-3 bottom-3   right-0  w-1  cursor-e-resize  z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 'w')"  class="absolute top-3 bottom-3   left-0   w-1  cursor-w-resize  z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 'se')" class="absolute bottom-0 right-0  w-3 h-3  cursor-se-resize z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 'sw')" class="absolute bottom-0 left-0   w-3 h-3  cursor-sw-resize z-50" />

    <div class="h-full flex flex-col bg-neutral-950 border border-synth-neon/30 rounded-2xl overflow-hidden shadow-2xl">
      <!-- Header (drag handle) -->
      <div
        class="flex items-center gap-3 px-4 py-3 bg-neutral-900/60 border-b border-neutral-800 cursor-grab active:cursor-grabbing shrink-0"
        @mousedown.stop="onDragStart"
      >
        <span class="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-synth-neon shrink-0">
          <Piano class="w-4 h-4" /> SY.CORE Cockpit
        </span>
        <div class="flex-1" />
        <div class="flex items-center gap-1" @mousedown.stop>
          <MacOsButtons
            @close="uiStore.isInstrumentCockpitOpen = false"
            @minimize="toggleMinimize"
            @maximize="maximize"
          />
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 min-h-0 overflow-hidden">
        <InstrumentCockpitPanel />
      </div>
    </div>
  </div>
</template>
