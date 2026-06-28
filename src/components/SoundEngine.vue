<script setup>
import { watch } from 'vue'
import { Cpu, Minus, X } from 'lucide-vue-next'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'
import ResultsPanel from '@/components/ResultsPanel.vue'
import { useUiStore } from '@/stores/useUiStore'

const uiStore = useUiStore()
const props = defineProps({ isOpen: Boolean })
const emit  = defineEmits(['close'])

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } = useDraggableResizable({
  storageKey:    'SYCORE_POS_SOUND_ENGINE',
  initialWidth:  920,
  initialHeight: 720,
  minWidth:      700,
  minHeight:     480,
  zIndex:        100,
  minimizeLabel: 'Sound Engine',
})
watch(() => props.isOpen, (v) => { if (v) bringToFront() })
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      v-show="!isMinimized"
      class="bg-neutral-950 border border-neutral-900 rounded-2xl overflow-hidden flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.8)]"
      :style="panelStyle"
    >
      <!-- Resize handles -->
      <div @mousedown.stop="e => onResizeStart(e, 'n')"  class="absolute top-0    left-3  right-3  h-1  cursor-n-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 's')"  class="absolute bottom-0 left-3  right-3  h-1  cursor-s-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'e')"  class="absolute top-3 bottom-3   right-0  w-1  cursor-e-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'w')"  class="absolute top-3 bottom-3   left-0   w-1  cursor-w-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'se')" class="absolute bottom-0 right-0  w-3 h-3  cursor-se-resize z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'sw')" class="absolute bottom-0 left-0   w-3 h-3  cursor-sw-resize z-50" />

      <!-- ── Header (drag handle) ─────────────────────────────────── -->
      <div
        class="px-4 py-2 border-b border-neutral-900 flex items-center justify-between gap-4 shrink-0 bg-black/40 backdrop-blur-md cursor-grab active:cursor-grabbing select-none"
        @mousedown="onDragStart"
      >
        <div class="flex items-center gap-2 pointer-events-none">
          <Cpu class="w-4 h-4 text-synth-neon" />
          <span class="text-xs font-black uppercase tracking-widest text-neutral-300">Sound Engine</span>
        </div>
        <div class="flex items-center gap-1 pointer-events-auto" @mousedown.stop>
          <MacOsButtons @close="() => { emit('close'); uiStore.isSequencerOpen = false }" @minimize="toggleMinimize" @maximize="maximize" />
        </div>
      </div>

      <!-- ── Content ──────────────────────────────────────────────── -->
      <div class="flex-1 min-h-0 overflow-hidden">
        <ResultsPanel />
      </div>
    </div>
  </Teleport>
</template>
