<script setup>
// A player's slots A–H in a play view, in the app's color (`accent`): dark filled, outlined the current one (stopped: the one
// Play starts), blinking queued / armed, full playing. `compact`: small fixed cells (the chain
// sits on their right, Chain mode on).
import { slotClass, slotLook } from '@/lib/play-colors'
defineProps({ snap: { type: Object, required: true }, compact: { type: Boolean, default: false }, accent: { type: String, default: 'amber' } })
const LETTERS = 'ABCDEFGH'
</script>

<template>
  <div :class="compact ? 'flex gap-1 shrink-0' : 'grid grid-cols-8 gap-1.5'">
    <div v-for="(l, i) in LETTERS" :key="l" data-play-slot
         class="rounded border flex items-center justify-center font-black font-mono"
         :class="[compact ? 'w-6 h-6 text-[11px]' : 'h-8 text-[12px]', slotClass(accent, slotLook(snap, i))]">{{ l }}</div>
  </div>
</template>
