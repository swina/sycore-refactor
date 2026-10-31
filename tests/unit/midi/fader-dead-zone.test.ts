import { describe, it, expect } from 'vitest'
import { MidiService } from '@/core/midi/midi-service'
import { snapFaderValue } from '@/core/midi/midi-broadcast'

function setup(faderDeadZone?: number) {
  const svc = new MidiService() as any
  const input = { id: 'in-akai', name: 'AKAI' }
  svc.midiAccess = { inputs: new Map([[input.id, input]]), outputs: new Map() }
  svc.setRoutingConfig({
    globalThruEnabled: true,
    registrations: {
      AKAI: { name: 'AKAI', inEnabled: true, inChannel: -1, faderDeadZone },
      X3: { name: 'X3', outEnabled: true, notes: true, cc: true, outChannel: -1 },
    },
  })
  const thru: number[][] = []
  svc.registerVirtualOutput('X3', (data: number[]) => thru.push(data))
  svc.router.matrix.set('AKAI', new Set(['X3']))
  const ccs: number[] = []
  const monitor: number[] = []
  svc.addCCListener((_cc: number, val: number) => ccs.push(val))
  svc.addMonitorListener((e: any) => { if (e.direction === 'in') monitor.push(e.data[2]) })
  const receive = (bytes: number[]) => svc.handleIngress({ data: new Uint8Array(bytes), target: input, timeStamp: performance.now() })
  return { thru, ccs, monitor, receive }
}

describe('snapFaderValue', () => {
  it('snaps values within the zone to 0 / 127 and leaves the rest', () => {
    expect(snapFaderValue(2, 3)).toBe(0)
    expect(snapFaderValue(4, 3)).toBe(4)
    expect(snapFaderValue(124, 3)).toBe(127)
    expect(snapFaderValue(123, 3)).toBe(123)
    expect(snapFaderValue(1, 0)).toBe(1)
  })
})

describe('Fader dead zone on ingress', () => {
  it('snaps CCs for Thru and CC listeners; the Monitor keeps the raw value', () => {
    const { thru, ccs, monitor, receive } = setup(3)
    receive([0xb0, 7, 2])
    receive([0xb0, 8, 125])
    expect(ccs).toEqual([0, 127])
    expect(thru).toEqual([[0xb0, 7, 0], [0xb0, 8, 127]])
    expect(monitor).toEqual([2, 125])
  })

  it('is off by default', () => {
    const { ccs, receive } = setup()
    receive([0xb0, 7, 2])
    expect(ccs).toEqual([2])
  })
})
