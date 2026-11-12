<script setup>
// A floating panel's resize handles on every edge and corner: width and height from any side.
// Pointer events (mouse, pen, touch: no page scroll while resizing). `start(e, dir)`: the panel's
// useDraggableResizable onResizeStart.
defineProps({ start: { type: Function, required: true } })
const HANDLES = [
  ['n', 'top-0 left-3 right-3 h-1.5 cursor-n-resize'],
  ['s', 'bottom-0 left-3 right-3 h-1.5 cursor-s-resize'],
  ['e', 'top-3 bottom-3 right-0 w-1.5 cursor-e-resize'],
  ['w', 'top-3 bottom-3 left-0 w-1.5 cursor-w-resize'],
  ['ne', 'top-0 right-0 w-3 h-3 cursor-ne-resize'],
  ['nw', 'top-0 left-0 w-3 h-3 cursor-nw-resize'],
  ['se', 'bottom-0 right-0 w-3 h-3 cursor-se-resize'],
  ['sw', 'bottom-0 left-0 w-3 h-3 cursor-sw-resize'],
]
</script>

<template>
  <div v-for="h in HANDLES" :key="h[0]" :class="['absolute z-50 touch-none', h[1]]"
       @pointerdown.stop="e => start(e, h[0])" @mousedown.stop />
</template>
