import { describe, it, expect } from 'vitest'
import { drumSnapshot, chordSnapshot, seqSnapshot, applySnapshot, applyClock, slotEvent, isLiveApp } from '@/lib/rig-live'
import { createRigState } from '@/lib/rig-controller'

const steps = (on: number[], n = 16) => Array.from({ length: n }, (_, i) => ({ active: on.includes(i), notes: [60] }))

describe('rig-live snapshots', () => {
  it('drum: a sequence is filled by drums or bass line; the active one plays only while playing', () => {
    const seqs: Record<string, { steps: any[] }[]> = {}
    for (const k of 'ABCDEFGH') seqs[k] = [{ steps: steps([]) }]
    seqs.A = [{ steps: steps([0, 4]) }]
    const bass = { C: [{ steps: steps([2]) }] }
    const snap = drumSnapshot(seqs, bass, 'C', true, 0)
    expect(snap.filled.slice(0, 4)).toEqual([true, false, true, false])
    expect(snap.playing).toBe(2)
    expect(snap.queued).toBe(0)
    expect(drumSnapshot(seqs, bass, 'C', false, null).playing).toBeNull()
  })

  it('chord: a slot is filled by an active step with notes within numSteps; playingSlotIndex wins', () => {
    const empty = { steps: Array.from({ length: 16 }, () => ({ active: false, notes: [] })), numSteps: 8 }
    const slots = Array.from({ length: 8 }, () => empty)
    slots[1] = { steps: steps([0]), numSteps: 8 }
    slots[2] = { steps: steps([12]), numSteps: 8 } // beyond numSteps
    const snap = chordSnapshot(slots, 1, 3, true, null)
    expect(snap.filled.slice(0, 3)).toEqual([false, true, false])
    expect(snap.playing).toBe(3)
    expect(chordSnapshot(slots, 1, null, true, null).playing).toBe(1)
    expect(chordSnapshot(slots, 1, 3, false, null).playing).toBeNull()
  })

  it('seq: banks filled by active steps', () => {
    const banks = Array.from({ length: 8 }, (_, i) => ({ steps: steps(i === 4 ? [1] : []), numSteps: 16 }))
    const snap = seqSnapshot(banks, 4, true, 5)
    expect(snap.filled[4]).toBe(true)
    expect(snap.filled[0]).toBe(false)
    expect(snap.playing).toBe(4)
    expect(snap.queued).toBe(5)
  })

  it('applySnapshot mirrors into a row, keeping its options; a queued slot equal to the playing one is not shown', () => {
    const s = createRigState()
    const a = s.apps.find(x => x.id === 'drum')!
    a.muted = true
    applySnapshot(a, { filled: [true, true, false, false, false, false, false, false], playing: 1, queued: 1 })
    expect(a.filled.slice(0, 3)).toEqual([true, true, false])
    expect(a.playing).toBe(1)
    expect(a.queued).toBeNull()
    expect(a.muted).toBe(true)
    applySnapshot(a, { filled: Array(8).fill(true), playing: 1, queued: 3 })
    expect(a.queued).toBe(3)
  })
})

describe('rig-live clock', () => {
  const int = { running: false, bpm: 120, bar: 1, beat: 1, sixteenth: 1 }
  it('EXT: position and tempo from Live', () => {
    const s = createRigState()
    applyClock(s, { following: true, playing: true, bpm: 75, position: '5.3.2' }, int)
    expect(s.clock).toMatchObject({ source: 'EXT', bpm: 75, running: true, bar: 5, beat: 3, step: 9 })
    expect(s.clock.total).toBe(4 * 16 + 9)
  })
  it('EXT stopped: not running, back to 1.1', () => {
    const s = createRigState()
    applyClock(s, { following: true, playing: false, bpm: 75, position: '5.3.2' }, int)
    expect(s.clock).toMatchObject({ source: 'EXT', running: false, bar: 1, beat: 1, step: 0 })
  })
  it('INT: the internal transport', () => {
    const s = createRigState()
    applyClock(s, { following: false, playing: false, bpm: 0, position: '1.1.1' }, { running: true, bpm: 128, bar: 2, beat: 4, sixteenth: 4 })
    expect(s.clock).toMatchObject({ source: 'INT', bpm: 128, running: true, bar: 2, beat: 4, step: 15 })
  })
})

