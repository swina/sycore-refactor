// Lookahead step scheduler for the Arpeggiator.
//
// The old engine fired each step from a setInterval and sent the note right then,
// so any main-thread hiccup (closing a panel, mouse-over tooltips, re-renders) made
// the arp late and uneven. Here a short timer wakes every `tickMs` and hands every
// step due within the next `lookaheadMs` to `playNote` with its exact time — the
// same scheme as the outgoing MIDI clock: a Web MIDI output schedules a timestamped
// send off the main thread, so a stall shorter than the lookahead doesn't shift it.
//
// Every note is scheduled together with its note-off (gate), so stopping never
// leaves a stuck note: steps already handed out still end on their own.

export interface ArpSchedulerOptions {
  /** clock, ms — performance.now() base (Web MIDI send timestamps use it) */
  now: () => number
  /** step length in ms, read at every step so BPM/subdivision changes apply live */
  stepMs: () => number
  /** note to play on this step, or null for a silent step (nothing held) */
  nextNote: () => number | null
  /** schedule `note` from `at` to `offAt` (ms, same clock as now()) */
  playNote: (note: number, at: number, offAt: number) => void
  /** gate as a fraction of the step (default 0.5, like the old engine) */
  gate?: number
  lookaheadMs?: number
  tickMs?: number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export interface ArpScheduler {
  start(): void
  stop(): void
  readonly running: boolean
  /** scheduler pass (exposed for tests) */
  tick(): void
}

export function createArpScheduler(opts: ArpSchedulerOptions): ArpScheduler {
  const gate = opts.gate ?? 0.5
  const lookaheadMs = opts.lookaheadMs ?? 100
  const tickMs = opts.tickMs ?? 25
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))

  let timer: unknown = null
  let running = false
  let nextStepAt = 0

  function tick(): void {
    if (!running) return
    const now = opts.now()
    // Fell more than a step behind (e.g. timers throttled in a hidden window):
    // resync instead of firing a burst of overdue steps.
    if (nextStepAt < now - opts.stepMs()) nextStepAt = now
    while (nextStepAt < now + lookaheadMs) {
      const step = opts.stepMs()
      const note = opts.nextNote()
      if (note !== null) opts.playNote(note, nextStepAt, nextStepAt + step * gate)
      nextStepAt += step
    }
  }

  function loop(): void {
    tick()
    if (running) timer = setTimer(loop, tickMs)
  }

  return {
    start() {
      if (running) return
      running = true
      // first step one step from now, as the old setInterval engine did
      nextStepAt = opts.now() + opts.stepMs()
      loop()
    },
    stop() {
      running = false
      if (timer !== null) clearTimer(timer)
      timer = null
    },
    get running() { return running },
    tick,
  }
}
