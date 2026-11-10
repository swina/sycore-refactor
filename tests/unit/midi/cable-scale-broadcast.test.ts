import { describe, it, expect } from 'vitest'
import { midiService, cableMuteKey } from '@/core/midi/midi-service'
import { MidiSource } from '@/types/midi'

describe('broadcast: per-cable velocity and mute on a virtual instrument', () => {
  it('scales and mutes only the picked cable', () => {
    const ms = midiService as any
    const sent: Record<string, number[][]> = { 'Live Drums': [], 'Emu': [] }
    ms.midiAccess = { outputs: new Map(), inputs: new Map() }
    const reg = { outEnabled: true, notes: true, cc: true, pc: true, clock: false, transport: false, outChannel: -1 }
    ms.routingConfig = { registrations: { 'Live Drums': reg, 'Emu': reg } }
    ms.router.setRouting(MidiSource.DRUM_MACHINE, ['Live Drums', 'Emu'])
    midiService.registerVirtualOutput('Live Drums', d => sent['Live Drums'].push(d))
    midiService.registerVirtualOutput('Emu', d => sent['Emu'].push(d))

    midiService.setVelocityScales({}, { [cableMuteKey('DRUM_MACHINE', 'Live Drums')]: 0 })
    midiService.sendNoteOn(36, 100, 9, MidiSource.DRUM_MACHINE)
    expect(sent['Live Drums'].at(-1)).toEqual([0x99, 36, 1])
    expect(sent['Emu'].at(-1)).toEqual([0x99, 36, 100])

    midiService.setMutedCables([cableMuteKey('DRUM_MACHINE', 'Live Drums')])
    const n = sent['Live Drums'].length
    midiService.sendNoteOn(38, 100, 9, MidiSource.DRUM_MACHINE)
    expect(sent['Live Drums'].length).toBe(n)
    expect(sent['Emu'].at(-1)).toEqual([0x99, 38, 100])

    // a CC limited to one cable (the rig's CC 7 on a scoped app)
    midiService.sendCC(7, 0, 9, MidiSource.DRUM_MACHINE, null, { onlyTargets: ['live drums'] })
    expect(sent['Live Drums'].at(-1)).toEqual([0xB9, 7, 0])
    expect(sent['Emu'].at(-1)).toEqual([0x99, 38, 100])
    midiService.sendCC(7, 127, 9, MidiSource.DRUM_MACHINE)
    expect(sent['Emu'].at(-1)).toEqual([0xB9, 7, 127])

    midiService.setMutedCables([]); midiService.setVelocityScales({})
    midiService.unregisterVirtualOutput('Live Drums'); midiService.unregisterVirtualOutput('Emu')
    ms.router.setRouting(MidiSource.DRUM_MACHINE, [])
    ms.midiAccess = null; ms.routingConfig = null
  })
})
