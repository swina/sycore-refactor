import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { userKey } from '@/lib/userKey'
import { idbTimelineAudioPut, idbTimelineAudioGet } from '@/lib/idb'

// ── Types ──────────────────────────────────────────────────────────────────

export interface LivePadSound {
  id: string
  name: string
  ccData: Record<string, number>
  paramValues: Record<string, number>
  category: string
  pc: number
  preset?: any
}

export interface PlaylistTrack {
  id: string
  label: string
  url: string
  genre?: string
  isLocal?: boolean
  duration?: number
}

export interface LivePadSettings {
  playlistRepeats: number[]
  crossfadeSec: number
  loopPlaylist: boolean
}

export interface LivePadSnapshot {
  sounds: LivePadSound[]
  playlist: PlaylistTrack[]
  playlistRepeats: number[]
  crossfadeSec: number
  loopPlaylist: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getItem<T>(key: string, defaultValue: T): T {
  try {
    const val = localStorage.getItem(userKey(key))
    return val ? JSON.parse(val) : defaultValue
  } catch {
    return defaultValue
  }
}

function setItem(key: string, val: any) {
  try {
    localStorage.setItem(userKey(key), JSON.stringify(val))
  } catch (e) {
    console.warn(`[Storage] Failed to save ${key} to localStorage:`, e)
  }
}

function emptySound(i: number): LivePadSound {
  return {
    id: `ls_slot_${i}`,
    name: '',
    ccData: {},
    paramValues: {},
    category: '',
    pc: i + 1,
  }
}

// ── Store ──────────────────────────────────────────────────────────────────

export const useLivePadStore = defineStore('livePad', () => {
  const sounds = ref<LivePadSound[]>(
    getItem('sycore_live_pads', Array.from({ length: 16 }, (_, i) => emptySound(i)))
  )

  const playlist = ref<PlaylistTrack[]>(getItem('sycore_live_playlist', []))
  const playlistIdx = ref(-1)
  const activePadIndex = ref(-1)
  const activePerfSetIdx  = ref(-1)
  const activeDevicePcIdx = ref(-1)
  const loopActivePads = ref<boolean[]>(Array(16).fill(false))

  const savedSettings = getItem<LivePadSettings>('sycore_live_settings', {
    playlistRepeats: [],
    crossfadeSec: 3,
    loopPlaylist: true,
  })
  const playlistRepeats = ref<number[]>(savedSettings.playlistRepeats || [])
  const playlistCurrentRepeat = ref(1)
  const crossfadeSec = ref(savedSettings.crossfadeSec ?? 3)
  const loopPlaylist = ref(savedSettings.loopPlaylist ?? true)

  // ── Auto-save ────────────────────────────────────────────────────────────

  watch([sounds, playlist, playlistRepeats, crossfadeSec, loopPlaylist], () => {
    saveState()
  }, { deep: true })

  // ── Actions ──────────────────────────────────────────────────────────────

  function updateSound(idx: number, data: Partial<LivePadSound>) {
    if (idx < 0 || idx >= sounds.value.length) return
    sounds.value[idx] = { ...sounds.value[idx], ...data }
  }

  function assignPresetToPad(idx: number, preset: any) {
    if (idx < 0 || idx >= sounds.value.length) return
    sounds.value[idx] = {
      ...sounds.value[idx],
      name: preset.name,
      preset,
      category: preset.category,
      ccData: preset.data,
    }
  }

  function clearPad(idx: number) {
    if (idx < 0 || idx >= sounds.value.length) return
    sounds.value[idx] = emptySound(idx)
  }

  function setPlaylist(newPlaylist: PlaylistTrack[]) {
    playlist.value = newPlaylist
  }

  function saveState() {
    const cleanedPlaylist = (playlist.value || []).map(track => {
      if (track.url && (track.url.startsWith('data:') || track.url.length > 2048)) {
        idbTimelineAudioPut(track.id, track.url).catch(() => {})
        return { ...track, url: '' }
      }
      return track
    })
    setItem('sycore_live_pads', sounds.value)
    setItem('sycore_live_playlist', cleanedPlaylist)
    setItem('sycore_live_settings', {
      playlistRepeats: playlistRepeats.value,
      crossfadeSec: crossfadeSec.value,
      loopPlaylist: loopPlaylist.value,
    })
  }

  async function restorePlaylistAudio() {
    const pl = playlist.value
    if (!pl.length) return
    const updated = await Promise.all(
      pl.map(async track => {
        if (!track.url && track.id) {
          const dataUrl = await idbTimelineAudioGet(track.id).catch(() => undefined)
          if (dataUrl) return { ...track, url: dataUrl }
        }
        return track
      })
    )
    if (updated.some((t, i) => t.url !== pl[i].url)) playlist.value = updated
  }

  function getSnapshot(): LivePadSnapshot {
    return {
      sounds: sounds.value,
      playlist: playlist.value,
      playlistRepeats: playlistRepeats.value,
      crossfadeSec: crossfadeSec.value,
      loopPlaylist: loopPlaylist.value,
    }
  }

  function loadSnapshot(snapshot: LivePadSnapshot | null) {
    if (!snapshot) return
    if (snapshot.sounds) sounds.value = snapshot.sounds
    if (snapshot.playlist) playlist.value = snapshot.playlist
    if (snapshot.playlistRepeats) playlistRepeats.value = snapshot.playlistRepeats
    if (snapshot.crossfadeSec !== undefined) crossfadeSec.value = snapshot.crossfadeSec
    if (snapshot.loopPlaylist !== undefined) loopPlaylist.value = snapshot.loopPlaylist
  }

  function clearAll() {
    sounds.value = Array.from({ length: 16 }, (_, i) => emptySound(i))
    playlist.value = []
    playlistIdx.value = -1
    playlistRepeats.value = []
  }

  function addBlobToPlaylist(blob: Blob, label?: string): PlaylistTrack {
    const url = URL.createObjectURL(blob)
    const newTrack: PlaylistTrack = {
      id: `local_${Date.now()}`,
      label: label || 'Looper Mix',
      url,
      genre: 'Looper',
      isLocal: true,
      duration: 0,
    }
    playlist.value = [...playlist.value, newTrack]
    playlistRepeats.value = [...playlistRepeats.value, 1]
    return newTrack
  }

  // Restore audio URLs from IDB on startup
  restorePlaylistAudio()

  return {
    sounds, playlist, playlistIdx, activePadIndex,
    activePerfSetIdx, activeDevicePcIdx, loopActivePads,
    playlistRepeats, playlistCurrentRepeat, crossfadeSec, loopPlaylist,
    updateSound, assignPresetToPad, clearPad, setPlaylist,
    saveState, getSnapshot, loadSnapshot, clearAll, addBlobToPlaylist,
  }
})