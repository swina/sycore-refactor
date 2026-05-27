<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  Play, Pause, Volume2, Upload, Music, X, ListMusic,
  Plus, Trash2, Edit2, Repeat, ListPlus, ChevronUp, ChevronDown,
  Save, FolderOpen, GripVertical, SkipBack, SkipForward, Link,
  Minimize2, Maximize2
} from 'lucide-vue-next'
import { useDraggable } from '@/composables/useDraggable'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import {
  collection, onSnapshot, query, orderBy, addDoc,
  serverTimestamp, deleteDoc, doc, updateDoc, deleteField
} from '@/lib/idb'
import { db } from '@/lib/firebase'
import PlayList from '@/components/PlayList.vue'
import { useUiStore } from '@/stores/useUiStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useSyncStore } from '@/stores/useSyncStore'

const uiStore = useUiStore()
const midiStore = useMidiStore()
const authStore = useAuthStore()
const configStore = useConfigStore()
const syncStore = useSyncStore()


const props = defineProps({})
const emit = defineEmits(['srcChange'])

const isAdmin = computed(() => authStore.isAdmin)


// ── Reactive state ────────────────────────────────────────────────────────────
const isOpen = computed({
  get: () => uiStore.isBackingTrackOpen,
  set: (v) => uiStore.isBackingTrackOpen = v
})
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
const newTrackAuthor  = ref('')
const editingTrackId  = ref(null)
const editingTrackIsBase64 = ref(false)
const deletingTrackId = ref(null)
const tracks          = ref([])
const detectedBpm     = ref(null)
const newTrackBpm     = ref('')
const playingTrack    = ref(null)
const pendingLocalFile = ref(null)
const triggerSource    = ref(null)

const playlist            = ref([])
const playlistRepeats     = ref([])
const playlistIdx         = ref(-1)
const playlistCurrentRepeat = ref(1)
const crossfadeSec        = ref(3)
const loopPlaylist        = ref(true)
const syncInternalSequencer = computed({
  get: () => syncStore.syncTrack,
  set: (v) => { syncStore.syncTrack = v },
})

const syncRecordAudioCapture = computed({
  get: () => syncStore.syncRecordAudioCapture,
  set: (v) => { syncStore.syncRecordAudioCapture = v },
})

const isMinimized = ref(localStorage.getItem('S1_BT_MINIMIZED') === 'true')
watch(isMinimized, v => localStorage.setItem('S1_BT_MINIMIZED', v ? 'true' : 'false'))
const isDialOpen = ref(false)


const { x: barX, y: barY, startDrag: startBarDrag } = useDraggable(
  Math.max(8, (window.innerWidth  - 600) / 2),
  Math.max(8,  window.innerHeight - 80),
  'S1_BT_BAR_POS'
)

const { panelStyle: panelDRStyle, onDragStart: startPanelDrag, onResizeStart: startPanelResize } = useDraggableResizable({
  storageKey: 'S1_BT_PANEL_DR',
  initialWidth: 904,
  initialHeight: Math.min(500, window.innerHeight - 60),
  minWidth: 904,
  minHeight: 280,
  zIndex: 220,
})


// ── DOM refs ──────────────────────────────────────────────────────────────────
const audioRefA = ref(null)
const audioRefB = ref(null)

// ── Plain mutable (non-reactive) ──────────────────────────────────────────────
let activeSlot       = 'a'
let isCrossfadingRef = false
let crossfadeTimerRef = null
let volumeRef        = 0.5

// ── Computed ──────────────────────────────────────────────────────────────────
const isPlaylistMode = computed(() => playlistIdx.value >= 0 && playlist.value.length > 0)
const loopAttr       = computed(() => isPlaylistMode.value ? false : isLooping.value)

const totalPlaylistDuration = computed(() => {
  return playlist.value.reduce((sum, track) => sum + (track.duration || 0), 0)
})

// Keep volumeRef in sync (used inside crossfade tick where .value isn't available)
watch(volume, v => { volumeRef = v })

// Volume → both elements (skip during crossfade)
watch(volume, v => {
  if (isCrossfadingRef) return
  if (audioRefA.value) audioRefA.value.volume = v
  if (audioRefB.value) audioRefB.value.volume = v
})

watch(src, v => emit('srcChange', v))

watch(isPlaying, v => { uiStore.isPlayingBacking = v }, { immediate: true })




// ── MIDI Transport Sync Watcher ───────────────────────────────────────────────
watch(isPlaying, (val) => {
  if (midiStore.syncMidiTransport) {
    // Timeline manages its own transport via markers — never auto-sync from here
    const isFromTimeline = triggerSource.value === 'timeline'
    const isFromLivePad  = triggerSource.value === 'livepad'
    const syncEnabled = isFromTimeline
      ? false
      : isFromLivePad
        ? configStore.syncMidiTransportFromLivePad
        : true

    if (syncEnabled) {
      if (val) midiStore.sendStart()
      else midiStore.sendStop()
    }
  }
  // Reset source after a short delay to ensure the watcher finishes processing
  setTimeout(() => { triggerSource.value = null }, 50)
})

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