describe('rig-live commands', () => {
  it('a pad sends the Control Map command of its app', () => {
    expect(slotEvent('chord', 2)).toEqual({ name: 'cp-slot-cue', detail: { idx: 2 } })
    expect(slotEvent('drum', 1)).toEqual({ name: 'dm-seq-switch', detail: { seq: 'B', quantize: true } })
    expect(slotEvent('seq', 7)).toEqual({ name: 'seq-bank-cue', detail: { idx: 7 } })
    expect(isLiveApp('bass')).toBe(false)
    expect(isLiveApp('drum')).toBe(true)
  })
})

import { mutedLiveSources, rigMutes } from '@/lib/rig-live'
describe('rig-live mute / solo', () => {
  const apps = (over: Record<string, { muted?: boolean; solo?: boolean }>) =>
    ['chord', 'drum', 'bass', 'seq', 'arp'].map(id => ({ id, muted: false, solo: false, ...over[id] }))
  it('muted apps', () => {
    expect(mutedLiveSources(apps({}))).toEqual([])
    expect(mutedLiveSources(apps({ seq: { muted: true } }))).toEqual(['SEQUENCER2'])
  })
  it('solo: all the other connected rows (Arp too); Drum and Bass inside the Drum Machine', () => {
    expect(rigMutes(apps({ drum: { solo: true } }))).toEqual({ sources: ['CHORD_PROG', 'SEQUENCER2', 'ARP'], cables: [], parts: { drum: false, bass: true } })
    expect(rigMutes(apps({ bass: { solo: true }, chord: { muted: true } }))).toEqual({ sources: ['CHORD_PROG', 'SEQUENCER2', 'ARP'], cables: [], parts: { drum: true, bass: false } })
    expect(mutedLiveSources(apps({ arp: { muted: true } }))).toEqual(['ARP'])
  })
  it('scopes: an app with devices in its scope mutes only those cables; Bass has no scope', () => {
    const a = apps({ chord: { muted: true }, drum: { muted: true } })
    expect(rigMutes(a, { chord: ['Live · Chords'] })).toEqual({ sources: [], cables: [['CHORD_PROG', 'Live · Chords']], parts: { drum: true, bass: false } })
    expect(rigMutes(apps({ seq: { solo: true } }), { drum: ['A', 'B'], bass: ['A'] })).toEqual({ sources: ['CHORD_PROG', 'ARP'], cables: [['DRUM_MACHINE', 'A'], ['DRUM_MACHINE', 'B']], parts: { drum: false, bass: true } })
    expect(rigMutes(apps({}), { chord: ['X'] })).toEqual({ sources: [], cables: [], parts: { drum: false, bass: false } })
  })
})


import { rigVelocityScales } from '@/lib/rig-live'
describe('rig-live intensity', () => {
  const apps = (over: Record<string, number>) => ['chord', 'drum', 'bass', 'seq', 'arp'].map(id => ({ id, intensity: over[id] ?? 127 }))
  it('127 everywhere: nothing scaled', () => {
    expect(rigVelocityScales(apps({}), 127)).toEqual({ sources: {}, cables: [], parts: { drum: 1, bass: 1 } })
  })
  it('Intensity × Global per row; Drum (whole app) and Bass inside the Drum Machine', () => {
    const v = rigVelocityScales(apps({ seq: 63.5, bass: 0 }), 127)
    expect(v.sources).toEqual({ SEQUENCER2: 0.5 })
    expect(v.parts).toEqual({ drum: 1, bass: 0 })
    const g = rigVelocityScales(apps({ seq: 63.5 }), 63.5)
    expect(g.sources).toEqual({ CHORD_PROG: 0.5, SEQUENCER2: 0.25 }) // Arp: Intensity is its rate
    expect(g.parts).toEqual({ drum: 0.5, bass: 0.5 })
  })
  it('scoped apps scale only their cables', () => {
    const v = rigVelocityScales(apps({ chord: 63.5 }), 127, { chord: ['Live · Chords'] })
    expect(v).toEqual({ sources: {}, cables: [['CHORD_PROG', 'Live · Chords', 0.5]], parts: { drum: 1, bass: 1 } })
  })
})

