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

export function cancelCountIn(): boolean {
  const was = countIn.active
  timers.forEach(clearTimeout)
  timers = []
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
  for (let i = 0; i < total; i++) {
    timers.push(setTimeout(() => {
      countIn.left = total - i
      countIn.beat = (i % BEATS_PER_BAR) + 1
    }, i * beatMs))
  }
  timers.push(setTimeout(() => { cancelCountIn(); go() }, total * beatMs))
  return true
}
