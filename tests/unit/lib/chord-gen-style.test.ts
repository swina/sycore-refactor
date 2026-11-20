import { describe, it, expect } from 'vitest'
import {
  CHORD_GEN_STYLES, CHORD_GEN_STYLE_NAMES, MODAL_KEY_INDEX, durSixteenths, modalRoot, pickProgression, voiceChord, generateStyled,
} from '@/lib/chord-gen-style'
import { STYLES, BASS_STYLES } from '@/core/engines/sequencer'

const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length] }

describe('styles', () => {
  it("are the Sequencer's, without its bassline styles", () => {
    const expected = Object.keys(STYLES).filter(n => !(BASS_STYLES as readonly string[]).includes(n))
    expect(CHORD_GEN_STYLE_NAMES.sort()).toEqual(expected.sort())
  })
  it('every rhythm pattern is whole bars of known durations', () => {
    for (const [name, st] of Object.entries(CHORD_GEN_STYLES)) {
      for (const r of st.rhythms) {
        const total = r.reduce((s, d) => s + durSixteenths(d), 0)
        expect(r.every(d => durSixteenths(d) > 0), name).toBe(true)
        expect(total % 16, `${name} ${r}`).toBe(0)
      }
    }
  })
})

describe('modalRoot / pickProgression', () => {
  const names = ['A Mysterious Dark', 'A Joyful', 'Gb Surprised Rebellious', 'C bIIIM V7 I', 'C Peaceful Tender']
  it('reads the root of a Modal Chords name', () => {
    expect(modalRoot('Gb Surprised Rebellious')).toBe(6)
    expect(modalRoot('A Mysterious')).toBe(9)
    expect(modalRoot('ii-V-I C')).toBeNull()
  })
  it('stays on the root, the moods first', () => {
    expect(pickProgression(names, { root: 0, moods: ['Peaceful'], rnd: () => 0 })).toBe('C Peaceful Tender')
    expect(pickProgression(names, { root: 9, moods: ['Dark'], rnd: () => 0.5 })).toBe('A Mysterious Dark')
  })
  it('any root when null or none on it; null on an empty list', () => {
    expect(names).toContain(pickProgression(names, { root: null, rnd: () => 0.99 }))
    expect(names).toContain(pickProgression(names, { root: 4, rnd: () => 0 }))
    expect(pickProgression([], {})).toBeNull()
  })
})

describe('voiceChord', () => {
  const eb = { chordName: 'Eb', notes: [63, 67, 70, 39] } // the library's: a triad plus the bass
  const cm = { chordName: 'Cm', notes: [60, 63, 67] }
  it('triad: as written', () => expect(voiceChord(eb, 'triad')).toEqual(eb))
  it('seventh: adds maj7 / b7, keeps the bass', () => {
    const v = voiceChord(eb, 'seventh')
    expect(v.notes).toContain(39)
    expect(v.notes.some(n => n % 12 === 2)).toBe(true) // D = maj7 of Eb
    expect(v.chordName).toBe(voiceChord(eb, 'seventh').chordName)
    expect(voiceChord(cm, 'seventh').notes.some(n => n % 12 === 10)).toBe(true) // Bb
  })
  it('stab: a close triad, no bass', () => {
    expect(voiceChord(eb, 'stab').notes).toEqual([63, 67, 70])
  })
  it('power: root, fifth, octave', () => {
    const v = voiceChord(cm, 'power')
    expect(v.chordName).toBe('C5')
    expect(v.notes.slice(1)).toEqual([48, 55, 60])
  })
  it('open: spread over octaves', () => {
    const v = voiceChord(cm, 'open')
    expect(Math.max(...v.notes) - Math.min(...v.notes)).toBeGreaterThan(24)
  })
})

describe('generateStyled', () => {
  const data = {
    'A Peaceful': [{ chordName: 'Am', notes: [57, 60, 64, 45] }, { chordName: 'F', notes: [57, 60, 65, 41] }],
    'C Dark': [{ chordName: 'C', notes: [60, 64, 67, 48] }],
  }
  it('fills the steps with the style rhythm, gate and velocity, on the root', () => {
    const g = generateStyled({ data, selectedKey: MODAL_KEY_INDEX, keyMode: null, root: 9, style: 'Ambient', numSteps: 4, rnd: seq([0, 0, 0]) })!
    expect(g.name).toBe('A Peaceful')
    expect(g.steps).toHaveLength(4)
    expect(g.steps.map(s => s.duration)).toEqual(['4m', '4m', '4m', '4m'])
    expect(g.steps[0].gate).toBe(CHORD_GEN_STYLES.Ambient.gate)
    expect(g.steps[0].stepMode).toBeUndefined()
  })
  it('Arpeggio: the steps are arpeggiated', () => {
    const g = generateStyled({ data, selectedKey: MODAL_KEY_INDEX, keyMode: null, root: null, style: 'Arpeggio', numSteps: 2, rnd: () => 0 })!
    expect(g.steps.every(s => s.stepMode === 'arp' && s.arpRate === '16n')).toBe(true)
  })
  it('a major key file: from the major templates', () => {
    const g = generateStyled({ data: {}, selectedKey: 0, keyMode: 'major', root: null, style: 'Pop', numSteps: 4, rnd: () => 0 })!
    expect(g.steps).toHaveLength(4)
    expect(g.steps[0].chordName).toBe('C')
  })
  it('null on an empty library', () => {
    expect(generateStyled({ data: {}, selectedKey: MODAL_KEY_INDEX, keyMode: null, root: null, style: 'House', numSteps: 4 })).toBeNull()
  })
})

