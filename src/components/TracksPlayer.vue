<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import {
  Play, Upload, Music, X, Minus,
  Plus, Trash2, Edit2, ListPlus,
  Save, GripVertical, Link, FolderOpen,
} from 'lucide-vue-next'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'
import {
  collection, onSnapshot, query, orderBy, addDoc,
  serverTimestamp, deleteDoc, doc, updateDoc, deleteField, db
} from '@/lib/idb'
import PlayList from '@/components/PlayList.vue'
import { useUiStore } from '@/stores/useUiStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useSyncStore } from '@/stores/useSyncStore'
import { detectBpmFromUrl } from '@/composables/useBpmDetector'

const uiStore = useUiStore()
const midiStore = useMidiStore()
const authStore = useAuthStore()
const uid = computed(() => authStore.user?.uid)
const configStore = useConfigStore()
const syncStore = useSyncStore()
const route = useRoute()

const props = defineProps({})
const emit = defineEmits(['srcChange', 'close'])

const isAdmin = computed(() => authStore.isAdmin)


// ── Reactive state ────────────────────────────────────────────────────────────
const isOpen = computed({
  get: () => uiStore.isTracksPlayerOpen,
  set: (v) => uiStore.isTracksPlayerOpen = v
})

watch(() => route.path, (path) => {
  if (path === '/') isOpen.value = false
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
const confirmDialog    = ref(null) // { label, url, bpm, genre?, author? }
const pendingBrowser   = ref(null) // tracks which browser opened: 'freesound' | 'folder'
const pendingFolderFile = ref(null) // raw File object for folder saves (read as dataUrl on confirm)

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

const { panelStyle: panelDRStyle, onDragStart: startPanelDrag, onResizeStart: startPanelResize, isMinimized, toggleMinimize, bringToFront, maximize } = useDraggableResizable({
  storageKey: 'S1_TP_PANEL_DR',
  minimizeLabel: 'Backing Track',
  openRef: () => uiStore.isTracksPlayerOpen,
  initialWidth: 904,
  initialHeight: Math.min(500, window.innerHeight - 60),
  minWidth: 904,
  minHeight: 280,
  zIndex: 220,
  panelId: 'tracks-player',
})
watch(isOpen, (v) => { if (v) bringToFront() })


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
        await addDoc(collection(db, 'users', uid.value, 'backing_tracks'), data)
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
    await addDoc(collection(db, 'users', uid.value, 'backing_tracks'), data)
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
    if (!editingTrackIsBase64.value) {
      data.url = newTrackUrl.value
    }

    data.bpm = newTrackBpm.value !== '' ? Number(newTrackBpm.value) : deleteField()
    await updateDoc(doc(db, 'users', uid.value, 'backing_tracks', editingTrackId.value), data)
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
  try { await deleteDoc(doc(db, 'users', uid.value, 'backing_tracks', id)); deletingTrackId.value = null }
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
    updateDoc(doc(db, 'users', uid.value, 'backing_tracks', playingTrack.value.id), { duration: d }).catch(console.error)
  }
}

