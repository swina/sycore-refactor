// Timing counters for the Audio Diagnostics panel. Engines report into it from their hot
// paths, so every record* call is a handful of arithmetic ops and allocates nothing.
//
// - scheduled hits: a sound scheduled on the audio clock (Tone.js lookahead) whose `time`
//   is already in the past when it reaches the engine fires late — clamped to currentTime,
//   i.e. off the grid. margin = time - currentTime; negative = late.
// - MIDI ingress: how long a MIDI message waited between the browser receiving it
//   (event.timeStamp) and our handler running — main-thread congestion.
// - main-thread stalls: how late a periodic timer fired (measured while the panel is open).

export interface SeriesStats {
  count: number
  sum: number
  min: number
  max: number
}

function emptySeries(): SeriesStats {
  return { count: 0, sum: 0, min: Infinity, max: -Infinity }
}

function push(s: SeriesStats, v: number): void {
  s.count++
  s.sum += v
  if (v < s.min) s.min = v
  if (v > s.max) s.max = v
}

export function seriesAvg(s: SeriesStats): number | null {
  return s.count ? s.sum / s.count : null
}

let _hitMarginMs = emptySeries()
let _lateHits = 0
let _maxLateMs = 0
let _midiIngressMs = emptySeries()
let _stallMs = emptySeries()

/** A sound scheduled at `scheduledTime` (audio-clock seconds) reached the engine at `ctxNow`. */
export function recordScheduledHit(scheduledTime: number, ctxNow: number): void {
  const marginMs = (scheduledTime - ctxNow) * 1000
  push(_hitMarginMs, marginMs)
  if (marginMs < 0) {
    _lateHits++
    if (-marginMs > _maxLateMs) _maxLateMs = -marginMs
  }
}

/** A MIDI message waited `delayMs` before its handler ran. */
export function recordMidiIngress(delayMs: number): void {
  if (delayMs >= 0 && Number.isFinite(delayMs)) push(_midiIngressMs, delayMs)
}

/** A periodic timer fired `lateMs` after it was due. */
export function recordStall(lateMs: number): void {
  if (lateMs >= 0) push(_stallMs, lateMs)
}

export interface DiagnosticsSnapshot {
  hitMarginMs: SeriesStats
  lateHits: number
  maxLateMs: number
  midiIngressMs: SeriesStats
  stallMs: SeriesStats
}

export function getDiagnosticsSnapshot(): DiagnosticsSnapshot {
  return {
    hitMarginMs: { ..._hitMarginMs },
    lateHits: _lateHits,
    maxLateMs: _maxLateMs,
    midiIngressMs: { ..._midiIngressMs },
    stallMs: { ..._stallMs },
  }
}

export function resetDiagnostics(): void {
  _hitMarginMs = emptySeries()
  _lateHits = 0
  _maxLateMs = 0
  _midiIngressMs = emptySeries()
  _stallMs = emptySeries()
  resetHogs()
  resetDrawAttribution()
}

// ── Main-thread hogs (Long Animation Frames API, Chrome 123+) ─────────────────
// Each long frame lists the scripts that ran in it; they are grouped by who started
// them (invoker, e.g. "MIDIInput.onmidimessage" / "TimerHandler:setInterval") plus the
// function and file, so the panel can rank what keeps the main thread busy.

export interface LoafScript {
  invoker?: string
  sourceFunctionName?: string
  sourceURL?: string
  duration: number
}

export interface HogStats {
  key: string
  invoker: string
  fn: string
  file: string
  count: number
  totalMs: number
  maxMs: number
}

let _hogs = new Map<string, HogStats>()

