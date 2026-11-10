import { describe, it, expect } from 'vitest'
import {
  ExternalClockFollower, computePhaseLock, PhaseLock, isClockSourceEcho, type ExternalClockEvent,
  CLOCKS_PER_BAR, TONE_PPQ,
} from '@/core/midi/external-clock'

function setup(opts = {}) {
  const f = new ExternalClockFollower(opts)
  const events: ExternalClockEvent[] = []
  f.on(e => events.push(e))
  return { f, events }
}

const periodMs = (bpm: number) => 60000 / (bpm * 24)

/** Feed `n` clocks starting at time `t0`, with optional ±jitter (deterministic). */
function clocks(f: ExternalClockFollower, n: number, bpm: number, t0: number, jitterMs = 0): number {
  const p = periodMs(bpm)
  let t = t0
  for (let i = 0; i < n; i++) {
    const j = jitterMs ? jitterMs * Math.sin(i * 12.9898) : 0
    f.handleMessage([0xF8], t + j)
    t += p
  }
  return t
}

const types = (events: ExternalClockEvent[]) => events.map(e => e.type)

describe('ExternalClockFollower — transport state machine', () => {
  it('Start arms playback and the apps start on the first clock (the downbeat)', () => {
    const { f, events } = setup()
    f.handleMessage([0xFA], 0)
    expect(f.state).toBe('waiting-bar')
    expect(types(events)).not.toContain('start')
    f.handleMessage([0xF8], 1)
    expect(f.state).toBe('playing')
    const start = events.find(e => e.type === 'start')
    expect(start).toMatchObject({ type: 'start', sixteenth: 0 })
  })

  it('Stop stops, and only once', () => {
    const { f, events } = setup()
    f.handleMessage([0xFA], 0)
    clocks(f, 10, 120, 1)
    f.handleMessage([0xFC], 200)
    f.handleMessage([0xFC], 210)
    expect(types(events).filter(t => t === 'stop')).toHaveLength(1)
    expect(f.state).toBe('stopped')
  })

  it('Stop while already stopped emits nothing', () => {
    const { f, events } = setup()
    f.handleMessage([0xFC], 0)
    expect(events).toHaveLength(0)
  })

  it('tracks the song position from the clocks', () => {
    const { f } = setup()
    f.handleMessage([0xFA], 0)
    clocks(f, CLOCKS_PER_BAR * 2 + 24 + 6, 120, 1) // 2 bars + 1 beat + 1 sixteenth
    expect(f.positionSixteenths).toBe(32 + 4 + 1)
    expect(f.positionLabel).toBe('3.2.2')
  })
})

describe('ExternalClockFollower — Song Position Pointer', () => {
  it('decodes SPP (LSB first) and reports the position', () => {
    const { f, events } = setup()
    // 200 sixteenths = 0x48 + (0x01 << 7)
    f.handleMessage([0xF2, 0x48, 0x01], 0)
    expect(f.positionSixteenths).toBe(200)
    expect(events.at(-1)).toEqual({ type: 'position', sixteenth: 200 })
  })

  it('Continue from a bar line starts on the next clock at that position', () => {
    const { f, events } = setup()
    f.handleMessage([0xF2, 64, 0], 0) // sixteenth 64 = bar 5
    f.handleMessage([0xFB], 1)
    f.handleMessage([0xF8], 2)
    expect(events.find(e => e.type === 'start')).toMatchObject({ sixteenth: 64 })
    expect(f.positionLabel).toBe('5.1.1')
  })

  it('Continue from mid-bar waits for the next bar line', () => {
    const { f, events } = setup()
    f.handleMessage([0xF2, 70, 0], 0) // bar 5, beat 2, 3rd sixteenth
    f.handleMessage([0xFB], 1)
    // 10 sixteenths to the bar line = 60 clocks; the 61st lands on it.
    clocks(f, 60, 120, 2)
    expect(f.state).toBe('waiting-bar')
    expect(types(events)).not.toContain('start')
    f.handleMessage([0xF8], 2000)
    expect(f.state).toBe('playing')
    expect(events.find(e => e.type === 'start')).toMatchObject({ sixteenth: 80 })
  })

  it('Continue while already playing is ignored', () => {
    const { f, events } = setup()
    f.handleMessage([0xFA], 0)
    clocks(f, 5, 120, 1)
    f.handleMessage([0xFB], 100)
    expect(types(events).filter(t => t === 'start')).toHaveLength(1)
    expect(f.state).toBe('playing')
  })
})

