<template>
  <div class="flex flex-col gap-3">
    <!-- Player Controls -->
    <div v-if="playlist.length > 0" class="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 gap-3 shrink-0">
      <div class="flex items-center gap-3 shrink-0 cursor-pointer">
        <div title="Previous track" class="text-neutral-500 hover:text-synth-neon transition-colors" @click="$emit('prev')">
          <SkipBack class="w-4 h-4" />
        </div>
        <div :class="isPlaying ? 'text-synth-neon' : 'text-neutral-500'" title="Playback status" @click="$emit('togglePlay')">
          <Pause v-if="isPlaying" class="w-4 h-4 fill-current" />
          <Play v-else class="w-4 h-4 fill-current" />
        </div>
        <div title="Next track" class="text-neutral-500 hover:text-synth-neon transition-colors" @click="$emit('next')">
          <SkipForward class="w-4 h-4" />
        </div>
      </div>

      <div class="flex-1 flex items-center gap-2 min-w-0">
        <div class="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden cursor-pointer relative" @click="onSeek">
          <div class="h-full bg-synth-neon absolute left-0 top-0 bottom-0 pointer-events-none transition-all duration-75"
            :style="{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }" />
        </div>
        <div class="text-[9px] font-mono text-neutral-500 shrink-0 text-right w-[60px]">
          {{ formatTime(currentTime) }} {{ formatTime(duration) }} 
        </div>
      </div>

      <div class="flex items-center gap-1.5 w-16 shrink-0">
        <Volume2 class="w-3 h-3 text-neutral-500" />
        <input type="range" min="0" max="1" step="0.01" :value="volume" @input="e => $emit('update:volume', parseFloat(e.target.value))"
          class="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-synth-neon" />
      </div>
    </div>

    <div v-if="playlist.length === 0" class="text-center py-8 flex flex-col items-center gap-2">
      <ListMusic class="w-6 h-6 text-neutral-700" />
      <p class="text-xs text-neutral-500">No tracks in playlist.</p>
      <p class="text-[10px] text-neutral-600">Add tracks from the Library tab using the <ListPlus class="w-3 h-3 inline" /> button.</p>
    </div>
    <template v-else>
      <div class="flex flex-col gap-1 overflow-y-auto">
        <div
          v-for="(track, idx) in playlist" :key="`${track.id}-${idx}`"
          draggable="true"
          @click="$emit('play', idx)"
          @dragstart="dragIdxRef = idx"
          @dragover.prevent="dragOverIdx !== idx && (dragOverIdx = idx)"
          @drop.prevent="(e) => { if (dragIdxRef !== null) reorderPlaylist(dragIdxRef, idx); dragIdxRef = null; dragOverIdx = null }"
          @dragend="dragIdxRef = null; dragOverIdx = null"
          :class="['group isolate relative overflow-hidden flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors border', dragOverIdx === idx ? 'bg-synth-neon/5 border-synth-neon/50' : isPlaylistMode && playlistIdx === idx ? 'bg-synth-neon/10 border-synth-neon text-synth-neon' : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800 hover:border-neutral-700']"
        >
          <!-- Progress overlay for current track -->
          <div v-if="isPlaylistMode && playlistIdx === idx"
            class="absolute inset-y-0 left-0 bg-synth-neon/20 pointer-events-none"
            :style="{ width: `${duration > 0 ? Math.min(100, (currentTime / duration) * 100).toFixed(1) : 0}%`, zIndex: -1 }"
          />
          <GripVertical class="w-3 h-3 text-neutral-700 shrink-0 cursor-grab active:cursor-grabbing" />
          <span class="text-[9px] font-mono text-neutral-600 w-4 shrink-0 text-center">{{ idx + 1 }}</span>
          <div class="flex flex-col flex-1 overflow-hidden min-w-0">
            <span class="text-xs font-bold truncate flex items-center gap-1.5">
              {{ track.label }}
              <span v-if="track.bpm" class="text-[9px] font-mono text-emerald-400 bg-emerald-400/10 px-1 rounded">{{ track.bpm }} BPM</span>
            </span>
            <span v-if="track.url?.startsWith('blob:')" class="text-[9px] font-mono text-sky-400 bg-sky-400/10 px-1 rounded w-fit">LOCAL</span>
            <span v-else class="text-[10px] text-neutral-500 uppercase tracking-wider">{{ track.genre }}</span>
          </div>
          <!-- Repeat N× -->
          <div class="flex items-center gap-0.5 shrink-0" @click.stop>
            <button @click="setRepeatForIdx(idx, (playlistRepeats[idx] ?? 1) - 1)" :disabled="(playlistRepeats[idx] ?? 1) <= 1"
              class="w-4 h-4 flex items-center justify-center text-[10px] rounded bg-neutral-800 text-neutral-500 hover:text-white disabled:opacity-20 transition-colors">−</button>
            <span class="text-[9px] font-mono text-neutral-400 w-6 text-center">{{ playlistRepeats[idx] ?? 1 }}×</span>
            <button @click="setRepeatForIdx(idx, (playlistRepeats[idx] ?? 1) + 1)" :disabled="(playlistRepeats[idx] ?? 1) >= 99"
              class="w-4 h-4 flex items-center justify-center text-[10px] rounded bg-neutral-800 text-neutral-500 hover:text-white disabled:opacity-20 transition-colors">+</button>
          </div>
          <!-- Move / Remove -->
          <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" @click.stop>
            <button @click="moveInPlaylist(idx, 'up')" :disabled="idx === 0" class="p-1 text-neutral-600 hover:text-white disabled:opacity-20 transition-colors"><ChevronUp class="w-3 h-3" /></button>
            <button @click="moveInPlaylist(idx, 'down')" :disabled="idx === playlist.length - 1" class="p-1 text-neutral-600 hover:text-white disabled:opacity-20 transition-colors"><ChevronDown class="w-3 h-3" /></button>
            <button @click="removeFromPlaylist(idx)" class="p-1 text-neutral-600 hover:text-red-400 transition-colors"><X class="w-3 h-3" /></button>
          </div>
        </div>
      </div>

      <!-- Crossfade -->
      <div class="flex items-center gap-3 px-1 pt-1 border-t border-neutral-800">
        <span class="text-[9px] font-mono text-neutral-500 uppercase tracking-wider shrink-0">Crossfade</span>
        <input type="range" min="0" max="10" step="0.5" :value="crossfadeSec" @input="e => $emit('update:crossfadeSec', parseFloat(e.target.value))"
          class="flex-1 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-synth-neon" />
        <span class="text-[9px] font-mono text-synth-neon w-8 text-right">{{ crossfadeSec }}s</span>
      </div>

      <div class="flex items-center gap-2 px-1 flex-wrap">
        <button @click="$emit('update:loopPlaylist', !loopPlaylist)"
          :class="['flex items-center gap-1.5 text-[9px] font-bold uppercase px-2 py-1 rounded border transition-colors', loopPlaylist ? 'text-synth-neon border-synth-neon/30 bg-synth-neon/10' : 'text-neutral-500 border-neutral-700 hover:text-white']">
          <Repeat class="w-3 h-3" /> Loop
        </button>
        <button @click="$emit('clear')"
          class="flex items-center gap-1.5 text-[9px] font-bold uppercase px-2 py-1 rounded border text-neutral-600 border-neutral-700 hover:text-red-400 hover:border-red-500/30 transition-colors">
          <Trash2 class="w-3 h-3" /> Clear
        </button>
        <button v-if="!isPlaylistMode && playlist.length > 0" @click="$emit('play', 0)"
          class="flex items-center gap-1.5 text-[9px] font-bold uppercase px-2 py-1 rounded border text-synth-neon border-synth-neon/30 hover:bg-synth-neon/10 transition-colors">
          <Play class="w-3 h-3" /> Play
        </button>
      </div>
      <div v-if="totalPlaylistDuration > 0" class="text-[9px] font-mono text-neutral-500 text-right px-1">
        Total: {{ formatTime(totalPlaylistDuration) }}
      </div>
    </template>


    <div v-if="Object.keys(savedPlaylists).length > 0" class="flex flex-wrap gap-1.5 px-1 pb-2">
      <div v-for="name in Object.keys(savedPlaylists)" :key="name" 
        @click="loadSavedPlaylist(name)"
        class="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1 cursor-pointer hover:bg-neutral-800 hover:border-synth-neon/50 transition-all group/chip"
      >
        <FolderOpen class="w-3 h-3 text-neutral-600 group-hover/chip:text-synth-neon transition-colors" />
        <span class="text-[9px] font-mono text-neutral-400 group-hover/chip:text-white uppercase tracking-wider">{{ name }}</span>
        <button @click.stop="deleteSavedPlaylist(name)" class="ml-1 text-neutral-700 hover:text-red-400 transition-colors" title="Delete Playlist">
          <X class="w-3 h-3" />
        </button>
      </div>
    </div>

    <!-- Save Area -->
    <div v-if="playlist.length > 0" class="px-1 pt-2 border-t border-neutral-800">
      <div v-if="showSaveInput" class="flex items-center gap-2">
        <input type="text" v-model="saveName" placeholder="Playlist name…" autofocus
          @keydown.enter="savePlaylist" @keydown.escape="showSaveInput = false; saveName = ''"
          class="flex-1 min-w-0 bg-black border border-neutral-700 rounded px-2 py-1 text-[9px] text-white outline-none focus:border-synth-neon font-mono" />
        <button @click="savePlaylist" :disabled="!saveName.trim()"
          class="text-[9px] font-bold uppercase px-2 py-1 rounded border text-synth-neon border-synth-neon/30 hover:bg-synth-neon/10 transition-colors disabled:opacity-30">Save</button>
        <button @click="showSaveInput = false; saveName = ''"
          class="text-[9px] font-bold uppercase px-2 py-1 rounded border text-neutral-600 border-neutral-700 hover:text-white transition-colors">
          <X class="w-3 h-3" />
        </button>
      </div>
      <button v-else @click="showSaveInput = true"
        class="flex items-center gap-1.5 text-[9px] font-bold uppercase px-2 py-1 rounded border text-neutral-400 border-neutral-700 hover:text-white transition-colors">
        <Save class="w-3 h-3" /> Save Current Playlist
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ListMusic, ListPlus, GripVertical, ChevronUp, ChevronDown, X, Repeat, Trash2, Play, Save, FolderOpen, SkipBack, SkipForward, Pause, Volume2 } from 'lucide-vue-next'
import { useUiStore } from '@/stores/useUiStore'

