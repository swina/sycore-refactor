import { describe, it, expect } from 'vitest'
import { parseSongPlan, validateSongPlan, normalizeGrid, drumLabelFor } from '@/lib/song-plan'

const good = {
  title: 'Night Drive',
  key: { root: 'A', mode: 'minor' },
  bpm: 118,
  style: { summary: 'French house', drumStyle: 'house' },
  sections: [
    { id: 'intro', name: 'Intro', bars: 4, energy: 2, chords: [{ symbol: 'Am7', beats: 8 }, { symbol: 'Fmaj7', beats: 8 }],
      drums: { Kick: 'x...x...x...x...', hihat: '..x.' } },
    { id: 'chorus', name: 'Chorus', bars: 4, energy: 5, chords: ['i', 'VI', 'III', 'VII'], playMode: 'arp',
      bass: { pattern: 'x..x..x.x..x..x.', notes: 'root|fifth|octave' } },
  ],
  form: ['intro', 'Chorus', 'chorus', 'Bridge'],
  sounds: { chords: 'Pad', bass: 'Bass' },
}

describe('song plan: parse', () => {
  it('extracts the JSON from an answer with fences and chatter', () => {
    const r = parseSongPlan('Here you go:\n```json\n{"title":"X","key":"C"}\n```\nEnjoy!')
    expect(r.error).toBeUndefined()
    expect(r.value).toEqual({ title: 'X', key: 'C' })
    expect(parseSongPlan('no json here').error).toMatch(/No JSON/)
    expect(parseSongPlan('{ broken').error).toBeDefined()
  })
})

describe('song plan: validate', () => {
  it('keeps a good plan and repairs the small things', () => {
    const { plan, issues } = validateSongPlan(good)
    expect(plan).not.toBeNull()
    expect(plan!.key).toEqual({ root: 'A', rootPc: 9, mode: 'minor' })
    expect(plan!.bpm).toBe(118)
    expect(plan!.style.drumStyle).toBe('House')
    expect(plan!.sections.map(s => s.id)).toEqual(['A', 'B'])
    // roman numerals → chords of A minor
    expect(plan!.sections[1].chords.map(c => c.symbol)).toEqual(['Am', 'F', 'C', 'G'])
    expect(plan!.sections[1].chords[0].beats).toBe(4)
    expect(plan!.sections[1].playMode).toBe('arp')
    expect(plan!.sections[1].bass).toEqual({ pattern: 'x..x..x.x..x..x.', tones: ['root', 'fifth', 'octave'] })
    // drum alias + short grid repeated to 16 steps
    expect(plan!.sections[0].drums).toEqual({ Kick: 'x...x...x...x...', 'Closed HH': '..x...x...x...x.' })
    // form by id or name; unknown "Bridge" dropped
    expect(plan!.form).toEqual(['A', 'B', 'B'])
    expect(issues.some(i => i.path === 'form[3]' && i.level === 'repaired')).toBe(true)
    expect(plan!.sounds).toEqual({ chords: 'Pad', bass: 'Bass' })
  })

  it('reads keys written in several ways', () => {
    expect(validateSongPlan({ ...good, key: 'F# minor' }).plan!.key).toMatchObject({ root: 'F#', mode: 'minor' })
    expect(validateSongPlan({ ...good, key: { root: 'Dm' } }).plan!.key).toMatchObject({ root: 'D', mode: 'minor' })
    const noMode = validateSongPlan({ ...good, key: { root: 'Eb' } })
    expect(noMode.plan!.key).toMatchObject({ root: 'D#', mode: 'major' })
    expect(noMode.issues.some(i => i.path === 'key.mode')).toBe(true)
    expect(validateSongPlan({ ...good, key: { root: 'X' } }).plan).toBeNull()
  })

  it('clamps the tempo and defaults it', () => {
    expect(validateSongPlan({ ...good, bpm: 400 }).plan!.bpm).toBe(240)
    expect(validateSongPlan({ ...good, bpm: '95' }).plan!.bpm).toBe(95)
    expect(validateSongPlan({ ...good, bpm: undefined }).plan!.bpm).toBe(120)
  })

  it('drops unknown chords and sections left without chords; null when nothing is playable', () => {
    const r = validateSongPlan({ ...good, sections: [{ name: 'Bad', chords: ['Qm7', 42] }, good.sections[1]], form: [] })
    expect(r.plan!.sections.map(s => s.name)).toEqual(['Chorus'])
    expect(r.plan!.sections[0].id).toBe('A')
    expect(r.plan!.form).toEqual(['A'])        // no form: sections in order
    expect(r.issues.filter(i => i.level === 'error').length).toBeGreaterThanOrEqual(3)
    expect(validateSongPlan({ ...good, sections: [{ chords: ['nope'] }] }).plan).toBeNull()
    expect(validateSongPlan('not an object').plan).toBeNull()
  })

  it('warns about chords outside the key, keeps them', () => {
    const r = validateSongPlan({ ...good, sections: [{ name: 'V', chords: ['E7'] }] })
    expect(r.plan!.sections[0].chords[0].symbol).toBe('E7')
    expect(r.issues.some(i => i.level === 'warning' && /outside A minor/.test(i.message))).toBe(true)
  })

  it('caps sections, chords and form at the modules\' sizes', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ name: `S${i}`, chords: Array(20).fill('Am') }))
    const r = validateSongPlan({ ...good, sections: many, form: Array(30).fill('S0') })
    expect(r.plan!.sections).toHaveLength(8)
    expect(r.plan!.sections[0].chords).toHaveLength(16)
    expect(r.plan!.form).toHaveLength(16)
  })
})

