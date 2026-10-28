import { describe, it, expect, vi, afterEach } from 'vitest'
import { MidiService, MidiSource } from '@/core/midi/midi-service'

function setup() {
  const svc = new MidiService() as any
  const sent: { msg: number[]; ts?: number }[] = []
  const out = { id: 'out-winb', name: 'MIDI WIN B', send: (msg: number[], ts?: number) => sent.push({ msg, ts }) }
  svc.midiAccess = { inputs: new Map(), outputs: new Map([[out.id, out]]) }
  svc.setRoutingConfig({
    registrations: {
      'MIDI WIN B': { name: 'MIDI WIN B', outEnabled: true, notes: true, outChannel: -1 },
      'Synth': { name: 'Synth', outEnabled: true, notes: true, outChannel: -1 },
    },
  })
  const virt: number[][] = []
  svc.registerVirtualOutput('Synth', (data: number[]) => virt.push(data))
  svc.router.matrix.set(MidiSource.ARP, new Set(['MIDI WIN B', 'Synth']))
  return { svc, sent, virt }
}

describe('scheduled note sends (at)', () => {
  afterEach(() => vi.useRealTimers())

  it('gives real outputs a timestamped send and delivers virtual outputs at that time', () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const { svc, sent, virt } = setup()
    const at = performance.now() + 50
    svc.sendNoteOn(60, 100, 0, MidiSource.ARP, null, at)

    expect(sent).toEqual([{ msg: [0x90, 60, 100], ts: at }])
    expect(virt).toEqual([])          // not early
    vi.advanceTimersByTime(60)
    expect(virt).toEqual([[0x90, 60, 100]])
  })

  it('sends immediately without a timestamp when no time is given', () => {
    const { svc, sent, virt } = setup()
    svc.sendNoteOff(60, 0, 0, MidiSource.ARP)
    expect(sent).toEqual([{ msg: [0x80, 60, 0], ts: undefined }])
    expect(virt).toEqual([[0x80, 60, 0]])
  })

  it('records the scheduled send time for echo matching', () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const { svc } = setup()
    const before = Date.now()
    svc.sendNoteOn(61, 90, 0, MidiSource.ARP, null, performance.now() + 80)
    const t = svc.globalSentHashes.get('144,61,90')
    expect(t).toBeGreaterThanOrEqual(before + 70)
  })
})
