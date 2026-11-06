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