watch([isPlaying, playlistIdx, volume, isLooping, playingTrack, src], () => {
  window.dispatchEvent(new CustomEvent('player-state-sync', {
    detail: {
      isPlaying: isPlaying.value,
      playlistIdx: playlistIdx.value,
      volume: volume.value,
      isLooping: isLooping.value,
      hasSrc: !!src.value,
      playingTrackLabel: playingTrack.value?.label || fileName.value || '',
    }
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

// ── Set SoundFolder assign target when folder tab is active ───────────
watch(inputType, (tab) => {
  if (tab === 'folder') {
    uiStore.soundFolderAssignTarget = {
      label: 'Backing Tracks Library',
      onAssign: async (file) => {
        const actualFile = await file.handle.getFile()
        pendingFolderFile.value = actualFile
        const label = file.name.replace(/\.[^.]+$/, '')
        const url = URL.createObjectURL(actualFile)
        let bpm = null
        try {
          bpm = await detectBpmFromUrl(url)
        } catch {}
        URL.revokeObjectURL(url)
        showLibraryConfirm({ label, url: '', bpm, author: '', genre: 'Local' }, 'folder')
      },
    }
  } else if (uiStore.soundFolderAssignTarget?.label === 'Backing Tracks Library') {
    uiStore.soundFolderAssignTarget = null
  }
})

// ── Library Confirm Dialog functions ────────────────────────────────────
const handleFreesoundAdd = (e) => {
  const track = e.detail
  if (!track) return
  showLibraryConfirm({ label: track.label, url: track.url, bpm: track.bpm, author: track.author, genre: track.genre || 'Freesound' }, 'freesound')
}

async function showLibraryConfirm(track, source) {
  pendingBrowser.value = source
  confirmDialog.value = { ...track }
}

const confirmingLib     = ref(false)

async function confirmLibrarySave() {
  if (!confirmDialog.value || !uid.value) return
  confirmingLib.value = true
  const d = confirmDialog.value
  let trackUrl = d.url
  const file = pendingFolderFile.value
  if (file && !trackUrl) {
    trackUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = reject
      reader.onload = () => resolve(reader.result)
      reader.readAsDataURL(file)
    })
  }
  const data = {
    label: d.label || 'Untitled',
    url: trackUrl,
    genre: d.genre || 'Library',
    author: d.author || '',
    createdAt: serverTimestamp(),
  }
  if (d.bpm) data.bpm = Math.round(d.bpm)
  if (!data.bpm && trackUrl && (trackUrl.startsWith('http') || trackUrl.startsWith('blob'))) {
    try {
      const bpm = await Promise.race([
        detectBpmFromUrl(trackUrl),
        new Promise(r => setTimeout(() => r(null), 8000)),
      ])
      if (bpm) data.bpm = Math.round(bpm)
    } catch {}
  }
  if (trackUrl && (trackUrl.startsWith('http') || trackUrl.startsWith('blob') || trackUrl.startsWith('data:'))) {
    try {
      await Promise.race([
        new Promise((resolve) => {
          const audio = new Audio(trackUrl)
          audio.addEventListener('loadedmetadata', () => {
            const dur = audio.duration
            if (isFinite(dur)) data.duration = dur
            audio.remove()
            resolve()
          }, { once: true })
          audio.addEventListener('error', () => { audio.remove(); resolve() }, { once: true })
        }),
        new Promise(r => setTimeout(r, 8000)),
      ])
    } catch {}
  }
  await addDoc(collection(db, 'users', uid.value, 'backing_tracks'), data)
  if (!d.bpm && data.bpm) d.bpm = data.bpm
  confirmDialog.value = null
  pendingBrowser.value = null
  pendingFolderFile.value = null
  confirmingLib.value = false
  inputType.value = 'list'
}

function cancelLibraryConfirm() {
  confirmDialog.value = null
  pendingBrowser.value = null
  pendingFolderFile.value = null
}


// ── Lifecycle ─────────────────────────────────────────────────────────────────

let _unsubTracks = null
let _handlers = {}

watch(uid, (newUid) => {
  if (_unsubTracks) { _unsubTracks(); _unsubTracks = null }
  if (!newUid) { tracks.value = []; return }
  // Clear in-memory playlist state so previous user's data doesn't bleed through
  playlist.value = []
  playlistRepeats.value = []
  playlistIdx.value = -1
  playlistCurrentRepeat.value = 1
  const q = query(collection(db, 'users', newUid, 'backing_tracks'), orderBy('createdAt', 'desc'))
  _unsubTracks = onSnapshot(q, (snapshot) => {
    const ts = []
    snapshot.forEach(d => ts.push({ id: d.id, ...d.data() }))
    tracks.value = ts
  })
}, { immediate: true })

onMounted(() => {

  const handleToggle = (e) => {
    const audio = activeSlot === 'a' ? audioRefA.value : audioRefB.value
    const play = e.detail?.play
    const restart = e.detail?.restart

    // If no track loaded but playlist exists, start/stop from playlist
    if (!audio || !src.value) {
      if (play === true && playlist.value.length > 0) {
        playFromPlaylist(0)
      } else if (play === false) {
        // nothing to stop — noop
      }
      return
    }
    if (restart) { audio.currentTime = 0; currentTime.value = 0 }
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
        playlistCurrentRepeat: playlistCurrentRepeat.value,
        isLooping: isLooping.value,
        hasSrc: !!src.value,
        playingTrackLabel: playingTrack.value?.label || fileName.value || '',
      }
    }))
  }
  const handleLoopToggle = () => { isLooping.value = !isLooping.value }
  const handleOpenFreesound = () => { uiStore.isFreesoundBrowserOpen = true }

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
  window.addEventListener('playlist-loop-toggle', handleLoopToggle)
  window.addEventListener('tracks-player-open-freesound', handleOpenFreesound)
  window.addEventListener('freesound-add-to-playlist', handleFreesoundAdd)
  window.addEventListener('tracks-player-volume', handleVolume)

  _handlers = { handleToggle, handlePlayStop, handleNext, handleAddFromCapture, handlePrev, handlePlaylistPlay, handleSeek, handleVolume, handlePlaylistMutate, handlePlaylistClear, handlePlayerStateRequest, handleLoopToggle, handleOpenFreesound, handleFreesoundAdd }
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
  window.removeEventListener('playlist-loop-toggle', _handlers.handleLoopToggle)
  window.removeEventListener('tracks-player-open-freesound', _handlers.handleOpenFreesound)
  window.removeEventListener('freesound-add-to-playlist', _handlers.handleFreesoundAdd)
  window.removeEventListener('tracks-player-volume', _handlers.handleVolume)
})
</script>

