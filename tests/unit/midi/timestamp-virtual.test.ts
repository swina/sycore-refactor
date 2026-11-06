import { describe, it, expect, vi, afterEach } from 'vitest'
import { MidiService, MidiSource } from '@/core/midi/midi-service'

// workerTimed (Drum Machine on the system clock): scheduled notes are delivered by a
// Worker-timed queue at their time — not with a timestamp, which a Windows MIDI Services
// loopback ignores (note-on and note-off left together: no sound).
function setup() {
  const svc = new MidiService() as any
  const sent: { msg: number[]; ts?: number; at: number }[] = []
  const port = { id: 'out-hw', name: 'MIDIWIN (A)', send: (msg: number[], ts?: number) => sent.push({ msg: Array.from(msg), ts, at: performance.now() }) }
  const virt: { msg: number[]; at: number }[] = []
  svc.midiAccess = { inputs: new Map(), outputs: new Map([[port.id, port]]) }
  svc.setRoutingConfig({
    registrations: {
      'MIDIWIN (A)': { name: 'MIDIWIN (A)', outEnabled: true, notes: true, outChannel: -1 },
      'X3': { name: 'X3', outEnabled: true, notes: true, outChannel: -1 },
    },
  })
  svc.registerVirtualOutput('X3', (data: number[]) => virt.push({ msg: data, at: performance.now() }), 'MIDIWIN (A)')
  svc.router.matrix.set(MidiSource.DRUM_MACHINE, new Set(['MIDIWIN (A)', 'X3']))
  return { svc, sent, virt }
}

describe('Worker-timed scheduled sends', () => {
  afterEach(() => vi.useRealTimers())

  it('note-on and note-off reach both a real port and a virtual instrument at their own times, without timestamps', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'performance'] })
    const { svc, sent, virt } = setup()
    const t0 = performance.now()
    svc.sendNoteOn(36, 100, 9, MidiSource.DRUM_MACHINE, null, t0 + 100, { workerTimed: true })
    svc.sendNoteOff(36, 0, 9, MidiSource.DRUM_MACHINE, null, t0 + 300, { workerTimed: true })
    expect(sent).toEqual([])
    expect(virt).toEqual([])
    vi.advanceTimersByTime(104)
    expect(sent.map(x => x.msg)).toEqual([[0x99, 36, 100]])
    expect(sent[0].ts).toBeUndefined()
    expect(virt.map(x => x.msg)).toEqual([[0x99, 36, 100]])
    vi.advanceTimersByTime(200)
    expect(sent.map(x => x.msg)).toEqual([[0x99, 36, 100], [0x89, 36, 0]])
    expect(virt.map(x => x.msg)).toEqual([[0x99, 36, 100], [0x89, 36, 0]])
    expect(sent[1].at - sent[0].at).toBeGreaterThanOrEqual(195)   // the note lasts
  })

  it('without the option: real ports timestamped, virtual outputs on a timer (as before)', () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const { svc, sent, virt } = setup()
    const at = performance.now() + 80
    svc.sendNoteOn(36, 100, 9, MidiSource.DRUM_MACHINE, null, at)
    expect(sent).toEqual([expect.objectContaining({ msg: [0x99, 36, 100], ts: at })])
    expect(virt).toEqual([])
    vi.advanceTimersByTime(90)
    expect(virt).toHaveLength(1)
  })
})
