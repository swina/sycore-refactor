import { describe, it, expect } from 'vitest'
import { defaultFades, parseFades, planFadeIn, planFadeOut, rampAt, faded } from '@/lib/rig-fades'

describe('rig fades', () => {
  it('settings: bars only from the list, the rest off', () => {
    const s = parseFades({ master: { in: 2, out: 4 }, drum: { in: 3, out: 'x' }, chord: { in: 0.5 } })
    expect(s.master).toEqual({ in: 2, out: 4, max: 127 })
    expect(s.drum).toEqual({ in: 0, out: 0, max: 127 })
    expect(s.chord).toEqual({ in: 0.5, out: 0, max: 127 })
    expect(parseFades({ seq: { in: 1, max: 200 } }).seq.max).toBe(127)
    expect(parseFades(null)).toEqual(defaultFades())
  })

  it('Fade In: from the Play over its bars; without one: full at once', () => {
    const s = parseFades({ master: { in: 1 }, chord: { in: 2, max: 63.5 } })
    const { ramps, full } = planFadeIn(s, 1000, 2000)
    expect(ramps[0]).toEqual({ key: 'master', from: 0, to: 1, t0: 1000, t1: 3000 })
    expect(ramps[1].to).toBeCloseTo(64 / 127)
    expect(full.map(f => f.key)).toEqual(['drum', 'seq', 'bass', 'arp'])
    expect(full[0].level).toBe(1)
    expect(rampAt(ramps[0], 2000)).toBe(0.5)
  })

  it('Fade Out: ends on the Stop line; longer than the time left: starts now, from the factor now', () => {
    const s = parseFades({ master: { out: 1 }, drum: { out: 4 } })
    const r = planFadeOut(s, 1000, 5000, 2000, { drum: 0.8 })
    expect(r).toEqual([
      { key: 'master', from: 1, to: 0, t0: 3000, t1: 5000 },
      { key: 'drum', from: 0.8, to: 0, t0: 1000, t1: 5000 },
    ])
    expect(rampAt(r[0], 4000)).toBe(0.5)
    expect(planFadeOut(s, 6000, 5000, 2000)).toEqual([]) // a stop now: no fade
  })

  it('faded intensity', () => {
    expect(faded(100, 0.5)).toBe(50)
    expect(faded(100, undefined)).toBe(100)
  })
})

describe('per-channel fades', async () => {
  const m = await import('@/lib/rig-fades')
  it('In: 0 → Max; only an Out: back to Max at the Start; Out: to 0 on the Stop; others untouched', () => {
    const s = m.parseChFades({ 'X3|0': { in: 2, out: 1, max: 100 }, 'X3|1': { out: 1, max: 80 }, 'X3|2': { in: 0, out: 0 }, bad: { in: 1 } })
    expect(Object.keys(s)).toEqual(['X3|0', 'X3|1', 'X3|2'])
    const keys = ['X3|0', 'X3|1', 'X3|2', 'X3|3']
    const a = m.planChIn(s, keys, 0, 2000)
    expect(a.ramps).toEqual([{ key: 'X3|0', from: 0, to: 100, t0: 0, t1: 4000 }])
    expect(a.set).toEqual([{ key: 'X3|1', value: 80 }])
    expect(m.chRampAt(a.ramps[0], 2000)).toBe(50)
    const b = m.planChOut(s, keys, 1000, 5000, 2000, { 'X3|0': 100 })
    expect(b.map(r => [r.key, r.from, r.t0])).toEqual([['X3|0', 100, 3000], ['X3|1', 80, 3000]])
  })
})
