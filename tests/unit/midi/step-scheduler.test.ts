import { describe, it, expect } from 'vitest'
import { StepScheduler } from '@/core/midi/step-scheduler'
import { externalGrid } from '@/core/midi/external-grid'
import { ExternalClockFollower, type ExternalClockEvent } from '@/core/midi/external-clock'

function collect(opts = {}) {
  const steps: { step: number; t: number; late: boolean }[] = []
  const s = new StepScheduler((step, t, late) => steps.push({ step, t, late }), opts)
  return { s, steps }
}

describe('StepScheduler — system-clock step grid', () => {
  it('hands out steps up to the lookahead, each at its grid time', () => {
    const { s, steps } = collect({ lookaheadMs: 100 })
    s.start(1000, 120) // a 16th = 125 ms
    s.tick(1000)
    expect(steps.map(x => x.t)).toEqual([1000])
    s.tick(1030)        // window to 1130: step 1 (1125)
    s.tick(1100)        // window to 1200: nothing new
    s.tick(1160)        // window to 1260: step 2 (1250)
    expect(steps.map(x => [x.step, x.t])).toEqual([[0, 1000], [1, 1125], [2, 1250]])
    expect(steps.every(x => !x.late)).toBe(true)
  })

  it('keeps the grid with irregular, coarse ticks', () => {
    const { s, steps } = collect()
    s.start(0, 75)                  // a 16th = 200 ms
    for (const now of [0, 37, 390, 395, 801, 1203, 1999]) s.tick(now)
    expect(steps.map(x => x.t)).toEqual([0, 200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000])
  })

  it('a stalled page: steps found too late are marked late, not bunched as notes', () => {
    const { s, steps } = collect({ lateToleranceMs: 60 })
    s.start(0, 120)
    s.tick(0)
    s.tick(700)                      // 700 ms stall
    const late = steps.filter(x => x.late).map(x => x.step)
    expect(late).toEqual([1, 2, 3, 4, 5])         // 125…625 ms: over 60 ms late
    expect(steps.filter(x => !x.late).map(x => x.step)).toEqual([0, 6])     // 750: ahead, in the lookahead
  })

  it('setTempo bends the grid at the next step, no jump', () => {
    const { s, steps } = collect({ lookaheadMs: 0 })
    s.start(0, 120)
    s.tick(1)        // step 0 @ 0
    s.tick(126)      // step 1 @ 125
    s.setTempo(60)   // 16th = 250 ms from step 2 (@ 250)
    s.tick(251); s.tick(501)
    expect(steps.map(x => x.t)).toEqual([0, 125, 250, 500])
  })

  it('anchorTo follows the master: the following steps move onto its beats', () => {
    const { s, steps } = collect({ lookaheadMs: 0 })
    s.start(0, 120)
    s.tick(1); s.tick(126); s.tick(251); s.tick(376)   // steps 0..3
    // The master's beat (step 4) actually lands at 510, at 118 BPM.
    s.anchorTo(4, 510, 118)
    s.tick(511)
    s.tick(511 + 128)
    expect(steps.at(-2)).toMatchObject({ step: 4, t: 510 })
    expect(steps.at(-1)!.t).toBeCloseTo(510 + 60000 / (118 * 4))
  })

  it('stop hands out nothing more', () => {
    const { s, steps } = collect()
    s.start(0, 120)
    s.tick(0)
    s.stop()
    s.tick(1000)
    expect(steps).toHaveLength(1)
  })
})

describe('externalGrid', () => {
  it('times song positions from the latest beat and finds bar lines', () => {
    externalGrid.emit({ type: 'beat', sixteenth: 20, t: 10000, bpm: 120 })
    expect(externalGrid.timeOf(24)).toBe(10500)
    expect(externalGrid.barAtOrAfter(10000)).toBe(32)
    expect(externalGrid.barAtOrAfter(10000 - 4 * 125)).toBe(16)
    expect(externalGrid.barAtOrBefore(10000)).toBe(16)
    expect(externalGrid.barAtOrBefore(10000 + 12 * 125)).toBe(32)   // sixteenth 32, the bar line
    expect(externalGrid.barAtOrBefore(10000 + 11 * 125)).toBe(16)
    externalGrid.emit({ type: 'stop' })
    expect(externalGrid.active).toBe(false)
    expect(externalGrid.timeOf(24)).toBeNull()
  })
})