describe('stepPlayMode (the header AUTO / CHORD / ARP)', async () => {
  const { stepPlayMode } = await import('@/stores/useChordProgStore')
  it('AUTO: the step, else the slot', () => {
    expect(stepPlayMode('auto', 'arp', 'chord')).toBe('arp')
    expect(stepPlayMode('auto', undefined, 'chord')).toBe('chord')
    expect(stepPlayMode(undefined, undefined, 'arp')).toBe('arp')
  })
  it('CHORD / ARP: every step', () => {
    expect(stepPlayMode('chord', 'arp', 'arp')).toBe('chord')
    expect(stepPlayMode('arp', 'chord', 'chord')).toBe('arp')
  })
})

describe('generateStyled with a name (the Progressions browser)', () => {
  const data = {
    'A Peaceful': [{ chordName: 'Am', notes: [57, 60, 64, 45] }],
    'C Dark': [{ chordName: 'C', notes: [60, 64, 67, 48] }],
  }
  it('takes that progression, in the style', () => {
    const g = generateStyled({ data, selectedKey: MODAL_KEY_INDEX, keyMode: null, root: 9, style: 'Ambient', numSteps: 2, name: 'C Dark', rnd: () => 0 })!
    expect(g.name).toBe('C Dark')
    expect(g.steps.map(s => s.duration)).toEqual(['4m', '4m'])
  })
  it('also on a key file set to Major; null when not in the library', () => {
    expect(generateStyled({ data, selectedKey: 0, keyMode: 'major', root: null, style: 'Pop', numSteps: 2, name: 'A Peaceful' })!.name).toBe('A Peaceful')
    expect(generateStyled({ data, selectedKey: 0, keyMode: null, root: null, style: 'Pop', numSteps: 2, name: 'Nope' })).toBeNull()
  })
})

describe('the key files: major and minor progressions (free-midi-chords)', async () => {
  const { progressionMode, progressionsInMode } = await import('@/lib/chord-gen-style')
  const fs = await import('node:fs')
  const path = await import('node:path')
  const dir = path.resolve(__dirname, '../../../src/data/progressions')
  const read = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))

  it('progressionMode: by the root token', () => {
    expect(progressionMode('C Hopeful Romantic · I V vi IV')).toBe('major')
    expect(progressionMode('Am Dark · i VI III VII')).toBe('minor')
    expect(progressionMode('C#m Sad · i iv')).toBe('minor')
    expect(progressionMode('i-VI-III-VII Cm')).toBeNull()
    expect(progressionsInMode(['C A · I', 'Am B · i'], null)).toHaveLength(2)
  })
  it('every key file: 50 major on its major tonic + 60 minor on the relative minor, chords with notes', () => {
    const f = read('05-EMajor-C#minor.json')
    const names = Object.keys(f)
    expect(progressionsInMode(names, 'major')).toHaveLength(50)
    expect(progressionsInMode(names, 'minor')).toHaveLength(60)
    expect(names.filter(n => progressionMode(n) === 'major').every(n => n.startsWith('E '))).toBe(true)
    expect(names.filter(n => progressionMode(n) === 'minor').every(n => n.startsWith('C#m '))).toBe(true)
    expect(Object.values(f).every((cs: any) => cs.length && cs.every((c: any) => c[1].length >= 2))).toBe(true)
  })
  it('Modal Chords: 85 on each root, moods first', () => {
    const names = Object.keys(read('ModalChords.json'))
    expect(names).toHaveLength(1020)
    expect(names.filter(n => modalRoot(n) === 9)).toHaveLength(85)
    expect(names).toContain('A Mysterious Dark · bIIM ivm biii im')
  })
  it('Generate on a major key picks a major progression of the file', async () => {
    const { normalizeChord } = await import('@/composables/useProgressionLoader')
    const raw = read('01-CMajor-Aminor.json')
    const data = Object.fromEntries(Object.entries(raw).map(([k, v]: [string, any]) => [k, v.map(normalizeChord)]))
    for (let i = 0; i < 10; i++) {
      const g = generateStyled({ data, selectedKey: 0, keyMode: 'major', root: null, style: 'Pop', numSteps: 4 })!
      expect(progressionMode(g.name)).toBe('major')
      const m = generateStyled({ data, selectedKey: 0, keyMode: 'minor', root: null, style: 'Pop', numSteps: 4 })!
      expect(m.name.startsWith('Am ')).toBe(true)
    }
  })
})
