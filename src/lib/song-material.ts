/**
 * song-material.ts — SG4: the material of the songs that own it, and the session's (lib/songs.ts).
 *
 * The apps hold one material at a time (their slots A–H). Switching to a song with its own
 * material: what is in the apps goes back to where it came from (the song loaded, or the session),
 * then the song's comes in. A song with no material yet takes what is in the apps (Capture).
 * Only with the apps stopped (the Rig panel waits for a stop). IndexedDB (big-storage), per user.
 */
import { reactive } from 'vue'
import { bigLoad, bigSave } from './big-storage'
import { userKey } from './userKey'
import { captureEngines, applyEngines, type EngineSnapshot } from './engine-snapshot'
import { SESSION_MATERIAL, materialKey, type Song, type SongLibrary } from './songs'

const LS_MATERIAL = 'SYCORE_SONG_MATERIAL'
export const songMaterial = reactive<{ ready: boolean; byKey: Record<string, EngineSnapshot> }>({ ready: false, byKey: {} })

let loading: Promise<void> | null = null
export function loadSongMaterial(): Promise<void> {
  loading ??= bigLoad<Record<string, EngineSnapshot>>(userKey(LS_MATERIAL), {}).then(v => {
    songMaterial.byKey = v && typeof v === 'object' ? v : {}
    songMaterial.ready = true
  })
  return loading
}
const persist = () => bigSave(userKey(LS_MATERIAL), JSON.parse(JSON.stringify(songMaterial.byKey))).catch(() => {})
/** Saves the songs' material (after a change made outside this module: the sessions). */
export const persistSongMaterial = persist

/** The material key now in the apps. */
export const loadedKey = (lib: SongLibrary): string => lib.loadedId ?? SESSION_MATERIAL

/** The apps' slots become `song`'s material (it owns it from now on, and it is the one loaded). */
export async function captureInto(lib: SongLibrary, song: Song): Promise<void> {
  await loadSongMaterial()
  // what was loaded before (another song, the session) keeps a copy of the apps as they are
  const snap = captureEngines()
  const from = loadedKey(lib)
  if (from !== song.id) songMaterial.byKey[from] = JSON.parse(JSON.stringify(snap))
  song.own = true
  songMaterial.byKey[song.id] = snap
  lib.loadedId = song.id
  await persist()
}

/**
 * The apps' slots are `song`'s own material from now on, and it is the one loaded. `before`: the
 * apps before they were replaced (the AI Song Composer's Load) — what was loaded then keeps it.
 */
export async function adoptApps(lib: SongLibrary, song: Song, before?: EngineSnapshot | null): Promise<void> {
  await loadSongMaterial()
  if (before) songMaterial.byKey[loadedKey(lib)] = before
  song.own = true
  songMaterial.byKey[song.id] = captureEngines()
  lib.loadedId = song.id
  await persist()
}

/** True when switching to `song` would change what is in the apps. */
export const needsSwitch = (lib: SongLibrary, song: Song | null | undefined): boolean => loadedKey(lib) !== materialKey(song)

/** Puts `song`'s material (or the session's) in the apps; the material there goes back first. Stopped only. */
export async function switchMaterial(lib: SongLibrary, song: Song | null | undefined): Promise<boolean> {
  await loadSongMaterial()
  const from = loadedKey(lib)
  const to = materialKey(song)
  if (from === to) return false
  songMaterial.byKey[from] = captureEngines()
  const snap = songMaterial.byKey[to]
  if (snap) applyEngines(snap)
  else songMaterial.byKey[to] = captureEngines() // nothing yet: it starts from what is in the apps
  lib.loadedId = to === SESSION_MATERIAL ? null : to
  await persist()
  return true
}

/** A song no longer owns material: back to the session's (loaded now if it was in the apps). */
export async function dropMaterial(lib: SongLibrary, song: Song): Promise<void> {
  await loadSongMaterial()
  const wasLoaded = lib.loadedId === song.id
  if (wasLoaded) {
    const snap = songMaterial.byKey[SESSION_MATERIAL]
    if (snap) applyEngines(snap)
    lib.loadedId = null
  }
  delete songMaterial.byKey[song.id]
  song.own = false
  await persist()
}

/** A copy of a song's material for its duplicate. */
export async function copyMaterial(fromId: string, toId: string): Promise<void> {
  await loadSongMaterial()
  const m = songMaterial.byKey[fromId]
  if (m) { songMaterial.byKey[toId] = JSON.parse(JSON.stringify(m)); await persist() }
}

export async function deleteMaterial(id: string): Promise<void> {
  await loadSongMaterial()
  if (songMaterial.byKey[id]) { delete songMaterial.byKey[id]; await persist() }
}
