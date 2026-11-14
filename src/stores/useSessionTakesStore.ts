// Session takes: a journal of what Generate wrote over and what it made, per app and slot (Drum
// A–H, Bass A–H, Chord Prog slot, Sequencer bank). Before each Generate the slot's content is kept
// (the first one of the session marked 'start'), after it the result ('gen'). Kept across restarts
// until the user clears it, so nothing generated — nor an unsaved edit Generate replaced — is lost.
// The snapshots and their restore are in lib/session-takes.ts; this store only keeps the list.
import { defineStore } from 'pinia'
import { shallowRef, watch } from 'vue'
import { userKey } from '@/lib/userKey'

export type TakeApp = 'drum' | 'bass' | 'chord' | 'seq' | 'capt'
export type TakeKind = 'start' | 'before' | 'gen'
export type TakeTarget = string | number

export interface SessionTake {
  id: string
  app: TakeApp
  target: TakeTarget
  kind: TakeKind
  source?: 'builtin' | 'ai'
  at: number
  data: unknown
  /** a short text set when recorded (e.g. the Drum style) */
  note?: string
}

const LS_KEY = 'SYCORE_SESSION_TAKES'
/** Per app, besides each slot's 'start' take (never dropped). */
export const TAKES_PER_APP = 60

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
let _seq = 0
const newId = () => `${Date.now().toString(36)}${(_seq++).toString(36)}`

export const useSessionTakesStore = defineStore('sessionTakes', () => {
  const load = (): { takes: SessionTake[]; startedAt: number } => {
    try {
      const v = JSON.parse(localStorage.getItem(userKey(LS_KEY)) || 'null')
      if (v && Array.isArray(v.takes)) return { takes: v.takes, startedAt: v.startedAt || Date.now() }
    } catch {}
    return { takes: [], startedAt: Date.now() }
  }
  const saved = load()
  // shallow: the snapshots are plain data, replaced (never edited) — no deep reactivity on them
  const takes = shallowRef<SessionTake[]>(saved.takes)
  const startedAt = shallowRef(saved.startedAt)

  let _saveTimer: ReturnType<typeof setTimeout> | null = null
  const persist = () => {
    try { localStorage.setItem(userKey(LS_KEY), JSON.stringify({ takes: takes.value, startedAt: startedAt.value })) } catch {}
  }
  watch([takes, startedAt], () => {
    if (_saveTimer) clearTimeout(_saveTimer)
    _saveTimer = setTimeout(() => { _saveTimer = null; persist() }, 400)
  })

  const lastFor = (app: TakeApp, target: TakeTarget): SessionTake | undefined => {
    for (let i = takes.value.length - 1; i >= 0; i--) {
      const t = takes.value[i]
      if (t.app === app && t.target === target) return t
    }
    return undefined
  }

  function trim(list: SessionTake[], app: TakeApp): SessionTake[] {
    let extra = list.filter(t => t.app === app && t.kind !== 'start').length - TAKES_PER_APP
    if (extra <= 0) return list
    return list.filter(t => !(extra > 0 && t.app === app && t.kind !== 'start' && extra-- > 0))
  }

  function push(t: Omit<SessionTake, 'id' | 'at'>): SessionTake {
    const take: SessionTake = { ...t, id: newId(), at: Date.now(), data: clone(t.data) }
    takes.value = trim([...takes.value, take], t.app)
    return take
  }

  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

  /** The slot's content before a Generate (or a restore): kept unless the slot's last take is the same. */
  function before(app: TakeApp, target: TakeTarget, data: unknown): SessionTake | null {
    const last = lastFor(app, target)
    if (last && same(last.data, data)) return null
    return push({ app, target, kind: last ? 'before' : 'start', data })
  }

  /** What a Generate made (skipped when it changed nothing). */
  function after(app: TakeApp, target: TakeTarget, data: unknown, source: 'builtin' | 'ai' = 'builtin', note?: string): SessionTake | null {
    const last = lastFor(app, target)
    if (last && same(last.data, data)) return null
    return push({ app, target, kind: 'gen', source, data, note })
  }

  function remove(id: string) { takes.value = takes.value.filter(t => t.id !== id) }

  /** A new session: the journal emptied. */
  function clear() { takes.value = []; startedAt.value = Date.now() }

  return { takes, startedAt, before, after, remove, clear, lastFor }
})
