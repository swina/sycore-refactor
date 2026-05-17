import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'

export const useLivePadStore = defineStore('livePad', () => {
  // Helper for localStorage
  const getItem = (key, defaultValue) => {
    try {
      const val = localStorage.getItem(key)
      return val ? JSON.parse(val) : defaultValue
    } catch {
      return defaultValue
    }
  }
  const setItem = (key, val) => {
    try {
      localStorage.setItem(key, JSON.stringify(val))
    } catch (e) {
      console.warn(`[Storage] Failed to save ${key} to localStorage:`, e)
    }
  }

  // --- State ---
  // 16 pads for sounds (presets)
  const sounds = ref(getItem('sycore_live_pads', Array(16).fill(null).map((_, i) => ({
    id: `ls_slot_${i}`,
    name: '',
    ccData: {},
    paramValues: {},
    category: '',
    pc: i + 1
  }))))

  // 16 slots for backing tracks
  const playlist = ref(getItem('sycore_live_playlist', []))
  const playlistIdx = ref(-1)
  const activePadIndex = ref(-1)
  
  // Load settings from storage
  const savedSettings = getItem('sycore_live_settings', {})
  const playlistRepeats = ref(savedSettings.playlistRepeats || [])
  const playlistCurrentRepeat = ref(1)
  const crossfadeSec = ref(savedSettings.crossfadeSec ?? 3)
  const loopPlaylist = ref(savedSettings.loopPlaylist ?? true)

  // --- Auto-save ---
  watch([sounds, playlist, playlistRepeats, crossfadeSec, loopPlaylist], () => {
    saveState()
  }, { deep: true })

  // --- Actions ---
  function updateSound(idx, data) {
    if (idx < 0 || idx >= sounds.value.length) return
    sounds.value[idx] = { ...sounds.value[idx], ...data }
  }

  function assignPresetToPad(idx, preset) {
    if (idx < 0 || idx >= sounds.value.length) return
    sounds.value[idx] = {
      ...sounds.value[idx],
      name: preset.name,
      preset: preset, // Store the full preset object for recall
      category: preset.category,
      ccData: preset.data
    }
  }

  function clearPad(idx) {
    if (idx < 0 || idx >= sounds.value.length) return
    sounds.value[idx] = {
      id: `ls_slot_${idx}`,
      name: '',
      ccData: {},
      paramValues: {},
      category: '',
      pc: idx + 1
    }
  }

  function setPlaylist(newPlaylist) {
    playlist.value = newPlaylist
    // saveState() is called by watch
  }

  function saveState() {
    // Strip giant base64 data URLs from playlist to prevent QuotaExceededError
    const cleanedPlaylist = (playlist.value || []).map(track => {
      if (track.url && (track.url.startsWith('data:') || track.url.length > 2048)) {
        return {
          ...track,
          url: '' // Strip it, we will restore it from Firestore/IndexedDB on reload
        }
      }
      return track
    })
    setItem('sycore_live_pads', sounds.value)
    setItem('sycore_live_playlist', cleanedPlaylist)
    // Other settings
    setItem('sycore_live_settings', {
      playlistRepeats: playlistRepeats.value,
      crossfadeSec: crossfadeSec.value,
      loopPlaylist: loopPlaylist.value
    })
  }

  function getSnapshot() {
    return {
      sounds: sounds.value,
      playlist: playlist.value,
      playlistRepeats: playlistRepeats.value,
      crossfadeSec: crossfadeSec.value,
      loopPlaylist: loopPlaylist.value
    }
  }

  function loadSnapshot(snapshot) {
    if (!snapshot) return
    if (snapshot.sounds) sounds.value = snapshot.sounds
    if (snapshot.playlist) playlist.value = snapshot.playlist
    if (snapshot.playlistRepeats) playlistRepeats.value = snapshot.playlistRepeats
    if (snapshot.crossfadeSec !== undefined) crossfadeSec.value = snapshot.crossfadeSec
    if (snapshot.loopPlaylist !== undefined) loopPlaylist.value = snapshot.loopPlaylist
  }

  function clearAll() {
    sounds.value = Array(16).fill(null).map((_, i) => ({
      id: `ls_slot_${i}`,
      name: '',
      ccData: {},
      paramValues: {},
      category: '',
      pc: i + 1
    }))
    playlist.value = []
    playlistIdx.value = -1
    playlistRepeats.value = []
  }

  function addBlobToPlaylist(blob, label) {
    const url = URL.createObjectURL(blob)
    const newTrack = {
      id: `local_${Date.now()}`,
      label: label || 'Looper Mix',
      url: url,
      genre: 'Looper',
      isLocal: true,
      duration: 0 // Will be updated by player
    }
    playlist.value = [...playlist.value, newTrack]
    playlistRepeats.value = [...playlistRepeats.value, 1]
    return newTrack
  }

  return {
    sounds,
    playlist,
    playlistIdx,
    activePadIndex,
    playlistRepeats,
    playlistCurrentRepeat,
    crossfadeSec,
    loopPlaylist,
    updateSound,
    assignPresetToPad,
    clearPad,
    setPlaylist,
    saveState,
    getSnapshot,
    loadSnapshot,
    clearAll,
    addBlobToPlaylist
  }
})
