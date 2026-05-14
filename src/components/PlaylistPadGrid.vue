<template>
  <div class="grid grid-cols-8 gap-3 overflow-y-hidden">
    <button v-for="i in 16" :key="i"
      @click="emit('togglePlay', i - 1)"
      :disabled="i - 1 >= playlist.length"
      :class="[
        'h-20 rounded-xl border-2 flex flex-col items-center justify-center p-2 gap-1 transition-all relative overflow-hidden group',
        getPadColorClass(i - 1, playlistIdx === (i - 1)),
        { 'opacity-20 cursor-not-allowed': i - 1 >= playlist.length }
      ]"
    >
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
        <span v-if="playlistIdx === (i-1)">{{ formatTime(currentTime) }} /</span> {{ formatTime(playlist[i-1].duration) }}
      </span>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { ListMusic, ListPlus, GripVertical, ChevronUp, ChevronDown, X, Repeat, Trash2, Play, Save, FolderOpen, SkipBack, SkipForward, Pause, Volume2 } from 'lucide-vue-next'

const props = defineProps({
  playlist: { type: Array, required: true },
  playlistIdx: { type: Number, default: -1 },
  currentTime : { type: Number, default: 0 },
  isPlaying: { type: Boolean, default: false }
})

const emit = defineEmits(['play', 'prev', 'next', 'togglePlay'])

function getPadColorClass(idx, isActive) {
  const row = Math.floor(idx / 2) // Two columns, so row changes every 2 pads
  const colors = [
    { base: 'border-white/10 text-white bg-white/5 hover:bg-red-700/20', active: 'bg-red-700/50 text-white shadow-[0_0_15px_rgba(255,0,0,0.5)]' },
    { base: 'border-white/10 text-white bg-white/5 hover:bg-red-700/20', active: 'bg-red-700/50 text-white shadow-[0_0_15px_rgba(255,0,0,0.5)]' },
    { base: 'border-white/10 text-white bg-white/5 hover:bg-red-700/20', active: 'bg-red-700/50 text-white shadow-[0_0_15px_rgba(255,0,0,0.5)]' },
    { base: 'border-white/10 text-white bg-white/5 hover:bg-red-700/20', active: 'bg-red-700/50 text-white shadow-[0_0_15px_rgba(255,0,0,0.5)]' }
    // { base: 'border-fuchsia-500 text-fuchsia-500 hover:bg-fuchsia-500/20', active: 'bg-fuchsia-500 text-black shadow-[0_0_15px_rgba(217,70,239,0.5)]' },
    // { base: 'border-amber-400 text-amber-400 hover:bg-amber-400/20', active: 'bg-amber-400 text-black shadow-[0_0_15px_rgba(251,191,36,0.5)]' },
    // { base: 'border-cyan-400 text-cyan-400 hover:bg-cyan-400/20', active: 'bg-cyan-400 text-black shadow-[0_0_15px_rgba(34,211,238,0.5)]' }
  ]
  // Use modulo to cycle through colors if more than 4 rows (8 pads / 2 cols = 4 rows)
  return isActive ? colors[row % colors.length].active : colors[row % colors.length].base
}
const totalDuration = ()=>{
    let duration = 0
    props.playlist.forEach ( t => {
        duration += t?.duration ? t.duration : 0
    })
    return duration
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