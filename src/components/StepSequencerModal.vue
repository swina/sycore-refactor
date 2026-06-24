<script setup>
import { watch } from 'vue'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import StepSequencer from './StepSequencer.vue'

defineOptions({ inheritAttrs: false })
const props = defineProps({ isOpen: Boolean })

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront } =
  useDraggableResizable({
    storageKey:    'S1_STEP_SEQ_MODAL',
    minimizeLabel: 'Step Sequencer',
    initialWidth:  1020,
    initialHeight: 700,
    minWidth:      760,
    minHeight:     500,
    zIndex:        120,
  })

watch(() => props.isOpen, v => { if (v) bringToFront() })
</script>

<template>
  <div
    v-if="isOpen && !isMinimized"
    class="fixed select-none"
    :style="panelStyle"
    @mousedown="bringToFront"
  >
    <!-- Drag handle — sits above StepSequencer's z-[1500], leaves right 120px for its own buttons -->
    <div
      class="absolute top-0 left-0 right-[120px] h-10 cursor-grab active:cursor-grabbing z-[2000]"
      @mousedown.stop="onDragStart"
    />

    <!-- Resize handles above StepSequencer z-[1500] -->
    <div class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-[2000]" @mousedown.stop="onResizeStart($event, 'se')" />
    <div class="absolute bottom-0 left-3 right-4 h-1.5 cursor-s-resize z-[2000]"  @mousedown.stop="onResizeStart($event, 's')" />
    <div class="absolute top-3 bottom-4 right-0 w-1.5 cursor-e-resize z-[2000]"   @mousedown.stop="onResizeStart($event, 'e')" />

    <StepSequencer
      v-bind="$attrs"
      :isOpen="true"
      :embedded="true"
      @minimize="toggleMinimize"
    />
  </div>
</template>
