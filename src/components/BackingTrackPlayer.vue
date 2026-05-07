<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  Play, Pause, Volume2, Upload, Music, X, ListMusic,
  Plus, Trash2, Edit2, Repeat, ListPlus, ChevronUp, ChevronDown,
  Save, FolderOpen, GripVertical, SkipBack, SkipForward, Link
} from 'lucide-vue-next'
import { useDraggable } from '@/composables/useDraggable'
import {
  collection, onSnapshot, query, orderBy, addDoc,
  serverTimestamp, deleteDoc, doc, updateDoc, deleteField
} from '@/lib/idb'
import { db } from '@/lib/firebase'

const props = defineProps({
  isAdmin: { type: Boolean, default: false },
})
const emit = defineEmits(['srcChange'])

// ── Reactive state ────────────────────────────────────────────────────────────
const isOpen          = ref(false)
const src             = ref(null)
const isPlaying       = ref(false)
const volume          = ref(0.5)
const currentTime     = ref(0)
const duration        = ref(0)
const inputType       = ref('list')
const isLooping       = ref(true)
const urlInput        = ref('')
const fileName        = ref('')

const isAdding        = ref(false)
const newTrackUrl     = ref('')
const newTrackLabel   = ref('')
const newTrackGenre   = ref('')
const editingTrackId  = ref(null)
const deletingTrackId = ref(null)
const tracks          = ref([])
const detectedBpm     = ref(null)
const newTrackBpm     = ref('')
const playingTrack    = ref(null)
const pendingLocalFile = ref(null)

const playlist            = ref([])
const playlistRepeats     = ref([])
const playlistIdx         = ref(-1)
const playlistCurrentRepeat = ref(1)
const crossfadeSec        = ref(3)
const loopPlaylist        = ref(true)
const saveName            = ref('')
const showSaveInput       = ref(false)
const dragOverIdx         = ref(null)

const { x: panelX, y: panelY, startDrag } = useDraggable(
  Math.max(8, (window.innerWidth  - 600) / 2),
  Math.max(8,  window.innerHeight - 560),
  'S1_BT_POS'
)

const SAVED_PL_KEY = 'S1_SAVED_PLAYLISTS'
const savedPlaylists = ref((() => {
  try { return JSON.parse(localStorage.getItem(SAVED_PL_KEY) || '{}') } catch { return {} }
})())

// ── DOM refs ──────────────────────────────────────────────────────────────────
const audioRefA = ref(null)
const audioRefB = ref(null)

// ── Plain mutable (non-reactive) ──────────────────────────────────────────────
let activeSlot       = 'a'
let isCrossfadingRef = false
let crossfadeTimerRef = null
let volumeRef        = 0.5
let dragIdxRef       = null

// ── Computed ──────────────────────────────────────────────────────────────────
const isPlaylistMode = computed(() => playlistIdx.value >= 0 && playlist.value.length > 0)
const loopAttr       = computed(() => isPlaylistMode.value ? false : isLooping.value)

// Keep volumeRef in sync (used inside crossfade tick where .value isn't available)
watch(volume, v => { volumeRef = v })

// Volume → both elements (skip during crossfade)
watch(volume, v => {
  if (isCrossfadingRef) return
  if (audioRefA.value) audioRefA.value.volume = v
  if (audioRefB.value) audioRefB.value.volume = v
})

watch(src, v => emit('srcChange', v))

// ── Helpers ───────────────────────────────────────────────────────────────────
function getPrimary() { return activeSlot === 'a' ? audioRefA.value : audioRefB.value }