function fadeStop() {
  if (!isPlaying.value || isCrossfadingRef) {
    isPlaying.value = false
    audioRefA.value?.pause()
    audioRefB.value?.pause()
    if (syncInternalSequencer.value) {
      window.dispatchEvent(new CustomEvent('toggle-sequencer', { detail: { play: false, source: 'backing-track' } }))
    }
    if (syncRecordAudioCapture.value) {
      window.dispatchEvent(new CustomEvent('capture-stop-rec'))
    }
    return
  }

  const audio = activeSlot === 'a' ? audioRefA.value : audioRefB.value
  if (!audio) return

  const fadeSec = Math.min(1.0, crossfadeSec.value)
  const steps = 30
  const stepMs = (fadeSec * 1000) / steps
  const vol = volumeRef
  let step = 0
  isCrossfadingRef = true

  const tick = () => {
    step++
    const t = step / steps
    audio.volume = Math.max(0, (1 - t) * vol)
    if (step < steps) {
      crossfadeTimerRef = window.setTimeout(tick, stepMs)
    } else {
      audio.pause()
      audio.volume = vol
      isPlaying.value = false
      isCrossfadingRef = false
      if (syncInternalSequencer.value) {
        window.dispatchEvent(new CustomEvent('toggle-sequencer', { detail: { play: false, source: 'backing-track' } }))
      }
      if (syncRecordAudioCapture.value) {
        window.dispatchEvent(new CustomEvent('capture-stop-rec'))
      }
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
      if (syncRecordAudioCapture.value) {
        window.dispatchEvent(new CustomEvent('capture-stop-rec'))
      }
    }
  } else {
    isPlaying.value = false
  }
}

function handlePrimaryTimeUpdate(slot, ct, dur) {
  if (activeSlot !== slot) return
  currentTime.value = ct
  const effectiveDur = isFinite(dur) ? dur : (playingTrack.value?.duration || duration.value || 0)
  if (isFinite(dur) && dur > 0) duration.value = dur
  window.dispatchEvent(new CustomEvent('player-state-sync', { detail: { currentTime: ct, duration: effectiveDur } }))
  if (!isPlaylistMode.value || isCrossfadingRef || effectiveDur <= 0 || isNaN(effectiveDur) || ct < 0.5) return
  const isLastRepeat = playlistCurrentRepeat.value >= (playlistRepeats.value[playlistIdx.value] ?? 1)
  if (!isLastRepeat) return
  const timeLeft = effectiveDur - ct
  if (timeLeft <= crossfadeSec.value && timeLeft > 0.1) {
    const nextIdx = getNextIdx(playlistIdx.value)
    if (nextIdx !== null) {
      startCrossfade(playlist.value[nextIdx], nextIdx, Math.min(crossfadeSec.value, timeLeft - 0.05))
    }
  }
}

// ── Load helpers ──────────────────────────────────────────────────────────────
function loadDirect(url, track, label, autoPlay = false) {
  if (crossfadeTimerRef) clearTimeout(crossfadeTimerRef)
  isCrossfadingRef = false
  audioRefA.value?.pause()
  audioRefB.value?.pause()
  
  activeSlot = 'a'
  const audio = audioRefA.value
  if (!audio) return
  audio.src = url
  audio.volume = volumeRef
  src.value = url
  playingTrack.value = track
  fileName.value = label
  currentTime.value = 0
  playlistIdx.value = -1
  
  if (autoPlay) {
    audio.play().catch(console.error)
    isPlaying.value = true
    if (syncInternalSequencer.value) {
      window.dispatchEvent(new CustomEvent('toggle-sequencer', { detail: { play: true, source: 'backing-track' } }))
    }
  } else {
    isPlaying.value = false
  }
  
  if (track?.bpm) {
    detectedBpm.value = track.bpm
    window.dispatchEvent(new CustomEvent('bpm-update', { detail: { bpm: track.bpm } }))
  }
}

function playTrack(track) {
  if (editingTrackId.value) return
  loadDirect(track.url, track, track.label, true)
}

function playFromPlaylist(idx, source = 'manual') {
  triggerSource.value = source
  if (playlistIdx.value === idx && src.value) {
    togglePlay()
    return
  }
  if (crossfadeTimerRef) clearTimeout(crossfadeTimerRef)
  isCrossfadingRef = false
  audioRefA.value?.pause()
  audioRefB.value?.pause()
  
  const track = playlist.value[idx]
  if (!track) return
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
  duration.value = track.duration || 0
  window.dispatchEvent(new CustomEvent('player-state-sync', {
    detail: { currentTime: 0, duration: track.duration || 0, playlistIdx: idx }
  }))

  if (syncRecordAudioCapture.value) {
    window.dispatchEvent(new CustomEvent('capture-start-rec', { detail: { background: true } }))
  }
  
  if (track.bpm) {
    detectedBpm.value = track.bpm
    window.dispatchEvent(new CustomEvent('bpm-update', { detail: { bpm: track.bpm } }))
  }
}

function handleFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  if (pendingLocalFile.value) URL.revokeObjectURL(pendingLocalFile.value.url)
  pendingLocalFile.value = { url: URL.createObjectURL(file), name: file.name, file }
}

