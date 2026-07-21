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

  // inputRouting is just string-keyed, so an app's own MidiSource id works
  // as a routing key exactly like a device name does — this is what makes
  // app-to-app routing (Chord Sequencer OUT → Virtual Keyboard IN) possible
  // without any data-model changes.
  it('an app MidiSource id works as a routing key, same as a device name', () => {
    const midiStore = useMidiStore()
    midiStore.setInputRouting(MidiSource.CHORD_PROG, [{ app: MidiSource.KEYBOARD }])

    expect(midiStore.isDeviceRoutedToApp(MidiSource.CHORD_PROG, MidiSource.KEYBOARD)).toBe(true)
    expect(midiStore.isDeviceRoutedToApp(MidiSource.CHORD_PROG, MidiSource.SEQUENCER)).toBe(false)
  })
})

describe('useMidiStore app-to-app note broadcast (addAppNoteListener)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('sendNoteOn/sendNoteOff notify app-note listeners, tagged with the source app', () => {
    const midiStore = useMidiStore()
    const received = []
    midiStore.addAppNoteListener((type, note, velocity, channel, sourceApp) => {
      received.push({ type, note, velocity, channel, sourceApp })
    })

    midiStore.sendNoteOn(60, 100, 1, MidiSource.CHORD_PROG)
    midiStore.sendNoteOff(60, 0, 1, MidiSource.CHORD_PROG)

    expect(received).toHaveLength(2)
    expect(received[0]).toMatchObject({ type: 'on', note: 60, sourceApp: MidiSource.CHORD_PROG })
    expect(received[1]).toMatchObject({ type: 'off', note: 60, sourceApp: MidiSource.CHORD_PROG })
  })

  it('unsubscribing stops further notifications', () => {
    const midiStore = useMidiStore()
    const received = []
    const unsub = midiStore.addAppNoteListener((type, note) => received.push({ type, note }))

    midiStore.sendNoteOn(60, 100, 1, MidiSource.CHORD_PROG)
    unsub()
    midiStore.sendNoteOn(61, 100, 1, MidiSource.CHORD_PROG)

    expect(received).toHaveLength(1)
    expect(received[0].note).toBe(60)
  })

  it('a listener combined with isDeviceRoutedToApp reproduces the app-to-app gate used by the 5 apps', () => {
    const midiStore = useMidiStore()
    midiStore.setInputRouting(MidiSource.CHORD_PROG, [{ app: MidiSource.SAMPLER, filter: { lowNote: 60, highNote: 72 } }])
    // Wired to a *different* app — makes KEYBOARD exclusive, so it's a real
    // negative case below rather than falling through to the fail-open default.
    midiStore.setInputRouting(MidiSource.KEYBOARD, [{ app: MidiSource.SEQUENCER }])

    const allowed = []
    midiStore.addAppNoteListener((type, note, velocity, channel, sourceApp) => {
      if (!midiStore.isDeviceRoutedToApp(sourceApp, MidiSource.SAMPLER, note)) return
      allowed.push(note)
    })

    midiStore.sendNoteOn(55, 100, 1, MidiSource.CHORD_PROG)  // below filter range — blocked
    midiStore.sendNoteOn(64, 100, 1, MidiSource.CHORD_PROG)  // in range — allowed
    midiStore.sendNoteOn(64, 100, 1, MidiSource.KEYBOARD)    // wired to SEQUENCER, not SAMPLER — blocked

    expect(allowed).toEqual([64])
  })
})
