import { describe, it, expect, vi } from 'vitest'
import { midiService, cableMuteKey } from '@/core/midi/midi-service'
import { MidiSource } from '@/types/midi'

describe('midiService muted sources', () => {
  it('drops note-ons of a muted source, keeps its note-offs and other sources', () => {
    const spy = vi.spyOn(midiService as any, 'broadcast').mockImplementation(() => {})
    midiService.setMutedSources([MidiSource.SEQUENCER2])
    midiService.sendNoteOn(60, 100, 0, MidiSource.SEQUENCER2)
    midiService.sendNoteOff(60, 0, 0, MidiSource.SEQUENCER2)
    midiService.sendNoteOn(36, 100, 9, MidiSource.DRUM_MACHINE)
    expect(spy.mock.calls.map(c => [c[0], c[3]])).toEqual([['noteoff', 'SEQUENCER2'], ['noteon', 'DRUM_MACHINE']])
    expect(midiService.isSourceMuted(MidiSource.SEQUENCER2)).toBe(true)
    midiService.setMutedSources([])
    midiService.sendNoteOn(60, 100, 0, MidiSource.SEQUENCER2)
    expect(spy).toHaveBeenCalledTimes(3)
    spy.mockRestore()
  })
  it('cable keys: by source and device, case/space tolerant', () => {
    expect(cableMuteKey('CHORD_PROG', ' Live · Chords ')).toBe('CHORD_PROG→live · chords')
    midiService.setMutedCables([cableMuteKey('CHORD_PROG', 'Live · Chords')])
    expect(midiService.isCableMuted(MidiSource.CHORD_PROG, 'LIVE · CHORDS')).toBe(true)
    expect(midiService.isCableMuted(MidiSource.CHORD_PROG, 'Emulator X3')).toBe(false)
    expect(midiService.isCableMuted(MidiSource.DRUM_MACHINE, 'Live · Chords')).toBe(false)
    midiService.setMutedCables([])
    expect(midiService.isCableMuted(MidiSource.CHORD_PROG, 'Live · Chords')).toBe(false)
  })
})


import { scaleVelocity } from '@/core/midi/midi-service'
describe('midiService velocity scales', () => {
  it('scaleVelocity: never 0 (a note-off), 1 = unchanged', () => {
    expect(scaleVelocity(100, 1)).toBe(100)
    expect(scaleVelocity(100, 0.5)).toBe(50)
    expect(scaleVelocity(100, 0)).toBe(1)
    expect(scaleVelocity(3, 0.1)).toBe(1)
  })
  it('a source scale lowers the note-on velocity, note-offs untouched', () => {
    const spy = vi.spyOn(midiService as any, 'broadcast').mockImplementation(() => {})
    midiService.setVelocityScales({ CHORD_PROG: 0.5 })
    midiService.sendNoteOn(60, 100, 0, MidiSource.CHORD_PROG)
    midiService.sendNoteOn(36, 100, 9, MidiSource.DRUM_MACHINE)
    midiService.sendNoteOff(60, 0, 0, MidiSource.CHORD_PROG)
    expect(spy.mock.calls.map(c => [c[0], c[1].velocity])).toEqual([['noteon', 50], ['noteon', 100], ['noteoff', 0]])
    midiService.setVelocityScales({})
    midiService.sendNoteOn(60, 100, 0, MidiSource.CHORD_PROG)
    expect(spy.mock.calls[3][1].velocity).toBe(100)
    spy.mockRestore()
  })
})

