<script setup>
import ResizeHandles from '@/components/ui/ResizeHandles.vue'
import ChordNowDisplay from '@/components/ChordNowDisplay.vue'
// Now / Next as a floating panel (Classic). In Performance it is in the Rig Controls column,
// above Play (RigControllerPanel's teleport).
import { useDraggableResizable } from '@/composables/useDraggableResizable'

defineEmits(['close'])
const { panelStyle, onDragStart, onResizeStart, isMinimized, bringToFront } = useDraggableResizable({
  storageKey: 'SYCORE_POS_CHORD_NOW',
  minimizeLabel: 'Now / Next',
  initialWidth: 540,
  initialHeight: 44,
  minWidth: 240,
  minHeight: 36,
  zIndex: 160,
  panelId: 'chord-now',
})
</script>

<template>
  <div class="bg-neutral-950 border border-white/10 rounded-xl shadow-2xl flex flex-col justify-center overflow-hidden relative touch-none cursor-grab active:cursor-grabbing select-none"
       :style="panelStyle" v-show="!isMinimized" @mousedown.capture="bringToFront" @pointerdown="onDragStart">
    <ChordNowDisplay />
    <ResizeHandles :start="onResizeStart" />
  </div>
</template>
