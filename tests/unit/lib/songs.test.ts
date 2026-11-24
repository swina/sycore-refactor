import { describe, it, expect } from 'vitest'
import {
  exampleSong, songBars, sectionStartBar, nextSectionIndex, parseLibrary, parseSong,
  startRun, songBarLine, jumpTo, setHold, newSection, songVolKeys, sectionVolTargets, sectionVolRamps, sectionDrumDensity, planToSong, type Song,
  setClipPreset, clearClipPresets, samePreset, markPresetSent, isPresetEcho,
  songFadeBars, barsToEnd, fadeStopLine, laneClips, hasOwnClips, setLaneClips, lanesAt, clipAt, normalizeClips, clipFits, setSectionBars,
} from '@/lib/songs'

const song = (bars: number[], end: Song['end'] = 'stop'): Song =>
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

  it('end Next: the last bar of the last section asks for the next song (the run untouched), parsed back', () => {
    const s = song([2, 2], 'next')
    const r = startRun(s, 1)
    expect(songBarLine(r, s)).toBeNull()
    expect(songBarLine(r, s)).toEqual({ kind: 'next' })
    expect([r.stopping, r.queued]).toEqual([false, null])
    expect(parseSong({ end: 'next', sections: [] })!.end).toBe('next')
  })

  it("End Next fades out to the song's end as End Stop; the song's In parsed (absent / bad: Rig)", () => {
    const s = song([2, 2], 'next')
    const r = startRun(s, 1)
    songBarLine(r, s)
    expect(barsToEnd(r, s)).toBe(2)
    expect(parseSong({ fadeIn: 2, sections: [] })!.fadeIn).toBe(2)
    expect(parseSong({ sections: [] })!.fadeIn).toBe('rig')
    expect(parseSong({ fadeIn: 'x', sections: [] })!.fadeIn).toBe('rig')
  })

  it('clip presets: saved on a whole-section clip (kept as a clip), parsed back, taken off', () => {
    const s = song([4])
    const sec = s.sections[0]
    const pc = { program: 12, bank: null, soundName: 'Pad', category: null, msb: 0, lsb: 0, msgs: [[0xc3, 12]] }
    expect(setClipPreset(sec, 'chord', 1, 'X3|3', pc)).toBe(true)
    expect(laneClips(sec, 'chord')[0].presets?.['X3|3'].soundName).toBe('Pad')
    const back = parseSong(JSON.parse(JSON.stringify(s)))!
    expect(laneClips(back.sections[0], 'chord')[0].presets?.['X3|3'].program).toBe(12)
    clearClipPresets(sec, 'chord', 1)
    expect(sec.clips).toBeUndefined() // a plain clip again
    expect(setClipPreset(sec, 'chord', 3, 'X3|3', pc)).toBe(false) // no clip starts there
  })

  it('samePreset compares what is sent (the channel aside); the player\'s own sends are told apart', () => {
    const a = { program: 5, bank: null, soundName: 'A', category: null, msb: 0, lsb: 0, msgs: [[0xc0, 5]] }
    expect(samePreset(a, { ...a, soundName: 'other name', msgs: [[0xc7, 5]] })).toBe(true)
    expect(samePreset(a, { ...a, program: 6, msgs: [[0xc0, 6]] })).toBe(false)
    expect(samePreset(null, a)).toBe(false)
    markPresetSent('X3|0', a)
    expect(isPresetEcho('X3|0', a)).toBe(true)
    expect(isPresetEcho('X3|0', a)).toBe(false) // once
  })

  it('planToSong: the form in order, each section on its letter, lanes with nothing silent', () => {
    const sec = (id: string, name: string, bars: number, extra: object = {}) =>
      ({ id, name, bars, energy: 3, chords: [{ symbol: 'C', beats: 4 }], drums: {}, playMode: 'chord', ...extra })
    const plan: any = {
      title: 'Night Drive', key: { root: 'C', rootPc: 0, mode: 'ionian' }, bpm: 100, style: { summary: '' },
      sections: [sec('A', 'Verse', 8, { drums: { Kick: 'x...' } }), sec('B', 'Chorus', 16, { sequence: { role: 'bass', steps: [] } })],
      form: ['A', 'B', 'A', 'Z'], sounds: {},
    }
    const s = planToSong(plan)
    expect(s.name).toBe('Night Drive')
    expect(s.sections.map(x => [x.name, x.bars])).toEqual([['Verse', 8], ['Chorus', 16], ['Verse', 8]])
    expect(s.sections[0].lanes).toEqual({ drum: 0, chord: 0, seq: null, bass: null, arp: null })
    expect(s.sections[1].lanes).toEqual({ drum: null, chord: 1, seq: 1, bass: null, arp: null })
    plan.style.drumStyle = 'house'
    expect(planToSong(plan).sections[1].lanes.drum).toBe(1) // a drum style fills the sections without a grid
  })
})

