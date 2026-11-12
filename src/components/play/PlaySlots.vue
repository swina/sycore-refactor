<script setup>
// A player's slots A–H in a play view: dark amber filled, blinking queued / armed, full amber playing.
import { SLOT_CLASS, slotLook } from '@/lib/play-colors'
defineProps({ snap: { type: Object, required: true } })
const LETTERS = 'ABCDEFGH'
</script>

<template>
  <div class="grid grid-cols-8 gap-1.5">
    <div v-for="(l, i) in LETTERS" :key="l"
         class="h-8 rounded border flex items-center justify-center text-[12px] font-black font-mono"
         :class="SLOT_CLASS[slotLook(snap, i)]">{{ l }}</div>
  </div>
</template>