function formatTime(t) {
  if (isNaN(t) || !isFinite(t)) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ── Playlist helpers ──────────────────────────────────────────────────────────
function getNextIdx(idx) {
  if (playlist.value.length === 0) return null
  const next = idx + 1
  return next < playlist.value.length ? next : (loopPlaylist.value ? 0 : null)
}

function startCrossfade(nextTrack, nextIdx, fadeSec) {
  if (isCrossfadingRef) return
  isCrossfadingRef = true
  if (crossfadeTimerRef) clearTimeout(crossfadeTimerRef)

  const from = activeSlot === 'a' ? audioRefA.value : audioRefB.value
  const to   = activeSlot === 'a' ? audioRefB.value : audioRefA.value
  if (!from || !to) { isCrossfadingRef = false; return }

  const vol = volumeRef
  const steps = Math.max(10, Math.round(fadeSec * 30))
  const stepMs = (fadeSec * 1000) / steps
  let step = 0

  to.src = nextTrack.url
  to.volume = 0
  to.play().catch(console.error)

  const tick = () => {
    step++
    const t = step / steps
    from.volume = Math.max(0, (1 - t) * vol)
    to.volume   = Math.min(vol, t * vol)
    if (step < steps) {
      crossfadeTimerRef = window.setTimeout(tick, stepMs)
    } else {
      from.pause()
      from.volume = vol
      activeSlot = activeSlot === 'a' ? 'b' : 'a'
      const newPrimary = activeSlot === 'a' ? audioRefA.value : audioRefB.value
      src.value = nextTrack.url
      playingTrack.value = nextTrack
      fileName.value = nextTrack.label
      playlistIdx.value = nextIdx
      currentTime.value = newPrimary?.currentTime ?? 0
      const d = newPrimary?.duration ?? NaN
      duration.value = isFinite(d) ? d : 0
      if (nextTrack.bpm) {
        detectedBpm.value = nextTrack.bpm
        window.dispatchEvent(new CustomEvent('bpm-update', { detail: { bpm: nextTrack.bpm } }))
      }
      isCrossfadingRef = false
    }
  }
  crossfadeTimerRef = window.setTimeout(tick, stepMs)
}

function handlePrimaryEnded(slot) {
  if (activeSlot !== slot || isCrossfadingRef) return
  if (isPlaylistMode.value) {
    const repeatCount = playlistRepeats.value[playlistIdx.value] ?? 1
    if (playlistCurrentRepeat.value < repeatCount) {
      const audio = activeSlot === 'a' ? audioRefA.value : audioRefB.value
      if (audio) { audio.currentTime = 0; audio.play().catch(console.error) }
      playlistCurrentRepeat.value++
      currentTime.value = 0
      return
    }
    playlistCurrentRepeat.value = 1
    const nextIdx = getNextIdx(playlistIdx.value)
    if (nextIdx !== null) {
      const nextTrack = playlist.value[nextIdx]
      const audio = activeSlot === 'a' ? audioRefA.value : audioRefB.value
      if (!audio) return
      audio.src = nextTrack.url
      audio.volume = volumeRef
      audio.play().catch(console.error)
      src.value = nextTrack.url
      playingTrack.value = nextTrack
      fileName.value = nextTrack.label
      playlistIdx.value = nextIdx
      currentTime.value = 0
      if (nextTrack.bpm) {
        detectedBpm.value = nextTrack.bpm
        window.dispatchEvent(new CustomEvent('bpm-update', { detail: { bpm: nextTrack.bpm } }))
      }
    } else {
      isPlaying.value = false
      playlistIdx.value = -1
    }
  } else {
    isPlaying.value = false
  }
}

function handlePrimaryTimeUpdate(slot, ct, dur) {
  if (activeSlot !== slot) return
  currentTime.value = ct
  if (!isPlaylistMode.value || isCrossfadingRef || dur <= 0 || isNaN(dur) || ct < 0.5) return
  const isLastRepeat = playlistCurrentRepeat.value >= (playlistRepeats.value[playlistIdx.value] ?? 1)
  if (!isLastRepeat) return
  const timeLeft = dur - ct
  if (timeLeft <= crossfadeSec.value && timeLeft > 0.1) {
    const nextIdx = getNextIdx(playlistIdx.value)
    if (nextIdx !== null) {
      startCrossfade(playlist.value[nextIdx], nextIdx, Math.min(crossfadeSec.value, timeLeft - 0.05))
    }
  }
}

// ── Load helpers ──────────────────────────────────────────────────────────────
function loadDirect(url, track, label) {
  if (isCrossfadingRef) {
    if (crossfadeTimerRef) clearTimeout(crossfadeTimerRef)
    isCrossfadingRef = false
    audioRefA.value?.pause()
    audioRefB.value?.pause()
  }
  activeSlot = 'a'
  const audio = audioRefA.value
  if (!audio) return
  audio.src = url
  audio.volume = volumeRef
  src.value = url
  playingTrack.value = track
  fileName.value = label
  isPlaying.value = false
  currentTime.value = 0
  playlistIdx.value = -1
  if (track?.bpm) {
    detectedBpm.value = track.bpm
    window.dispatchEvent(new CustomEvent('bpm-update', { detail: { bpm: track.bpm } }))
  }
}

function playTrack(track) {
  if (editingTrackId.value) return
  loadDirect(track.url, track, track.label)
}

function playFromPlaylist(idx) {
  const track = playlist.value[idx]
  if (!track) return
  if (isCrossfadingRef) {
    if (crossfadeTimerRef) clearTimeout(crossfadeTimerRef)
    isCrossfadingRef = false
    audioRefA.value?.pause()
    audioRefB.value?.pause()
  }
  activeSlot = 'a'
  const audio = audioRefA.value
  if (!audio) return
  audio.src = track.url
  audio.volume = volumeRef
  audio.play().catch(console.error)
  src.value = track.url
  playingTrack.value = track
  fileName.value = track.label
  playlistIdx.value = idx
  playlistCurrentRepeat.value = 1
  isPlaying.value = true
  currentTime.value = 0
  if (track.bpm) {
    detectedBpm.value = track.bpm
    window.dispatchEvent(new CustomEvent('bpm-update', { detail: { bpm: track.bpm } }))
  }
}

function handleFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  if (pendingLocalFile.value) URL.revokeObjectURL(pendingLocalFile.value.url)
  pendingLocalFile.value = { url: URL.createObjectURL(file), name: file.name }
}

function loadLocalFile() {
  if (!pendingLocalFile.value) return
  loadDirect(pendingLocalFile.value.url, null, pendingLocalFile.value.name)
  pendingLocalFile.value = null
}

function addLocalFileToPlaylist() {
  if (!pendingLocalFile.value) return
  addToPlaylist({ id: `local_${Date.now()}`, url: pendingLocalFile.value.url, label: pendingLocalFile.value.name.replace(/\.[^.]+$/, ''), genre: '' })
  pendingLocalFile.value = null
  inputType.value = 'playlist'
}

