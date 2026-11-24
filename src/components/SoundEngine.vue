<script setup>
import PanelHeader from '@/components/ui/PanelHeader.vue'
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
  panelId:       'sound-engine',
})
watch(() => props.isOpen, (v) => { if (v) bringToFront() })
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      v-show="!isMinimized"
      class="bg-neutral-950 border border-synth-neon/30 rounded-2xl overflow-hidden flex flex-col"
      :style="panelStyle"
      @mousedown.capture="bringToFront"
    >
      <!-- Resize handles -->
      <div @mousedown.stop="e => onResizeStart(e, 'n')"  class="absolute top-0    left-3  right-3  h-1  cursor-n-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 's')"  class="absolute bottom-0 left-3  right-3  h-1  cursor-s-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'e')"  class="absolute top-3 bottom-3   right-0  w-1  cursor-e-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'w')"  class="absolute top-3 bottom-3   left-0   w-1  cursor-w-resize  z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'se')" class="absolute bottom-0 right-0  w-3 h-3  cursor-se-resize z-50" />
      <div @mousedown.stop="e => onResizeStart(e, 'sw')" class="absolute bottom-0 left-0   w-3 h-3  cursor-sw-resize z-50" />

      <!-- ── Header (drag handle) ─────────────────────────────────── -->
      <PanelHeader title="Sound Engine" subtitle="Roland S-1" :icon="Cpu" accent="text-synth-neon"
                   @mousedown="onDragStart" @close="() => { emit('close'); uiStore.isSequencerOpen = false }" @minimize="toggleMinimize" @maximize="maximize" />

      <!-- ── Content ──────────────────────────────────────────────── -->
      <div class="flex-1 min-h-0 overflow-hidden">
        <ResultsPanel />
      </div>
    </div>
  </Teleport>
</template>
