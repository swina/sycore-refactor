/**
 * sessions.ts — the sessions at runtime (plan phase 6a; the model: lib/sessions.ts).
 *
 * Each project has its sessions (IndexedDB, per user, `SYCORE_SESSIONS`). The current session is
 * what is in the apps now: the apps, the Rig's settings and the songs keep their own state as
 * always, so it follows the user (S2); its stored copy is refreshed when it is left or saved.
 * Loading another session (or switching project: its current session comes in) only with the
 * apps stopped — playing, it waits for the stop. Installed by SynthApp.
 */
import { ref, computed, watch } from 'vue'
import { bigLoad, bigSave } from '@/lib/big-storage'
import { userKey } from '@/lib/userKey'
import { captureEngines, applyEngines } from '@/lib/engine-snapshot'
import { songLibrary, saveSongs, parseLibrary, SESSION_MATERIAL, songRun } from '@/lib/songs'
import { songMaterial, loadSongMaterial, copyMaterial, deleteMaterial, persistSongMaterial, needsSwitch, switchMaterial } from '@/lib/song-material'
import { intGrid } from '@/core/midi/int-grid'
import {
  type Session, type SessionData, type SessionsDoc, createSession, uniqueSessionName, parseSessionsDoc,
  duplicateData, ownSongIds,
} from '@/lib/sessions'
import { seqLanePlaying } from '@/lib/seq-lanes'
import { externalGrid } from '@/core/midi/external-grid'
import { useTransportManager } from '@/composables/useTransportManager'
import { useDrumMachineStore } from '@/stores/useDrumMachineStore'
import { useChordProgStore } from '@/stores/useChordProgStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { currentProjectId, projectsLoaded } from '@/core/projects'

const LS_SESSIONS = 'SYCORE_SESSIONS'
/** The Rig's settings in a session (the Rig panel reads them back on 'rig-settings-reloaded'). */
const RIG_KEYS = { sync: 'SYCORE_RIG_SYNC', fades: 'SYCORE_RIG_FADES', chFades: 'SYCORE_RIG_CH_FADES' } as const
export const RIG_SETTINGS_EVENT = 'rig-settings-reloaded'

const doc = ref<SessionsDoc>({})
export const sessionsLoaded = ref(false)
/** A session (or a project's) waiting for the apps to stop: { projectId, sessionId } */
export const pendingSession = ref<{ projectId: string; sessionId: string } | null>(null)

/** The sessions of the current project, the current one. */
export const projectSessions = computed(() => (currentProjectId.value ? doc.value[currentProjectId.value] ?? null : null))
export const sessions = computed<Session[]>(() => projectSessions.value?.sessions ?? [])
export const currentSession = computed(() => sessions.value.find(s => s.id === projectSessions.value?.currentId) ?? null)

const persist = () => bigSave(userKey(LS_SESSIONS), JSON.parse(JSON.stringify(doc.value))).catch(() => {})

/** Nothing plays: no app, no transport, no Live grid. */
export function appsIdle(): boolean {
  const dm = useDrumMachineStore()
  const cp = useChordProgStore()
  return !dm.isPlaying && !cp.isPlaying && !seqLanePlaying.main && !seqLanePlaying.bass && !seqLanePlaying.arp
    && !useTransportManager().isRunning.value && !externalGrid.active && intGrid.barLineAtOrAfter(performance.now()) == null
}

// ── The song open: its own material in the apps (SG4), only with them stopped ──
/** The song open waits for a stop to load its material (or to give the session's slots back). */
export const materialPending = ref(false)
let materialBusy = false
export async function syncSongMaterial(): Promise<void> {
  const lib = songLibrary()
  const song = lib.songs.find(x => x.id === lib.currentId)
  if (!needsSwitch(lib, song)) { materialPending.value = false; return }
  if (!appsIdle() || songRun.value) { materialPending.value = true; return }
  if (materialBusy || busy) return
  materialBusy = true
  materialPending.value = false
  try { await switchMaterial(lib, song) } finally { materialBusy = false }
}

// ── What is in the apps now, and putting a session there ─────────────────
function readRig(): SessionData['rig'] {
  const get = (k: string) => { try { const v = localStorage.getItem(k); return v != null ? JSON.parse(v) : null } catch { return null } }
  return { sync: get(RIG_KEYS.sync), fades: get(RIG_KEYS.fades), chFades: get(RIG_KEYS.chFades) }
}

/** The current session's data: the apps (the session's slots — a song with its own material loaded
 *  holds them: that song keeps the apps, the session's slots are the copy kept aside). */
