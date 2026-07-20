import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useMidiStore } from '@/stores/useMidiStore'
import { MidiSource } from '@/types/midi'

describe('useMidiStore device→app input routing (isDeviceRoutedToApp)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('is open by default when a device has no explicit routing entries', () => {
    const midiStore = useMidiStore()
    expect(midiStore.isDeviceRoutedToApp('My Keyboard', MidiSource.SEQUENCER)).toBe(true)
  })

  it('becomes exclusive once a device has explicit entries — apps not listed are closed', () => {
    const midiStore = useMidiStore()
    midiStore.setInputRouting('My Keyboard', [{ app: MidiSource.SEQUENCER }])

    expect(midiStore.isDeviceRoutedToApp('My Keyboard', MidiSource.SEQUENCER)).toBe(true)
    expect(midiStore.isDeviceRoutedToApp('My Keyboard', MidiSource.DRUM_MACHINE)).toBe(false)
  })

  it('an app with a matching entry but no filter passes any note', () => {
    const midiStore = useMidiStore()
    midiStore.setInputRouting('My Keyboard', [{ app: MidiSource.SEQUENCER }])

    expect(midiStore.isDeviceRoutedToApp('My Keyboard', MidiSource.SEQUENCER, 0)).toBe(true)
    expect(midiStore.isDeviceRoutedToApp('My Keyboard', MidiSource.SEQUENCER, 127)).toBe(true)
  })

  it('respects a note-range filter (the "keyboard split" case)', () => {
    const midiStore = useMidiStore()
    midiStore.setInputRouting('My Keyboard', [
      { app: MidiSource.SEQUENCER,    filter: { lowNote: 0,  highNote: 59 } },
      { app: MidiSource.DRUM_MACHINE, filter: { lowNote: 60, highNote: 127 } },
    ])

    expect(midiStore.isDeviceRoutedToApp('My Keyboard', MidiSource.SEQUENCER, 59)).toBe(true)
    expect(midiStore.isDeviceRoutedToApp('My Keyboard', MidiSource.SEQUENCER, 60)).toBe(false)
    expect(midiStore.isDeviceRoutedToApp('My Keyboard', MidiSource.DRUM_MACHINE, 60)).toBe(true)
    expect(midiStore.isDeviceRoutedToApp('My Keyboard', MidiSource.DRUM_MACHINE, 59)).toBe(false)
  })

  it('a filter with only lowNote/highNote omitted defaults to the unbounded side', () => {
    const midiStore = useMidiStore()
    midiStore.setInputRouting('My Keyboard', [{ app: MidiSource.SEQUENCER, filter: { lowNote: 60 } }])

    expect(midiStore.isDeviceRoutedToApp('My Keyboard', MidiSource.SEQUENCER, 0)).toBe(false)
    expect(midiStore.isDeviceRoutedToApp('My Keyboard', MidiSource.SEQUENCER, 60)).toBe(true)
    expect(midiStore.isDeviceRoutedToApp('My Keyboard', MidiSource.SEQUENCER, 127)).toBe(true)
  })

  it('setInputRouting([]) clears the device back to the open default', () => {
    const midiStore = useMidiStore()
    midiStore.setInputRouting('My Keyboard', [{ app: MidiSource.SEQUENCER }])
    expect(midiStore.isDeviceRoutedToApp('My Keyboard', MidiSource.DRUM_MACHINE)).toBe(false)

    midiStore.setInputRouting('My Keyboard', [])
    expect(midiStore.isDeviceRoutedToApp('My Keyboard', MidiSource.DRUM_MACHINE)).toBe(true)
    expect(midiStore.inputRouting['My Keyboard']).toBeUndefined()
  })

  it('routing for one device does not affect another', () => {
    const midiStore = useMidiStore()
    midiStore.setInputRouting('Keyboard A', [{ app: MidiSource.SEQUENCER }])

    expect(midiStore.isDeviceRoutedToApp('Keyboard B', MidiSource.SEQUENCER)).toBe(true)
    expect(midiStore.isDeviceRoutedToApp('Keyboard B', MidiSource.DRUM_MACHINE)).toBe(true)
  })
})