describe('ExternalClockFollower — tempo and bars', () => {
  it('measures the tempo, within 0.1 BPM, even with ±2 ms jitter', () => {
    for (const bpm of [70, 124, 180]) {
      const { f } = setup()
      f.handleMessage([0xFA], 0)
      clocks(f, CLOCKS_PER_BAR * 2 + 1, bpm, 1, 2)
      expect(Math.abs(f.bpm - bpm)).toBeLessThan(0.1)
    }
  })

  it('emits a bar event on every bar line after the start', () => {
    const { f, events } = setup()
    f.handleMessage([0xFA], 0)
    clocks(f, CLOCKS_PER_BAR * 3 + 1, 120, 1)
    const bars = events.filter(e => e.type === 'bar') as Extract<ExternalClockEvent, { type: 'bar' }>[]
    expect(bars.map(b => b.bar)).toEqual([1, 2, 3])
    expect(bars.map(b => b.clocksSinceStart)).toEqual([96, 192, 288])
  })

  it('follows a tempo change within one bar', () => {
    const { f } = setup()
    f.handleMessage([0xFA], 0)
    const t = clocks(f, CLOCKS_PER_BAR * 2, 120, 1)
    clocks(f, CLOCKS_PER_BAR + 1, 140, t)
    expect(Math.abs(f.bpm - 140)).toBeLessThan(0.1)
  })

  it('measures the tempo from a running clock with no transport', () => {
    const { f, events } = setup()
    clocks(f, 49, 100, 0)
    expect(Math.abs(f.bpm - 100)).toBeLessThan(0.1)
    expect(types(events)).not.toContain('start')
  })
})

describe('ExternalClockFollower — clock loss', () => {
  /** Checks every 100 ms from `from` to `to`, like the worker timer. */
  function checksUntil(f: ExternalClockFollower, from: number, to: number) {
    for (let now = from; now <= to; now += 100) f.checkTimeout(now)
  }

  it('default "stop": declares the clock lost and stops the apps', () => {
    const { f, events } = setup()
    f.handleMessage([0xFA], 0)
    const t = clocks(f, 48, 120, 1)
    checksUntil(f, t, t + 400)
    expect(types(events)).not.toContain('clockLost')
    checksUntil(f, t + 500, t + 700)
    expect(events.find(e => e.type === 'clockLost')).toMatchObject({ behavior: 'stop' })
    expect(types(events).at(-1)).toBe('stop')
    expect(f.state).toBe('stopped')
  })

  it('"continue": keeps the apps playing at the last BPM and re-locks on the next Start', () => {
    const { f, events } = setup({ lossBehavior: 'continue' })
    f.handleMessage([0xFA], 0)
    const t = clocks(f, 48, 124, 1)
    checksUntil(f, t, t + 1000)
    const lost = events.find(e => e.type === 'clockLost') as Extract<ExternalClockEvent, { type: 'clockLost' }>
    expect(lost.behavior).toBe('continue')
    expect(Math.abs(lost.lastBpm - 124)).toBeLessThan(0.1)
    expect(types(events)).not.toContain('stop')
    expect(f.state).toBe('lost')

    f.handleMessage([0xFA], t + 5000)
    f.handleMessage([0xF8], t + 5001)
    expect(f.state).toBe('playing')
    expect(types(events).filter(e => e === 'start')).toHaveLength(2)
  })

  it('a late check (main thread blocked, clocks still queued) is not a clock loss', () => {
    const { f, events } = setup()
    f.handleMessage([0xFA], 0)
    const t = clocks(f, 48, 75, 1)
    f.checkTimeout(t)
    // The main thread stalls for 600 ms: the next check runs late...
    f.checkTimeout(t + 600)
    expect(types(events)).not.toContain('clockLost')
    // ...then the queued clocks are delivered and checks resume on time.
    clocks(f, 20, 75, t + 605)
    checksUntil(f, t + 700, t + 1000)
    expect(types(events)).not.toContain('clockLost')
  })

  it('queued checks right after a stall (first Play after a reload) declare no loss', () => {
    const { f, events } = setup()
    f.handleMessage([0xFA], 0)
    const t = clocks(f, 48, 75, 1)
    f.checkTimeout(t)
    // 900 ms stall: the timer's queued checks run back to back, ahead of the queued clocks.
    f.checkTimeout(t + 900)
    f.checkTimeout(t + 901)
    f.checkTimeout(t + 905)
    expect(types(events)).not.toContain('clockLost')
    // Then the queued clocks arrive and checks resume normally.
    const t2 = clocks(f, 20, 75, t + 910)
    checksUntil(f, t2, t2 + 200)
    expect(types(events)).not.toContain('clockLost')
  })

  it('a real loss after a stall is still declared once the grace has passed', () => {
    const { f, events } = setup()
    f.handleMessage([0xFA], 0)
    const t = clocks(f, 48, 75, 1)
    f.checkTimeout(t)
    f.checkTimeout(t + 900)          // stall → grace
    checksUntil(f, t + 1000, t + 1400)
    expect(events.find(e => e.type === 'clockLost')).toBeTruthy()
  })

  it('never fires while stopped', () => {
    const { f, events } = setup()
    f.checkTimeout(1e6)
    expect(events).toHaveLength(0)
  })

  it('the timeout scales with slow tempos', () => {
    const { f } = setup()
    f.handleMessage([0xFA], 0)
    clocks(f, 49, 20, 1)
    expect(f.lossTimeoutMs()).toBeCloseTo(periodMs(20) * 8, 0)
  })
})