import { rigCc7, intensityCc7, intensityMode } from '@/lib/rig-live'
describe('rig-live intensity modes', () => {
  const apps = (over: Record<string, number>) => ['chord', 'drum', 'bass', 'seq', 'arp'].map(id => ({ id, intensity: over[id] ?? 127 }))
  it('CC 7 by default; Intensity × Global', () => {
    expect(intensityMode({}, 'drum')).toBe('cc7')
    expect(intensityCc7(127, 127)).toBe(127)
    expect(intensityCc7(64, 127)).toBe(64)
    expect(intensityCc7(127, 0)).toBe(0)
    expect(rigCc7(apps({ drum: 0 }), 127, {}, { drum: ['Live Drums'] })).toEqual([
      { id: 'chord', source: 'CHORD_PROG', value: 127, targets: [] },
      { id: 'drum', source: 'DRUM_MACHINE', value: 0, targets: ['Live Drums'] },
      { id: 'seq', source: 'SEQUENCER2', value: 127, targets: [] },
    ])
  })
  it('Bass: CC 7 only with the bassline on its own channel, else velocity', () => {
    const only = { chord: 'velocity', drum: 'velocity', seq: 'velocity', arp: 'velocity' } as const
    expect(rigCc7(apps({ bass: 64 }), 127, only)).toEqual([])
    expect(rigCc7(apps({ bass: 64 }), 127, only, {}, { bassChannel: 2 })).toEqual([{ id: 'bass', source: 'DRUM_MACHINE', value: 64, targets: [] }])
    expect(rigVelocityScales(apps({ bass: 0 }), 127, {}, {}).parts.bass).toBe(0)
    expect(rigVelocityScales(apps({ bass: 0 }), 127, {}, {}, { bassChannel: 2 }).parts.bass).toBe(1)
  })
  it('velocity mode: no CC 7; cc7 mode: no velocity scale', () => {
    expect(rigCc7(apps({}), 127, { chord: 'velocity', drum: 'velocity', seq: 'velocity', arp: 'velocity' })).toEqual([])
    expect(rigVelocityScales(apps({ drum: 0, seq: 0 }), 127, {}, { seq: 'both' }).sources).toEqual({ SEQUENCER2: 0 })
    expect(rigVelocityScales(apps({ drum: 0 }), 127, {}, { drum: 'velocity' }).parts.drum).toBe(0)
  })
})

describe('rig-live Trigger sync (pads in LIVE)', () => {
  it('maps Trigger sync to sixteenths of the song grid; Live stopped = at once; SIM-only values = bar', async () => {
    const { liveSyncSteps } = await import('@/lib/rig-live')
    expect(liveSyncSteps('off', true)).toBe(0)
    expect(liveSyncSteps('1', true)).toBe(4)
    expect(liveSyncSteps('2', true)).toBe(8)
    expect(liveSyncSteps('4', true)).toBe(16)
    expect(liveSyncSteps('queue', true)).toBe(16)
    expect(liveSyncSteps('4', false)).toBe(0)
  })

  it('a pad is Latch: stopped → select and start, other slot → switch, playing slot → stop', async () => {
    const { padEvents } = await import('@/lib/rig-live')
    expect(padEvents('drum', 2, null, 16)).toEqual([
      { name: 'dm-seq-switch', detail: { seq: 'C', quantize: true, sync: 16 } },
      { name: 'dm-play-stop', detail: { play: true, sync: 16 } },
    ])
    expect(padEvents('drum', 2, 0, 4)).toEqual([{ name: 'dm-seq-switch', detail: { seq: 'C', quantize: true, sync: 4 } }])
    expect(padEvents('drum', 2, 2, 8)).toEqual([{ name: 'dm-play-stop', detail: { play: false, sync: 8 } }])
    expect(padEvents('chord', 1, null, 16).map(e => e.name)).toEqual(['cp-slot-cue', 'cp-start'])
    expect(padEvents('chord', 1, 1, 16)).toEqual([{ name: 'cp-stop', detail: { sync: 16 } }])
    expect(padEvents('seq', 3, null, 4)).toEqual([
      { name: 'seq-bank-cue', detail: { idx: 3 } },
      { name: 'toggle-sequencer2', detail: { play: true, sync: 4 } },
    ])
    expect(padEvents('seq', 3, 3, 4)).toEqual([{ name: 'toggle-sequencer2', detail: { play: false, sync: 4 } }])
  })

  it('describes what the press does', async () => {
    const { padWhen } = await import('@/lib/rig-live')
    expect(padWhen('drum', null, 0, 16)).toBe('starts on the next bar')
    expect(padWhen('drum', 0, 0, 4)).toBe('stops on the next beat')
    expect(padWhen('chord', 0, 1, 8)).toBe('on the next 2 beats')
    expect(padWhen('seq', 0, 1, 16)).toBe('at the end of its pattern')
    expect(padWhen('drum', null, 0, 0)).toBe('starts now')
  })
})

