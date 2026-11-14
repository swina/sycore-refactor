<script setup>
// The Play count-in's modal countdown (lib/count-in.ts). A click calls it off (nothing starts).
import { countIn, cancelCountIn, BEATS_PER_BAR } from '@/lib/count-in'
</script>

<template>
  <Transition name="sy-modal">
    <div v-if="countIn.active" class="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-sm cursor-pointer"
      title="Click: cancel the count-in" @click="cancelCountIn()">
      <div class="flex flex-col items-center gap-6 select-none">
        <p class="text-[11px] font-black uppercase tracking-[0.4em] text-neutral-400">Count-in</p>
        <p :key="countIn.left" class="count-in-num font-black leading-none tabular-nums"
          :class="countIn.beat === 1 ? 'text-synth-neon' : 'text-white'">{{ countIn.left || '' }}</p>
        <div class="flex gap-3">
          <span v-for="b in BEATS_PER_BAR" :key="b" class="w-4 h-4 rounded-full border"
            :class="b === countIn.beat ? (b === 1 ? 'bg-synth-neon border-synth-neon' : 'bg-white border-white') : 'border-neutral-600'" />
        </div>
        <p class="text-[9px] text-neutral-500 uppercase tracking-widest">Click or Stop to cancel</p>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.count-in-num { font-size: 12rem; animation: count-in-pop 0.25s ease-out; }
@keyframes count-in-pop { from { transform: scale(1.25); opacity: 0.4; } to { transform: scale(1); opacity: 1; } }
</style>