<template>
  <!-- ── Panel (teleported to avoid overflow-hidden clipping) ── -->
  <Teleport to="body">
    <Transition name="panel-up">
      <div
        v-if="isOpen"
        :style="panelDRStyle"
        class="flex flex-col bg-neutral-900 max-h-[94vh] border border-emerald-500/30 rounded-xl overflow-hidden shadow-[0_0_50px_rgba(0,163,112,0.15)]"
        v-show="!isMinimized"
      >
        <!-- Header -->
        <div
          class="px-4 py-2 border-b border-neutral-800 flex items-center justify-between bg-gradient-to-r from-emerald-950/40 to-transparent shrink-0 cursor-grab active:cursor-grabbing select-none"
          @mousedown="startPanelDrag"
        >
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Music class="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 class="text-sm font-black uppercase tracking-[0.2em] text-white leading-none mb-1">BACKING TRACK</h2>
              <p class="text-[9px] font-mono text-emerald-500/60 uppercase tracking-widest">Audio Library & Playlist Player</p>
            </div>
          </div>
          <div class="flex items-start h-full gap-1">
            <MacOsButtons @close="emit('close')" @minimize="toggleMinimize" @maximize="maximize" />
          </div>
        </div>

        <!-- Body -->
        <div class="flex flex-col flex-1 min-h-0 p-4 md:p-6 overflow-hidden">

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
              <button
                @click="inputType = 'freesound'; uiStore.isFreesoundBrowserOpen = true"
                :class="['flex-1 text-[9px] font-black uppercase tracking-widest py-1.5 rounded transition-all', inputType === 'freesound' ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300']"
              >Freesound</button>
              <button
                @click="inputType = 'folder'; uiStore.isSoundFolderBrowserOpen = true"
                :class="['flex-1 text-[9px] font-black uppercase tracking-widest py-1.5 rounded transition-all', inputType === 'folder' ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300']"
              >Folder</button>
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
            <div v-if="inputType === 'list'" class="flex flex-col gap-2 overflow-y-auto custom-scrollbar">
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
              <div v-else class="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-3 overflow-y-auto custom-scrollbar gap-2">
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
                    <div class="flex flex-col overflow-hidden min-w-0">
                      <span class="text-xs font-bold flex items-center gap-2 min-w-0">
                        <span class="truncate">{{ track.label }}</span>
                        <span v-if="track.bpm" class="shrink-0 text-[9px] font-mono text-emerald-400 bg-emerald-400/10 px-1 rounded">{{ track.bpm }} BPM</span>
                        <span v-if="track.duration" class="shrink-0 text-[9px] font-mono text-neutral-400 bg-neutral-800 px-1 rounded">{{ formatTime(track.duration) }}</span>
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

            <!-- ── FREESOUND (admin) ── -->
            <div v-if="inputType === 'freesound'" class="flex flex-col items-center justify-center gap-3 mt-4 text-neutral-500">
              <Music class="w-8 h-8 text-amber-500/60" />
              <span class="text-[10px] font-bold uppercase tracking-widest">Freesound Browser</span>
              <span class="text-[9px] text-neutral-600 text-center max-w-xs">Browse and search sounds from Freesound.org. Assign to your library with auto BPM detection.</span>
              <button @click="uiStore.isFreesoundBrowserOpen = true"
                class="px-4 py-2 bg-amber-500/20 border border-amber-500/60 rounded text-amber-400 hover:bg-amber-500/30 text-[10px] font-black uppercase tracking-wider transition-colors"
              >Open Freesound Browser</button>
            </div>

            <!-- ── FOLDER (admin) ── -->
            <div v-if="inputType === 'folder'" class="flex flex-col items-center justify-center gap-3 mt-4 text-neutral-500">
              <FolderOpen class="w-8 h-8 text-cyan-500/60" />
              <span class="text-[10px] font-bold uppercase tracking-widest">Local Folder Browser</span>
              <span class="text-[9px] text-neutral-600 text-center max-w-xs">Browse audio files on your local machine. Assign to your library with auto BPM detection.</span>
              <button @click="uiStore.isSoundFolderBrowserOpen = true"
                class="px-4 py-2 bg-cyan-500/20 border border-cyan-500/60 rounded text-cyan-400 hover:bg-cyan-500/30 text-[10px] font-black uppercase tracking-wider transition-colors"
              >Open Folder Browser</button>
            </div>

          </div>

        </div><!-- /Body -->

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

  <!-- ── Library Save Confirmation ── -->
  <Teleport to="body">
    <div
      v-if="confirmDialog"
      class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      @click.self="cancelLibraryConfirm"
    >
      <div class="bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 bg-neutral-800 border-b border-neutral-700">
          <span class="text-[10px] font-black uppercase tracking-widest text-white">Save to Library</span>
          <button @click="cancelLibraryConfirm" class="text-neutral-500 hover:text-white">
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
        <div class="p-4 space-y-3">
          <div>
            <label class="text-[8px] uppercase tracking-widest text-neutral-500 font-bold">Label</label>
            <input v-model="confirmDialog.label" class="w-full bg-black border border-neutral-700 rounded px-2 py-1.5 text-xs text-white focus:border-synth-neon outline-none mt-1" />
          </div>
          <div class="flex gap-3">
            <div class="flex-1">
              <label class="text-[8px] uppercase tracking-widest text-neutral-500 font-bold">Genre</label>
              <input v-model="confirmDialog.genre" class="w-full bg-black border border-neutral-700 rounded px-2 py-1.5 text-xs text-white focus:border-synth-neon outline-none mt-1" />
            </div>
            <div class="flex-1">
              <label class="text-[8px] uppercase tracking-widest text-neutral-500 font-bold">Author</label>
              <input v-model="confirmDialog.author" class="w-full bg-black border border-neutral-700 rounded px-2 py-1.5 text-xs text-white focus:border-synth-neon outline-none mt-1" />
            </div>
          </div>
          <div>
            <label class="text-[8px] uppercase tracking-widest text-neutral-500 font-bold">BPM <span class="text-neutral-600">(optional — auto-detected in background if empty)</span></label>
            <div class="flex items-center gap-2 mt-1">
              <input v-model.number="confirmDialog.bpm" type="number" min="20" max="300"
                class="w-20 bg-black border border-neutral-700 rounded px-2 py-1.5 text-xs text-white font-mono focus:border-synth-neon outline-none"
              />
            </div>
          </div>
        </div>
        <div class="flex gap-2 px-4 py-3 bg-neutral-800/50 border-t border-neutral-700">
          <button @click="cancelLibraryConfirm"
            class="flex-1 py-2 text-[9px] font-black uppercase tracking-wider bg-neutral-700 rounded text-neutral-300 hover:bg-neutral-600 transition-colors"
          >Cancel</button>
          <button @click="confirmLibrarySave" :disabled="confirmingLib"
            class="flex-1 py-2 text-[9px] font-black uppercase tracking-wider bg-synth-neon rounded text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-wait transition-colors"
          >{{ confirmingLib ? 'Analyzing…' : 'Save to Library' }}</button>
        </div>
      </div>
    </div>
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