describe('rig-live arming with Live stopped', () => {
  it('a press arms the slot, the same pad disarms, another pad moves the arm', async () => {
    const { armPress } = await import('@/lib/rig-live')
    expect(armPress(null, 2)).toBe(2)
    expect(armPress(2, 2)).toBeNull()
    expect(armPress(2, 5)).toBe(5)
  })

  it("Live's Stop stops each real app at once", async () => {
    const { stopEvents } = await import('@/lib/rig-live')
    expect(stopEvents('chord')).toEqual([{ name: 'cp-stop' }])
    expect(stopEvents('drum')).toEqual([{ name: 'dm-play-stop', detail: { play: false, sync: 0 } }])
    expect(stopEvents('seq')).toEqual([{ name: 'toggle-sequencer2', detail: { play: false, sync: 0 } }])
  })
})

describe('rig-live Bass and Arp rows', () => {
  it('Bass: the sequences holding a bassline (playing only while it is on); Drum and Bass as parts', async () => {
    const { bassSnapshot, rowPadEvents, isLiveRow } = await import('@/lib/rig-live')
    const on = { steps: [{ active: true }] }, off = { steps: [{ active: false }] }
    const bass = { A: [off], B: [on] }
    expect(bassSnapshot(bass, true, 'B', true, null)).toEqual({ filled: [false, true, false, false, false, false, false, false], playing: 1, queued: null })
    expect(bassSnapshot(bass, true, 'A', true, 1).playing).toBeNull()
    expect(bassSnapshot(bass, false, 'B', true, null).playing).toBeNull()
    expect(rowPadEvents('bass', 1, 1, 16)).toEqual([{ name: 'dm-part', detail: { part: 'bass', on: false, sync: 16 } }])
    expect(rowPadEvents('drum', 2, 1, 4)).toEqual([{ name: 'dm-part', detail: { part: 'drum', on: true, seq: 'C', sync: 4 } }])
    expect(rowPadEvents('chord', 2, null, 0)[0].name).toBe('cp-slot-cue')
    expect(isLiveRow('bass') && isLiveRow('arp')).toBe(true)
  })
  it('Arp: pads A–H are modes; the mode playing again switches it off', async () => {
    const { arpSnapshot, arpPress, RIG_ARP_MODES } = await import('@/lib/rig-live')
    expect(arpSnapshot(true, 'down')).toEqual({ filled: Array(8).fill(true), playing: 1, queued: null })
    expect(arpSnapshot(false, 'down').playing).toBeNull()
    expect(arpSnapshot(true, 'thumb-up').playing).toBeNull()
    expect(arpPress(1, 1)).toEqual({ enabled: false })
    expect(arpPress(1, 7)).toEqual({ enabled: true, mode: RIG_ARP_MODES[7] })
  })
})

describe('rig-live Arp knobs', () => {
  it('Density = octave range −3…+3, Intensity = rate; both round-trip', async () => {
    const { arpOctaveOf, arpOctaveValue, arpRateOf, arpRateValue, RIG_ARP_RATES } = await import('@/lib/rig-live')
    expect(arpOctaveOf(0)).toBe(-3)
    expect(arpOctaveOf(64)).toBe(0)
    expect(arpOctaveOf(127)).toBe(3)
    for (let o = -3; o <= 3; o++) expect(arpOctaveOf(arpOctaveValue(o))).toBe(o)
    expect(arpRateOf(0)).toBe('1/1d')
    expect(arpRateOf(127)).toBe('1/64t')
    for (const r of RIG_ARP_RATES) expect(arpRateOf(arpRateValue(r))).toBe(r) // every rate of the Arpeggiator's slider
  })
})