const uiStore = useUiStore()

const props = defineProps({
  playlist: { type: Array, required: true },
  playlistRepeats: { type: Array, required: true },
  playlistIdx: { type: Number, required: true },
  playlistCurrentRepeat: { type: Number, required: true },
  crossfadeSec: { type: Number, required: true },
  loopPlaylist: { type: Boolean, required: true },
  isPlaylistMode: { type: Boolean, required: true },
  currentTime: { type: Number, default: 0 },
  duration: { type: Number, default: 0 }, // Duration of current track
  totalPlaylistDuration: { type: Number, default: 0 }, // Total duration of all tracks
  isPlaying: { type: Boolean, default: false },
  volume: { type: Number, default: 0.5 }
})

const emit = defineEmits([
  'update:playlist', 'update:playlistRepeats', 'update:playlistIdx', 
  'update:playlistCurrentRepeat', 'update:crossfadeSec', 'update:loopPlaylist',
  'play', 'clear', 'seek', 'update:volume', 'prev', 'next', 'togglePlay'
])

const dragIdxRef = ref(null)
const dragOverIdx = ref(null)
const saveName = ref('')
const showSaveInput = ref(false)

const SAVED_PL_KEY = 'S1_SAVED_PLAYLISTS'
const savedPlaylists = ref((() => {
  try { return JSON.parse(localStorage.getItem(SAVED_PL_KEY) || '{}') } catch { return {} }
})())

