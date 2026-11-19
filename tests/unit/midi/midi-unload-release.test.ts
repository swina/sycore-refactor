import { describe, it, expect } from 'vitest'
import { midiService } from '@/core/midi/midi-service'

// A page reload (a dev rebuild) or close with notes sounding: every output gets its queue dropped and
// All Notes Off / All Sound Off / Sustain off on its 16 channels — no notes left hanging on the instrument.
describe('MIDI: release on page unload', () => {
  it('pagehide clears each output\'s queue, then CC 123 / 120 / 64 on every channel', () => {
    const sent: number[][] = []
    let cleared = 0
    const out = { id: 'x3', name: 'Emulator X3', send: (m: number[]) => sent.push(m), clear: () => { cleared++ } }
    ;(midiService as any).midiAccess = { outputs: new Map([['x3', out]]), inputs: new Map() }
    window.dispatchEvent(new Event('pagehide'))
    expect(cleared).toBe(1)
    expect(sent).toHaveLength(48)
    for (let ch = 0; ch < 16; ch++) {
      expect(sent).toContainEqual([0xb0 + ch, 123, 0])
      expect(sent).toContainEqual([0xb0 + ch, 120, 0])
      expect(sent).toContainEqual([0xb0 + ch, 64, 0])
    }
    ;(midiService as any).midiAccess = null
  })
})
