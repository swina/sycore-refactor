import { describe, it, expect } from 'vitest'
import { MidiSource } from '@/types/midi'

describe('MidiSource enum', () => {
  it('has all expected values', () => {
    expect(MidiSource.SEQUENCER).toBe('SEQUENCER')
    expect(MidiSource.CHORD_PROG).toBe('CHORD_PROG')
    expect(MidiSource.KEYBOARD).toBe('KEYBOARD')
    expect(MidiSource.ARP).toBe('ARP')
    expect(MidiSource.UI).toBe('UI')
    expect(MidiSource.TRANSPORT).toBe('TRANSPORT')
    expect(MidiSource.DRUM_MACHINE).toBe('DRUM_MACHINE')
  })
})