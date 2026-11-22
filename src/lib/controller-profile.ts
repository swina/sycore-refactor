/**
 * controller-profile.ts — controllers that belong to Ableton Live or to SY.CORE.
 *
 * Since control sets (lib/projects.ts, phase 3a of docs/plans/projects-and-control.md)
 * a controller's role is in the project's active set, and the key switches between
 * two sets. What stays here: the key and Follow the clock (ProfileSettings), the
 * ingress verdict, and the old mode / Live list, read once to migrate them to sets.
 *
 * One mode for the whole rig, switched by one learned key (and optionally by the
 * Live clock): **Live** — the controllers chosen as "Live's" (by default the AKAI
 * MIDImix) are Live's Control Surface: SY.CORE drops their input and sends them
 * no LEDs. **Performance** — they work through the user's own mappings (MIDI
 * Learn, app mappings, Controller Designer), with LED feedback.
 *
 * The key works in both modes, even when it is on a Live controller; its
 * release is swallowed too, so it never reaches a mapping.
 */
import { learnToggle, matchToggle, type RigToggleBinding } from '@/lib/rig-toggle'
import { isMidimixName } from '@/lib/rig-midimix'

export type ControllerMode = 'live' | 'performance'

export interface ProfileSettings {
  /** Port names of Live's controllers; null: the default (any MIDImix). */
  liveDevices: string[] | null
  /** The key that switches Live ↔ Performance. */
  key: RigToggleBinding | null
  /** Follow the clock: Live while SY.CORE follows an external clock (MIDI clock / Link), Performance when it stops. */
  autoLive: boolean
}

export const DEFAULT_PROFILE: ProfileSettings = { liveDevices: null, key: null, autoLive: false }

const norm = (s: string): string => s.trim().toLowerCase()

/** A port of one of Live's controllers? (input and output alike: same name) */
export function isLiveDevice(s: ProfileSettings, name: string | undefined | null): boolean {
  if (!name) return false
  if (s.liveDevices === null) return isMidimixName(name)
  const n = norm(name)
  return s.liveDevices.some(d => norm(d) === n)
}

export type IngressVerdict = 'toggle' | 'swallow' | 'drop' | 'pass'

/**
 * What to do with an incoming message: the key's press → 'toggle', its release
 * → 'swallow'; a controller that is Live's right now (its role in the active
 * control set, `isLive`) → 'drop'; else 'pass'.
 */
export function profileIngress(s: ProfileSettings, isLive: (device: string | undefined | null) => boolean, device: string | undefined | null, data: ArrayLike<number>): IngressVerdict {
  const k = matchToggle(s.key, device, data)
  if (k === 'press') return 'toggle'
  if (k === 'release') return 'swallow'
  if (isLive(device)) return 'drop'
  return 'pass'
}

/** The key a message would learn (a note-on or CC > 0), null otherwise. */
export const learnProfileKey = learnToggle

/** Turn a Live controller on / off in the list (starting from the default: the MIDImix ports connected). */
export function setLiveDevice(s: ProfileSettings, name: string, on: boolean, connected: readonly string[]): ProfileSettings {
  const cur = s.liveDevices ?? connected.filter(n => isMidimixName(n))
  const rest = cur.filter(d => norm(d) !== norm(name))
  return { ...s, liveDevices: on ? [...rest, name] : rest }
}

const LS_KEY = 'SYCORE_CONTROLLER_PROFILE'
const LS_MODE = 'SYCORE_CONTROLLER_MODE'

export function loadProfile(): ProfileSettings {
  try {
    const p = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null')
    if (!p || typeof p !== 'object') return { ...DEFAULT_PROFILE }
    const key = p.key && typeof p.key.device === 'string' && typeof p.key.status === 'number' && typeof p.key.data1 === 'number' ? p.key : null
    const liveDevices = Array.isArray(p.liveDevices) ? p.liveDevices.filter((d: unknown) => typeof d === 'string') : null
    return { liveDevices, key, autoLive: p.autoLive === true }
  } catch { return { ...DEFAULT_PROFILE } }
}

export function saveProfile(s: ProfileSettings): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)) } catch {}
}

export function loadMode(): ControllerMode {
  // Performance by default: as before profiles, SY.CORE sees every controller.
  try { return localStorage.getItem(LS_MODE) === 'live' ? 'live' : 'performance' } catch { return 'performance' }
}

export function saveMode(m: ControllerMode): void {
  try { localStorage.setItem(LS_MODE, m) } catch {}
}
