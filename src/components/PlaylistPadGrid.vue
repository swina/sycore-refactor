<template>
  <div class="grid grid-cols-8 gap-3 overflow-y-hidden">
    <button v-for="i in 16" :key="i"
      @click="emit('togglePlay', i - 1)"
      @contextmenu.prevent="midiMapPrefix && i - 1 < playlist.length ? openMenu($event, { name: midiMapPrefix + '_' + (i - 1), label: playlist[i - 1]?.label || ('Track ' + i) }) : null"
      :disabled="i - 1 >= playlist.length"
      :class="[
        'h-20 rounded-xl border-2 flex flex-col items-center justify-center p-2 gap-1 transition-all relative overflow-hidden group',
        getPadColorClass(i - 1, playlistIdx === (i - 1)),
        { 'opacity-20 cursor-not-allowed': i - 1 >= playlist.length }
      ]"
    >
      <!-- MIDI learn orange dot -->
      <span
        v-if="midiMapPrefix && mappingStore.learningParamName === midiMapPrefix + '_' + (i - 1)"
        class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] animate-pulse z-50 pointer-events-none"
      />

      <!-- Progress Bar Overlay (Filling Background) -->
      <div v-if="playlistIdx === (i-1)"
        class="absolute inset-y-0 left-0 bg-red-600/40 pointer-events-none transition-all duration-100"
        :style="{
          width: `${(playlist[i-1]?.duration > 0) ? (currentTime / playlist[i-1].duration) * 100 : 0}%`
        }"
      />

      <span class="w-full font-black text-center text-[11px] uppercase tracking-tight z-10 truncate px-1">
        {{ playlist[i - 1]?.label || `EMPTY ${i}` }}
      </span>

      <span v-if="playlist[i - 1]?.label" class="text-[9px] font-mono font-medium uppercase tracking-widest opacity-40 z-10">
        <template v-if="playlistIdx === (i-1) && playlist[i-1].duration > 0">{{ formatTime(currentTime) }} / </template>
        {{ playlist[i-1].duration > 0 ? formatTime(playlist[i-1].duration) : '--:--' }}
      </span>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import { useMappingStore } from '@/stores/useMappingStore'

const props = defineProps({
  playlist: { type: Array, required: true },
  playlistIdx: { type: Number, default: -1 },
  currentTime : { type: Number, default: 0 },
  isPlaying: { type: Boolean, default: false },
  midiMapPrefix: { type: String, default: null },
})

const emit = defineEmits(['play', 'prev', 'next', 'togglePlay'])

const { openMenu } = useMidiContextMenu()
const mappingStore = useMappingStore()

function getPadColorClass(idx, isActive) {
  const row = Math.floor(idx / 2) // Two columns, so row changes every 2 pads
  const colors = [
    { base: 'border-red-500/70 text-white bg-white/5 hover:bg-red-700/20', active: 'bg-red-700/50 text-white shadow-[0_0_15px_rgba(255,0,0,0.5)]' },
    { base: 'border-red-500/70 text-white bg-white/5 hover:bg-red-700/20', active: 'bg-red-700/50 text-white shadow-[0_0_15px_rgba(255,0,0,0.5)]' },
    { base: 'border-red-500/70 text-white bg-white/5 hover:bg-red-700/20', active: 'bg-red-700/50 text-white shadow-[0_0_15px_rgba(255,0,0,0.5)]' },
    { base: 'border-red-500/70 text-white bg-white/5 hover:bg-red-700/20', active: 'bg-red-700/50 text-white shadow-[0_0_15px_rgba(255,0,0,0.5)]' }
  ]
  return isActive ? colors[row % colors.length].active : colors[row % colors.length].base
}

function formatTime(t) {
  if (isNaN(t) || !isFinite(t)) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
</script>

<style scoped>
/* Add any specific styles here if needed, but Tailwind should handle most */
</style>