describe('ExternalClockFollower — beat events for the system-clock grid', () => {
  it('emits a beat on every quarter with its song sixteenth and a fitted time', () => {
    const f = new ExternalClockFollower()
    const beats: Extract<ExternalClockEvent, { type: 'beat' }>[] = []
    f.on(e => { if (e.type === 'beat') beats.push(e) })
    f.handleMessage([0xF2, 32, 0], 0) // bar 3
    f.handleMessage([0xFB], 1)
    const p = 60000 / (100 * 24)
    for (let i = 0; i < 24 * 4 + 1; i++) f.handleMessage([0xF8], 10 + i * p + (i % 2 ? 1.5 : -1.5))
    expect(beats.map(b => b.sixteenth)).toEqual([36, 40, 44, 48])  // beat 2..4 of bar 3, bar 4 (beat 1 has no tempo yet)
    const last = beats.at(-1)!
    expect(Math.abs(last.t - (10 + 96 * p))).toBeLessThan(1.5)   // jitter ±1.5 ms smoothed
    expect(Math.abs(last.bpm - 100)).toBeLessThan(0.2)
  })
})

describe('StepScheduler — a late start joins the bar in phase', () => {
  it('steps already gone are late (silent); the first one still in time sounds on the grid', () => {
    const steps: { step: number; t: number; late: boolean }[] = []
    const s = new StepScheduler((step, t, late) => steps.push({ step, t, late }))
    // Live's bar started at 0 (75 BPM: a 16th = 200 ms); the app only starts at 450 ms.
    s.start(0, 75)
    s.tick(450)
    expect(steps.filter(x => x.late).map(x => x.step)).toEqual([0, 1])       // 0, 200 ms
    expect(steps.filter(x => !x.late).map(x => [x.step, x.t])).toEqual([[2, 400]])   // 50 ms late: still sounds
  })
})

describe('StepScheduler — step lengths other than a 16th (Sequencer Time)', () => {
  it('1/8 steps at 120 BPM are 250 ms; Live beats re-anchor them by song sixteenth', () => {
    const steps: { step: number; t: number }[] = []
    const s = new StepScheduler((step, t) => steps.push({ step, t }), { lookaheadMs: 0 })
    s.start(0, 120, 0.5)
    for (let now = 1; now <= 760; now += 5) s.tick(now)
    expect(steps.map(x => x.t)).toEqual([0, 250, 500, 750])
    // Live's beat at song sixteenth 16 (= step 8 in 1/8) lands at 2010 ms.
    s.anchorTo(16, 2010, 120)
    expect(s.timeOf(8)).toBe(2010)
    expect(s.timeOf(9)).toBe(2260)
  })

  it('changing the step length mid-play bends at the next step and keeps the sixteenth mapping', () => {
    const steps: { step: number; t: number }[] = []
    const s = new StepScheduler((step, t) => steps.push({ step, t }), { lookaheadMs: 0 })
    s.start(0, 120, 0.25)                 // 16ths: 125 ms
    for (let now = 1; now <= 380; now += 5) s.tick(now)   // steps 0..3 (0..375)
    s.setStepBeats(0.5)                   // 1/8 from step 4 (at 500 ms = sixteenth 4)
    for (let now = 381; now <= 1001; now += 5) s.tick(now)
    expect(steps.map(x => x.t)).toEqual([0, 125, 250, 375, 500, 750, 1000])
    // Sixteenth 8 is two 1/8 steps after sixteenth 4: step 6.
    s.anchorTo(8, 1003, 120)
    expect(s.timeOf(6)).toBe(1003)
  })
})
