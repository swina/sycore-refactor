<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ListMusic, X, ExternalLink, Play, Pause, SkipBack, SkipForward } from 'lucide-vue-next'
import { useUiStore } from '@/stores/useUiStore'

const emit = defineEmits(['close'])

const uiStore = useUiStore()

// Mirrors AppFooter.vue's existing player-state-sync/player-state-request
// bridge — TracksPlayer.vue has no Pinia store, so this is the established
// way a sibling component reads/drives its playback state.
const isPlaying         = ref(false)
const playlist          = ref([])
const playlistIdx       = ref(-1)
const playingTrackLabel = ref('')

function onPlayerSync(e) {
  const d = e.detail
  if (d.isPlaying         !== undefined) isPlaying.value         = d.isPlaying
  if (d.playlistIdx       !== undefined) playlistIdx.value       = d.playlistIdx
  if (d.playlist          !== undefined) playlist.value          = d.playlist
  if (d.playingTrackLabel !== undefined) playingTrackLabel.value = d.playingTrackLabel
}

function playStop() { window.dispatchEvent(new CustomEvent('playlist-play-stop')) }
function prev()     { window.dispatchEvent(new CustomEvent('playlist-prev')) }
function next()     { window.dispatchEvent(new CustomEvent('playlist-next')) }
function playIdx(idx) { window.dispatchEvent(new CustomEvent('playlist-play', { detail: { idx, source: 'deck' } })) }

function formatTime(t) {
  if (isNaN(t) || !isFinite(t) || !t) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function openPanel() {
  uiStore.isTracksPlayerOpen = true
}

onMounted(() => {
  window.addEventListener('player-state-sync', onPlayerSync)
  window.dispatchEvent(new CustomEvent('player-state-request'))
})
onUnmounted(() => {
  window.removeEventListener('player-state-sync', onPlayerSync)
})
</script>

<template>
  <div class="flex flex-col h-full min-h-0 text-[9px] font-mono">
    <div class="flex items-center justify-between shrink-0 mb-1.5">
      <span class="flex items-center gap-1.5 text-synth-neon font-black uppercase tracking-widest text-[10px]">
        <ListMusic class="w-3 h-3" /> Playlist
      </span>
      <div class="flex items-center gap-1">
        <button @click="openPanel" title="Open Playlist"
          class="p-1 rounded border border-neutral-700 text-neutral-400 hover:text-synth-neon hover:border-synth-neon/50 transition-colors"
        >
          <ExternalLink class="w-3 h-3" />
        </button>
        <button @click="emit('close')" title="Back"
          class="p-1 rounded border border-neutral-700 text-neutral-400 hover:text-rose-400 hover:border-rose-500/50 transition-colors"
        >
          <X class="w-3 h-3" />
        </button>
      </div>
    </div>

    <div class="flex-1 min-h-0 flex flex-col gap-2">
      <!-- Now playing + transport — same colors as AppFooter.vue's own transport controls -->
      <div class="shrink-0 flex flex-col gap-1.5">
        <p class="truncate font-black uppercase tracking-tighter" :class="playingTrackLabel ? 'text-synth-neon' : 'text-neutral-700 italic'" :title="playingTrackLabel">
          {{ playingTrackLabel || 'Nothing playing' }}
        </p>
        <div class="flex items-center justify-center gap-3">
          <button @click="prev" title="Previous" class="text-neutral-500 hover:text-white transition-colors">
            <SkipBack class="w-4 h-4" />
          </button>
          <button @click="playStop" :title="isPlaying ? 'Pause' : 'Play'"
            class="w-8 h-8 flex items-center justify-center rounded-full bg-synth-neon/10 text-synth-neon hover:bg-synth-neon hover:text-black transition-all active:scale-90 shadow-lg shadow-synth-neon/20"
          >
            <Pause v-if="isPlaying" class="w-4 h-4 fill-current" />
            <Play v-else class="w-4 h-4 fill-current ml-0.5" />
          </button>
          <button @click="next" title="Next" class="text-neutral-500 hover:text-white transition-colors">
            <SkipForward class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Song list — same colors as PlayList.vue's own row states -->
      <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-1">
        <p v-if="playlist.length === 0" class="text-neutral-700 italic text-center pt-2">Playlist is empty</p>
        <div v-for="(track, idx) in playlist" :key="track.id ?? idx"
          @click="playIdx(idx)"
          title="Play this track"
          class="flex items-center gap-1.5 px-2 py-1 rounded-lg border cursor-pointer transition-colors"
          :class="idx === playlistIdx
            ? 'bg-synth-neon/10 border-synth-neon text-synth-neon'
            : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800 hover:border-neutral-700'"
        >
          <div class="flex flex-col flex-1 min-w-0 gap-0.5">
            <span class="truncate flex items-center gap-1.5" :title="track.label">
              {{ track.label }}
              <span v-if="track.bpm" class="text-[8px] font-mono text-emerald-400 bg-emerald-400/10 px-1 rounded shrink-0">{{ track.bpm }} BPM</span>
            </span>
            <span class="truncate text-[8px] text-neutral-500 uppercase tracking-wider flex items-center gap-1">
              <span v-if="track.genre">{{ track.genre }}</span>
              <span v-if="track.genre && track.author" class="text-neutral-700">•</span>
              <span v-if="track.author" class="normal-case italic text-neutral-400 truncate">{{ track.author }}</span>
            </span>
          </div>
          <span class="shrink-0 text-neutral-600 tabular-nums">{{ formatTime(track.duration) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
