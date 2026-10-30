import { describe, it, expect } from 'vitest'
import { isCaptureInput } from '@/composables/useMidiCCListener'

// Chord Capture listens to played notes only: SY.CORE's own MIDI coming back through a loopback
// port (Drum Machine / Arp notes sent to a virtual instrument) must not replace the chord played.
describe('isCaptureInput', () => {
  const ctx = {
    loopbacks: ['MIDI WIN 2 (A)'],
    outputPorts: ['loopMIDI X3 (B)'],
    registrations: { 'Launchkey MK4': { inEnabled: true }, 'X3': { inEnabled: false } },
    controllers: ['WORLDE'],
  }

  it('takes inputs wired in MIDI Flow and registered controllers', () => {
    expect(isCaptureInput('Launchkey MK4', ctx)).toBe(true)
    expect(isCaptureInput('WORLDE', ctx)).toBe(true)
  })

  it('drops loopbacks, the input side of a virtual instrument port, and unwired inputs', () => {
    expect(isCaptureInput('MIDI WIN 2 (A)', ctx)).toBe(false)
    expect(isCaptureInput('loopMIDI X3 (A)', ctx)).toBe(false)
    expect(isCaptureInput('Some Synth', ctx)).toBe(false)
    expect(isCaptureInput(null, ctx)).toBe(false)
  })

  it('with nothing wired as an input, any non-loopback input counts', () => {
    expect(isCaptureInput('Some Synth', { ...ctx, registrations: {} })).toBe(true)
    expect(isCaptureInput('MIDI WIN 2 (A)', { ...ctx, registrations: {} })).toBe(false)
  })
})