async function saveLocalFileToLibrary() {
  if (!pendingLocalFile.value?.file) return
  const file = pendingLocalFile.value.file
  
  const tempAudio = new Audio(URL.createObjectURL(file))
  tempAudio.addEventListener('loadedmetadata', () => {
    const duration = tempAudio.duration
    
    const reader = new FileReader()
    reader.onload = async (e) => {
      const dataUrl = e.target.result
      try {
        const data = {
          url: dataUrl,
          label: file.name.replace(/\.[^.]+$/, ''),
          genre: 'Local',
          createdAt: serverTimestamp(),
          duration: isFinite(duration) ? duration : 0
        }
        await addDoc(collection(db, 'backing_tracks'), data)
        inputType.value = 'list'
        pendingLocalFile.value = null
      } catch (err) {
        console.error('Failed to add local track to library:', err)
      }
    }
    reader.readAsDataURL(file)
  })
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
  if (isPlaying.value) {
    fadeStop()
  } else {
    const audio = getPrimary()
    if (!audio || !src.value) {
      if (playlist.value.length > 0) playFromPlaylist(0)
      return
    }
    audio.play().catch(console.error)
    isPlaying.value = true
    if (syncInternalSequencer.value) {
      window.dispatchEvent(new CustomEvent('toggle-sequencer', { detail: { play: true, source: 'backing-track' } }))
    }
    if (syncRecordAudioCapture.value && isPlaylistMode.value) {
      window.dispatchEvent(new CustomEvent('capture-start-rec', { detail: { background: true } }))
    }
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

function seekToPos(pos) {
  const audio = getPrimary()
  if (!audio || !duration.value) return
  audio.currentTime = pos * duration.value
  currentTime.value = pos * duration.value
}

// ── Playlist management ───────────────────────────────────────────────────────
function addToPlaylist(track) {
  playlist.value = [...playlist.value, track]
  playlistRepeats.value = [...playlistRepeats.value, track.repeats || 1]
}

function clearPlaylist() {
  playlist.value = []
  playlistRepeats.value = []
  playlistIdx.value = -1
  playlistCurrentRepeat.value = 1
  uiStore.lastPlaylistName = ""
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
function cancelAdd() { 
  isAdding.value = false; 
  newTrackUrl.value = ''; 
  newTrackLabel.value = ''; 
  newTrackGenre.value = ''; 
  newTrackAuthor.value = '';
  newTrackBpm.value = '' 
}
function cancelEdit() { 
  editingTrackId.value = null; 
  editingTrackIsBase64.value = false;
  newTrackUrl.value = ''; 
  newTrackLabel.value = ''; 
  newTrackGenre.value = ''; 
  newTrackAuthor.value = '';
  newTrackBpm.value = '' 
}

async function addTrack(e) {
  e.preventDefault()
  if (!newTrackUrl.value || !newTrackLabel.value || !newTrackGenre.value) return
  try {
    const data = { 
      url: newTrackUrl.value, 
      label: newTrackLabel.value, 
      genre: newTrackGenre.value, 
      author: newTrackAuthor.value,
      createdAt: serverTimestamp() 
    }
    if (newTrackBpm.value !== '') data.bpm = Number(newTrackBpm.value)
    await addDoc(collection(db, 'backing_tracks'), data)
    cancelAdd()
  } catch (err) { console.error('Failed to add track:', err) }
}

async function saveEditTrack(e) {
  e.preventDefault()
  if (!editingTrackId.value || !newTrackLabel.value || !newTrackGenre.value) return
  try {
    const data = { 
      label: newTrackLabel.value, 
      genre: newTrackGenre.value,
      author: newTrackAuthor.value
    }
    // Only update URL if not base64 (local)
    if (!editingTrackIsBase64.value) {
      data.url = newTrackUrl.value
    }
    
    data.bpm = newTrackBpm.value !== '' ? Number(newTrackBpm.value) : deleteField()
    await updateDoc(doc(db, 'backing_tracks', editingTrackId.value), data)
    cancelEdit()
  } catch (err) { console.error('Failed to edit track:', err) }
}

function startEditTrack(track, e) {
  e.stopPropagation()
  isAdding.value = false
  editingTrackId.value = track.id
  editingTrackIsBase64.value = track.url?.startsWith('data:')
  
  newTrackUrl.value = editingTrackIsBase64.value ? 'Local File (Base64)' : track.url
  newTrackLabel.value = track.label
  newTrackGenre.value = track.genre
  newTrackAuthor.value = track.author || ''
  newTrackBpm.value = track.bpm || ''
}

async function deleteTrack(id, e) {
  e.stopPropagation()
  try { await deleteDoc(doc(db, 'backing_tracks', id)); deletingTrackId.value = null }
  catch (err) { console.error('Failed to delete track:', err) }
}

function onLoadedMeta(slot, d) {
  if (activeSlot !== slot) return
  const resolvedDur = isFinite(d) && d > 0 ? d : (playingTrack.value?.duration || 0)
  duration.value = resolvedDur
  currentTime.value = 0
  if (isFinite(d) && d > 0 && playlistIdx.value >= 0 && playlistIdx.value < playlist.value.length) {
    const item = playlist.value[playlistIdx.value]
    if (!item.duration) {
      playlist.value = playlist.value.map((t, i) => i === playlistIdx.value ? { ...t, duration: d } : t)
    }
  }
  window.dispatchEvent(new CustomEvent('player-state-sync', {
    detail: { currentTime: 0, duration: resolvedDur }
  }))
  if (isAdmin.value && playingTrack.value && !playingTrack.value.duration && d && isFinite(d)) {
    updateDoc(doc(db, 'backing_tracks', playingTrack.value.id), { duration: d }).catch(console.error)
  }
}

watch([isPlaying, playlistIdx, volume], () => {
  window.dispatchEvent(new CustomEvent('player-state-sync', {
    detail: { isPlaying: isPlaying.value, playlistIdx: playlistIdx.value, volume: volume.value }
  }))
})

watch([playlist, playlistRepeats, crossfadeSec, loopPlaylist, playlistCurrentRepeat], () => {
  window.dispatchEvent(new CustomEvent('player-state-sync', {
    detail: {
      playlist: playlist.value,
      tracks: tracks.value,
      playlistRepeats: playlistRepeats.value,
      crossfadeSec: crossfadeSec.value,
      loopPlaylist: loopPlaylist.value,
      totalPlaylistDuration: totalPlaylistDuration.value,
      playlistCurrentRepeat: playlistCurrentRepeat.value
    }
  }))
}, { deep: true })

// Automatically restore missing URLs in the playlist from the loaded tracks library
function restorePlaylistUrls() {
  if (!playlist.value.length || !tracks.value.length) return
  let modified = false
  const updated = playlist.value.map(track => {
    if (!track.url && track.id) {
      const match = tracks.value.find(t => t.id === track.id)
      if (match && match.url) {
        modified = true
        return { ...track, url: match.url }
      }
    }
    return track
  })
  if (modified) {
    playlist.value = updated
  }
}

watch(tracks, restorePlaylistUrls)
watch(playlist, (newPlaylist) => {
  const hasEmptyUrls = newPlaylist.some(t => !t.url && t.id)
  if (hasEmptyUrls) {
    restorePlaylistUrls()
  }
}, { deep: true })




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
      if (isPlaying.value) {
        audio.pause()
        if (syncRecordAudioCapture.value) window.dispatchEvent(new CustomEvent('capture-stop-rec'))
      } else {
        audio.play()
        if (syncRecordAudioCapture.value && isPlaylistMode.value) window.dispatchEvent(new CustomEvent('capture-start-rec', { detail: { background: true } }))
      }
      isPlaying.value = !isPlaying.value
    } else if (play && !isPlaying.value) {
      audio.play(); isPlaying.value = true
      if (syncRecordAudioCapture.value && isPlaylistMode.value) window.dispatchEvent(new CustomEvent('capture-start-rec', { detail: { background: true } }))
    } else if (!play && isPlaying.value) {
      audio.pause(); isPlaying.value = false
      if (syncRecordAudioCapture.value) window.dispatchEvent(new CustomEvent('capture-stop-rec'))
    }
  }

  const handlePlayStop = () => {
    if (isPlaying.value) {
      fadeStop()
    } else {
      const audio = activeSlot === 'a' ? audioRefA.value : audioRefB.value
      if (!audio || !src.value) {
        if (playlist.value.length > 0) playFromPlaylist(0)
        return
      }
      audio.play().catch(console.error)
      isPlaying.value = true
      if (syncInternalSequencer.value) {
        window.dispatchEvent(new CustomEvent('toggle-sequencer', { detail: { play: true, source: 'backing-track' } }))
      }
      if (syncRecordAudioCapture.value && isPlaylistMode.value) {
        window.dispatchEvent(new CustomEvent('capture-start-rec', { detail: { background: true } }))
      }
    }
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
    const { url, label, duration, bpm, repeats } = e.detail || {}
    if (!url) return
    addToPlaylist({ id: `rec_${Date.now()}`, url, label, genre: 'Recording', duration, bpm, repeats })
    inputType.value = 'playlist'; isOpen.value = true
  }
  
  const handlePlaylistPlay = (e) => {
    const d = e.detail || {}
    if (d.playlist) playlist.value = d.playlist
    if (d.repeats) playlistRepeats.value = d.repeats
    if (d.idx === undefined) return

    const source = d.source || 'livepad'

    const useCrossfade = d.crossfade
      && isPlaying.value
      && playlistIdx.value !== d.idx
      && !isCrossfadingRef

    if (useCrossfade) {
      const nextTrack = playlist.value[d.idx]
      if (nextTrack) {
        triggerSource.value = source
        const audio = getPrimary()
        const timeLeft = audio && isFinite(audio.duration)
          ? Math.max(0.5, audio.duration - audio.currentTime)
          : crossfadeSec.value
        startCrossfade(nextTrack, d.idx, Math.min(crossfadeSec.value, timeLeft))
      }
    } else {
      playFromPlaylist(d.idx, source)
    }
  }
  const handlePrev = () => playlistPrev()
  const handleSeek = (e) => { if (e.detail !== undefined) seekToPos(e.detail) }
  const handleVolume = (e) => { if (e.detail !== undefined) volume.value = e.detail }
  
  const handlePlaylistMutate = (e) => {
    const { key, value } = e.detail || {}
    if (key === 'playlist') playlist.value = value
    else if (key === 'playlistRepeats') playlistRepeats.value = value
    else if (key === 'playlistIdx') playlistIdx.value = value
    else if (key === 'playlistCurrentRepeat') playlistCurrentRepeat.value = value
    else if (key === 'crossfadeSec') crossfadeSec.value = value
    else if (key === 'loopPlaylist') loopPlaylist.value = value
  }
  const handlePlaylistClear = () => clearPlaylist()
  const handlePlayerStateRequest = () => {
    window.dispatchEvent(new CustomEvent('player-state-sync', {
      detail: {
        currentTime: currentTime.value,
        duration: duration.value,
        isPlaying: isPlaying.value,
        playlistIdx: playlistIdx.value,
        volume: volume.value,
        playlist: playlist.value,
        tracks: tracks.value,
        playlistRepeats: playlistRepeats.value,
        crossfadeSec: crossfadeSec.value,
        loopPlaylist: loopPlaylist.value,
        playlistCurrentRepeat: playlistCurrentRepeat.value
      }
    }))
  }

  window.addEventListener('toggle-backing-track', handleToggle)
  window.addEventListener('playlist-play-stop', handlePlayStop)
  window.addEventListener('playlist-next', handleNext)
  window.addEventListener('playlist-add-from-capture', handleAddFromCapture)
  window.addEventListener('playlist-prev', handlePrev)
  window.addEventListener('playlist-play', handlePlaylistPlay)
  window.addEventListener('playlist-seek', handleSeek)
  window.addEventListener('playlist-volume', handleVolume)
  window.addEventListener('playlist-mutate', handlePlaylistMutate)
  window.addEventListener('playlist-clear', handlePlaylistClear)
  window.addEventListener('player-state-request', handlePlayerStateRequest)
  
  _handlers = { handleToggle, handlePlayStop, handleNext, handleAddFromCapture, handlePrev, handlePlaylistPlay, handleSeek, handleVolume, handlePlaylistMutate, handlePlaylistClear, handlePlayerStateRequest }
})

