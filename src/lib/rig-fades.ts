/**
 * rig-fades.ts — Fade In on the global Start, Fade Out on the global Stop (pure).
 *
 * From docs/notes/automations.md: the master and each lane (Drum, Chord, Seq, Bass, Arp) get a
 * Fade In and a Fade Out, in bars (0 = off). A fade is a factor 0–1 on the Rig's Intensity (CC 7
 * or velocity, as each lane's Intensity mode) — the master's on the Global intensity and the audio
 * mixer's master. Fade In: from the Play, 0 → 1 over its bars. Fade Out: it ends on the Stop's
 * bar line (the Rig's Stop comes at the end of the next bar); longer than the time left, it starts now.
 */
export const FADE_KEYS = ['master', 'drum', 'chord', 'seq', 'bass', 'arp'] as const
export type FadeKey = typeof FADE_KEYS[number]
export const FADE_BARS = [0, 0.5, 1, 2, 4] as const

/** in / out: bars (0 = off); max: the level a Fade In goes up to, 0–127 (127 = the Intensity as set). */
export interface FadeSetting { in: number; out: number; max: number }
export type FadeSettings = Record<FadeKey, FadeSetting>

export interface FadeRamp { key: FadeKey; from: number; to: number; t0: number; t1: number }

export function defaultFades(): FadeSettings {
  return Object.fromEntries(FADE_KEYS.map(k => [k, { in: 0, out: 0, max: 127 }])) as FadeSettings
}

const okBars = (v: unknown): number => (FADE_BARS as readonly number[]).includes(Number(v)) ? Number(v) : 0

export function parseFades(raw: unknown): FadeSettings {
  const d = defaultFades()
  const r = raw && typeof raw === 'object' ? raw as Record<string, any> : {}
  for (const k of FADE_KEYS) {
    const m = Number(r[k]?.max)
    d[k] = { in: okBars(r[k]?.in), out: okBars(r[k]?.out), max: Number.isFinite(m) ? Math.max(0, Math.min(127, Math.round(m))) : 127 }
  }
  return d
}

/** The factor of a ramp at time `t` (linear). */
export function rampAt(r: FadeRamp, t: number): number {
  if (t <= r.t0) return r.from
  if (t >= r.t1 || r.t1 <= r.t0) return r.to
  return r.from + (r.to - r.from) * ((t - r.t0) / (r.t1 - r.t0))
}

/**
 * The Fade In ramps of a Start at `now`: from 0 (a Fade Out left it there; never from full) up to
 * its max. The keys without a Fade In: at their max at once (`full`, with the level).
 */
export function planFadeIn(s: FadeSettings, now: number, barMs: number): { ramps: FadeRamp[]; full: { key: FadeKey; level: number }[] } {
  const ramps: FadeRamp[] = []
  const full: { key: FadeKey; level: number }[] = []
  for (const k of FADE_KEYS) {
    const bars = s[k].in
    const level = (s[k].max ?? 127) / 127
    if (bars > 0 && barMs > 0) ramps.push({ key: k, from: 0, to: level, t0: now, t1: now + bars * barMs })
    else full.push({ key: k, level: s[k].in > 0 ? level : 1 })
  }
  return { ramps, full }
}

/** The Fade Out ramps of a Stop at `stopAt`, from each key's factor now (`current`). */
export function planFadeOut(s: FadeSettings, now: number, stopAt: number, barMs: number, current: Partial<Record<FadeKey, number>> = {}): FadeRamp[] {
  const ramps: FadeRamp[] = []
  if (!(stopAt > now) || !(barMs > 0)) return ramps
  for (const k of FADE_KEYS) {
    const bars = s[k].out
    if (bars <= 0) continue
    ramps.push({ key: k, from: current[k] ?? 1, to: 0, t0: Math.max(now, stopAt - bars * barMs), t1: stopAt })
  }
  return ramps
}

/** An Intensity (0–127) with its fade. */
export const faded = (intensity: number, factor: number | undefined): number =>
  Math.max(0, Math.min(127, Math.round(intensity * (factor ?? 1))))

// ── Per MIDI channel (device + channel): a lane's layers each with its own fade ─────────────
// A lane reaches some devices on some channels (cables, Multi-CH out: a Chord layered on 4
// channels). Each of them: In / Out in bars and a Max 0–127, sent as CC 7 straight to it.

export interface ChFade { in: number; out: number; max: number }
export type ChFades = Record<string, ChFade>
export const chKey = (device: string, ch0: number): string => `${device}|${ch0}`

export function parseChFades(raw: unknown): ChFades {
  const out: ChFades = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw as Record<string, any>)) {
    if (!/\|\d+$/.test(k)) continue
    const m = Number(v?.max)
    out[k] = { in: okBars(v?.in), out: okBars(v?.out), max: Number.isFinite(m) ? Math.max(0, Math.min(127, Math.round(m))) : 127 }
  }
  return out
}

export interface ChRamp { key: string; from: number; to: number; t0: number; t1: number }

/**
 * The Start: each channel with a Fade In goes 0 → its Max; one with only a Fade Out (left at 0
 * by it) back to its Max at once (`set`). The others are left alone (their CC 7 isn't touched).
 */
export function planChIn(s: ChFades, keys: readonly string[], now: number, barMs: number): { ramps: ChRamp[]; set: { key: string; value: number }[] } {
  const ramps: ChRamp[] = []
  const set: { key: string; value: number }[] = []
  for (const k of keys) {
    const f = s[k]
    if (!f) continue
    if (f.in > 0 && barMs > 0) ramps.push({ key: k, from: 0, to: f.max, t0: now, t1: now + f.in * barMs })
    else if (f.out > 0) set.push({ key: k, value: f.max })
  }
  return { ramps, set }
}

/** The Stop at `stopAt`: each channel with a Fade Out, from its value now (`current`, else its Max) to 0. */
export function planChOut(s: ChFades, keys: readonly string[], now: number, stopAt: number, barMs: number, current: Record<string, number> = {}): ChRamp[] {
  const ramps: ChRamp[] = []
  if (!(stopAt > now) || !(barMs > 0)) return ramps
  for (const k of keys) {
    const f = s[k]
    if (!f || f.out <= 0) continue
    ramps.push({ key: k, from: current[k] ?? f.max, to: 0, t0: Math.max(now, stopAt - f.out * barMs), t1: stopAt })
  }
  return ramps
}

export const chRampAt = (r: ChRamp, t: number): number =>
  Math.round(t <= r.t0 ? r.from : t >= r.t1 || r.t1 <= r.t0 ? r.to : r.from + (r.to - r.from) * ((t - r.t0) / (r.t1 - r.t0)))
