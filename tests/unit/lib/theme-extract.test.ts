import { describe, it, expect } from 'vitest'
import { splitTheme, extractChords, extractMelody, themeBars, beatsToDuration, type ThemeNote } from '@/lib/theme-extract'

// 120 BPM: beat 500 ms, bar 2000 ms, 1/16 125 ms
const BPM = 120
const n = (pitch: number, startTime: number, duration: number, velocity = 100): ThemeNote => ({ pitch, startTime, duration, velocity })
const chord = (pitches: number[], at: number, dur: number) => pitches.map((p, i) => n(p, at + i * 5, dur))
const AM = [57, 60, 64], F = [53, 57, 60], C = [48, 52, 55], G = [55, 59, 62]

describe('theme: split', () => {
  it('auto: 3+ notes struck together are chords, the rest melody', () => {
    const notes = [...chord(AM, 0, 1900), n(76, 0, 400), n(72, 500, 400)]
    const { chord: c, melody } = splitTheme(notes)
    // the top note struck with the chord counts as the chord's
    expect(c.map(x => x.pitch).sort()).toEqual([57, 60, 64, 76])
    expect(melody.map(x => x.pitch)).toEqual([72])
  })
  it('split note: below chords, from it up melody', () => {
    const { chord: c, melody } = splitTheme([...chord(AM, 0, 1900), n(76, 0, 400)], { split: 72 })
    expect(c).toHaveLength(3)
    expect(melody.map(x => x.pitch)).toEqual([76])
  })
})

describe('theme: chords', () => {
  it('one per bar, named from the notes; the same chord merged', () => {
    const notes = [...chord(AM, 0, 1950), ...chord(AM, 2000, 1950), ...chord(F, 4000, 1950), ...chord(G, 6000, 1950)]
    const out = extractChords(notes, { t0: 0, bpm: BPM, bars: 4 })
    expect(out.map(c => [c.name, c.beats])).toEqual([['Am', 8], ['F', 4], ['G', 4]])
    expect(out[0].notes).toEqual(AM)
  })
  it('a change at half bar: two steps of 2 beats', () => {
    const notes = [...chord(C, 0, 950), ...chord(G, 1000, 950)]
    expect(extractChords(notes, { t0: 0, bpm: BPM, bars: 1 }).map(c => [c.name, c.beats])).toEqual([['C', 2], ['G', 2]])
  })
  it('a bar with no chord: the one before holds; before the first chord, a rest', () => {
    const notes = [...chord(AM, 2000, 1950)]
    const out = extractChords(notes, { t0: 0, bpm: BPM, bars: 3 })
    expect(out.map(c => [c.name, c.beats])).toEqual([['', 4], ['Am', 8]])
  })
  it('durations for Chord Prog', () => {
    expect([2, 4, 8, 16].map(beatsToDuration)).toEqual(['2n', '1m', '2m', '4m'])
  })
})

describe('theme: melody', () => {
  it('a bar per bank at 1/16, long notes tied', () => {
    const banks = extractMelody([n(72, 0, 120), n(74, 250, 500), n(76, 2125, 100)], { t0: 0, bpm: BPM, bars: 2 })
    expect(banks).toHaveLength(2)
    expect(banks[0][0]).toMatchObject({ active: true, notes: [72], tieSteps: 0 })
    expect(banks[0][2]).toMatchObject({ active: true, notes: [74], tieSteps: 3 })
    expect(banks[0][1].active).toBe(false)
    expect(banks[1][1]).toMatchObject({ active: true, notes: [76] })
  })
  it('two notes on one step: the highest', () => {
    const [b] = extractMelody([n(67, 0, 100), n(71, 10, 100)], { t0: 0, bpm: BPM, bars: 1 })
    expect(b[0].notes).toEqual([71])
  })
})

describe('theme: bars', () => {
  it('from the first note; a late release does not add a bar', () => {
    expect(themeBars([n(60, 0, 3990)], 0, BPM)).toBe(2)
    expect(themeBars([n(60, 0, 4100)], 0, BPM)).toBe(2)
    expect(themeBars([n(60, 0, 4500)], 0, BPM)).toBe(3)
  })
})
