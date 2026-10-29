import { describe, it, expect, beforeEach } from 'vitest'
import { MidiRouter } from '@/core/midi/midi-routing'
import { MidiService, MidiSource } from '@/core/midi/midi-service'
import { cableOutChannels } from '@/types/midi'

// The cable is the routing unit: its OUT channels (InputRouteFilter.outChannels) remap what that
// one connection sends, over the device's OUT ch — e.g. Sequencer → FM-1 on CH 2 and a keyboard →
// FM-1 on CH 3; several channels layer parts of a multipart device.

describe('cableOutChannels', () => {
  it('keeps valid channels once, [] when none', () => {
    expect(cableOutChannels(undefined)).toEqual([])
    expect(cableOutChannels({})).toEqual([])
    expect(cableOutChannels({ outChannels: [] })).toEqual([])
    expect(cableOutChannels({ outChannels: [2, 2, 16, -1, 4] })).toEqual([2, 4])
  })
})

describe('device → device Thru', () => {
  beforeEach(() => localStorage.clear())

  function setup(filter: any, outChannel = -1) {
    const sent: number[][] = []
    const input = { id: 'in-1', name: 'Keys' }
    const output = { id: 'out-1', name: 'Synth', send: (b: Uint8Array) => sent.push(Array.from(b)) }
    const registrations: any = {
      Keys: { inEnabled: true },
      Synth: { outEnabled: true, notes: true, cc: true, outChannel, isMulti: false },
    }
    const router = new MidiRouter({
      getMidiAccess: () => ({ inputs: new Map([[input.id, input]]), outputs: new Map([[output.id, output]]) }),
      getRoutingConfig: () => ({ registrations } as any),
      getGlobalChannel: () => 0,
      getSmartLatch: () => ({ isActive: false } as any),
      getSequencerPlaying: () => false,
      getOutputRouteFilter: () => filter,
      onSent: () => {},
    } as any)
    router.setRouting('Keys', ['Synth'])
    return { router, sent, input }
  }

  it('sends notes, their note-offs and CCs on the cable channel, over the device OUT ch', () => {
    const { router, sent, input } = setup({ outChannels: [2] }, 5)
    router.routeMessageToOutputs(new Uint8Array([0x90, 60, 100]), input.id, 0)
    router.routeMessageToOutputs(new Uint8Array([0xb0, 1, 64]), input.id, 1)
    router.routeMessageToOutputs(new Uint8Array([0x80, 60, 0]), input.id, 2)
    expect(sent).toEqual([[0x92, 60, 100], [0xb2, 1, 64], [0x82, 60, 0]])
  })

  it('layers several cable channels, each note-off on every channel its note-on used', () => {
    const { router, sent, input } = setup({ outChannels: [0, 3] })
    router.routeMessageToOutputs(new Uint8Array([0x90, 60, 100]), input.id, 0)
    router.routeMessageToOutputs(new Uint8Array([0x80, 60, 0]), input.id, 1)
    expect(sent).toEqual([[0x90, 60, 100], [0x93, 60, 100], [0x80, 60, 0], [0x83, 60, 0]])
  })

  it('without a cable channel keeps the device OUT ch', () => {
    const { router, sent, input } = setup(undefined, 5)
    router.routeMessageToOutputs(new Uint8Array([0x90, 60, 100]), input.id, 0)
    expect(sent).toEqual([[0x95, 60, 100]])
  })
})

describe('app → virtual output (FM-1)', () => {
  function setup() {
    const svc = new MidiService() as any
    svc.midiAccess = { inputs: new Map(), outputs: new Map() }
    svc.setRoutingConfig({
      registrations: { 'FM-1 Emulator': { name: 'FM-1 Emulator', outEnabled: true, notes: true, cc: true, outChannel: -1 } },
    })
    const virt: number[][] = []
    svc.registerVirtualOutput('FM-1 Emulator', (data: number[]) => virt.push(data))
    svc.router.matrix.set(MidiSource.SEQUENCER2, new Set(['FM-1 Emulator']))
    svc.router.matrix.set(MidiSource.CHORD_PROG, new Set(['FM-1 Emulator']))
    svc.setOutputRouteFilters({ [`${MidiSource.SEQUENCER2}→FM-1 Emulator`]: { outChannels: [1] } })
    return { svc, virt }
  }

  it('remaps only the cable that sets it', () => {
    const { svc, virt } = setup()
    svc.sendNoteOn(60, 100, 0, MidiSource.SEQUENCER2)
    svc.sendNoteOn(64, 100, 0, MidiSource.CHORD_PROG)
    expect(virt).toEqual([[0x91, 60, 100], [0x90, 64, 100]])
  })
})
