import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useMidiStore } from '@/stores/useMidiStore'
import { MidiSource } from '@/types/midi'

describe('useMidiStore app→app note loop guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('stops a listener that re-sends every note it hears (MIDI Flow cable cycle)', () => {
    const midiStore = useMidiStore()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let calls = 0
    const unsub = midiStore.addAppNoteListener((type, note, velocity, chan) => {
      calls++
      if (type === 'on') midiStore.sendNoteOn(note, velocity, chan + 1, MidiSource.ARP)
    })

    expect(() => midiStore.sendNoteOn(60, 100, 1, MidiSource.CHORD_PROG)).not.toThrow()
    expect(calls).toBe(8)
    expect(warn).toHaveBeenCalledTimes(1)

    unsub()
    warn.mockRestore()
  })

  it('still delivers normal one-hop app notes after a loop was cut', () => {
    const midiStore = useMidiStore()
    const seen: number[] = []
    const unsub = midiStore.addAppNoteListener((_t, note) => { seen.push(note) })
    midiStore.sendNoteOn(64, 100, 1, MidiSource.CHORD_PROG)
    expect(seen).toEqual([64])
    unsub()
  })
})
