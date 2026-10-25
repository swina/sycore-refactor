import { describe, it, expect, beforeEach } from 'vitest'
import { MidiService } from '@/core/midi/midi-service'

describe('resendAllProgramChanges', () => {
  beforeEach(() => localStorage.clear())

  it('only re-sends to devices cabled in MIDI Flow', () => {
    const svc = new MidiService() as any
    const sent: Record<string, number[][]> = {}
    svc.sendRawToDeviceByName = (name: string, data: number[]) => { (sent[name] ??= []).push(data) }
    svc.setRoutingConfig({
      registrations: {
        'E-MU X SOLO': { name: 'E-MU X SOLO', pcChannels: { 0: { program: 5, msb: 0, lsb: 0 } } },
        'SEQTRAK-1':   { name: 'SEQTRAK-1',   pcChannels: { 0: { program: 9, msb: 0, lsb: 0 } } },
      },
    })
    svc.setRouting('Launchkey MK4 49 MIDI', ['E-MU X SOLO'])

    svc.resendAllProgramChanges()

    expect(sent['E-MU X SOLO']).toContainEqual([0xc0, 5])
    expect(sent['SEQTRAK-1']).toBeUndefined()
  })
})
