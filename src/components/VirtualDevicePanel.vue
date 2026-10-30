<script setup>
// Virtual Device Panel: the floating window around VirtualDeviceView (the DECK shows the same view
// in place of its display). See VirtualDeviceView.vue.
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'
import VirtualDeviceView from '@/components/VirtualDeviceView.vue'

const emit = defineEmits(['close'])

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } = useDraggableResizable({
  storageKey: 'SYCORE_POS_VIRTUAL_DEVICE',
  minimizeLabel: 'Virtual Device',
  initialWidth: 620,
  initialHeight: 440,
  minWidth: 460,
  minHeight: 320,
  zIndex: 160,
  panelId: 'virtual-device',
})
</script>

<template>
  <div class="bg-neutral-950 border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden relative" :style="panelStyle" v-show="!isMinimized" @mousedown.capture="bringToFront">
    <VirtualDeviceView class="flex-1" grab @header-mousedown="onDragStart">
      <template #actions>
        <MacOsButtons @close="emit('close')" @minimize="toggleMinimize" @maximize="maximize" />
      </template>
    </VirtualDeviceView>

    <div @mousedown.stop="e => onResizeStart(e, 'se')" class="absolute bottom-1 right-1 w-3 h-3 cursor-se-resize z-50 opacity-40 hover:opacity-80" style="background:radial-gradient(circle,#aaa 1px,transparent 1px) 0 0/3px 3px" />
  </div>
</template>
