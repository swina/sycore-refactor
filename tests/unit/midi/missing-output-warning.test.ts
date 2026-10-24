import { describe, it, expect, vi, afterEach } from 'vitest'
import { MidiService } from '@/core/midi/midi-service'

describe('sendRawToDeviceByName missing-output warning', () => {
  afterEach(() => vi.restoreAllMocks())

  it('warns once per missing device, again after it has reconnected and dropped', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const svc = new MidiService() as any
    const outputs = new Map<string, any>()
    svc.midiAccess = { inputs: new Map(), outputs }

    for (let v = 0; v < 200; v++) svc.sendRawToDeviceByName('SEQTRAK-1', [0xe0, v & 0x7f, 64])
    expect(warn).toHaveBeenCalledTimes(1)

    const sent: number[][] = []
    outputs.set('o1', { name: 'SEQTRAK-1', send: (d: number[]) => sent.push(d) })
    svc.sendRawToDeviceByName('SEQTRAK-1', [0xe0, 0, 64])
    expect(sent).toHaveLength(1)

    outputs.clear()
    svc.sendRawToDeviceByName('SEQTRAK-1', [0xe0, 0, 64])
    expect(warn).toHaveBeenCalledTimes(2)
  })
})
