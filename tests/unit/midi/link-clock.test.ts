import { describe, it, expect } from 'vitest'
import { LinkClockAdapter, type LinkTimeSource } from '@/core/midi/link-clock'
import type { ExternalClockEvent } from '@/core/midi/external-clock'

/** A Live transport mirror: `beat` at time `at`, interpolated at `tempo`. */
function source(init: { playing?: boolean; beat?: number; tempo?: number; num?: number; den?: number } = {}) {
  const s = {
    transport: { playing: init.playing ?? true, tempo: init.tempo ?? 120, num: init.num ?? 4, den: init.den ?? 4 },
    beat: init.beat ?? 0, at: 0,
    beatAt(t: number) { return this.transport.playing ? this.beat + ((t - this.at) * this.transport.tempo) / 60000 : this.beat },
    timeOfBeat(b: number) { return this.at + ((b - this.beat) * 60000) / this.transport.tempo },
    set(beat: number, at: number) { this.beat = beat; this.at = at },
  }
  return s as LinkTimeSource & typeof s
}

function run(src: ReturnType<typeof source>) {
  const a = new LinkClockAdapter(src)
  const ev: ExternalClockEvent[] = []
  a.on(e => ev.push(e))
  const tickTo = (from: number, to: number, step = 10) => { for (let t = from; t <= to; t += step) a.tick(t) }
  return { a, ev, tickTo }
}

describe('LinkClockAdapter', () => {
  it('Live starts at 1.1.1: start on beat 0, then a beat per quarter and a bar every 4', () => {
    const src = source()
    const { a, ev, tickTo } = run(src)
    a.onTransport(0)
    tickTo(0, 2000) // 120 BPM: 4 beats
    expect(ev[0]).toEqual({ type: 'tempo', bpm: 120 })
    expect(ev[1]).toEqual({ type: 'start', sixteenth: 0, bpm: 120, t: 0 })
    const beats = ev.filter(e => e.type === 'beat') as any[]
    expect(beats.map(b => b.sixteenth)).toEqual([4, 8, 12, 16])
    expect(beats.map(b => b.t)).toEqual([500, 1000, 1500, 2000])
    const bars = ev.filter(e => e.type === 'bar') as any[]
    expect(bars).toEqual([{ type: 'bar', bar: 1, clocksSinceStart: 96, bpm: 120, t: 2000 }])
    expect(a.state).toBe('playing')
  })

  it('Live starts mid-bar: waits for the next bar line', () => {
    const src = source({ beat: 5 })  // bar 2, beat 2
    const { a, ev, tickTo } = run(src)
    a.onTransport(0)
    tickTo(0, 1400)
    expect(a.state).toBe('waiting-bar')
    tickTo(1500, 1600)          // beat 8 at 1500 ms
    expect(ev.find(e => e.type === 'start')).toEqual({ type: 'start', sixteenth: 32, bpm: 120, t: 1500 })
  })

  it('a start seen up to 150 ms after the bar line starts on it, later waits for the next', () => {
    const late = source({ beat: 4.28 })   // 140 ms after beat 4 at 120 BPM
    const r1 = run(late); r1.a.onTransport(0); r1.a.tick(0)
    expect(r1.ev.find(e => e.type === 'start')).toMatchObject({ sixteenth: 16, t: expect.closeTo(-140, 6) })
    const later = source({ beat: 4.4 })   // 200 ms after
    const r2 = run(later); r2.a.onTransport(0); r2.a.tick(0)
    expect(r2.ev.find(e => e.type === 'start')).toBeUndefined()
    expect(r2.a.state).toBe('waiting-bar')
  })

  it('a start report a little past the bar line still starts on it', () => {
    const src = source({ beat: 4.02 })
    const { a, ev } = run(src)
    a.onTransport(0)
    a.tick(0)
    expect(ev.find(e => e.type === 'start')).toMatchObject({ sixteenth: 16 })
  })

  it('a late tick still gives each beat its exact time, all beats emitted', () => {
    const src = source()
    const { a, ev } = run(src)
    a.onTransport(0); a.tick(0)
    a.tick(1730) // a stalled page: three beats due
    expect((ev.filter(e => e.type === 'beat') as any[]).map(b => b.t)).toEqual([500, 1000, 1500])
  })

  it('stop when Live stops', () => {
    const src = source()
    const { a, ev, tickTo } = run(src)
    a.onTransport(0); tickTo(0, 600)
    src.transport.playing = false; src.set(1.2, 600)
    a.onTransport(600)
    expect(ev.at(-1)).toEqual({ type: 'stop' })
    expect(a.state).toBe('stopped')
  })

  it('a jump (loop back) stops and starts again on the next bar line', () => {
    const src = source()
    const { a, ev, tickTo } = run(src)
    a.onTransport(0); tickTo(0, 3900)  // to beat ~7.8
    src.set(0, 3950)                     // Live loops back to 1.1.1
    a.tick(3950)
    expect(ev.at(-1)).toEqual({ type: 'stop' })
    expect(a.state).toBe('waiting-bar')
    a.tick(3960)
    expect(ev.at(-1)).toMatchObject({ type: 'start', sixteenth: 0, t: 3950 })
  })

  it('3/4: bars every 3 beats', () => {
    const src = source({ num: 3, den: 4 })
    const { a, ev, tickTo } = run(src)
    a.onTransport(0); tickTo(0, 3000)
    expect((ev.filter(e => e.type === 'bar') as any[]).map(b => b.clocksSinceStart)).toEqual([72, 144])
    expect(a.positionLabel(1750)).toBe('2.1.3')
  })

  it('tempo changes are passed on', () => {
    const src = source()
    const { a, ev } = run(src)
    a.onTransport(0); a.tick(0)
    src.set(src.beatAt(100), 100); src.transport.tempo = 90
    a.onTransport(100)
    expect(ev.at(-1)).toEqual({ type: 'tempo', bpm: 90 })
  })

  it('the bridge lost while playing: clockLost, then stop (behaviour stop) or not (continue)', () => {
    const src = source()
    const { a, ev } = run(src)
    a.onTransport(0); a.tick(0)
    a.lost()
    expect(ev.slice(-2)).toEqual([{ type: 'clockLost', behavior: 'stop', lastBpm: 120 }, { type: 'stop' }])

    const src2 = source()
    const r2 = run(src2)
    r2.a.lossBehavior = 'continue'
    r2.a.onTransport(0); r2.a.tick(0)
    r2.a.lost()
    expect(r2.ev.at(-1)).toEqual({ type: 'clockLost', behavior: 'continue', lastBpm: 120 })
    expect(r2.a.state).toBe('lost')
  })

  it('stopped: ticks emit nothing', () => {
    const src = source({ playing: false })
    const { a, ev, tickTo } = run(src)
    a.onTransport(0); tickTo(0, 2000)
    expect(ev).toEqual([])
  })
})
