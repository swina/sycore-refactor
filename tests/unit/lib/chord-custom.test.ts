import { describe, it, expect } from 'vitest'
import { customChordName, chordSymbolRoot, chordBassNote, normalizeCustomStep } from '@/lib/chord-custom'

// Chord Prog: custom chords named by their notes; the bass per step.
describe('chord-custom', () => {
  it('a custom chord is named by its notes, lowest first (C4 = 60)', () => {
    expect(customChordName([67, 55])).toBe('G3G4')
    expect(normalizeCustomStep({ chordName: 'Custom', notes: [55, 67] }).chordName).toBe('G3G4')
    expect(normalizeCustomStep({ chordName: 'Cm7', notes: [60] }).chordName).toBe('Cm7')
  })
  it('tells chord symbols from other names', () => {
    expect(chordSymbolRoot('Ebm')).toBe(3)
    expect(chordSymbolRoot('DbM')).toBe(1)
    expect(chordSymbolRoot('Bb')).toBe(10)
    expect(chordSymbolRoot('F#m7b5')).toBe(6)
    expect(chordSymbolRoot('C/E')).toBe(0)
    for (const n of ['G3G4', 'CEG', 'Custom', 'Pad', '']) expect(chordSymbolRoot(n)).toBeNull()
  })
  it('bass: a symbol\'s root in octave 2; custom notes: the lowest an octave down; with the transpose', () => {
    expect(chordBassNote({ chordName: 'Ebm', notes: [63, 66, 70] })).toBe(39) // Eb2
    expect(chordBassNote({ chordName: 'G3G4', notes: [55, 67] })).toBe(43)    // G2
    expect(chordBassNote({ chordName: 'Custom', notes: [67, 55] })).toBe(43)
    expect(chordBassNote({ chordName: 'Bb', notes: [58, 62, 65] }, 2)).toBe(48) // Bb2 + 2
    expect(chordBassNote({ chordName: 'C', notes: [] })).toBeNull()
  })
})