function handleUrlSubmit(e) {
  e.preventDefault()
  if (urlInput.value) loadDirect(urlInput.value, null, urlInput.value.split('/').pop() || 'URL Audio')
}

function togglePlay() {
  const audio = getPrimary()
  if (!audio || !src.value) return
  const next = !isPlaying.value
  if (next) audio.play(); else audio.pause()
  isPlaying.value = next
  if (localStorage.getItem('S1_SYNC_TRACK') === 'true') {
    window.dispatchEvent(new CustomEvent('toggle-sequencer', { detail: { play: next, source: 'backing-track' } }))
  }
}

function seekTo(e) {
  const audio = getPrimary()
  if (!audio || !duration.value) return
  const rect = e.currentTarget.getBoundingClientRect()
  const pos = (e.clientX - rect.left) / rect.width
  audio.currentTime = pos * duration.value
  currentTime.value = pos * duration.value
}

// ── Playlist management ───────────────────────────────────────────────────────
function addToPlaylist(track) {
  playlist.value = [...playlist.value, track]
  playlistRepeats.value = [...playlistRepeats.value, 1]
}

function removeFromPlaylist(idx) {
  const next = playlist.value.filter((_, i) => i !== idx)
  playlist.value = next
  playlistRepeats.value = playlistRepeats.value.filter((_, i) => i !== idx)
  if (playlistIdx.value === idx) {
    playlistIdx.value = next.length > 0 ? Math.min(idx, next.length - 1) : -1
  } else if (playlistIdx.value > idx) {
    playlistIdx.value--
  }
}

function reorderPlaylist(fromIdx, toIdx) {
  if (fromIdx === toIdx) return
  const pl = [...playlist.value]
  const [item] = pl.splice(fromIdx, 1)
  pl.splice(toIdx, 0, item)
  playlist.value = pl
  const rp = [...playlistRepeats.value]
  const [ri] = rp.splice(fromIdx, 1)
  rp.splice(toIdx, 0, ri)
  playlistRepeats.value = rp
  const cur = playlistIdx.value
  if (cur === fromIdx) playlistIdx.value = toIdx
  else if (fromIdx < toIdx && cur > fromIdx && cur <= toIdx) playlistIdx.value = cur - 1
  else if (fromIdx > toIdx && cur >= toIdx && cur < fromIdx) playlistIdx.value = cur + 1
}

function moveInPlaylist(idx, dir) {
  const swap = dir === 'up' ? idx - 1 : idx + 1
  if (swap < 0 || swap >= playlist.value.length) return
  const pl = [...playlist.value];
  [pl[idx], pl[swap]] = [pl[swap], pl[idx]]
  playlist.value = pl
  const rp = [...playlistRepeats.value];
  [rp[idx], rp[swap]] = [rp[swap] ?? 1, rp[idx] ?? 1]
  playlistRepeats.value = rp
  if (playlistIdx.value === idx) playlistIdx.value = swap
  else if (playlistIdx.value === swap) playlistIdx.value = idx
}

function setRepeatForIdx(idx, n) {
  const rp = [...playlistRepeats.value]
  rp[idx] = Math.max(1, Math.min(99, n))
  playlistRepeats.value = rp
}

function savePlaylist() {
  const name = saveName.value.trim()
  if (!name || playlist.value.length === 0) return
  const updated = {
    ...savedPlaylists.value,
    [name]: { tracks: playlist.value, repeats: playlistRepeats.value, crossfadeSec: crossfadeSec.value, loopPlaylist: loopPlaylist.value, savedAt: new Date().toISOString() }
  }
  savedPlaylists.value = updated
  localStorage.setItem(SAVED_PL_KEY, JSON.stringify(updated))
  saveName.value = ''; showSaveInput.value = false
}

function loadSavedPlaylist(name) {
  const pl = savedPlaylists.value[name]
  if (!pl) return
  playlist.value = pl.tracks
  playlistRepeats.value = pl.repeats.length === pl.tracks.length ? pl.repeats : pl.tracks.map(() => 1)
  crossfadeSec.value = pl.crossfadeSec
  loopPlaylist.value = pl.loopPlaylist
  playlistIdx.value = -1; playlistCurrentRepeat.value = 1
}

function deleteSavedPlaylist(name) {
  const updated = { ...savedPlaylists.value }
  delete updated[name]
  savedPlaylists.value = updated
  localStorage.setItem(SAVED_PL_KEY, JSON.stringify(updated))
}

function playlistPrev() {
  if (!isPlaylistMode.value) return
  playFromPlaylist(((playlistIdx.value - 1) + playlist.value.length) % playlist.value.length)
}

function playlistNext() {
  if (!isPlaylistMode.value || isCrossfadingRef) return
  const nextIdx = getNextIdx(playlistIdx.value)
  if (nextIdx === null) return
  const audio = getPrimary()
  const timeLeft = audio && isFinite(audio.duration) ? Math.max(0.2, audio.duration - audio.currentTime) : crossfadeSec.value
  startCrossfade(playlist.value[nextIdx], nextIdx, Math.min(crossfadeSec.value, timeLeft))
}

