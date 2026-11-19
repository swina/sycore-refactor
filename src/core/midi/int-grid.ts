/**
 * int-grid.ts — one bar grid for the sequences on the internal clock (CLK SYS, no external master).
 *
 * Each sequence (the Sequencer's lanes, the Drum Machine) runs its own StepScheduler. With Live as the
 * master they all sit on Live's grid (external-grid.ts); on the internal clock each one used to start
 * "now", so two sequences started a moment apart never lined up. Here the first sequence to start sets
 * bar 1; the next ones join it:
 *  - sync (SYNC / Start@bar on): from the next bar line of the ones playing (or the one just passed,
 *    within a few ms — a press a hair late on the downbeat);
 *  - not sync: from the bar line now playing, in phase — the steps already gone pass silently
 *    (the scheduler hands them out late), as when joining Live's grid.
 * The grid lasts while any of them plays; the last one to stop drops it.
 */
const users = new Set<string>()
let t0 = 0       // a bar line (performance.now() ms)
let barMs = 2000 // one bar (4 beats) at the grid's tempo

const barMsOf = (bpm: number) => 240000 / (bpm > 0 ? bpm : 120)

export const intGrid = {
  /** Sequences other than `id` play on the grid. */
  hasOthers(id: string): boolean { return [...users].some(u => u !== id) },

  /**
   * A sequence starting at `nowMs`: its start time on the grid. `firstStart`: the time it would start
   * at with no one else playing (it then sets the grid's bar 1).
   */
  join(id: string, nowMs: number, bpm: number, sync: boolean, firstStart: number): number {
    let start: number
    if (this.hasOthers(id)) {
      const k = Math.floor((nowMs - t0) / barMs)
      const cur = t0 + k * barMs
      const graceMs = Math.min(80, barMs / 32)
      start = !sync || nowMs - cur <= graceMs ? cur : cur + barMs
    } else {
      start = firstStart
      t0 = firstStart
      barMs = barMsOf(bpm)
    }
    users.add(id)
    return start
  },

  leave(id: string): void { users.delete(id) },

  /** A tempo change at `nowMs`: the grid keeps its phase there (the schedulers bend at their next step). */
  setTempo(bpm: number, nowMs: number): void {
    if (!users.size) return
    const next = barMsOf(bpm)
    if (Math.abs(next - barMs) < 1e-6) return
    const phase = (nowMs - t0) / barMs
    t0 = nowMs - phase * next
    barMs = next
  },

  /** Tests. */
  _reset(): void { users.clear(); t0 = 0; barMs = 2000 },
}
