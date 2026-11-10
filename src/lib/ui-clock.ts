/**
 * ui-clock.ts — UI / state updates at an audio time, and a per-frame loop, that keep working with
 * the page hidden (SY.CORE's window covered by Ableton Live, minimized, another tab).
 *
 * Tone's Draw runs on requestAnimationFrame, which the browser pauses on a hidden page, and drops
 * callbacks more than 0.25 s late — so state set there (a sequence switched, a part off, a player
 * stopped) was lost while Live was in front, and the Rig Controller went stale: pads and a
 * controller's / Launchpad's presses acted on an old state. Here the same queue is run by
 * requestAnimationFrame (visible: on the frame) and by a Worker timer (never paused), and a late
 * callback still runs.
 */
import { getContext } from 'tone'
import { createWorkerTicker } from '@/core/midi/step-scheduler'

type Ev = { time: number; cb: () => void }
const ANTICIPATION = 0.008
const events: Ev[] = []
let stopTicker: (() => void) | null = null
let raf = 0
let nowFn: () => number = () => getContext().currentTime

const hidden = () => typeof document !== 'undefined' && document.hidden
const hasRaf = () => typeof requestAnimationFrame === 'function'

/** Run the callbacks due (in time order). */
export function flushUi(): void {
  flushTimeouts()
  const now = nowFn() + ANTICIPATION
  const due: Ev[] = []
  for (let i = events.length - 1; i >= 0; i--) if (events[i].time <= now) due.push(events.splice(i, 1)[0])
  due.sort((a, b) => a.time - b.time)
  for (const e of due) { try { e.cb() } catch (err) { console.error('[ui-clock]', err) } }
  if (!events.length && !timeouts.length && stopTicker) { stopTicker(); stopTicker = null }
}
function frame() { raf = 0; flushUi(); if (events.length && hasRaf()) raf = requestAnimationFrame(frame) }

/** As Tone's getDraw().schedule(cb, time) (time: AudioContext seconds), also with the page hidden. */
export function drawAt(cb: () => void, time: number): void {
  events.push({ time, cb })
  if (!stopTicker) stopTicker = createWorkerTicker(flushUi, 15)
  if (!raf && hasRaf() && !hidden()) raf = requestAnimationFrame(frame)
}

/** `cb` on every frame while visible, every `hiddenMs` while hidden. Returns stop. */
export function frameLoop(cb: () => void, hiddenMs = 40): () => void {
  let id = 0, stopped = false
  const loop = () => { if (stopped) return; if (!hidden()) cb(); id = hasRaf() ? requestAnimationFrame(loop) : 0 }
  if (hasRaf()) id = requestAnimationFrame(loop)
  const stopT = createWorkerTicker(() => { if (!stopped && (hidden() || !hasRaf())) cb() }, hiddenMs)
  return () => { stopped = true; if (id && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id); stopT() }
}

/** Tests: the clock read. */
export function _setUiNow(fn: () => number): void { nowFn = fn }

/** setTimeout that is not throttled on a hidden page (run by the same Worker timer; a page's own
 *  timers wait ~1 s there). Returns cancel. */
const timeouts: { at: number; cb: () => void }[] = []
export function uiTimeout(cb: () => void, ms: number): () => void {
  const t = { at: performance.now() + ms, cb }
  timeouts.push(t)
  if (!stopTicker) stopTicker = createWorkerTicker(flushUi, 15)
  return () => { const k = timeouts.indexOf(t); if (k >= 0) timeouts.splice(k, 1) }
}
function flushTimeouts(): void {
  const now = performance.now()
  for (let i = timeouts.length - 1; i >= 0; i--) {
    if (timeouts[i].at > now) continue
    const [t] = timeouts.splice(i, 1)
    try { t.cb() } catch (err) { console.error('[ui-clock]', err) }
  }
}
