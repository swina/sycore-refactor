/**
 * Who gets a controller's message today (phase 0 of docs/plans/projects-and-control.md).
 *
 * A controller "Keys" cabled to "X3" in MIDI Flow. For each layer that can take a
 * message, what still sees it: raw listeners (MIDI Learn capture, panels), the
 * MIDI Monitor (incoming rows), Thru (the cable to X3), the CC / note listeners (MIDI Learn
 * mappings, the Designer canvas). Phase 2 replaces this chain with one owner per
 * message: these tests say what it must keep, or change on purpose.
 */
import { describe, it, expect } from 'vitest'
import { MidiService } from '@/core/midi/midi-service'

type Gate = 'consumed' | 'drop' | 'pass'

function rig() {
  const svc = new MidiService() as any
  const input = { id: 'in-keys', name: 'Keys' }
  svc.midiAccess = { inputs: new Map([[input.id, input]]), outputs: new Map() }
  svc.setRoutingConfig({
    globalThruEnabled: true,
    registrations: {
      Keys: { name: 'Keys', inEnabled: true, inChannel: -1 },
      X3: { name: 'X3', outEnabled: true, notes: true, cc: true, outChannel: -1 },
    },
  })
  const seen = { raw: 0, monitor: 0, thru: [] as number[][], cc: [] as number[], note: [] as string[] }
  svc.registerVirtualOutput('X3', (data: number[]) => seen.thru.push(data))
  svc.router.matrix.set('Keys', new Set(['X3']))
  svc.addRawListener(() => { seen.raw++ })
  svc.addCCListener((cc: number) => seen.cc.push(cc))
  svc.addNoteListener((type: string, note: number) => seen.note.push(`${type}${note}`))
  const append = svc.monitor.append.bind(svc.monitor)
  svc.monitor.append = (e: any) => { if (e?.direction === 'in') seen.monitor++; return append(e) }
  const receive = (bytes: number[]) =>
    svc.handleIngress({ data: new Uint8Array(bytes), target: input, timeStamp: performance.now() })
  return { svc, seen, receive }
}

const CC74 = [0xb0, 74, 100]

describe('a controller CC, layer by layer (today)', () => {
  it('no layer takes it: seen everywhere and played to the cable', () => {
    const { seen, receive } = rig()
    receive(CC74)
    expect(seen).toEqual({ raw: 1, monitor: 1, thru: [CC74], cc: [74], note: [] })
  })

  it('the Live/Perf key (profile gate "consumed"): nobody sees it, not even the Monitor', () => {
    const { svc, seen, receive } = rig()
    svc.setProfileGate((): Gate => 'consumed')
    receive(CC74)
    expect(seen).toEqual({ raw: 0, monitor: 0, thru: [], cc: [], note: [] })
  })

  it('a controller in Live mode (profile gate "drop"): nobody sees it', () => {
    const { svc, seen, receive } = rig()
    svc.setProfileGate((): Gate => 'drop')
    receive(CC74)
    expect(seen).toEqual({ raw: 0, monitor: 0, thru: [], cc: [], note: [] })
  })

  it('Rig mode (exclusive input): only the Rig sees it', () => {
    const { svc, seen, receive } = rig()
    let rigSaw = 0
    svc.setExclusiveInput(() => { rigSaw++; return true })
    receive(CC74)
    expect(rigSaw).toBe(1)
    expect(seen).toEqual({ raw: 0, monitor: 0, thru: [], cc: [], note: [] })
  })

  it('Rig before Live: a Live-dropped controller still reaches the Rig', () => {
    const { svc, seen, receive } = rig()
    let rigSaw = 0
    svc.setProfileGate((): Gate => 'drop')
    svc.setExclusiveInput(() => { rigSaw++; return false })
    receive(CC74)
    expect(rigSaw).toBe(1)
    expect(seen.raw).toBe(0)
  })

  it('an app mapping (ingress filter, consume): Monitor and raw see it, not Thru nor the listeners', () => {
    const { svc, seen, receive } = rig()
    svc.setIngressFilter(() => true)
    receive(CC74)
    expect(seen).toEqual({ raw: 1, monitor: 1, thru: [], cc: [], note: [] })
  })

  it('the Control Map (control consumer): Monitor and raw see it, not Thru nor the listeners', () => {
    const { svc, seen, receive } = rig()
    svc.setControlConsumer(() => true)
    receive(CC74)
    expect(seen).toEqual({ raw: 1, monitor: 1, thru: [], cc: [], note: [] })
  })

  it('a MIDI Learn mapping (Thru exclusion): not played, the listeners still apply it', () => {
    const { svc, seen, receive } = rig()
    svc.setThruExclude((_d: string, _c: number, kind: string, n: number) => kind === 'cc' && n === 74)
    receive(CC74)
    expect(seen).toEqual({ raw: 1, monitor: 1, thru: [], cc: [74], note: [] })
  })

  it('a learned note: its note-on and its note-off are both kept out of Thru', () => {
    const { svc, seen, receive } = rig()
    svc.setThruExclude((_d: string, _c: number, kind: string, n: number) => kind === 'note' && n === 36)
    receive([0x99, 36, 100])
    receive([0x89, 36, 0])
    receive([0x90, 60, 100])
    expect(seen.thru).toEqual([[0x90, 60, 100]])
    expect(seen.note).toEqual(['on36', 'off36', 'on60'])
  })

  it('an app mapping that does not consume: everyone gets it, played too', () => {
    const { svc, seen, receive } = rig()
    svc.setIngressFilter(() => false)
    receive(CC74)
    expect(seen).toEqual({ raw: 1, monitor: 1, thru: [CC74], cc: [74], note: [] })
  })
})