describe('computePhaseLock', () => {
  it('in phase: tempo unchanged', () => {
    const r = computePhaseLock(120, 96, 96 * 8)
    expect(r.errorBeats).toBe(0)
    expect(r.bpm).toBe(120)
    expect(r.resyncTicks).toBeNull()
  })

  it('follower ahead: slows down to close the gap over the next bar', () => {
    const r = computePhaseLock(120, 96, 96 * 8 + TONE_PPQ * 0.04) // 0.04 beats ahead
    expect(r.errorBeats).toBeCloseTo(0.04)
    expect(r.bpm).toBeCloseTo(120 * (4 - 0.04) / 4)
  })

  it('follower behind: speeds up', () => {
    const r = computePhaseLock(120, 192, 192 * 8 - TONE_PPQ * 0.04)
    expect(r.bpm).toBeGreaterThan(120)
  })

  it('the nudge is clamped', () => {
    const r = computePhaseLock(120, 96, 96 * 8 + TONE_PPQ * 0.4)
    expect(r.bpm).toBeCloseTo(120 * 0.97)
    expect(r.resyncTicks).toBeNull()
  })

  it('a large error jumps the follower instead', () => {
    const r = computePhaseLock(120, 96, 96 * 8 + TONE_PPQ * 2)
    expect(r.resyncTicks).toBe(96 * 8)
    expect(r.bpm).toBe(120)
  })

  it('simulated loop: drift stays under 5 ms over 10 minutes with ±2 ms jitter', () => {
    // A follower with a 0.5% clock error; corrected every bar from jittered measurements.
    const master = 124
    const barMs = 4 * 60000 / master
    let followerBpm = master
    let followerBeats = 0 // follower position in beats
    let maxDriftMs = 0
    const lock = new PhaseLock()
    const bars = Math.ceil(10 * 60000 / barMs)
    for (let bar = 1; bar <= bars; bar++) {
      followerBeats += (barMs / 60000) * followerBpm * 1.005 // the follower's own clock runs fast
      const jitterBeats = (2 * Math.sin(bar * 7.1) / 60000) * master
      const r = lock.update(master, bar * 96, (followerBeats + jitterBeats) * TONE_PPQ)
      if (r.resyncTicks !== null) followerBeats = r.resyncTicks / TONE_PPQ
      followerBpm = r.bpm
      const driftMs = Math.abs(followerBeats - bar * 4) * 60000 / master
      if (bar > 16) maxDriftMs = Math.max(maxDriftMs, driftMs)
    }
    expect(maxDriftMs).toBeLessThan(5)
  })
})

describe('isClockSourceEcho — no own clock back into the source', () => {
  it('the source port itself (loopMIDI, IAC: one name both ways)', () => {
    expect(isClockSourceEcho('SYC CTRL', 'SYC CTRL')).toBe(true)
    expect(isClockSourceEcho('SYC CTRL', 'SYC IN')).toBe(false)
  })

  it('the loopback peer of a Windows MIDI Services A/B pair', () => {
    expect(isClockSourceEcho('SYC CTRL B', 'SYC CTRL A')).toBe(true)
    expect(isClockSourceEcho('SYC CTRL (B)', 'SYC CTRL (A)')).toBe(true)
    expect(isClockSourceEcho('SYC CTRL-B', 'syc ctrl-a')).toBe(true)
    expect(isClockSourceEcho('SYC CTRL B', 'SYC IN A')).toBe(false)
  })

  it('a name merely ending in a or b is not a loopback side', () => {
    expect(isClockSourceEcho('Arturia KeyLab', 'Arturia KeyLaa')).toBe(false)
    expect(isClockSourceEcho('SYC CTRL', 'SYC CTRL A')).toBe(false)
  })
})
