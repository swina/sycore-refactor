import { describe, it, expect } from 'vitest'
import { chordPcs, fitToChord, seqFitOf } from '@/lib/seq-gen/harmony'

const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const DORIAN = [0, 2, 3, 5, 7, 9, 10]

describe('chordPcs', () => {
  it('pitch classes of any voicing, sorted, no repeats', () => {
    expect(chordPcs([65, 69, 72, 41])).toEqual([0, 5, 9]) // F major with its bass
    expect(chordPcs([])).toEqual([])
    expect(chordPcs(null)).toEqual([])
  })
})

describe('fitToChord', () => {
  const F = chordPcs([65, 69, 72]) // F A C
  it('a chord tone stays', () => {
    expect(fitToChord(69, F, true, 9, DORIAN)).toBe(69)
    expect(fitToChord(72, F, false, 9, DORIAN)).toBe(72)
  })
  it('strong step: the nearest chord tone (the lower on a tie)', () => {
    expect(fitToChord(67, F, true, 9, DORIAN)).toBe(65) // G between F and A → F
    expect(fitToChord(71, F, true, 9, DORIAN)).toBe(72) // B → C
  })
  it('weak step: a b9 against a chord tone moves down onto it — the borrowed F in A Dorian (F#)', () => {
    expect(fitToChord(66, F, false, 9, DORIAN)).toBe(65)
  })
  it('weak step: a scale tone that does not clash stays; outside the scale → a chord tone', () => {
    expect(fitToChord(67, F, false, 9, DORIAN)).toBe(67) // G: in A Dorian, a step from F and A
    expect(fitToChord(63, F, false, 0, MAJOR)).toBe(65) // Eb in C major: out of the scale → F
  })
  it('no chord: the note as it is', () => {
    expect(fitToChord(66, [], true, 9, DORIAN)).toBe(66)
  })
})

describe('seqFitOf', () => {
  it('chord or scale', () => {
    expect(seqFitOf('chord')).toBe('chord')
    expect(seqFitOf('x')).toBe('scale')
  })
})
