/**
 * stop-gate.ts — a Stop queued on the bar grid (the Rig Controls' Stop: at the end of the next bar).
 *
 * The sequences schedule ahead (StepScheduler, ~200 ms): stopped by a timer on the bar line, they had
 * already handed out its downbeat — an accented last note after the end. With the gate set, every
 * step at or after its time stays silent (Drum Machine, Chord Prog, Sequencer lanes check it), and
 * the stop itself comes on that bar line.
 */
let at: number | null = null

export const stopGate = {
  /** The time (performance.now() ms) the sequences go silent from; null: none queued. */
  get at(): number | null { return at },
  set(t: number): void { at = t },
  clear(): void { at = null },
  /** A step at `tMs` falls at or after the queued stop (1 ms early counts: the bar line itself). */
  reached(tMs: number | null | undefined): boolean { return at !== null && tMs != null && tMs >= at - 1 },
}

/**
 * The end of the next bar from `nowMs` on a bar grid: at 3.2.4 → 5.1.1 (bar 4 played to its end);
 * a press within `graceMs` after a bar line counts on it (4.1.1 + a hair → 5.1.1).
 * `nextBarLine` gives the first bar line at or after a time with its bar length; null: no grid.
 */
export function endOfNextBar(nowMs: number, nextBarLine: (t: number) => { t: number; barMs: number } | null, graceMs = 80): number | null {
  const b = nextBarLine(nowMs - graceMs)
  if (!b || !(b.barMs > 0)) return null
  let line = b.t
  while (line < nowMs - graceMs) line += b.barMs
  return line + b.barMs
}