describe('song plan: grids and drum names', () => {
  it('normalizes grids', () => {
    expect(normalizeGrid('x...|x...|x...|x...')?.grid).toBe('x...x...x...x...')
    expect(normalizeGrid('X-x-')?.grid).toBe('X.x.X.x.X.x.X.x.')
    expect(normalizeGrid([1, 0, 0, 0])?.grid).toBe('x...x...x...x...')
    expect(normalizeGrid('x.x')?.grid).toBe('x.x.............')
    expect(normalizeGrid('x'.repeat(20))?.grid).toBe('x'.repeat(16))
    expect(normalizeGrid('')).toBeNull()
    expect(normalizeGrid(5)).toBeNull()
  })

  it('maps drum names to the Drum Machine tracks', () => {
    expect(drumLabelFor('kick')).toBe('Kick')
    expect(drumLabelFor('Hi-Hat')).toBe('Closed HH')
    expect(drumLabelFor('open_hat')).toBe('Open HH')
    expect(drumLabelFor('crash')).toBe('Cymbal')
    expect(drumLabelFor('cowbell')).toBe('Cowbell')
    expect(drumLabelFor('theremin')).toBeNull()
  })
})

describe('song plan: chord dynamics and sequences', () => {
  const base = (section: Record<string, unknown>) => validateSongPlan({
    key: 'A minor', bpm: 100, sections: [{ name: 'Verse', bars: 2, chords: ['Am'], ...section }], form: ['Verse'],
  })

  it('keeps per-chord velocity, mode, strum, arp mode and rate; repairs the rest', () => {
    const { plan, issues } = base({ chords: [
      { symbol: 'Am', beats: 2, velocity: 110, mode: 'arp', arpMode: 'down', arpRate: '8n' },
      { symbol: 'F', beats: 1, velocity: 300, mode: 'chord', strum: 'up' },
      { symbol: 'G', beats: 1, velocity: 0.5, mode: 'wobble', strum: 'sideways', arpRate: '3n' },
    ] })
    const [a, f, g] = plan!.sections[0].chords
    expect(a).toEqual({ symbol: 'Am', beats: 2, velocity: 110, mode: 'arp', arpMode: 'down', arpRate: '8n' })
    expect(f).toEqual({ symbol: 'F', beats: 1, velocity: 127, mode: 'chord', strum: 'up' })
    expect(g).toEqual({ symbol: 'G', beats: 1, velocity: 64 })
    expect(issues.some(i => i.path.endsWith('[1].velocity'))).toBe(true)
    expect(issues.some(i => i.path.endsWith('[2].mode'))).toBe(true)
  })

  it('reads a sequence: notes, accents, chords, rests, holds; pads to whole bars', () => {
    const { plan, issues } = base({ sequence: { role: 'bass', steps: 'A1 - - . C3! . E2+A2 x9 - A2' } })
    const seq = plan!.sections[0].sequence!
    expect(seq.role).toBe('bass')
    expect(seq.steps).toHaveLength(16)
    expect(seq.steps[0]).toEqual({ notes: [33], accent: false, hold: 2 })   // A1
    expect(seq.steps[1]).toEqual({ notes: [], accent: false, hold: 0 })
    expect(seq.steps[4]).toEqual({ notes: [48], accent: true, hold: 0 })
    expect(seq.steps[6].notes).toEqual([40, 45])
    expect(seq.steps[7].notes).toEqual([])          // unreadable → rest
    expect(seq.steps[8]).toEqual({ notes: [], accent: false, hold: 0 })  // hold after a rest = rest
    expect(issues.some(i => i.message.includes('padded to 16'))).toBe(true)
    expect(issues.some(i => i.message.includes('unreadable'))).toBe(true)
  })

  it('drops a sequence without notes, caps it at 64 steps', () => {
    expect(base({ sequence: { steps: ['.', '.', '-'] } }).plan!.sections[0].sequence).toBeUndefined()
    const long = base({ sequence: { steps: Array(80).fill('C3') } }).plan!.sections[0].sequence!
    expect(long.steps).toHaveLength(64)
  })
})

describe('song plan: drum grids with dynamics', () => {
  it('keeps accents, soft / ghost hits, ratchets and ties', async () => {
    const { normalizeDrumGrid } = await import('@/lib/song-plan')
    expect(normalizeDrumGrid('X..g x.o. 3-..|x--.')!.grid).toBe('X..gx.o.3-..x--.')
    expect(normalizeDrumGrid('-x..')!.grid).toBe('.x...x...x...x..')     // a leading tie is a rest
    expect(normalizeDrumGrid('x.*.O...')!.grid).toBe('x.x.x...x.x.x...')   // other marks = hits
    expect(normalizeDrumGrid([2, 0, 1, 0])!.grid).toBe('X.x.X.x.X.x.X.x.')
  })

  it('reads swing (0-80; a fraction of it under 1) and drops tracks with no hits', () => {
    const v = validateSongPlan({ key: 'C', style: { swing: 120 }, sections: [{ name: 'A', chords: ['C'], drums: { Kick: 'x...', Snare: '....' } }] })
    expect(v.plan!.style.swing).toBe(80)
    expect(v.plan!.sections[0].drums).toEqual({ Kick: 'x...x...x...x...' })
    expect(validateSongPlan({ key: 'C', style: { swing: 0.25 }, sections: [{ name: 'A', chords: ['C'] }] }).plan!.style.swing).toBe(20)
  })
})
