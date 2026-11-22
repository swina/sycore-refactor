/**
 * count-in.ts — the Play count-in on SY.CORE's own clock (INT): N bars of beats shown as a modal
 * countdown (CountInOverlay.vue), then the real Play. Following an external clock (Live) there is no
 * count-in: the master decides when the bar starts.
 *
 * Beats are scheduled against one start time (no drift from chained timeouts). A Play pressed while
 * counting, a Stop, or a click on the overlay calls it off.
 */
import { reactive } from 'vue'

export const BEATS_PER_BAR = 4

export const countIn = reactive({
  active: false,
  /** Beats left, counting down (4 3 2 1 for one bar). */
  left: 0,
  /** The beat within the bar now, 1-based (1 = the bar's downbeat, for the accent). */
  beat: 0,
  total: 0,
})

let timers: ReturnType<typeof setTimeout>[] = []

/** The count-in's click (on by default): a short beep per beat, higher on the bar's downbeat. */
export const countInSound = { on: true }
let ctx: AudioContext | null = null
let clicks: OscillatorNode[] = []
function click(at: number, accent: boolean): void {
  if (!ctx) return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.frequency.value = accent ? 1600 : 1000
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, at + 0.002)
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06)
  o.connect(g).connect(ctx.destination)
  o.start(at)
  o.stop(at + 0.07)
  clicks.push(o)
}
/** The clicks scheduled on the audio clock (exact, whatever the page does); false: no audio. */
function scheduleClicks(total: number, beatMs: number): void {
  if (!countInSound.on || typeof window === 'undefined') return
  try {
    const AC = (window as any).AudioContext ?? (window as any).webkitAudioContext
    if (!AC) return
    ctx ??= new AC()
    ctx!.resume?.()
    const t0 = ctx!.currentTime + 0.03
    for (let i = 0; i < total; i++) click(t0 + (i * beatMs) / 1000, i % BEATS_PER_BAR === 0)
  } catch {}
}

export function cancelCountIn(): boolean {
  const was = countIn.active
  timers.forEach(clearTimeout)
  timers = []
  for (const o of clicks) { try { o.stop() } catch {} }
  clicks = []
  countIn.active = false
  countIn.left = 0
  countIn.beat = 0
  return was
}

/** Count `bars` bars at `bpm`, then run `go`. Returns false (and runs nothing) for 0 bars. */
export function startCountIn(bars: number, bpm: number, go: () => void): boolean {
  cancelCountIn()
  const total = Math.max(0, Math.round(bars)) * BEATS_PER_BAR
  if (!total) return false
  const beatMs = 60000 / (bpm > 0 ? bpm : 120)
  countIn.active = true
  countIn.total = total
  scheduleClicks(total, beatMs)
  for (let i = 0; i < total; i++) {
    timers.push(setTimeout(() => {
      countIn.left = total - i
      countIn.beat = (i % BEATS_PER_BAR) + 1
    }, i * beatMs))
  }
  timers.push(setTimeout(() => { clicks = []; cancelCountIn(); go() }, total * beatMs))
  return true
}
