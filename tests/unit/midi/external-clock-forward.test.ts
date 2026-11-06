import { describe, it, expect, vi, afterEach } from 'vitest'
import { MidiTransport } from '@/core/midi/midi-transport'
import { isClockSourceEcho } from '@/core/midi/external-clock'

function out(name: string) {
  return { name, sent: [] as number[][], send(d: number[]) { this.sent.push(Array.from(d)) }, clear() {} }
}

function setup() {
  const outs = [out('SYC CTRL A'), out('Roland S-1'), out('Off Synth')]
  const reg = (clock: boolean, transport: boolean, outEnabled = true) => ({ outEnabled, clock, transport })
  const virtualSent: [string, number[]][] = []
  const t = new MidiTransport({
    getMidiAccess: () => ({ outputs: new Map(outs.map(o => [o.name, o])) }),
    getRoutingConfig: () => ({
      registrations: {
        'SYC CTRL A': reg(true, true),
        'Roland S-1': reg(true, true),
        'Off Synth': reg(false, false),
      },
    }) as any,
    getVirtualClockTargets: () => ['VI'],
    getVirtualTransportTargets: () => ['VI'],
    sendToVirtualOutput: (n, d) => { virtualSent.push([n, d]) },
    isSyncOutputBlocked: name => isClockSourceEcho('SYC CTRL B', name),
  })
  return { t, outs, virtualSent }
}

describe('MidiTransport — following an external clock', () => {
  afterEach(() => vi.useRealTimers())

  it('forwards the source clock and transport to synced outputs, never to the source loopback peer', () => {
    const { t, outs, virtualSent } = setup()
    t.forwardRealTime([0xF8])
    t.forwardRealTime([0xF2, 8, 0])
    t.forwardRealTime([0xFB])
    expect(outs[0].sent).toEqual([])                                   // SYC CTRL A: echoes into SYC CTRL B
    expect(outs[1].sent).toEqual([[0xF8], [0xF2, 8, 0], [0xFB]])        // Roland S-1
    expect(outs[2].sent).toEqual([])                                   // clock/transport off
    expect(virtualSent.map(v => v[1][0])).toEqual([0xF8, 0xF2, 0xFB])
  })

  it('generates no clock of its own while following', () => {
    vi.useFakeTimers()
    const { t, outs } = setup()
    t.setBpm(120)
    t.setFollowingExternal(true)
    t.startClock()
    vi.advanceTimersByTime(500)
    expect(t.isPlayingClock).toBe(false)
    expect(outs[1].sent).toEqual([])
    t.setFollowingExternal(false)
    t.startClock()
    expect(t.isPlayingClock).toBe(true)
    t.stopClock()
  })

  it('switching to follow stops a running clock', () => {
    vi.useFakeTimers()
    const { t } = setup()
    t.setBpm(120)
    t.startClock()
    expect(t.isPlayingClock).toBe(true)
    t.setFollowingExternal(true)
    expect(t.isPlayingClock).toBe(false)
  })
})
