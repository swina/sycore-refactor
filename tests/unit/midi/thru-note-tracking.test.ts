import { describe, it, expect, beforeEach } from 'vitest'
import { MidiRouter } from '@/core/midi/midi-routing'

function setup() {
  const sent: number[][] = []
  const input = { id: 'in-1', name: 'Launchkey MK4 49 MIDI' }
  const output = { id: 'out-1', name: 'Synth', send: (b: Uint8Array) => sent.push(Array.from(b)) }
  const access = {
    inputs: new Map([[input.id, input]]),
    outputs: new Map([[output.id, output]]),
  }
  const state = { sequencerPlaying: false, globalChannel: 0, filter: undefined as any }
  const registrations: any = {
    [input.name]: { inEnabled: true },
    [output.name]: { outEnabled: true, notes: true, cc: true, outChannel: -1, isMulti: false },
  }
  const router = new MidiRouter({
    getMidiAccess: () => access,
    getRoutingConfig: () => ({ registrations } as any),
    getGlobalChannel: () => state.globalChannel,
    getSmartLatch: () => ({ isActive: false } as any),
    getSequencerPlaying: () => state.sequencerPlaying,
    getOutputRouteFilter: () => state.filter,
    onSent: () => {},
  })
  router.setRouting(input.name, [output.name])
  router.setRouting('SEQUENCER', [output.name])
  return { router, sent, state, registrations, input }
}

describe('MidiRouter Thru note-off tracking', () => {
  beforeEach(() => localStorage.clear())

  it('forwards the note-off even when the sequencer starts mid-note', () => {
    const { router, sent, state, input } = setup()
    router.routeMessageToOutputs(new Uint8Array([0x90, 37, 100]), input.id, 0)
    state.sequencerPlaying = true
    router.routeMessageToOutputs(new Uint8Array([0x80, 37, 0]), input.id, 1)
    expect(sent).toEqual([[0x90, 37, 100], [0x80, 37, 0]])
  })

  it('sends the note-off on the channel the note-on used after a Multi-CH switch', () => {
    const { router, sent, state, registrations, input } = setup()
    registrations.Synth.isMulti = true
    state.globalChannel = 2
    router.routeMessageToOutputs(new Uint8Array([0x90, 38, 100]), input.id, 0)
    state.globalChannel = 5
    router.routeMessageToOutputs(new Uint8Array([0x90, 38, 0]), input.id, 1)
    expect(sent).toEqual([[0x92, 38, 100], [0x92, 38, 0]])
  })

  it('does not send note-offs twice', () => {
    const { router, sent, input } = setup()
    router.routeMessageToOutputs(new Uint8Array([0x90, 37, 100]), input.id, 0)
    router.routeMessageToOutputs(new Uint8Array([0x80, 37, 0]), input.id, 1)
    expect(sent.filter(m => (m[0] & 0xf0) === 0x80)).toHaveLength(1)
  })
})
