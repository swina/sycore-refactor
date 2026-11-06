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
  it('solo: all the other real apps; a simulated row does not count', () => {
    expect(mutedLiveSources(apps({ drum: { solo: true } }))).toEqual(['CHORD_PROG', 'SEQUENCER2'])
    expect(mutedLiveSources(apps({ bass: { solo: true }, chord: { muted: true } }))).toEqual(['CHORD_PROG'])
  })
  it('scopes: an app with devices in its scope mutes only those cables', () => {
    const a = apps({ chord: { muted: true }, drum: { muted: true } })
    expect(rigMutes(a, { chord: ['Live · Chords'] })).toEqual({ sources: ['DRUM_MACHINE'], cables: [['CHORD_PROG', 'Live · Chords']] })
    expect(rigMutes(apps({ seq: { solo: true } }), { drum: ['A', 'B'] })).toEqual({ sources: ['CHORD_PROG'], cables: [['DRUM_MACHINE', 'A'], ['DRUM_MACHINE', 'B']] })
    expect(rigMutes(apps({}), { chord: ['X'] })).toEqual({ sources: [], cables: [] })
  })
})


import { rigVelocityScales } from '@/lib/rig-live'
describe('rig-live intensity', () => {
  const apps = (over: Record<string, number>) => ['chord', 'drum', 'bass', 'seq', 'arp'].map(id => ({ id, intensity: over[id] ?? 127 }))
  it('127 everywhere: nothing scaled', () => {
    expect(rigVelocityScales(apps({}), 127)).toEqual({ sources: {}, cables: [] })
  })
  it('Intensity × Global per real app; simulated rows ignored', () => {
    const v = rigVelocityScales(apps({ seq: 63.5, bass: 0 }), 127)
    expect(v.sources).toEqual({ SEQUENCER2: 0.5 })
    const g = rigVelocityScales(apps({ seq: 63.5 }), 63.5)
    expect(g.sources).toEqual({ CHORD_PROG: 0.5, DRUM_MACHINE: 0.5, SEQUENCER2: 0.25 })
  })
  it('scoped apps scale only their cables', () => {
    const v = rigVelocityScales(apps({ chord: 63.5 }), 127, { chord: ['Live · Chords'] })
    expect(v).toEqual({ sources: {}, cables: [['CHORD_PROG', 'Live · Chords', 0.5]] })
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
  it('velocity mode: no CC 7; cc7 mode: no velocity scale', () => {
    expect(rigCc7(apps({}), 127, { chord: 'velocity', drum: 'velocity', seq: 'velocity' })).toEqual([])
    expect(rigVelocityScales(apps({ drum: 0, seq: 0 }), 127, {}, { seq: 'both' }).sources).toEqual({ SEQUENCER2: 0 })
    expect(rigVelocityScales(apps({ drum: 0 }), 127, {}, { drum: 'velocity' }).sources).toEqual({ DRUM_MACHINE: 0 })
  })
})
