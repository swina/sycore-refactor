/**
 * led-feedback.ts — which LED each mapped button should show (pure).
 *
 * From the MIDI Learn mappings (paramName → 127 / 0) and the app mappings
 * (action → their feedbackOn / feedbackOff), given the state of what each one
 * controls, the list of LED messages wanted; then only the ones that changed
 * since the last send.
 *
 * A mapping with no state (a knob, an action with no on/off) gives no LED.
 * Two mappings on one button: on wins. A mapping without a device gives none
 * (it can't be told which output to light).
 */

export interface LedEntry {
  /** Output port (the controller's name: input and output share it). */
  device: string
  status: number
  data1: number
  value: number
}

export const ledKey = (e: { device: string; status: number; data1: number }): string => `${e.device}|${e.status}|${e.data1}`

type StateOf = (name: string) => boolean | undefined

interface LearnEntry { paramName?: string; device?: string | null; channel?: number | null; cc?: number; note?: number }
interface AppEntry { action?: string; device?: string; channel?: number; cc?: number; note?: number; feedbackOn?: number; feedbackOff?: number }

function msgOf(m: { channel?: number | null; cc?: number; note?: number }): { status: number; data1: number } | null {
  const ch = (m.channel == null || m.channel < 0 ? 0 : m.channel) & 0x0F
  if (typeof m.note === 'number') return { status: 0x90 | ch, data1: m.note }
  if (typeof m.cc === 'number') return { status: 0xB0 | ch, data1: m.cc }
  return null
}

/** LEDs wanted by the MIDI Learn mappings (127 on, 0 off) and the app mappings (their feedback values). */
export function ledTargets(
  learn: Record<string, unknown>,
  app: readonly AppEntry[],
  paramState: StateOf,
  actionState: StateOf,
): LedEntry[] {
  const byKey = new Map<string, LedEntry & { on: boolean }>()
  const put = (device: string, msg: { status: number; data1: number }, on: boolean, value: number) => {
    const e = { device, ...msg, value, on }
    const k = ledKey(e)
    const prev = byKey.get(k)
    if (!prev || (on && !prev.on)) byKey.set(k, e)
  }
  for (const raw of Object.values(learn)) {
    if (!raw || typeof raw !== 'object') continue
    const m = raw as LearnEntry
    if (!m.paramName || !m.device) continue
    const on = paramState(m.paramName)
    if (on === undefined) continue
    const msg = msgOf(m)
    if (msg) put(m.device, msg, on, on ? 127 : 0)
  }
  for (const m of app) {
    if (!m?.action || !m.device || m.feedbackOn === undefined || m.feedbackOff === undefined) continue
    const on = actionState(m.action)
    if (on === undefined) continue
    const msg = msgOf(m)
    if (msg) put(m.device, msg, on, on ? m.feedbackOn : m.feedbackOff)
  }
  return [...byKey.values()].map(({ on: _on, ...e }) => e)
}

/** The entries whose value differs from what was last sent (`sent`: key → value); `sent` is updated. */
export function ledChanges(sent: Map<string, number>, wanted: readonly LedEntry[]): LedEntry[] {
  const out: LedEntry[] = []
  for (const e of wanted) {
    const k = ledKey(e)
    if (sent.get(k) === e.value) continue
    sent.set(k, e.value)
    out.push(e)
  }
  return out
}

/** A port name without what tells input from output ("MIDIIN2 (x)", "MIDIOUT2 (x)", "2- x", "x In"/"x Out"). */
export function portBaseName(name: string): string {
  let n = name.trim().toLowerCase()
  const paren = /^midi(?:in|out)\d*\s*\((.*)\)$/.exec(n)
  if (paren) n = paren[1]
  n = n.replace(/^\d+\s*-\s*/, '').replace(/\s+(?:in|out|input|output)$/, '')
  return n.trim()
}

/**
 * The output to light a controller's LEDs: a mapping keeps its input's name, and
 * the output may be named a little differently. Exact name, then same name
 * ignoring case, then the same base name (portBaseName). Null: none.
 */
export function findOutputFor<T extends { name?: string | null }>(inputName: string, outputs: readonly T[]): T | null {
  const exact = outputs.find(o => o.name === inputName)
  if (exact) return exact
  const lower = inputName.toLowerCase()
  const ci = outputs.find(o => (o.name ?? '').toLowerCase() === lower)
  if (ci) return ci
  const base = portBaseName(inputName)
  return outputs.find(o => o.name && portBaseName(o.name) === base) ?? null
}
