import { describe, it, expect } from 'vitest'
import {
  exampleSong, songBars, sectionStartBar, nextSectionIndex, parseLibrary, parseSong,
  startRun, songBarLine, jumpTo, setHold, newSection, songVolKeys, sectionVolTargets, sectionVolRamps, sectionDrumDensity, type Song,
} from '@/lib/songs'

const song = (bars: number[], end: 'stop' | 'loop' = 'stop'): Song =>
  ({ id: 's', name: 'T', end, sections: bars.map((b, i) => newSection(`S${i}`, b, { chord: i })) })

describe('songs', () => {
  it('the example: six sections, 72 bars, lanes per section', () => {
    const s = exampleSong()
    expect(s.sections.map(x => x.name)).toEqual(['Intro', 'Build', 'Theme', 'Bridge', 'Theme II', 'Outro'])
    expect(songBars(s)).toBe(72)
    expect(sectionStartBar(s, 2)).toBe(25)
    expect(s.sections[2].lanes).toEqual({ drum: 2, chord: 2, seq: 2, bass: 1, arp: null })
  })

  it('end: stop or loop', () => {
    expect(nextSectionIndex(song([4, 4]), 1)).toBeNull()
    expect(nextSectionIndex(song([4, 4], 'loop'), 1)).toBe(0)
  })

  it('parse: bad data repaired, an empty library gets the example', () => {
    const p = parseSong({ name: '', sections: [{ bars: 999, lanes: { drum: 9, chord: 2 } }] })!
    expect(p.name).toBe('Song')
    expect(p.sections[0].bars).toBe(64)
    expect(p.sections[0].lanes).toEqual({ drum: null, chord: 2, seq: null, bass: null, arp: null })
    const lib = parseLibrary(null)
    expect(lib.songs[0].name).toBe('Nightline')
    expect(lib.currentId).toBe(lib.songs[0].id)
  })

  it('player: the next section is launched in the last bar, starts on the next line', () => {
    const s = song([2, 1])
    const r = startRun(s)
    expect(songBarLine(r, s)).toBeNull() // bar 1 of S0
    expect(r).toMatchObject({ index: 0, bar: 1 })
    expect(songBarLine(r, s)).toEqual({ kind: 'launch', index: 1 }) // bar 2 = last
    // S1 is 1 bar: its first bar is its last → the end
    expect(songBarLine(r, s)).toEqual({ kind: 'stop' })
    expect(r).toMatchObject({ index: 1, bar: 1, stopping: true })
    expect(songBarLine(r, s)).toEqual({ kind: 'done' })
  })

  it('player: loop goes back to the first section', () => {
    const s = song([1, 1], 'loop')
    const r = startRun(s)
    expect(songBarLine(r, s)).toEqual({ kind: 'launch', index: 1 })
    expect(songBarLine(r, s)).toEqual({ kind: 'launch', index: 0 })
    expect(songBarLine(r, s)).toEqual({ kind: 'launch', index: 1 })
    expect(r.index).toBe(0)
  })

  it('Hold loops the section; released in its last bar the next one is launched', () => {
    const s = song([2, 4])
    const r = startRun(s)
    setHold(r, s, true)
    songBarLine(r, s); songBarLine(r, s) // bars 1, 2 — nothing launched
    expect(r.queued).toBeNull()
    expect(songBarLine(r, s)).toBeNull()
    expect(r.bar).toBe(1) // looped
    songBarLine(r, s) // bar 2 again
    expect(setHold(r, s, false)).toEqual({ kind: 'launch', index: 1 })
  })

  it('a jump: that section on the next bar line', () => {
    const s = song([8, 8, 8])
    const r = startRun(s)
    songBarLine(r, s)
    expect(jumpTo(r, s, 2)).toEqual({ kind: 'launch', index: 2 })
    songBarLine(r, s)
    expect(r).toMatchObject({ index: 2, bar: 1 })
  })

  it('volumes per channel: set somewhere = the song\'s (100% where not set), % of the Max', () => {
    const s = song([4, 4, 4])
    s.sections[0].vol = { 'X3|0': 50 }
    s.sections[1].vol = { 'X3|1': 0 }
    expect(songVolKeys(s).sort()).toEqual(['X3|0', 'X3|1'])
    const max = (k: string) => (k === 'X3|0' ? 100 : 127)
    expect(sectionVolTargets(s, s.sections[0], max)).toEqual({ 'X3|0': 50, 'X3|1': 127 })
    expect(sectionVolTargets(s, s.sections[2], max)).toEqual({ 'X3|0': 100, 'X3|1': 127 })
    expect(sectionVolTargets(song([4]), song([4]).sections[0], max)).toEqual({}) // nothing set: left alone
  })

  it('volume ramps: from the value now over the bars from the bar line; Cut = on it', () => {
    const [r] = sectionVolRamps({ 'A|0': 64 }, { 'A|0': 127 }, 1000, 2000, 2)
    expect(r).toEqual({ key: 'A|0', from: 127, to: 64, t0: 1000, t1: 5000 })
    const [c] = sectionVolRamps({ 'A|0': 64 }, {}, 1000, 2000, 0)
    expect(c).toEqual({ key: 'A|0', from: 64, to: 64, t0: 1000, t1: 1000 })
  })

  it('parse: volumes clamped, bad keys dropped, volBars repaired', () => {
    const p = parseSong({ sections: [{ bars: 4, vol: { 'X3|2': 140, bad: 5, 'X3|3': -4 }, volBars: 3 }] })!
    expect(p.sections[0].vol).toEqual({ 'X3|2': 100, 'X3|3': 0 })
    expect(p.sections[0].volBars).toBe(0)
  })

  it('parse: chordSteps 1–16 or null (all)', () => {
    const p = parseSong({ sections: [{ chordSteps: 2 }, { chordSteps: 0 }, { chordSteps: 2.5 }, {}] })!
    expect(p.sections.map(s => s.chordSteps)).toEqual([2, null, null, null])
    expect(newSection().chordSteps).toBeNull()
  })

  it('drum density: own, 127 if set elsewhere, null if the song never sets it; parse clamps', () => {
    const s = song([4, 4])
    expect(sectionDrumDensity(s, s.sections[1])).toBeNull()
    s.sections[0].drumDensity = 40
    expect(sectionDrumDensity(s, s.sections[0])).toBe(40)
    expect(sectionDrumDensity(s, s.sections[1])).toBe(127)
    expect(parseSong({ sections: [{ drumDensity: 300 }, { drumDensity: 'x' }] })!.sections.map(x => x.drumDensity)).toEqual([127, null])
  })

  it('end Stay: after the last section it holds (no done) until stopped', () => {
    const s = song([2], 'stay')
    const r = startRun(s)
    expect(songBarLine(r, s)).toBeNull()             // bar 1
    expect(songBarLine(r, s)).toEqual({ kind: 'stay' }) // bar 2, the last
    expect(songBarLine(r, s)).toBeNull()             // held
    expect(songBarLine(r, s)).toBeNull()
    expect(r.bar).toBe(3)
    r.stay = false                                   // Stop song
    expect(songBarLine(r, s)).toEqual({ kind: 'done' })
    expect(parseSong({ end: 'stay', sections: [] })!.end).toBe('stay')
  })

  it('end Stay on section: the last section loops until stopped', () => {
    const s = song([2, 2], 'staySection')
    const r = startRun(s, 1)
    expect(songBarLine(r, s)).toBeNull()
    expect(songBarLine(r, s)).toBeNull() // its last bar: nothing launched, no stop
    expect(songBarLine(r, s)).toBeNull()
    expect([r.index, r.bar, r.stopping]).toEqual([1, 1, false])
  })
})
