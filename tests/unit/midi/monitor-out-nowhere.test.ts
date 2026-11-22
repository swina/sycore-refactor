import { describe, it, expect } from 'vitest'
import { MidiService } from '@/core/midi/midi-service'
import { MidiSource } from '@/types/midi'

// An app sending with nothing cabled (e.g. the Sound Engine's LFO) used to fill the Monitor
// with sends that reached nobody. Only a message that goes somewhere is logged.
describe('MIDI Monitor, outgoing: only what goes somewhere', () => {
  it('a send with no target is not logged; a cabled one is', () => {
    const svc = new MidiService() as any
    svc.midiAccess = { outputs: new Map(), inputs: new Map() }
    svc.routingConfig = { registrations: { X3: { outEnabled: true, notes: true, cc: true, outChannel: -1 } } }
    svc.router.setBroadcastMode(false)
    const logged: any[] = []
    const append = svc.monitor.append.bind(svc.monitor)
    svc.monitor.append = (e: any) => { if (e.direction === 'out' && e.device === MidiSource.UI) logged.push(e); return append(e) }
    const sent: number[][] = []
    svc.registerVirtualOutput('X3', (d: number[]) => sent.push(d))

    svc.sendCC(74, 64, 0, MidiSource.UI)
    expect(logged).toHaveLength(0)
    expect(sent).toHaveLength(0)

    svc.router.setRouting(MidiSource.UI, ['X3'])
    svc.sendCC(74, 65, 0, MidiSource.UI)
    expect(sent).toEqual([[0xb0, 74, 65]])
    expect(logged).toHaveLength(1)
  })
})