// ── Admin CRUD ────────────────────────────────────────────────────────────────
function cancelAdd() { isAdding.value = false; newTrackUrl.value = ''; newTrackLabel.value = ''; newTrackGenre.value = ''; newTrackBpm.value = '' }
function cancelEdit() { editingTrackId.value = null; newTrackUrl.value = ''; newTrackLabel.value = ''; newTrackGenre.value = ''; newTrackBpm.value = '' }

async function addTrack(e) {
  e.preventDefault()
  if (!newTrackUrl.value || !newTrackLabel.value || !newTrackGenre.value) return
  try {
    const data = { url: newTrackUrl.value, label: newTrackLabel.value, genre: newTrackGenre.value, createdAt: serverTimestamp() }
    if (newTrackBpm.value !== '') data.bpm = Number(newTrackBpm.value)
    await addDoc(collection(db, 'backing_tracks'), data)
    cancelAdd()
  } catch (err) { console.error('Failed to add track:', err) }
}

async function saveEditTrack(e) {
  e.preventDefault()
  if (!editingTrackId.value || !newTrackUrl.value || !newTrackLabel.value || !newTrackGenre.value) return
  try {
    const data = { url: newTrackUrl.value, label: newTrackLabel.value, genre: newTrackGenre.value }
    data.bpm = newTrackBpm.value !== '' ? Number(newTrackBpm.value) : deleteField()
    await updateDoc(doc(db, 'backing_tracks', editingTrackId.value), data)
    cancelEdit()
  } catch (err) { console.error('Failed to edit track:', err) }
}

function startEditTrack(track, e) {
  e.stopPropagation()
  isAdding.value = false
  editingTrackId.value = track.id
  newTrackUrl.value = track.url; newTrackLabel.value = track.label; newTrackGenre.value = track.genre; newTrackBpm.value = track.bpm || ''
}

async function deleteTrack(id, e) {
  e.stopPropagation()
  try { await deleteDoc(doc(db, 'backing_tracks', id)); deletingTrackId.value = null }
  catch (err) { console.error('Failed to delete track:', err) }
}

