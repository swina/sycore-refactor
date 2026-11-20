import { describe, it, expect } from 'vitest'
import { detectScale } from '@/lib/chord-key'

const ch = (chordName: string, notes: number[]) => ({ chordName, notes })
// triads in octave 4
const Am = ch('Am', [57, 60, 64]), G = ch('G', [55, 59, 62]), F = ch('F', [53, 57, 60]), D = ch('D', [50, 54, 57])
const E = ch('E', [52, 56, 59]), Bb = ch('Bb', [58, 62, 65]), C = ch('C', [48, 52, 55]), Dm = ch('Dm', [50, 53, 57])

describe('detectScale', () => {
  it('Am G F Am: A Minor', () => expect(detectScale([Am, G, F, Am])?.label).toBe('A Minor'))
  it('Am D Am D: A Dorian (the major IV)', () => expect(detectScale([Am, D, Am, D])?.label).toBe('A Dorian'))
  it('Am Bb Am G: A Phrygian (the bII)', () => expect(detectScale([Am, Bb, Am, G])?.label).toBe('A Phrygian'))
  it('Am Dm E Am: A Harmonic Min (the major V)', () => expect(detectScale([Am, Dm, E, Am])?.label).toBe('A Harmonic Min'))
  it('C Bb F C: C Mixolydian (the bVII)', () => expect(detectScale([C, Bb, F, C])?.label).toBe('C Mixolydian'))
  it('C D C D: C Lydian (the major II)', () => expect(detectScale([C, D, C, D])?.label).toBe('C Lydian'))
  it('C F G C: C Major', () => expect(detectScale([C, F, ch('G', [55, 59, 62]), C])?.label).toBe('C Major'))
  it('the tonic given: on it', () => {
    const s = detectScale([C, G, Am, F], 9)
    expect(s?.root).toBe(9)
    expect(s?.mode).toBe('minor')
  })
  it('no chords: null', () => expect(detectScale([])).toBeNull())
})

import { progressionKey, progressionKeyDetail } from '@/lib/chord-key'
describe('progressionKey', () => {
  const Am = ch('Am', [57, 60, 64]), D = ch('D', [50, 54, 57])
  it('no exact key (Modal Chords): the mode, a scale', () => {
    const k = progressionKey([Am, D, Am, D], { selectedKey: 12, keyMode: null, modalRoot: null })!
    expect(k.label).toBe('A Dorian')
    expect(progressionKeyDetail(k)).toEqual({ root: 9, scale: 'Dorian' })
  })
  it('Modal Chords root: the tonic', () => {
    expect(progressionKey([Am, D], { selectedKey: 12, keyMode: null, modalRoot: 2 })!.root).toBe(2)
  })
  it('an exact key: major / minor, no scale', () => {
    const k = progressionKey([Am, D, Am], { selectedKey: 0, keyMode: 'minor' })!
    expect(k.scale).toBeNull()
    expect(progressionKeyDetail(k)).toEqual({ root: k.root, mode: k.mode })
  })
  it('no chords: null', () => expect(progressionKey([], { selectedKey: 12, keyMode: null })).toBeNull())
})