describe('song fade-out', () => {
  const mk = (end: any = 'stop') => {
    const s = parseSong({ name: 'T', end, sections: [{ name: 'A', bars: 4 }, { name: 'B', bars: 8 }] })!
    return s
  }
  it('parses fadeOut: rig by default, the listed bars only', () => {
    expect(mk().fadeOut).toBe('rig')
    expect(parseSong({ sections: [{}], fadeOut: 2 })!.fadeOut).toBe(2)
    expect(parseSong({ sections: [{}], fadeOut: 0 })!.fadeOut).toBe(0)
    expect(parseSong({ sections: [{}], fadeOut: 3 })!.fadeOut).toBe('rig')
  })
  it('songFadeBars: the Rig\'s or its own', () => {
    const s = mk()
    expect(songFadeBars(s, 2)).toBe(2)
    s.fadeOut = 0.5
    expect(songFadeBars(s, 2)).toBe(0.5)
  })
  it('barsToEnd: only in the last section, End Stop, not held', () => {
    const s = mk()
    const r: any = { songId: s.id, index: 0, bar: 2, queued: null, hold: false, stopping: false }
    expect(barsToEnd(r, s)).toBeNull()
    r.index = 1; r.bar = 6
    expect(barsToEnd(r, s)).toBe(3)
    r.hold = true
    expect(barsToEnd(r, s)).toBeNull()
    r.hold = false
    expect(barsToEnd(r, mk('loop'))).toBeNull()
    r.outAt = 1
    expect(barsToEnd(r, s)).toBeNull()
  })
  it('fadeStopLine: the first bar line at least `bars` away', () => {
    // bars of 1000 ms, next line at 1500, now 1000
    expect(fadeStopLine(1000, 1500, 1000, 0)).toBe(1500)
    expect(fadeStopLine(1000, 1500, 1000, 0.5)).toBe(1500)
    expect(fadeStopLine(1000, 1500, 1000, 1)).toBe(2500)
    expect(fadeStopLine(1000, 1500, 1000, 2)).toBe(3500)
  })
  it('a Stop song fading: the section loops, no launch; a jump calls it off', () => {
    const s = mk()
    const r: any = { songId: s.id, index: 0, bar: 4, queued: null, hold: false, stopping: false, outAt: 5000 }
    expect(songBarLine({ ...r, bar: 3 }, s)).toBeNull()
    jumpTo(r, s, 1)
    expect(r.outAt).toBeNull()
  })
})

describe('clips in a section', () => {
  const sec = () => newSection('S', 16, { seq: 0, arp: 1 })
  it('no clips listed: one over the whole section', () => {
    const s = sec()
    expect(laneClips(s, 'seq')).toEqual([{ slot: 0, start: 1, len: 16 }])
    expect(laneClips(s, 'drum')).toEqual([])
    expect(hasOwnClips(s, 'seq')).toBe(false)
  })
  it('placed clips: silent between them, a start on each', () => {
    const s = sec()
    setLaneClips(s, 'seq', [{ slot: 0, start: 12, len: 4 }, { slot: 0, start: 1, len: 4 }])
    expect(s.lanes.seq).toBe(0)
    expect(laneClips(s, 'seq').map(c => c.start)).toEqual([1, 12])
    expect(lanesAt(s, 1)).toMatchObject({ lanes: { seq: 0, arp: 1 }, starts: ['seq', 'arp'] })
    expect(lanesAt(s, 5).lanes.seq).toBeNull()
    expect(lanesAt(s, 12).starts).toEqual(['seq'])
    expect(clipAt(s, 'seq', 15)?.starts).toBe(false)
    expect(clipAt(s, 'seq', 16)).toBeNull()
  })
  it('overlaps cut, inside the section, the whole section back to plain', () => {
    expect(normalizeClips([{ slot: 1, start: 1, len: 8 }, { slot: 2, start: 5, len: 20 }], 16))
      .toEqual([{ slot: 1, start: 1, len: 4 }, { slot: 2, start: 5, len: 12 }])
    const s = sec()
    setLaneClips(s, 'arp', [{ slot: 3, start: 1, len: 16 }])
    expect(s.clips).toBeUndefined()
    expect(s.lanes.arp).toBe(3)
    setLaneClips(s, 'arp', [])
    expect(s.lanes.arp).toBeNull()
  })
  it('clipFits and setSectionBars', () => {
    const s = sec()
    setLaneClips(s, 'seq', [{ slot: 0, start: 1, len: 4 }, { slot: 0, start: 12, len: 4 }])
    expect(clipFits(s, 'seq', 5, 7)).toBe(true)
    expect(clipFits(s, 'seq', 5, 8)).toBe(false)
    expect(clipFits(s, 'seq', 10, 4, 1)).toBe(true)
    setSectionBars(s, 8)
    expect(laneClips(s, 'seq')).toEqual([{ slot: 0, start: 1, len: 4 }])
  })
  it('parses clips', () => {
    const p = parseSong({ sections: [{ bars: 8, lanes: { seq: 2 }, clips: { seq: [{ slot: 1, start: 5, len: 4 }, { slot: 9, start: 1, len: 1 }] } }] })!
    expect(p.sections[0].clips?.seq).toEqual([{ slot: 1, start: 5, len: 4 }])
    expect(p.sections[0].lanes.seq).toBe(1)
    expect(parseSong({ sections: [{ bars: 8 }] })!.sections[0].clips).toBeUndefined()
  })
})