function onLoadedMeta(slot, d) {
  if (activeSlot !== slot) return
  duration.value = d; currentTime.value = 0
  if (props.isAdmin && playingTrack.value && !playingTrack.value.duration && d && isFinite(d)) {
    updateDoc(doc(db, 'backing_tracks', playingTrack.value.id), { duration: d }).catch(console.error)
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
let _unsubTracks = null
let _handlers = {}

onMounted(() => {
  const q = query(collection(db, 'backing_tracks'), orderBy('createdAt', 'desc'))
  _unsubTracks = onSnapshot(q, (snapshot) => {
    const ts = []
    snapshot.forEach(d => ts.push({ id: d.id, ...d.data() }))
    tracks.value = ts
  })

  const handleToggle = (e) => {
    const audio = activeSlot === 'a' ? audioRefA.value : audioRefB.value
    if (!audio || !src.value) return
    const restart = e.detail?.restart
    if (restart) { audio.currentTime = 0; currentTime.value = 0 }
    const play = e.detail?.play
    if (play === undefined) {
      if (isPlaying.value) audio.pause(); else audio.play()
      isPlaying.value = !isPlaying.value
    } else if (play && !isPlaying.value) {
      audio.play(); isPlaying.value = true
    } else if (!play && isPlaying.value) {
      audio.pause(); isPlaying.value = false
    }
  }

  const handlePlayStop = () => {
    const audio = activeSlot === 'a' ? audioRefA.value : audioRefB.value
    if (!audio || !src.value) return
    if (isPlaying.value) { audio.pause(); isPlaying.value = false }
    else { audio.play().catch(console.error); isPlaying.value = true }
  }

  const handleNext = () => {
    if (!isPlaylistMode.value || isCrossfadingRef) return
    const nextIdx = getNextIdx(playlistIdx.value)
    if (nextIdx === null) return
    const audio = getPrimary()
    const timeLeft = audio && isFinite(audio.duration) ? Math.max(0.2, audio.duration - audio.currentTime) : crossfadeSec.value
    startCrossfade(playlist.value[nextIdx], nextIdx, Math.min(crossfadeSec.value, timeLeft))
  }

  const handleAddFromCapture = (e) => {
    const { url, label } = e.detail || {}
    if (!url) return
    addToPlaylist({ id: `rec_${Date.now()}`, url, label, genre: 'Recording' })
    inputType.value = 'playlist'; isOpen.value = true
  }

  window.addEventListener('toggle-backing-track', handleToggle)
  window.addEventListener('playlist-play-stop', handlePlayStop)
  window.addEventListener('playlist-next', handleNext)
  window.addEventListener('playlist-add-from-capture', handleAddFromCapture)
  _handlers = { handleToggle, handlePlayStop, handleNext, handleAddFromCapture }
})

onUnmounted(() => {
  _unsubTracks?.()
  if (crossfadeTimerRef) clearTimeout(crossfadeTimerRef)
  window.removeEventListener('toggle-backing-track', _handlers.handleToggle)
  window.removeEventListener('playlist-play-stop', _handlers.handlePlayStop)
  window.removeEventListener('playlist-next', _handlers.handleNext)
  window.removeEventListener('playlist-add-from-capture', _handlers.handleAddFromCapture)
})
</script>

<template>
  <div class="relative z-[90] flex flex-col items-center justify-center gap-1">

    <!-- ── Status bar ── -->
    <div class="flex items-center gap-3 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1">

      <button
        @click="isOpen = !isOpen"
        :class="['flex items-center justify-center gap-1 transition-colors', isOpen || isPlaying ? 'text-synth-neon' : 'text-neutral-400 hover:text-synth-neon']"
        title="Audio Settings"
      >
        <Music :class="['w-3.5 h-3.5', isPlaying ? 'animate-pulse' : '']" />
        <span v-if="isPlaylistMode" class="text-[8px] font-mono text-synth-neon/70">{{ playlistIdx + 1 }}/{{ playlist.length }}</span>
      </button>

      <template v-if="src">
        <button v-if="isPlaylistMode" @click="playlistPrev" title="Previous track"
          class="text-neutral-500 hover:text-synth-neon transition-colors hidden md:block">
          <SkipBack class="w-3.5 h-3.5" />
        </button>

        <button @click="togglePlay" class="text-white hover:text-synth-neon transition-colors">
          <Pause v-if="isPlaying" class="w-3.5 h-3.5 fill-current" />
          <Play v-else class="w-3.5 h-3.5 fill-current" />
        </button>

        <button v-if="isPlaylistMode" @click="playlistNext" title="Next track (crossfade)"
          class="text-neutral-500 hover:text-synth-neon transition-colors hidden md:block">
          <SkipForward class="w-3.5 h-3.5" />
        </button>
        <button v-else
          @click="isLooping = !isLooping"
          :class="['transition-colors hidden md:block', isLooping ? 'text-synth-neon' : 'text-neutral-500 hover:text-white']"
          title="Toggle Loop"
        >
          <Repeat class="w-3.5 h-3.5" />
        </button>

        <!-- Progress -->
        <div class="w-32 hidden md:flex items-center">
          <div
            class="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden cursor-pointer relative"
            @click="seekTo"
          >
            <div
              class="h-full bg-synth-neon absolute left-0 top-0 bottom-0 pointer-events-none transition-all duration-75"
              :style="{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }"
            />
          </div>
        </div>

        <!-- Volume -->
        <div class="items-center gap-1.5 w-16 hidden md:flex">
          <Volume2 class="w-3 h-3 text-neutral-500" />
          <input type="range" min="0" max="1" step="0.01" :value="volume"
            @input="e => volume = parseFloat(e.target.value)"
            class="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-synth-neon" />
        </div>

        <!-- Time -->
        <div class="text-[9px] font-mono text-neutral-500 w-[60px] hidden md:block text-right">
          {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
        </div>
      </template>

      <span v-else class="text-[9px] text-neutral-500 tracking-widest hidden md:inline">NO TRACK</span>
    </div>

    <!-- Track name + BPM -->
    <span v-if="src" class="text-[9px] font-mono flex gap-1 items-center whitespace-nowrap overflow-hidden text-ellipsis max-w-[250px] text-center" :title="fileName">
      <span class="text-synth-neon">{{ fileName || 'Audio Track' }}</span>
      <span v-if="detectedBpm" class="text-emerald-400 font-bold ml-1">({{ detectedBpm }} BPM)</span>
    </span>

    <!-- ── Settings panel (teleported to avoid overflow-hidden clipping) ── -->
    <Teleport to="body">
    <Transition name="panel-up">
      <div
        v-if="isOpen"
        :style="{ left: panelX + 'px', top: panelY + 'px' }"
        class="fixed w-[90vw] md:w-[600px] max-h-[80vh] flex flex-col bg-black/95 backdrop-blur-xl border border-neutral-800 rounded-2xl shadow-[0_0_50px_rgba(0,163,112,0.15)] p-4 md:p-6 z-[220]"
      >
        <!-- Header -->
        <div class="flex items-center mb-4 shrink-0">
          <!-- Drag handle -->
          <div class="flex items-center gap-2 flex-1 min-w-0 cursor-grab active:cursor-grabbing select-none"
               @mousedown="startDrag">
            <GripVertical class="w-3 h-3 text-neutral-600 shrink-0" />
            <Music class="w-3 h-3 text-synth-neon shrink-0" />
            <h3 class="text-xs font-black uppercase tracking-widest text-neutral-400 truncate">Track Source</h3>
          </div>
          <button @click="isOpen = false" class="ml-3 text-neutral-600 hover:text-white transition-colors shrink-0">
            <X class="w-3 h-3" />
          </button>
        </div>

        <!-- Tabs -->
        <div class="flex bg-neutral-900 rounded-lg p-1 mb-3 shrink-0 gap-0.5">
          <button
            v-for="tab in ['list', 'playlist']" :key="tab"
            @click="inputType = tab"
            :class="['flex-1 flex items-center justify-center gap-1.5 text-[9px] font-black uppercase tracking-widest py-1.5 rounded transition-all', inputType === tab ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300']"
          >
            <template v-if="tab === 'list'">Library</template>
            <template v-else>
              Playlist
              <span v-if="playlist.length > 0" class="px-1 py-0.5 rounded bg-synth-neon/20 text-synth-neon text-[8px] font-mono leading-none">{{ playlist.length }}</span>
            </template>
          </button>
          <template v-if="isAdmin">
            <button v-for="tab in ['url', 'file']" :key="tab"
              @click="inputType = tab"
              :class="['flex-1 text-[9px] font-black uppercase tracking-widest py-1.5 rounded transition-all', inputType === tab ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300']"
            >{{ tab }}</button>
          </template>
        </div>

        <!-- Tab content -->
        <div class="flex-1 overflow-y-auto custom-scrollbar space-y-3 min-h-0 pr-2">

          <!-- ── LIBRARY ── -->
          <div v-if="inputType === 'list'" class="flex flex-col gap-2">
            <button v-if="isAdmin && !isAdding" @click="isAdding = true"
              class="w-full py-2 border border-dashed border-synth-neon text-synth-neon hover:bg-synth-neon/10 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-colors">
              <Plus class="w-3 h-3" /> Add Backing Track
            </button>

            <!-- Add form -->
            <form v-if="isAdmin && isAdding" @submit="addTrack" class="flex flex-col gap-2 bg-neutral-900 p-3 rounded-lg border border-neutral-800">
              <input type="url" placeholder="MP3 URL" v-model="newTrackUrl" class="w-full bg-black border border-neutral-800 rounded px-2 py-1.5 text-xs text-white focus:border-synth-neon outline-none" required />
              <input type="text" placeholder="Label" v-model="newTrackLabel" class="w-full bg-black border border-neutral-800 rounded px-2 py-1.5 text-xs text-white focus:border-synth-neon outline-none" required />
              <input type="text" placeholder="Genre" v-model="newTrackGenre" class="w-full bg-black border border-neutral-800 rounded px-2 py-1.5 text-xs text-white focus:border-synth-neon outline-none" required />
              <input type="number" placeholder="BPM (optional)" v-model="newTrackBpm" min="1" max="500" class="w-full bg-black border border-neutral-800 rounded px-2 py-1.5 text-xs text-white focus:border-synth-neon outline-none" />
              <div class="flex gap-2 mt-1">
                <button type="submit" class="flex-1 bg-synth-neon text-black text-xs font-bold py-1.5 rounded hover:bg-white transition-colors">Save</button>
                <button type="button" @click="cancelAdd" class="px-3 bg-neutral-800 text-white text-xs font-bold py-1.5 rounded hover:bg-neutral-700 transition-colors">Cancel</button>
              </div>
            </form>

            <div v-if="tracks.length === 0" class="text-center text-xs text-neutral-500 py-4">No tracks available.</div>
            <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <template v-for="track in tracks" :key="track.id">
                <!-- Edit form for this track -->
                <div v-if="editingTrackId === track.id" @click.stop>
                  <form @submit="saveEditTrack" class="flex flex-col gap-2 bg-neutral-900 p-3 rounded-lg border border-neutral-800">
                    <input type="url" placeholder="MP3 URL" v-model="newTrackUrl" class="w-full bg-black border border-neutral-800 rounded px-2 py-1.5 text-xs text-white focus:border-synth-neon outline-none" required />
                    <input type="text" placeholder="Label" v-model="newTrackLabel" class="w-full bg-black border border-neutral-800 rounded px-2 py-1.5 text-xs text-white focus:border-synth-neon outline-none" required />
                    <input type="text" placeholder="Genre" v-model="newTrackGenre" class="w-full bg-black border border-neutral-800 rounded px-2 py-1.5 text-xs text-white focus:border-synth-neon outline-none" required />
                    <input type="number" placeholder="BPM (optional)" v-model="newTrackBpm" min="1" max="500" class="w-full bg-black border border-neutral-800 rounded px-2 py-1.5 text-xs text-white focus:border-synth-neon outline-none" />
                    <div class="flex gap-2 mt-1">
                      <button type="submit" class="flex-1 bg-synth-neon text-black text-xs font-bold py-1.5 rounded hover:bg-white transition-colors">Save</button>
                      <button type="button" @click="cancelEdit" class="px-3 bg-neutral-800 text-white text-xs font-bold py-1.5 rounded hover:bg-neutral-700 transition-colors">Cancel</button>
                    </div>
                  </form>
                </div>
                <!-- Track card -->
                <div v-else
                  @click="playTrack(track)"
                  :class="['group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors border', src === track.url && !isPlaylistMode ? 'bg-synth-neon/10 border-synth-neon text-synth-neon' : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800 hover:border-neutral-700']"
                >
                  <div class="flex flex-col overflow-hidden">
                    <span class="text-xs font-bold truncate flex items-center gap-2">
                      {{ track.label }}
                      <span v-if="track.bpm" class="text-[9px] font-mono text-emerald-400 bg-emerald-400/10 px-1 rounded">{{ track.bpm }} BPM</span>
                      <span v-if="track.duration" class="text-[9px] font-mono text-neutral-400 bg-neutral-800 px-1 rounded">{{ formatTime(track.duration) }}</span>
                    </span>
                    <span class="text-[10px] text-neutral-500 uppercase tracking-wider">{{ track.genre }}</span>
                  </div>
                  <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button @click.stop="addToPlaylist(track)" title="Add to playlist" class="p-1 text-neutral-500 hover:text-synth-neon transition-colors">
                      <ListPlus class="w-3.5 h-3.5" />
                    </button>
                    <template v-if="isAdmin">
                      <template v-if="deletingTrackId === track.id">
                        <span class="text-[10px] text-neutral-400 font-bold uppercase tracking-wider pr-1">Sure?</span>
                        <button @click.stop="deleteTrack(track.id, $event)" class="px-2 py-0.5 bg-red-500/20 text-red-400 rounded hover:bg-red-500/40 text-[10px] uppercase font-bold transition-colors">Yes</button>
                        <button @click.stop="deletingTrackId = null" class="px-2 py-0.5 bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700 text-[10px] uppercase font-bold transition-colors">No</button>
                      </template>
                      <template v-else>
                        <button @click="startEditTrack(track, $event)" class="p-1 text-neutral-500 hover:text-white transition-colors" title="Edit Track">
                          <Edit2 class="w-3.5 h-3.5" />
                        </button>
                        <button @click.stop="deletingTrackId = track.id" class="p-1 text-neutral-500 hover:text-red-400 transition-colors" title="Delete Track">
                          <Trash2 class="w-3.5 h-3.5" />
                        </button>
                      </template>
                    </template>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- ── PLAYLIST ── -->
          <div v-if="inputType === 'playlist'" class="flex flex-col gap-3">
            <div v-if="playlist.length === 0" class="text-center py-8 flex flex-col items-center gap-2">
              <ListMusic class="w-6 h-6 text-neutral-700" />
              <p class="text-xs text-neutral-500">No tracks in playlist.</p>
              <p class="text-[10px] text-neutral-600">Add tracks from the Library tab using the <ListPlus class="w-3 h-3 inline" /> button.</p>
            </div>
            <template v-else>
              <div class="flex flex-col gap-1">
                <div
                  v-for="(track, idx) in playlist" :key="`${track.id}-${idx}`"
                  draggable="true"
                  @click="playFromPlaylist(idx)"
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
                    <span v-if="track.url.startsWith('blob:')" class="text-[9px] font-mono text-sky-400 bg-sky-400/10 px-1 rounded w-fit">LOCAL</span>
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
                <input type="range" min="0" max="10" step="0.5" :value="crossfadeSec" @input="e => crossfadeSec = parseFloat(e.target.value)"
                  class="flex-1 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-synth-neon" />
                <span class="text-[9px] font-mono text-synth-neon w-8 text-right">{{ crossfadeSec }}s</span>
              </div>

              <div class="flex items-center gap-2 px-1 flex-wrap">
                <button @click="loopPlaylist = !loopPlaylist"
                  :class="['flex items-center gap-1.5 text-[9px] font-bold uppercase px-2 py-1 rounded border transition-colors', loopPlaylist ? 'text-synth-neon border-synth-neon/30 bg-synth-neon/10' : 'text-neutral-500 border-neutral-700 hover:text-white']">
                  <Repeat class="w-3 h-3" /> Loop
                </button>
                <button @click="playlist = []; playlistRepeats = []; playlistIdx = -1"
                  class="flex items-center gap-1.5 text-[9px] font-bold uppercase px-2 py-1 rounded border text-neutral-600 border-neutral-700 hover:text-red-400 hover:border-red-500/30 transition-colors">
                  <Trash2 class="w-3 h-3" /> Clear
                </button>
                <button v-if="!isPlaylistMode && playlist.length > 0" @click="playFromPlaylist(0)"
                  class="flex items-center gap-1.5 text-[9px] font-bold uppercase px-2 py-1 rounded border text-synth-neon border-synth-neon/30 hover:bg-synth-neon/10 transition-colors">
                  <Play class="w-3 h-3" /> Play
                </button>
              </div>
            </template>

            <!-- Save / Load -->
            <div v-if="playlist.length > 0 || Object.keys(savedPlaylists).length > 0" class="flex items-center gap-2 px-1 pt-2 border-t border-neutral-800 flex-wrap">
              <template v-if="playlist.length > 0">
                <template v-if="showSaveInput">
                  <input type="text" v-model="saveName" placeholder="Playlist name…" autofocus
                    @keydown.enter="savePlaylist" @keydown.escape="showSaveInput = false; saveName = ''"
                    class="flex-1 min-w-0 bg-black border border-neutral-700 rounded px-2 py-1 text-[9px] text-white outline-none focus:border-synth-neon font-mono" />
                  <button @click="savePlaylist" :disabled="!saveName.trim()"
                    class="text-[9px] font-bold uppercase px-2 py-1 rounded border text-synth-neon border-synth-neon/30 hover:bg-synth-neon/10 transition-colors disabled:opacity-30">Save</button>
                  <button @click="showSaveInput = false; saveName = ''"
                    class="text-[9px] font-bold uppercase px-2 py-1 rounded border text-neutral-600 border-neutral-700 hover:text-white transition-colors">
                    <X class="w-3 h-3" />
                  </button>
                </template>
                <button v-else @click="showSaveInput = true"
                  class="flex items-center gap-1.5 text-[9px] font-bold uppercase px-2 py-1 rounded border text-neutral-400 border-neutral-700 hover:text-white transition-colors">
                  <Save class="w-3 h-3" /> Save
                </button>
              </template>
              <select v-if="Object.keys(savedPlaylists).length > 0"
                @change="e => { if (e.target.value) { loadSavedPlaylist(e.target.value); e.target.value = '' } }"
                class="flex-1 min-w-0 bg-black border border-neutral-700 rounded px-2 py-1 text-[9px] text-neutral-400 outline-none focus:border-synth-neon font-mono"
              >
                <option value="">Load…</option>
                <option v-for="name in Object.keys(savedPlaylists)" :key="name" :value="name">{{ name }} ({{ savedPlaylists[name].tracks.length }} tracks)</option>
              </select>
            </div>

            <!-- Saved playlist chips -->
            <div v-if="Object.keys(savedPlaylists).length > 0" class="flex flex-wrap gap-1 px-1">
              <span v-for="name in Object.keys(savedPlaylists)" :key="name" class="flex items-center gap-1 bg-neutral-900 border border-neutral-800 rounded px-1.5 py-0.5">
                <FolderOpen class="w-2.5 h-2.5 text-neutral-600" />
                <span class="text-[8px] font-mono text-neutral-500">{{ name }}</span>
                <button @click="deleteSavedPlaylist(name)" class="text-neutral-700 hover:text-red-400 transition-colors"><X class="w-2.5 h-2.5" /></button>
              </span>
            </div>
          </div>

          <!-- ── URL (admin) ── -->
          <form v-if="inputType === 'url'" @submit="handleUrlSubmit" class="flex gap-2 items-start mt-2">
            <input type="url" placeholder="https://..." v-model="urlInput"
              class="flex-1 bg-black border border-neutral-800 rounded px-2 py-1.5 text-xs text-white focus:border-synth-neon outline-none font-mono" />
            <button type="submit" class="p-1.5 px-3 bg-neutral-800 text-synth-neon rounded hover:bg-neutral-700 transition">
              <Link class="w-3.5 h-3.5" />
            </button>
          </form>

          <!-- ── FILE (admin) ── -->
          <div v-if="inputType === 'file'" class="flex flex-col gap-3 mt-2">
            <label class="flex items-center justify-center gap-2 w-full border border-dashed border-neutral-700 hover:border-synth-neon text-neutral-500 hover:text-white rounded-lg p-4 cursor-pointer transition-colors">
              <Upload class="w-4 h-4" />
              <span class="text-xs font-black uppercase tracking-widest">{{ pendingLocalFile ? 'Change File' : 'Select MP3 / WAV / OGG' }}</span>
              <input type="file" accept="audio/mp3,audio/wav,audio/ogg" @change="handleFileChange" class="hidden" />
            </label>
            <div v-if="pendingLocalFile" class="flex flex-col gap-2 bg-neutral-900 border border-neutral-800 rounded-lg p-3">
              <div class="flex items-center gap-2">
                <Music class="w-3.5 h-3.5 text-synth-neon shrink-0" />
                <span class="text-xs text-neutral-300 font-mono truncate flex-1">{{ pendingLocalFile.name }}</span>
              </div>
              <div class="flex gap-2">
                <button @click="loadLocalFile"
                  class="flex-1 flex items-center justify-center gap-1.5 text-[9px] font-bold uppercase px-3 py-1.5 rounded border text-white border-neutral-700 hover:border-synth-neon hover:text-synth-neon transition-colors">
                  <Play class="w-3 h-3" /> Load
                </button>
                <button @click="addLocalFileToPlaylist"
                  class="flex-1 flex items-center justify-center gap-1.5 text-[9px] font-bold uppercase px-3 py-1.5 rounded border text-synth-neon border-synth-neon/30 hover:bg-synth-neon/10 transition-colors">
                  <ListPlus class="w-3 h-3" /> Add to Playlist
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </Transition>
    </Teleport>

    <!-- ── Dual audio elements ── -->
    <audio
      ref="audioRefA"
      :loop="loopAttr"
      @ended="handlePrimaryEnded('a')"
      @play="activeSlot === 'a' && (isPlaying = true)"
      @pause="activeSlot === 'a' && (isPlaying = false)"
      @timeupdate="e => handlePrimaryTimeUpdate('a', e.target.currentTime, e.target.duration)"
      @loadedmetadata="e => onLoadedMeta('a', e.target.duration)"
      class="hidden"
    />
    <audio
      ref="audioRefB"
      :loop="loopAttr"
      @ended="handlePrimaryEnded('b')"
      @play="activeSlot === 'b' && (isPlaying = true)"
      @pause="activeSlot === 'b' && (isPlaying = false)"
      @timeupdate="e => handlePrimaryTimeUpdate('b', e.target.currentTime, e.target.duration)"
      @loadedmetadata="e => onLoadedMeta('b', e.target.duration)"
      class="hidden"
    />
  </div>
</template>

<style scoped>
.panel-up-enter-active,
.panel-up-leave-active {
  transition: opacity 0.15s ease;
}
.panel-up-enter-from,
.panel-up-leave-to {
  opacity: 0;
}
</style>
