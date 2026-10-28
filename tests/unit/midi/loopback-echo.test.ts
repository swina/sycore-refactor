import { describe, it, expect } from 'vitest'
import { MidiService } from '@/core/midi/midi-service'

// A Windows MIDI Services loopback: we send on "MIDI WIN 2 (B)", it comes back
// on "MIDI WIN 2 (A)" — a different name, so it isn't caught by the
// same-name loopback block and must be detected by its echoes.
function setup(registrations: Record<string, any> = {}) {
  const svc = new MidiService() as any
  const input = { id: 'in-win2a', name: 'MIDI WIN 2 (A)' }
  svc.midiAccess = { inputs: new Map([[input.id, input]]), outputs: new Map() }
  svc.setRoutingConfig({ registrations })
  const notes: number[] = []
  const transport: string[] = []
  svc.addNoteListener((type: string, note: number) => { if (type === 'on') notes.push(note) })
  svc.addTransportListener((type: string) => transport.push(type))
  // arrivedMsAgo: how long ago the browser received it (its handler runs late under load)
  const receive = (bytes: number[], arrivedMsAgo = 0) =>
    svc.handleIngress({ data: new Uint8Array(bytes), target: input, timeStamp: performance.now() - arrivedMsAgo })
  // we sent `bytes` sentMsAgo ago
  const sent = (bytes: number[], sentMsAgo = 0) => svc.globalSentHashes.set(bytes.join(','), Date.now() - sentMsAgo)
  return { svc, notes, transport, receive, sent }
}

describe('loopback echo handling', () => {
  it('suppresses an echo by its arrival time even when the handler runs late', () => {
    const { notes, receive, sent } = setup()
    sent([0x90, 60, 100], 100)    // sent 100 ms ago…
    receive([0x90, 60, 100], 99)  // …came back 1 ms later, handled only now
    expect(notes).toEqual([])
  })

  it('still delivers a matching note that arrives outside the echo window', () => {
    const { notes, receive, sent } = setup()
    sent([0x90, 60, 100], 100)
    receive([0x90, 60, 100], 0)   // arrived 100 ms after our send: a real note
    expect(notes).toEqual([60])
  })

  it('flags an unregistered input that keeps echoing our output: drops its clock, keeps played notes', () => {
    const { svc, notes, transport, receive, sent } = setup()
    for (let n = 0; n < 8; n++) {
      sent([0x90, 40 + n, 90])
      receive([0x90, 40 + n, 90])
    }
    expect(svc.getLoopbackInputNames()).toEqual(['MIDI WIN 2 (A)'])

    receive([0xF8])
    receive([0xFA])
    expect(transport).toEqual([])

    sent([0x80, 41, 0])
    receive([0x80, 41, 0])        // our own note-off coming back: dropped too
    receive([0x90, 72, 110])      // played on the device: passes
    expect(notes).toEqual([72])
  })

  it('never flags an input registered as an input in MIDI Flow', () => {
    const { svc, transport, receive, sent } = setup({ 'MIDI WIN 2 (A)': { name: 'MIDI WIN 2 (A)', inEnabled: true } })
    for (let n = 0; n < 12; n++) {
      sent([0x90, 40 + n, 90])
      receive([0x90, 40 + n, 90])
    }
    expect(svc.getLoopbackInputNames()).toEqual([])
    receive([0xFA])
    expect(transport).toEqual(['start'])
  })
})