export async function captureNow(): Promise<SessionData> {
  await loadSongMaterial()
  const lib = songLibrary()
  let engines = captureEngines()
  if (lib.loadedId) {
    songMaterial.byKey[lib.loadedId] = engines // the song loaded keeps what is in the apps
    engines = (songMaterial.byKey[SESSION_MATERIAL] as typeof engines) ?? engines
    await persistSongMaterial()
  }
  const songs = JSON.parse(JSON.stringify(lib))
  songs.loadedId = null // the session comes back with its own slots in the apps
  return { engines: JSON.parse(JSON.stringify(engines)), rig: readRig(), songs }
}

async function applyData(d: SessionData): Promise<void> {
  await loadSongMaterial()
  if (d.engines) applyEngines(d.engines)
  for (const [k, key] of Object.entries(RIG_KEYS)) {
    const v = (d.rig as any)?.[k]
    try { if (v != null) localStorage.setItem(key, JSON.stringify(v)); else localStorage.removeItem(key) } catch {}
  }
  window.dispatchEvent(new CustomEvent(RIG_SETTINGS_EVENT))
  // its songs; the session's slots are in the apps (nothing kept aside any more)
  const lib = songLibrary()
  const next = parseLibrary(d.songs ?? null)
  lib.songs = next.songs
  lib.currentId = next.currentId
  lib.loadedId = null
  saveSongs(lib)
  if (songMaterial.byKey[SESSION_MATERIAL]) { delete songMaterial.byKey[SESSION_MATERIAL]; await persistSongMaterial() }
}

// ── Actions on the current project's sessions ────────────────────────────
function ps() {
  const pid = currentProjectId.value
  return pid ? doc.value[pid] ?? null : null
}

/** Save: the current session takes what is in the apps now. */
export async function saveCurrentSession(): Promise<void> {
  const p = ps()
  const cur = p?.sessions.find(s => s.id === p.currentId)
  if (!cur) return
  cur.data = await captureNow()
  cur.updatedAt = Date.now()
  await persist()
}

/** A new session from what is in the apps now; it becomes the current one (nothing changes in the apps). */
export async function newSession(name: string): Promise<Session | null> {
  const p = ps()
  if (!p) return null
  await saveCurrentSession()
  const s = createSession(uniqueSessionName(p.sessions.map(x => x.name), name), await captureNow())
  p.sessions.push(s)
  p.currentId = s.id
  await persist()
  return s
}

export async function renameSession(id: string, name: string): Promise<void> {
  const p = ps()
  const s = p?.sessions.find(x => x.id === id)
  if (!p || !s || !name.trim() || name.trim() === s.name) return
  s.name = uniqueSessionName(p.sessions.filter(x => x.id !== id).map(x => x.name), name)
  s.updatedAt = Date.now()
  await persist()
}

export async function duplicateSession(id: string): Promise<void> {
  const p = ps()
  if (!p) return
  if (id === p.currentId) await saveCurrentSession()
  const s = p.sessions.find(x => x.id === id)
  if (!s) return
  const { data, ownIds } = duplicateData(s.data)
  for (const [from, to] of ownIds) await copyMaterial(from, to)
  p.sessions.push(createSession(uniqueSessionName(p.sessions.map(x => x.name), `${s.name} copy`), data))
  await persist()
}

/**
 * A song of the current session copied into another session of the project (a new id; its own
 * material copied too — the apps' if it is the one loaded now). The copy is independent.
 */
export async function copySongToSession(songId: string, sessionId: string): Promise<string | null> {
  const p = ps()
  const target = p?.sessions.find(s => s.id === sessionId)
  const lib = songLibrary()
  const song = lib.songs.find(s => s.id === songId)
  if (!p || !target || sessionId === p.currentId || !song) return null
  const copy = JSON.parse(JSON.stringify(song))
  copy.id = Math.random().toString(36).slice(2, 10)
  for (const sec of copy.sections) sec.id = Math.random().toString(36).slice(2, 10)
  if (song.own) {
    await loadSongMaterial()
    if (lib.loadedId === song.id) { songMaterial.byKey[song.id] = captureEngines(); await persistSongMaterial() }
    await copyMaterial(song.id, copy.id)
  }
  const songs = target.data.songs ?? { songs: [], currentId: null, loadedId: null }
  const names = new Set(songs.songs.map(s => s.name))
  if (names.has(copy.name)) { let i = 2; while (names.has(`${copy.name} ${i}`)) i++; copy.name = `${copy.name} ${i}`.slice(0, 40) }
  songs.songs.push(copy)
  songs.currentId ??= copy.id
  target.data.songs = songs
  target.updatedAt = Date.now()
  await persist()
  return copy.name
}

