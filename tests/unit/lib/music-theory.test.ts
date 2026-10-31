import { describe, it, expect } from 'vitest'
import {
  parsePitchClass, parseMode, scalePitchClasses, parseChordSymbol, chordPitchClasses, romanToSymbol,
  resolveChord, nonDiatonicTones, snapToScale, voiceChord, voiceLead, beatsToDuration, DURATION_BEATS,
} from '@/lib/music-theory'
import { DURATION_OPTIONS } from '@/stores/useChordProgStore'

describe('music-theory', () => {
  it('reads note names and modes', () => {
    expect(parsePitchClass('C')).toBe(0)
    expect(parsePitchClass('Bb')).toBe(10)
    expect(parsePitchClass('f#')).toBe(6)
    expect(parsePitchClass('Cb')).toBe(11)
    expect(parsePitchClass('H')).toBeNull()
    expect(parseMode('Aeolian')).toBe('minor')
    expect(parseMode('harmonic-minor')).toBe('harmonicMinor')
    expect(parseMode('blues')).toBeNull()
    expect(scalePitchClasses(9, 'minor')).toEqual([9, 11, 0, 2, 4, 5, 7])
  })

  it('parses chord symbols, slash chords included', () => {
    expect(parseChordSymbol('Am7')).toMatchObject({ symbol: 'Am7', rootPc: 9, intervals: [0, 3, 7, 10] })
    expect(parseChordSymbol('Bbmaj7')?.symbol).toBe('A#maj7')
    expect(parseChordSymbol('F#m7b5')?.intervals).toEqual([0, 3, 6, 10])
    const ce = parseChordSymbol('C/E')!
    expect(ce.bassPc).toBe(4)
    expect(chordPitchClasses(ce)).toEqual([0, 4, 7])
    expect(parseChordSymbol('Cxyz')).toBeNull()
    expect(parseChordSymbol('not a chord')).toBeNull()
  })

  it('turns roman numerals into chords of the key', () => {
    expect(romanToSymbol('ii7', 0, 'major')).toBe('Dm7')
    expect(romanToSymbol('V7', 0, 'major')).toBe('G7')
    expect(romanToSymbol('vii°', 0, 'major')).toBe('Bdim')
    expect(romanToSymbol('bVII', 9, 'minor')).toBe('F#')    // A minor: VII = G, b → F#
    expect(romanToSymbol('VII', 9, 'minor')).toBe('G')
    expect(romanToSymbol('iv', 9, 'minor')).toBe('Dm')
    expect(romanToSymbol('Imaj7', 5, 'major')).toBe('Fmaj7')
    expect(romanToSymbol('X', 0, 'major')).toBeNull()
    expect(resolveChord('vi', 0, 'major')?.symbol).toBe('Am')
    expect(resolveChord('Em', 0, 'major')?.symbol).toBe('Em')
  })

  it('finds tones outside the key and snaps notes into it', () => {
    expect(nonDiatonicTones(parseChordSymbol('E')!, 9, 'minor')).toEqual([8])    // G# in A minor
    expect(nonDiatonicTones(parseChordSymbol('E')!, 9, 'harmonicMinor')).toEqual([])
    expect(snapToScale(61, 0, 'major')).toBe(60)    // C# → C (down on a tie)
    expect(snapToScale(64, 0, 'major')).toBe(64)
  })

  it('voices chords near a center, with simple voice leading', () => {
    expect(voiceChord(parseChordSymbol('Am')!, 60)).toEqual([57, 60, 64])
    expect(voiceChord(parseChordSymbol('F')!, 60)).toEqual([65, 69, 72])
    const ce = voiceChord(parseChordSymbol('C/E')!, 60)
    expect(ce[0] % 12).toBe(4)
    expect(ce[0]).toBeLessThan(ce[1])
    // C → F: the common tone stays, the others move by step (C E G → C F A)
    const c = voiceChord(parseChordSymbol('C')!, 60)
    const f = voiceLead(parseChordSymbol('F')!, c, 60)
    expect(f).toEqual([60, 65, 69])
    const moved = f.reduce((s, n, i) => s + Math.abs(n - c[i]), 0)
    expect(moved).toBeLessThanOrEqual(3)
  })

  it('maps beats to Chord Prog durations (same set as the store)', () => {
    expect(Object.keys(DURATION_BEATS).sort()).toEqual([...DURATION_OPTIONS].sort())
    expect(beatsToDuration(4)).toBe('1m')
    expect(beatsToDuration(8)).toBe('2m')
    expect(beatsToDuration(2)).toBe('2n')
    expect(beatsToDuration(1)).toBe('4n')
    expect(beatsToDuration(3)).toBe('2n.')
    expect(beatsToDuration(5)).toBe('1m')
  })
})
