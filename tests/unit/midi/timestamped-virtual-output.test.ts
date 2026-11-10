import { describe, it, expect, vi, afterEach } from 'vitest'
import { MidiService, MidiSource } from '@/core/midi/midi-service'

// A virtual output that schedules on its own (SY.CORE Link: the bridge plays the
// note on Live's beat) gets scheduled sends at once, with their time.
function setup() {
  const svc = new MidiService() as any
  const got: { msg: number[]; at?: number }[] = []
  svc.midiAccess = { inputs: new Map(), outputs: new Map() }
  svc.setRoutingConfig({
    registrations: { 'Live (M4L)': { name: 'Live (M4L)', outEnabled: true, notes: true, cc: true, outChannel: -1 } },
  })
  svc.registerVirtualOutput('Live (M4L)', (data: number[], at?: number) => got.push({ msg: data, at }), undefined, { timestamped: true })
  svc.router.matrix.set(MidiSource.DRUM_MACHINE, new Set(['Live (M4L)']))
  return { svc, got }
}

describe('timestamped virtual outputs', () => {
  afterEach(() => vi.useRealTimers())

  it('a scheduled note reaches the output now, with its time (workerTimed or not)', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'performance'] })
    const { svc, got } = setup()
    const t0 = performance.now()
    svc.sendNoteOn(36, 100, 9, MidiSource.DRUM_MACHINE, null, t0 + 100, { workerTimed: true })
    svc.sendNoteOff(36, 0, 9, MidiSource.DRUM_MACHINE, null, t0 + 300)
    expect(got).toEqual([{ msg: [0x99, 36, 100], at: t0 + 100 }, { msg: [0x89, 36, 0], at: t0 + 300 }])
    vi.advanceTimersByTime(400)
    expect(got).toHaveLength(2) // nothing sent again by a timer
  })

  it('sendNoteTo by name: the same', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'performance'] })
    const { svc, got } = setup()
    const at = performance.now() + 50
    svc.sendNoteTo('Live (M4L)', 'noteon', 60, 90, 0, MidiSource.CHORD_PROG, at, { workerTimed: true })
    expect(got).toEqual([{ msg: [0x90, 60, 90], at }])
  })

  it('an unscheduled send goes out as before (no time)', () => {
    const { svc, got } = setup()
    svc.sendNoteOn(36, 100, 9, MidiSource.DRUM_MACHINE)
    expect(got).toEqual([{ msg: [0x99, 36, 100], at: undefined }])
  })

  it('re-registered without the option: back to the timer', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'performance'] })
    const { svc, got } = setup()
    svc.registerVirtualOutput('Live (M4L)', (data: number[], at?: number) => got.push({ msg: data, at }))
    svc.sendNoteOn(36, 100, 9, MidiSource.DRUM_MACHINE, null, performance.now() + 80)
    expect(got).toEqual([])
    vi.advanceTimersByTime(90)
    expect(got).toHaveLength(1)
  })
})