onUnmounted(() => {
  _unsubTracks?.()
  if (crossfadeTimerRef) clearTimeout(crossfadeTimerRef)
  window.removeEventListener('toggle-backing-track', _handlers.handleToggle)
  window.removeEventListener('playlist-play-stop', _handlers.handlePlayStop)
  window.removeEventListener('playlist-next', _handlers.handleNext)
  window.removeEventListener('playlist-add-from-capture', _handlers.handleAddFromCapture)
  window.removeEventListener('playlist-prev', _handlers.handlePrev)
  window.removeEventListener('playlist-play', _handlers.handlePlaylistPlay)
  window.removeEventListener('playlist-seek', _handlers.handleSeek)
  window.removeEventListener('playlist-volume', _handlers.handleVolume)
  window.removeEventListener('playlist-mutate', _handlers.handlePlaylistMutate)
  window.removeEventListener('playlist-clear', _handlers.handlePlaylistClear)
  window.removeEventListener('player-state-request', _handlers.handlePlayerStateRequest)
})
</script>

<template>
  <div class="relative">
    <!-- ── Floating Control Bar ── -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="authStore.user" class="contents">
          
          <!-- 1. Controls Bar & Info -->
          <div 
            v-show="!isMinimized"
            class="fixed z-[700] min-w-[920px] flex flex-col items-center gap-1 pointer-events-none"
            :style="{ left: barX + 'px', top: barY + 'px' }"
          >

          
          <!-- Main Controls Bar -->
          <div class="pointer-events-auto flex items-center gap-2 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.5)] border-t-white/20">
            
            <!-- Drag Handle -->
            <div 
              @mousedown="startBarDrag"
              class="cursor-grab active:cursor-grabbing p-1 text-white/20 hover:text-white/40 transition-colors"
            >
              <GripVertical class="w-3.5 h-3.5" />
            </div>

            <button
              @click="isOpen = !isOpen"

              :class="['flex items-center justify-center gap-1.5 transition-all active:scale-95', isOpen || isPlaying ? 'text-synth-neon' : 'text-neutral-400 hover:text-white']"
              title="Library & Playlist"
            >
              <Music :class="['w-4 h-4', isPlaying ? 'animate-pulse' : '']" />
              <span v-if="isPlaylistMode" class="text-[9px] font-black font-mono bg-synth-neon/20 px-1.5 rounded">{{ playlistIdx + 1 }}/{{ playlist.length }}</span>
            </button>

            <div class="w-px h-4 bg-white/10 mx-1" />

            <template v-if="src">
              <button v-if="isPlaylistMode" @click="playlistPrev" title="Previous track"
                class="text-neutral-500 hover:text-white transition-colors">
                <SkipBack class="w-4 h-4" />
              </button>

              <button @click="togglePlay" class="w-8 h-8 flex items-center justify-center rounded-full bg-synth-neon/10 text-synth-neon hover:bg-synth-neon hover:text-black transition-all active:scale-90 shadow-lg shadow-synth-neon/20">
                <Pause v-if="isPlaying" class="w-4 h-4 fill-current" />
                <Play v-else class="w-4 h-4 fill-current ml-0.5" />
              </button>

              <button v-if="isPlaylistMode" @click="playlistNext" title="Next track (crossfade)"
                class="text-neutral-500 hover:text-white transition-colors">
                <SkipForward class="w-4 h-4" />
              </button>
              <button v-else
                @click="isLooping = !isLooping"
                :class="['transition-colors', isLooping ? 'text-synth-neon' : 'text-neutral-500 hover:text-white']"
                title="Toggle Loop"
              >
                <Repeat class="w-4 h-4" />
              </button>

              <!-- Track Name -->
              <div class="hidden sm:flex flex-col ml-1 min-w-0 max-w-[100px]">
                <span class="text-[7px] font-black uppercase tracking-tighter text-white/30 leading-none mb-0.5">Playing</span>
                <span class="text-[9px] font-black uppercase tracking-tighter text-synth-neon truncate leading-tight">
                  {{ playingTrack?.label || fileName || 'Audio Track' }}
                </span>
              </div>


              <!-- Progress -->
              <div class="w-16 lg:w-24 flex flex-col items-center ml-2">
                <div
                  class="w-full h-1 bg-white/5 rounded-full overflow-hidden cursor-pointer relative group/progress"
                  @click="seekTo"
                >
                  <div
                    class="h-full bg-synth-neon absolute left-0 top-0 bottom-0 pointer-events-none transition-all duration-75 shadow-[0_0_8px_rgba(0,163,112,0.8)]"
                    :style="{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }"
                  />
                </div>
              </div>

              <!-- Volume -->
              <div class="items-center gap-1.5 w-10 lg:w-14 flex ml-2 group/vol">
                <Volume2 class="w-2.5 h-2.5 text-neutral-500 group-hover/vol:text-white transition-colors" />
                <input type="range" min="0" max="1" step="0.01" :value="volume"
                  @input="e => volume = parseFloat(e.target.value)"
                  class="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-synth-neon" />
              </div>

              <!-- Time -->
              <div class="text-[8px] font-mono text-neutral-400 w-[70px] text-right ml-1 shrink-0 flex flex-col leading-tight">
                <span class="text-white">{{ formatTime(currentTime) }}</span>
                <span class="text-neutral-600 tracking-tighter">{{ formatTime(duration) }}</span>
              </div>

              <div class="w-px h-4 bg-white/10 mx-1" />

              <!-- MIDI Sync Toggle -->
              <button 
                @click="midiStore.syncMidiTransport = !midiStore.syncMidiTransport"
                :class="['transition-all p-1.5 rounded-md active:scale-90', midiStore.syncMidiTransport ? 'text-synth-neon bg-synth-neon/10' : 'text-neutral-500 hover:text-white']"
                title="Sync MIDI START/STOP with Audio Player"
              >
                <Link class="w-3.5 h-3.5" />
              </button>

            </template>
            <span v-else class="text-[10px] font-black text-neutral-500 tracking-[0.2em] px-4">READY</span>

          </div>



        </div>

        <!-- Overlay backdrop when dial open -->
        <div 
          v-if="isDialOpen" 
          @click="isDialOpen = false"
          class="fixed inset-0 bg-black/10 backdrop-blur-[1px] z-[690]"
        ></div>

        <!-- Speedy-Dial in the bottom-left -->
        <div class="fixed bottom-10 left-[76px] z-[700] flex flex-col items-center gap-2 pointer-events-auto">
          <!-- Action buttons -->
          <TransitionGroup 
            name="speed-dial"
            tag="div"
            class="flex flex-col items-center gap-2 mb-1"
          >
            <div v-if="isDialOpen" class="flex flex-col items-center gap-2">
              <!-- Minimize / Maximize -->
              <button
                @click="isMinimized = !isMinimized; isDialOpen = false"
                class="w-10 h-10 rounded-full border border-white/10 bg-black/80 backdrop-blur-md flex items-center justify-center text-synth-neon hover:text-white hover:border-synth-neon/50 shadow-lg active:scale-95 transition-all duration-300"
                :title="isMinimized ? 'Visualizza controlli player' : 'Minimizza controlli player'"
              >
                <Maximize2 v-if="isMinimized" class="w-4 h-4" />
                <Minimize2 v-else class="w-4 h-4" />
              </button>

              <!-- Play / Pause -->
              <button
                v-if="src"
                @click="togglePlay"
                class="w-10 h-10 rounded-full border border-white/10 bg-black/80 backdrop-blur-md flex items-center justify-center text-synth-neon hover:text-white hover:border-synth-neon/50 shadow-lg active:scale-95 transition-all duration-300"
                :title="isPlaying ? 'Pausa' : 'Riproduci'"
              >
                <Pause v-if="isPlaying" class="w-4 h-4 fill-current" />
                <Play v-else class="w-4 h-4 fill-current ml-0.5" />
              </button>

              <!-- Library / Playlist Panel -->
              <button
                @click="isOpen = !isOpen; isDialOpen = false"
                class="w-10 h-10 rounded-full border border-white/10 bg-black/80 backdrop-blur-md flex items-center justify-center text-synth-neon hover:text-white hover:border-synth-neon/50 shadow-lg active:scale-95 transition-all duration-300"
                title="Sorgente Traccia"
              >
                <Music class="w-4 h-4" />
              </button>
            </div>
          </TransitionGroup>

          <!-- Main Dial Toggle Button -->
          <button
            @click="isDialOpen = !isDialOpen"
            :class="[
              'w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl border-2 z-10 active:scale-95',
              isDialOpen 
                ? 'bg-white text-black border-white' 
                : 'bg-neutral-900 text-synth-neon border-synth-neon/30 hover:border-synth-neon hover:scale-105'
            ]"
            :title="isDialOpen ? 'Chiudi controlli rapidi' : 'Controlli Rapidi Player'"
          >
            <X v-if="isDialOpen" class="w-5 h-5" />
            <Music v-else :class="['w-5 h-5', isPlaying && !isMinimized ? 'animate-pulse' : '']" />
          </button>
          
          <!-- Dial Indicator (Small neon dot if minimized) -->
          <div 
            v-if="isMinimized && !isDialOpen" 
            class="absolute -top-1 -right-1 w-3 h-3 bg-synth-neon rounded-full border-2 border-neutral-950 animate-ping"
          />
          <div 
            v-if="isMinimized && !isDialOpen" 
            class="absolute -top-1 -right-1 w-3 h-3 bg-synth-neon rounded-full border-2 border-neutral-950"
          />
        </div>

      </div>

      </Transition>
    </Teleport>

    <!-- ── Settings panel (teleported to avoid overflow-hidden clipping) ── -->
    <Teleport to="body">
      <Transition name="panel-up">
        <div
          v-if="isOpen"
          :style="panelDRStyle"
          class="flex flex-col bg-black/95 backdrop-blur-xl border border-neutral-800 rounded-2xl shadow-[0_0_50px_rgba(0,163,112,0.15)] p-4 md:p-6 relative overflow-hidden"
        >
          <!-- Header -->
          <div class="flex items-center mb-4 shrink-0">
            <!-- Drag handle -->
            <div class="flex items-center gap-2 flex-1 min-w-0 cursor-grab active:cursor-grabbing select-none"
                 @mousedown="startPanelDrag">
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
          
          <!-- MIDI / Sync Settings -->
          <div class="px-3 py-2.5 mb-3 bg-neutral-900/50 rounded-xl flex flex-wrap items-center gap-x-6 gap-y-3 shrink-0 border border-white/5">
            <!-- Global MIDI -->
            <div class="flex items-center gap-3 group cursor-pointer" @click="midiStore.setSyncMidiTransport(!midiStore.syncMidiTransport)">
              <div 
                :class="['w-8 h-4 rounded-full relative transition-all duration-300', midiStore.syncMidiTransport ? 'bg-synth-neon shadow-[0_0_10px_rgba(0,163,112,0.4)]' : 'bg-neutral-800']"
              >
                <div :class="['absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all duration-300', midiStore.syncMidiTransport ? 'left-4.5' : 'left-0.5']" />
              </div>
              <div class="flex flex-col">
                <span :class="['text-[9px] font-black uppercase tracking-widest transition-colors', midiStore.syncMidiTransport ? 'text-synth-neon' : 'text-neutral-400 group-hover:text-neutral-300']">Global MIDI Sync</span>
                <span class="text-[7px] text-neutral-600 uppercase font-bold tracking-tighter">Auto Start/Stop External MIDI</span>
              </div>
            </div>

            <div class="w-px h-6 bg-white/5 hidden md:block" />

            <!-- Internal Sequencer -->
            <div class="flex items-center gap-3 group cursor-pointer" @click="syncInternalSequencer = !syncInternalSequencer">
              <div 
                :class="['w-8 h-4 rounded-full relative transition-all duration-300', syncInternalSequencer ? 'bg-synth-neon shadow-[0_0_10px_rgba(0,163,112,0.4)]' : 'bg-neutral-800']"
              >
                <div :class="['absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all duration-300', syncInternalSequencer ? 'left-4.5' : 'left-0.5']" />
              </div>
              <div class="flex flex-col">
                <span :class="['text-[9px] font-black uppercase tracking-widest transition-colors', syncInternalSequencer ? 'text-synth-neon' : 'text-neutral-400 group-hover:text-neutral-300']">Internal Sync</span>
                <span class="text-[7px] text-neutral-600 uppercase font-bold tracking-tighter">Link with System Sequencer</span>
              </div>
            </div>

            <div class="w-px h-6 bg-white/5 hidden md:block" />

            <!-- Sync Record Audio Capture -->
            <div class="flex items-center gap-3 group cursor-pointer" @click="syncRecordAudioCapture = !syncRecordAudioCapture">
              <div 
                :class="['w-8 h-4 rounded-full relative transition-all duration-300', syncRecordAudioCapture ? 'bg-synth-neon shadow-[0_0_10px_rgba(0,163,112,0.4)]' : 'bg-neutral-800']"
              >
                <div :class="['absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all duration-300', syncRecordAudioCapture ? 'left-4.5' : 'left-0.5']" />
              </div>
              <div class="flex flex-col">
                <span :class="['text-[9px] font-black uppercase tracking-widest transition-colors', syncRecordAudioCapture ? 'text-synth-neon' : 'text-neutral-400 group-hover:text-neutral-300']">Sync Record</span>
                <span class="text-[7px] text-neutral-600 uppercase font-bold tracking-tighter">Auto Capture Playlist Play</span>
              </div>
            </div>
          </div>



          <!-- Tab content -->
          <div class="flex-1 space-y-3 min-h-0 pr-2 overflow-y-auto custom-scrollbar">

            <!-- ── LIBRARY ── -->
            <div v-if="inputType === 'list'" class="flex flex-col gap-2 overflow-y-auto custom-scrollbar ">
              <button v-if="isAdmin && !isAdding" @click="isAdding = true"
                class="w-full py-2 border border-dashed border-synth-neon text-synth-neon hover:bg-synth-neon/10 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-colors">
                <Plus class="w-3 h-3" /> Add Backing Track
              </button>

              <!-- Add form -->
              <form v-if="isAdmin && isAdding" @submit="addTrack" class="flex flex-col gap-2 bg-neutral-900 p-3 rounded-lg border border-neutral-800">
                <input type="url" placeholder="MP3 URL" v-model="newTrackUrl" class="w-full bg-black border border-neutral-800 rounded px-2 py-1.5 text-xs text-white focus:border-synth-neon outline-none" required />
                <input type="text" placeholder="Label" v-model="newTrackLabel" class="w-full bg-black border border-neutral-800 rounded px-2 py-1.5 text-xs text-white focus:border-synth-neon outline-none" required />
                <div class="grid grid-cols-2 gap-2">
                  <input type="text" placeholder="Genre" v-model="newTrackGenre" class="w-full bg-black border border-neutral-800 rounded px-2 py-1.5 text-xs text-white focus:border-synth-neon outline-none" required />
                  <input type="text" placeholder="Author" v-model="newTrackAuthor" class="w-full bg-black border border-neutral-800 rounded px-2 py-1.5 text-xs text-white focus:border-synth-neon outline-none" />
                </div>
                <input type="number" placeholder="BPM (optional)" v-model="newTrackBpm" min="1" max="500" class="w-full bg-black border border-neutral-800 rounded px-2 py-1.5 text-xs text-white focus:border-synth-neon outline-none" />
                <div class="flex gap-2 mt-1">
                  <button type="submit" class="flex-1 bg-synth-neon text-black text-xs font-bold py-1.5 rounded hover:bg-white transition-colors">Save</button>
                  <button type="button" @click="cancelAdd" class="px-3 bg-neutral-800 text-white text-xs font-bold py-1.5 rounded hover:bg-neutral-700 transition-colors">Cancel</button>
                </div>
              </form>

              <div v-if="tracks.length === 0" class="text-center text-xs text-neutral-500 py-4">No tracks available.</div>
              <div v-else class="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-3 overflow-y-auto custom-scrollbar  gap-2">
                <template v-for="track in tracks" :key="track.id">
                  <!-- Edit form for this track -->
                  <div v-if="editingTrackId === track.id" @click.stop>
                    <form @submit="saveEditTrack" class="flex flex-col gap-2 bg-neutral-900 p-3 rounded-lg border border-neutral-800">
                      <div class="relative">
                        <input 
                          type="text" 
                          placeholder="MP3 URL" 
                          v-model="newTrackUrl" 
                          :readonly="editingTrackIsBase64"
                          :class="['w-full bg-black border border-neutral-800 rounded px-2 py-1.5 text-xs focus:border-synth-neon outline-none', editingTrackIsBase64 ? 'text-neutral-500 cursor-not-allowed italic' : 'text-white']" 
                          required 
                        />
                        <span v-if="editingTrackIsBase64" class="absolute right-2 top-1.5 text-[8px] font-black uppercase text-synth-neon/50">Local Only</span>
                      </div>
                      <input type="text" placeholder="Label" v-model="newTrackLabel" class="w-full bg-black border border-neutral-800 rounded px-2 py-1.5 text-xs text-white focus:border-synth-neon outline-none" required />
                      <div class="grid grid-cols-2 gap-2">
                        <input type="text" placeholder="Genre" v-model="newTrackGenre" class="w-full bg-black border border-neutral-800 rounded px-2 py-1.5 text-xs text-white focus:border-synth-neon outline-none" required />
                        <input type="text" placeholder="Author" v-model="newTrackAuthor" class="w-full bg-black border border-neutral-800 rounded px-2 py-1.5 text-xs text-white focus:border-synth-neon outline-none" />
                      </div>
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
                      <span class="text-[10px] text-neutral-500 uppercase tracking-wider flex items-center gap-2">
                        {{ track.genre }}
                        <span v-if="track.author" class="text-neutral-700">•</span>
                        <span v-if="track.author" class="text-neutral-400 normal-case italic font-medium">{{ track.author }}</span>
                      </span>
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
            <PlayList
              v-if="inputType === 'playlist'"
              v-model:playlist="playlist"
              v-model:playlistRepeats="playlistRepeats"
              v-model:playlistIdx="playlistIdx"
              v-model:playlistCurrentRepeat="playlistCurrentRepeat"
              v-model:crossfadeSec="crossfadeSec"
              v-model:loopPlaylist="loopPlaylist"
              :is-playlist-mode="isPlaylistMode"
              :current-time="currentTime"
              :duration="duration"
              :is-playing="isPlaying"
              :volume="volume"
              @play="playFromPlaylist"
              @clear="clearPlaylist"
              @prev="playlistPrev"
              @next="playlistNext"
              @togglePlay="togglePlay"
              @seek="seekToPos" 
              @update:volume="v => volume = v"
            />

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
                  <button @click="saveLocalFileToLibrary"
                    class="flex-1 flex items-center justify-center gap-1.5 text-[9px] font-bold uppercase px-3 py-1.5 rounded border text-purple-400 border-purple-400/30 hover:bg-purple-400/10 transition-colors"
                    title="Save persistently for offline playback">
                    <Save class="w-3 h-3" /> Save to Library
                  </button>
                </div>
              </div>
            </div>

          </div>

          <!-- Resize handle -->
          <div
            @mousedown="e => startPanelResize(e, 'se')"
            class="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize flex items-end justify-end p-1 text-neutral-600 hover:text-synth-neon transition-colors"
            title="Resize"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
              <path d="M8 8H6V6H8V8ZM8 4H6V2H8V4ZM4 8H2V6H4V8Z"/>
            </svg>
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

/* Speed Dial Transition */
.speed-dial-enter-active,
.speed-dial-leave-active {
  transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

.speed-dial-enter-from,
.speed-dial-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.5);
}

button:not(.bg-white) {
  box-shadow: 0 0 15px rgba(0, 255, 204, 0.1);
}
button:not(.bg-white):hover {
  box-shadow: 0 0 25px rgba(0, 255, 204, 0.3);
}
</style>