/** Delete a session (not the current one, not the last). */
export async function deleteSession(id: string): Promise<boolean> {
  const p = ps()
  if (!p || p.sessions.length <= 1 || id === p.currentId) return false
  const s = p.sessions.find(x => x.id === id)
  if (!s) return false
  p.sessions = p.sessions.filter(x => x.id !== id)
  for (const sid of ownSongIds(s.data)) await deleteMaterial(sid)
  await persist()
  return true
}

/**
 * Load a session of the current project: the one playing now is saved first. Playing: at the next
 * stop. Returns 'now' | 'pending' | 'same'.
 */
export async function loadSession(id: string): Promise<'now' | 'pending' | 'same'> {
  const p = ps()
  if (!p || !p.sessions.some(s => s.id === id)) return 'same'
  if (id === p.currentId) { if (pendingSession.value?.projectId === currentProjectId.value) pendingSession.value = null; return 'same' }
  if (!appsIdle()) { pendingSession.value = { projectId: currentProjectId.value!, sessionId: id }; return 'pending' }
  await switchTo(currentProjectId.value!, id)
  return 'now'
}

let busy = false
/** The session `id` of project `pid` into the apps (stopped). The project's current one is left first
 *  when `leave` is true (the same project); a project switch left its own already. */
async function switchTo(pid: string, id: string, leaveFrom: { pid: string; id: string } | null = null): Promise<void> {
  if (busy) return
  busy = true
  try {
    const from = leaveFrom ?? { pid, id: doc.value[pid]?.currentId ?? '' }
    const left = doc.value[from.pid]?.sessions.find(s => s.id === from.id)
    if (left) { left.data = await captureNow(); left.updatedAt = Date.now() }
    const target = doc.value[pid]?.sessions.find(s => s.id === id)
    if (target) {
      await applyData(target.data)
      doc.value[pid].currentId = id
    }
    pendingSession.value = null
    await persist()
  } finally { busy = false }
}

// ── Projects: each one's current session comes in with it ────────────────
/** A project without sessions yet: one, from what is in the apps now. */
async function ensureProject(pid: string): Promise<boolean> {
  if (doc.value[pid]) return false
  const s = createSession('Session 1', await captureNow())
  doc.value[pid] = { sessions: [s], currentId: s.id }
  await persist()
  return true
}

/** Project switched from `oldPid` to `pid`: the old one's session is kept, the new one's loaded (stopped). */
let projectLeft: { pid: string; id: string } | null = null
async function onProjectSwitch(pid: string, oldPid: string | null) {
  if (oldPid && !projectLeft) {
    const id = doc.value[oldPid]?.currentId
    if (id) projectLeft = { pid: oldPid, id }
  }
  // a new project starts from what is in the apps (its first session); nothing to load
  if (await ensureProject(pid)) {
    if (projectLeft) {
      const left = doc.value[projectLeft.pid]?.sessions.find(s => s.id === projectLeft!.id)
      if (left) { left.data = await captureNow(); left.updatedAt = Date.now(); await persist() }
    }
    projectLeft = null
    pendingSession.value = null
    return
  }
  const target = doc.value[pid].currentId
  if (!appsIdle()) { pendingSession.value = { projectId: pid, sessionId: target }; return }
  const leave = projectLeft
  projectLeft = null
  await switchTo(pid, target, leave ?? { pid, id: '' })
}

let installed = false
export function installSessions(): void {
  if (installed) return
  installed = true
  const authStore = useAuthStore()

  async function load() {
    sessionsLoaded.value = false
    doc.value = parseSessionsDoc(await bigLoad(userKey(LS_SESSIONS), {}))
    sessionsLoaded.value = true
    // the current project: what is in the apps is its current session (existing users: its first one)
    if (currentProjectId.value) await ensureProject(currentProjectId.value)
  }
  watch(() => [authStore.user?.uid, projectsLoaded.value] as const, ([uid, ok]) => {
    doc.value = {}
    sessionsLoaded.value = false
    pendingSession.value = null
    projectLeft = null
    if (uid && ok) load()
  }, { immediate: true })

  watch(currentProjectId, (pid, old) => {
    if (!sessionsLoaded.value || !pid || pid === old) return
    onProjectSwitch(pid, old ?? null)
  })

  // the song open: its material (now, or at the stop)
  loadSongMaterial().then(syncSongMaterial)
  watch(() => songLibrary().currentId, () => { syncSongMaterial() })

  // a session waiting for the stop; the song open's material waiting for it
  setInterval(() => {
    if (materialPending.value && !busy && appsIdle()) syncSongMaterial()
    const p = pendingSession.value
    if (!p || busy || !appsIdle()) return
    if (p.projectId !== currentProjectId.value) { pendingSession.value = null; return }
    const leave = projectLeft
    projectLeft = null
    switchTo(p.projectId, p.sessionId, leave ?? null)
  }, 400)
}
