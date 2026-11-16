import { describe, it, expect } from 'vitest'
import { chordAfter, firstChord, rigChord, latchIndex } from '@/lib/chord-next'

const st = (name: string, duration = '1m', active = true) => ({ active, notes: name ? [60] : [], chordName: name, duration })
const L = { '1m': '1/1', '2n': '1/2' }

describe('chord-next', () => {
  const steps = [st('C'), st('', '1m', false), st('Am', '2n'), st('F'), st('G', '1m', false)]
  it('the next chord skips rests and wraps', () => {
    expect(chordAfter(steps, 4, 0)).toEqual({ step: steps[2], wraps: false })
    expect(chordAfter(steps, 4, 3)).toEqual({ step: steps[0], wraps: true })
    expect(chordAfter(steps, 4, 3, false)).toBeNull()
    expect(chordAfter([st('', '1m', false)], 1, 0)).toBeNull()
    expect(firstChord(steps, 4)).toBe(steps[0])
  })
  it('rigChord: labels, and a queued slot first after the end', () => {
    expect(rigChord({ name: 'C', duration: '1m' }, { name: 'Am', duration: '2n', wraps: false }, null, L))
      .toEqual({ now: 'C', dur: '1/1', next: 'Am', nextDur: '1/2', ms: 0, bars: 0, seq: 0 })
    expect(rigChord({ name: 'F', duration: '1m' }, { name: 'C', duration: '1m', wraps: true }, { steps: [st('Dm', '2n')], numSteps: 1 }, L))
      .toEqual({ now: 'F', dur: '1/1', next: 'Dm', nextDur: '1/2', ms: 0, bars: 0, seq: 0 })
    expect(rigChord({ name: 'C', duration: '1m', ms: 2000, bars: 1, seq: 7 }, null, null, L)).toMatchObject({ ms: 2000, bars: 1, seq: 7 })
    expect(rigChord({ name: '', duration: '', ms: 500 }, { name: 'C', duration: '1m', wraps: false }, null, L)).toMatchObject({ ms: 0 })
    expect(rigChord({ name: '', duration: '' }, null, null, L)).toBeNull()
  })

  it('Latch: chord n of the slot playing; none past its length or on a rest', () => {
    expect(latchIndex(steps, 4, 0, null)).toBe(-1)
    expect(latchIndex(steps, 4, 0, 2)).toBe(2)
    expect(latchIndex(steps, 4, 3, 1)).toBe(-1)   // a rest
    expect(latchIndex(steps, 4, 0, 4)).toBe(-1)   // past the length
  })
  it('Latch in a chain: the same slot instance as the pointer', () => {
    const chain = [st('C'), st('F'), st('Am'), st('G')]
    const c = { slotIndices: [0, 0, 1, 1], localIndices: [0, 1, 0, 1], positions: [0, 0, 1, 1] }
    expect(latchIndex(chain, 4, 0, 1, c)).toBe(1)
    expect(latchIndex(chain, 4, 3, 1, c)).toBe(3)
    expect(latchIndex(chain, 4, 2, 0, { ...c, positions: null })).toBe(2)
  })
})