/** "http://host/src/components/Foo.vue?t=123" → "components/Foo.vue" */
export function shortSource(url = ''): string {
  const path = url.split(/[?#]/)[0]
  const src = path.indexOf('/src/')
  if (src >= 0) return path.slice(src + 5)
  const deps = path.indexOf('/node_modules/')
  if (deps >= 0) return path.slice(deps + 14).replace(/^\.vite\/deps\//, '')
  return path.split('/').pop() || '(anonymous)'
}

export function recordLongFrameScripts(scripts: LoafScript[]): void {
  for (const s of scripts) {
    const invoker = s.invoker || '?'
    const fn = s.sourceFunctionName || '(anonymous)'
    const file = shortSource(s.sourceURL)
    const key = `${invoker}|${fn}|${file}`
    let h = _hogs.get(key)
    if (!h) { h = { key, invoker, fn, file, count: 0, totalMs: 0, maxMs: 0 }; _hogs.set(key, h) }
    h.count++
    h.totalMs += s.duration
    if (s.duration > h.maxMs) h.maxMs = s.duration
  }
}

export function getTopHogs(limit = 8): HogStats[] {
  return [..._hogs.values()].sort((a, b) => b.totalMs - a.totalMs).slice(0, limit).map(h => ({ ...h }))
}

export function resetHogs(): void {
  _hogs = new Map()
}

// ── Tone.Draw attribution ─────────────────────────────────────────────────────
// Long frames only name Tone's `_drawLoop`, not who scheduled the callbacks it ran.
// While the panel is open, Draw.schedule is wrapped: each callback run is logged with
// its caller (first app frame of the scheduling stack); a long `_drawLoop` script is
// then split across the callers whose callbacks ran inside it. Vue's re-render runs as
// a microtask inside that same script, so it's included.

const DRAW_RUNS_MAX = 512
let _drawRuns: { t: number; caller: string }[] = []
let _drawByCaller = new Map<string, { caller: string; frames: number; totalMs: number; maxMs: number; runs: number; syncMs: number; syncMaxMs: number }>()

function drawEntry(caller: string) {
  let d = _drawByCaller.get(caller)
  if (!d) { d = { caller, frames: 0, totalMs: 0, maxMs: 0, runs: 0, syncMs: 0, syncMaxMs: 0 }; _drawByCaller.set(caller, d) }
  return d
}

/** First `src/…:line` frame of a stack that isn't the diagnostics code itself. */
export function callerFromStack(stack = ''): string {
  for (const line of stack.split('\n').slice(1)) {
    const m = line.match(/\/src\/([^?:)\s]+)(?:\?[^:)\s]*)?:(\d+)/)
    if (!m) continue
    if (m[1].includes('audio-diagnostics') || m[1].includes('AudioDiagnosticsPanel')) continue
    return `${m[1]}:${m[2]}`
  }
  return '(unknown)'
}

/** A Draw callback scheduled by `caller` started at `t` and ran synchronously for `syncMs`. */
export function recordDrawRun(t: number, caller: string, syncMs = 0): void {
  _drawRuns.push({ t, caller })
  if (_drawRuns.length > DRAW_RUNS_MAX) _drawRuns.shift()
  const d = drawEntry(caller)
  d.runs++
  d.syncMs += syncMs
  if (syncMs > d.syncMaxMs) d.syncMaxMs = syncMs
}

/** A `_drawLoop` script of `durationMs` started at `startTime`: charge it to its callers. */
export function attributeDrawScript(startTime: number, durationMs: number): void {
  const end = startTime + durationMs
  const callers = new Set<string>()
  for (const r of _drawRuns) if (r.t >= startTime && r.t <= end) callers.add(r.caller)
  if (!callers.size) callers.add('(unknown)')
  const share = durationMs / callers.size
  for (const caller of callers) {
    const d = drawEntry(caller)
    d.frames++
    d.totalMs += share
    if (share > d.maxMs) d.maxMs = share
  }
}

export function getDrawByCaller(limit = 6) {
  return [..._drawByCaller.values()].sort((a, b) => b.totalMs - a.totalMs).slice(0, limit).map(d => ({ ...d }))
}

export function resetDrawAttribution(): void {
  _drawRuns = []
  _drawByCaller = new Map()
}