// A Mute / Solo on a lane holding notes (a latched or long chord): its notes end at the Mute and
// sound again at the unmute (before: they rang on through a Solo, and stayed silent after an unmute).
describe('midiService muted sources — held notes', () => {
  const calls = (spy: any) => spy.mock.calls.map((c: any[]) => [c[0], c[1].note, c[3]])
  it('Mute ends the notes the source holds; unmute strikes again the ones still held', () => {
    ;(midiService as any).heldNotes.clear()
    const spy = vi.spyOn(midiService as any, 'broadcast').mockImplementation(() => {})
    midiService.sendNoteOn(60, 90, 0, MidiSource.CHORD_PROG)
    midiService.sendNoteOn(64, 90, 0, MidiSource.CHORD_PROG)
    midiService.sendNoteOn(36, 100, 9, MidiSource.DRUM_MACHINE)
    spy.mockClear()
    midiService.setMutedSources([MidiSource.CHORD_PROG])
    expect(calls(spy)).toEqual([['noteoff', 60, 'CHORD_PROG'], ['noteoff', 64, 'CHORD_PROG']])
    spy.mockClear()
    // while muted: 64 ends, 67 starts (dropped, but held by the app)
    midiService.sendNoteOff(64, 0, 0, MidiSource.CHORD_PROG)
    midiService.sendNoteOn(67, 80, 0, MidiSource.CHORD_PROG)
    spy.mockClear()
    midiService.setMutedSources([])
    expect(calls(spy)).toEqual([['noteon', 60, 'CHORD_PROG'], ['noteon', 67, 'CHORD_PROG']])
    expect(spy.mock.calls[1][1].velocity).toBe(80)
    midiService.sendNoteOff(60, 0, 0, MidiSource.CHORD_PROG)
    midiService.sendNoteOff(67, 0, 0, MidiSource.CHORD_PROG)
    midiService.sendNoteOff(36, 0, 9, MidiSource.DRUM_MACHINE)
    spy.mockRestore()
  })
  it('Solo on another lane = this one muted: its held chord ends', () => {
    ;(midiService as any).heldNotes.clear()
    const spy = vi.spyOn(midiService as any, 'broadcast').mockImplementation(() => {})
    midiService.sendNoteOn(60, 90, 0, MidiSource.CHORD_PROG)
    spy.mockClear()
    midiService.setMutedSources([MidiSource.CHORD_PROG, MidiSource.SEQUENCER2]) // Drum soloed
    midiService.setMutedSources([MidiSource.CHORD_PROG, MidiSource.SEQUENCER2]) // same set again: nothing
    expect(calls(spy)).toEqual([['noteoff', 60, 'CHORD_PROG']])
    midiService.setMutedSources([])
    midiService.sendNoteOff(60, 0, 0, MidiSource.CHORD_PROG)
    spy.mockRestore()
  })
  it('a cable mute ends / strikes again only on that device', () => {
    ;(midiService as any).heldNotes.clear()
    const spy = vi.spyOn(midiService as any, 'broadcast').mockImplementation(() => {})
    midiService.sendNoteOn(60, 90, 0, MidiSource.CHORD_PROG)
    spy.mockClear()
    midiService.setMutedCables([cableMuteKey('CHORD_PROG', 'Emulator X3')])
    expect(spy.mock.calls.map((c: any[]) => [c[0], c[6]?.onlyTargets])).toEqual([['noteoff', ['emulator x3']]])
    spy.mockClear()
    midiService.setMutedCables([])
    expect(spy.mock.calls.map((c: any[]) => [c[0], c[6]?.onlyTargets])).toEqual([['noteon', ['emulator x3']]])
    midiService.sendNoteOff(60, 0, 0, MidiSource.CHORD_PROG)
    spy.mockRestore()
  })
  it('nothing held after a note-on at 0, or a Panic', () => {
    ;(midiService as any).heldNotes.clear()
    const spy = vi.spyOn(midiService as any, 'broadcast').mockImplementation(() => {})
    midiService.sendNoteOn(60, 90, 0, MidiSource.CHORD_PROG)
    midiService.sendNoteOn(60, 0, 0, MidiSource.CHORD_PROG)
    midiService.sendNoteOn(62, 90, 0, MidiSource.SEQUENCER2)
    vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'trace').mockImplementation(() => {})
    midiService.panic()
    spy.mockClear()
    midiService.setMutedSources([MidiSource.CHORD_PROG, MidiSource.SEQUENCER2])
    midiService.setMutedSources([])
    expect(spy.mock.calls.filter((c: any[]) => c[0] === 'noteon')).toEqual([])
    vi.restoreAllMocks()
  })
})
