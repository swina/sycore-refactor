import { describe, it, expect } from 'vitest'
import { chordAfter, firstChord, rigChord } from '@/lib/chord-next'

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
      .toEqual({ now: 'C', dur: '1/1', next: 'Am', nextDur: '1/2' })
    expect(rigChord({ name: 'F', duration: '1m' }, { name: 'C', duration: '1m', wraps: true }, { steps: [st('Dm', '2n')], numSteps: 1 }, L))
      .toEqual({ now: 'F', dur: '1/1', next: 'Dm', nextDur: '1/2' })
    expect(rigChord({ name: '', duration: '' }, null, null, L)).toBeNull()
  })
})
