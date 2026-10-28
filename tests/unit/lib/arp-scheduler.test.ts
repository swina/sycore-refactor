import { describe, it, expect } from 'vitest'
import { createArpScheduler } from '@/lib/arp-scheduler'

function harness(stepMs = 100, notes: (number | null)[] = [60, 64, 67]) {
  let t = 0
  let i = 0
  const played: { note: number; at: number; offAt: number }[] = []
  const timers: (() => void)[] = []
  let step = stepMs
  const sch = createArpScheduler({
    now: () => t,
    stepMs: () => step,
    nextNote: () => notes[i++ % notes.length],
    playNote: (note, at, offAt) => played.push({ note, at, offAt }),
    lookaheadMs: 100,
    tickMs: 25,
    setTimer: (fn) => { timers.push(fn); return timers.length },
    clearTimer: () => {},
  })
  // advance the clock and run the scheduler pass that would fire then
  const advance = (ms: number) => { t += ms; sch.tick() }
  return { sch, played, advance, setStep: (v: number) => { step = v } }
}

describe('arp lookahead scheduler', () => {
  it('starts one step from now and only schedules within the lookahead window', () => {
    const { sch, played, advance } = harness(100)
    sch.start()          // t=0: first step @100 is not yet inside [0, 100)
    expect(played).toEqual([])
    advance(1)           // t=1: @100 is
    expect(played).toEqual([{ note: 60, at: 100, offAt: 150 }])
  })

  it('keeps the grid exact even when a tick runs late (main-thread stall)', () => {
    const { sch, played, advance } = harness(100)
    sch.start()
    advance(20)   // schedules step @100
    advance(140)  // late tick at t=160: schedules @200 — on the grid, not @160
    expect(played.map(p => p.at)).toEqual([100, 200])
    expect(played[0]).toEqual({ note: 60, at: 100, offAt: 150 })
    expect(played[1].note).toBe(64)
  })

  it('skips silent steps but keeps the grid', () => {
    const { sch, played, advance } = harness(100, [60, null, 67])
    sch.start()
    for (let k = 0; k < 4; k++) advance(100)
    expect(played.map(p => [p.note, p.at])).toEqual([[60, 100], [67, 300], [60, 400]])
  })

  it('resyncs after falling far behind instead of bursting overdue steps', () => {
    const { sch, played, advance } = harness(100)
    sch.start()
    advance(20)       // @100
    advance(1000)     // t=1020: throttled for a second
    const ats = played.map(p => p.at)
    expect(ats[0]).toBe(100)
    expect(ats.slice(1).every(a => a >= 1020)).toBe(true)
    expect(ats.length).toBeLessThanOrEqual(3)
  })

  it('applies a new step length from the next step and stops cleanly', () => {
    const { sch, played, advance, setStep } = harness(100)
    sch.start()
    advance(20)       // @100
    setStep(50)
    advance(81)       // t=101: @200 (already on the grid), now 50 ms long; @250 not yet in the window
    expect(played.map(p => p.at)).toEqual([100, 200])
    expect(played[1].offAt).toBe(225)
    sch.stop()
    advance(500)
    expect(played).toHaveLength(2)
    expect(sch.running).toBe(false)
  })
})
