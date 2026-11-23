/**
 * sessions.ts — a session: what is played (plan phase 6a, docs/plans/projects-and-control.md). Pure.
 *
 * A project has several sessions (e.g. one per gig, or a rehearsal); each holds:
 *   - the three engines' material (lib/engine-snapshot.ts): Chord Prog, Drum Machine, Sequencer
 *     lanes, with tempo and key;
 *   - the Rig's Trigger sync and Fades (master / Drum, and per MIDI channel);
 *   - its songs (Session > Songs, SG3: one session, several songs).
 * The current session is what is in the apps now (it follows the user, S2): its stored copy is
 * refreshed when it is left (another session, another project) or saved. Loading one: with the
 * apps stopped (else at the next stop).
 */
import type { EngineSnapshot } from './engine-snapshot'
import type { SongLibrary } from './songs'

export interface SessionData {
  engines: EngineSnapshot | null
  /** the Rig's settings as stored (SYCORE_RIG_SYNC / _FADES / _CH_FADES); null = left as they are */
  rig: { sync: unknown; fades: unknown; chFades: unknown }
  songs: SongLibrary | null
}

export interface Session {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  data: SessionData
}

export interface ProjectSessions { sessions: Session[]; currentId: string }
/** Per project id. */
export type SessionsDoc = Record<string, ProjectSessions>

const rid = (): string => Math.random().toString(36).slice(2, 11)

export function createSession(name: string, data: SessionData, now = Date.now()): Session {
  return { id: rid(), name, createdAt: now, updatedAt: now, data }
}

/** A name not taken yet: `base`, then "base 2", "base 3"… */
export function uniqueSessionName(taken: Iterable<string>, base: string): string {
  const t = new Set(taken)
  const b = base.trim() || 'Session'
  if (!t.has(b)) return b
  let i = 2
  while (t.has(`${b} ${i}`)) i++
  return `${b} ${i}`
}

const okSession = (s: any): s is Session =>
  !!s && typeof s === 'object' && typeof s.id === 'string' && s.id && typeof s.name === 'string' && !!s.data && typeof s.data === 'object'

/** The stored doc, repaired: bad sessions dropped, each project's current one existing. */
export function parseSessionsDoc(raw: unknown): SessionsDoc {
  const out: SessionsDoc = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [pid, ps] of Object.entries(raw as Record<string, any>)) {
    const sessions = Array.isArray(ps?.sessions) ? ps.sessions.filter(okSession).map((s: Session) => ({
      ...s,
      createdAt: Number(s.createdAt) || 0,
      updatedAt: Number(s.updatedAt) || 0,
      data: { engines: s.data.engines ?? null, rig: s.data.rig ?? { sync: null, fades: null, chFades: null }, songs: s.data.songs ?? null },
    })) : []
    if (!sessions.length) continue
    out[pid] = { sessions, currentId: sessions.some((s: Session) => s.id === ps.currentId) ? ps.currentId : sessions[0].id }
  }
  return out
}

/**
 * A copy of a session's data for a duplicate: its songs get new ids (their own material is kept
 * per song id: `ownIds` maps old → new, for the caller to copy it).
 */
export function duplicateData(d: SessionData): { data: SessionData; ownIds: [string, string][] } {
  const data: SessionData = JSON.parse(JSON.stringify(d))
  const ownIds: [string, string][] = []
  if (data.songs) {
    const map = new Map<string, string>()
    for (const s of data.songs.songs) {
      const id = rid()
      map.set(s.id, id)
      if (s.own) ownIds.push([s.id, id])
      s.id = id
    }
    data.songs.currentId = data.songs.currentId ? map.get(data.songs.currentId) ?? null : null
    data.songs.loadedId = null
  }
  return { data, ownIds }
}

/** The song ids with their own material in a session (deleted with it). */
export const ownSongIds = (d: SessionData): string[] => (d.songs?.songs ?? []).filter(s => s.own).map(s => s.id)
