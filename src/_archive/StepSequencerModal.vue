<script setup>
import { toRef } from 'vue'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'
import StepSequencer from './StepSequencer.vue'

defineOptions({ inheritAttrs: false })
const props = defineProps({ isOpen: Boolean })
const emit = defineEmits(['close'])

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } =
  useDraggableResizable({
    storageKey:    'S1_STEP_SEQ_MODAL',
    minimizeLabel: 'Step Sequencer',
    initialWidth:  1020,
    initialHeight: 700,
    minWidth:      760,
    minHeight:     500,
    zIndex:        120,
    openRef:       toRef(props, 'isOpen'),
  })
</script>

<template>
  <div
    v-if="isOpen && !isMinimized"
    class="fixed bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden select-none"
    :style="panelStyle"
    @mousedown="bringToFront"
  >
    <div @mousedown.stop="e => onResizeStart(e, 'n')"  class="absolute top-0    left-3  right-3  h-1.5  cursor-n-resize  z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 's')"  class="absolute bottom-0 left-3  right-3  h-1.5  cursor-s-resize  z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 'e')"  class="absolute top-3 bottom-3   right-0  w-1.5  cursor-e-resize  z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 'w')"  class="absolute top-3 bottom-3   left-0   w-1.5  cursor-w-resize  z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 'se')" class="absolute bottom-0 right-0  w-4 h-4  cursor-se-resize z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 'sw')" class="absolute bottom-0 left-0   w-4 h-4  cursor-sw-resize z-50" />

    <div
      class="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-neutral-800 bg-gradient-to-r from-amber-950/70 to-transparent cursor-grab active:cursor-grabbing"
      @mousedown.stop="onDragStart"
    >
      <div class="flex items-center gap-2 pointer-events-none">
        <div class="w-5 h-5 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
          <svg class="w-3 h-3 text-amber-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 4v2M16 4v2"/></svg>
        </div>
        <span class="text-[11px] font-black uppercase tracking-widest text-white">Sequencer</span>
      </div>
      <div class="flex-1" />
      <div class="flex items-center gap-1 pointer-events-auto" @mousedown.stop>
        <MacOsButtons @close="emit('close')" @minimize="toggleMinimize" @maximize="maximize" />
      </div>
    </div>

    <div class="flex-1 flex flex-col overflow-hidden">
      <StepSequencer
        v-bind="$attrs"
        :isOpen="true"
        :embedded="true"
      />
    </div>
  </div>
</template>