function onSeek(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const pos = (e.clientX - rect.left) / rect.width
  emit('seek', pos)
}

function formatTime(t) {
  if (isNaN(t) || !isFinite(t)) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function removeFromPlaylist(idx) {
  const pl = [...props.playlist]
  pl.splice(idx, 1)
  emit('update:playlist', pl)

  const rp = [...props.playlistRepeats]
  rp.splice(idx, 1)
  emit('update:playlistRepeats', rp)

  let nextIdx = props.playlistIdx
  if (props.playlistIdx === idx) {
    nextIdx = pl.length > 0 ? Math.min(idx, pl.length - 1) : -1
  } else if (props.playlistIdx > idx) {
    nextIdx--
  }
  emit('update:playlistIdx', nextIdx)
}

function reorderPlaylist(fromIdx, toIdx) {
  if (fromIdx === toIdx) return
  const pl = [...props.playlist]
  const [item] = pl.splice(fromIdx, 1)
  pl.splice(toIdx, 0, item)
  emit('update:playlist', pl)

  const rp = [...props.playlistRepeats]
  const [ri] = rp.splice(fromIdx, 1)
  rp.splice(toIdx, 0, ri)
  emit('update:playlistRepeats', rp)

  const cur = props.playlistIdx
  if (cur === fromIdx) emit('update:playlistIdx', toIdx)
  else if (fromIdx < toIdx && cur > fromIdx && cur <= toIdx) emit('update:playlistIdx', cur - 1)
  else if (fromIdx > toIdx && cur >= toIdx && cur < fromIdx) emit('update:playlistIdx', cur + 1)
}

function moveInPlaylist(idx, dir) {
  const swap = dir === 'up' ? idx - 1 : idx + 1
  if (swap < 0 || swap >= props.playlist.length) return
  const pl = [...props.playlist];
  [pl[idx], pl[swap]] = [pl[swap], pl[idx]]
  emit('update:playlist', pl)

  const rp = [...props.playlistRepeats];
  [rp[idx], rp[swap]] = [rp[swap] ?? 1, rp[idx] ?? 1]
  emit('update:playlistRepeats', rp)

  if (props.playlistIdx === idx) emit('update:playlistIdx', swap)
  else if (props.playlistIdx === swap) emit('update:playlistIdx', idx)
}

function setRepeatForIdx(idx, n) {
  const rp = [...props.playlistRepeats]
  rp[idx] = Math.max(1, Math.min(99, n))
  emit('update:playlistRepeats', rp)
}

function savePlaylist() {
  const name = saveName.value.trim()
  if (!name || props.playlist.length === 0) return
  const updated = {
    ...savedPlaylists.value,
    [name]: {
      tracks: props.playlist,
      repeats: props.playlistRepeats,
      crossfadeSec: props.crossfadeSec,
      loopPlaylist: props.loopPlaylist,
      savedAt: new Date().toISOString()
    }
  }
  savedPlaylists.value = updated
  localStorage.setItem(SAVED_PL_KEY, JSON.stringify(updated))
  saveName.value = ''
  showSaveInput.value = false
}

function loadSavedPlaylist(name) {
  if (!name) return
  const pl = savedPlaylists.value[name]
  if (!pl) return
  uiStore.lastPlaylistName = name
  emit('update:playlist', pl.tracks)
  emit('update:playlistRepeats', pl.repeats.length === pl.tracks.length ? pl.repeats : pl.tracks.map(() => 1))
  emit('update:crossfadeSec', pl.crossfadeSec)
  emit('update:loopPlaylist', pl.loopPlaylist)
  emit('update:playlistIdx', -1)
  emit('update:playlistCurrentRepeat', 1)
}

function deleteSavedPlaylist(name) {
  const updated = { ...savedPlaylists.value }
  delete updated[name]
  savedPlaylists.value = updated
  localStorage.setItem(SAVED_PL_KEY, JSON.stringify(updated))
  if (uiStore.lastPlaylistName === name) {
    uiStore.lastPlaylistName = ''
  }
}
onMounted(() => {
  if (uiStore.lastPlaylistName && savedPlaylists.value[uiStore.lastPlaylistName]) {
    loadSavedPlaylist(uiStore.lastPlaylistName)
  }
})
</script>
