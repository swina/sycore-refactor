import { describe, it, expect } from 'vitest'
import { MidiService, MidiSource } from '@/core/midi/midi-service'

// MIDI Flow "via SY.CORE Link": an app's messages to a port marked viaLink go to the bridge
// (it plays them on Live's beat) while Link can play ports; else the port as before.
function setup(viaLink = true) {
  const svc = new MidiService() as any
  const direct: number[][] = []
  const out = { id: 'x3', name: 'MIDIWIN (B)', send: (msg: number[]) => direct.push(msg) }
  svc.midiAccess = { inputs: new Map(), outputs: new Map([[out.id, out]]) }
  svc.setRoutingConfig({
    registrations: { 'MIDIWIN (B)': { name: 'MIDIWIN (B)', outEnabled: true, notes: true, cc: true, outChannel: -1, viaLink } },
  })
  svc.router.matrix.set(MidiSource.CHORD_PROG, new Set(['MIDIWIN (B)']))
  const link: { port: string; data: number[]; at?: number; beat?: number }[] = []
  let can = true
  let clears = 0
  svc.setLinkPort({ can: () => can, send: (port: string, data: number[], at?: number, beat?: number) => { link.push({ port, data, at, beat }); return true }, clear: () => { clears++ } })
  return { svc, direct, link, setCan: (v: boolean) => { can = v }, clears: () => clears }
}

describe('MIDI Flow ports via SY.CORE Link', () => {
  it('a scheduled note goes to the bridge with its port, time and exact beat — not to the port', () => {
    const { svc, direct, link } = setup()
    const at = performance.now() + 120
    svc.sendNoteOn(60, 100, 3, MidiSource.CHORD_PROG, null, at, { workerTimed: true, beat: 8 })
    expect(direct).toEqual([])
    expect(link).toEqual([{ port: 'MIDIWIN (B)', data: [0x93, 60, 100], at, beat: 8 }])
  })

  it('an immediate message goes through the bridge too (no time): order kept with the scheduled ones', () => {
    const { svc, direct, link } = setup()
    svc.sendNoteOff(60, 0, 3, MidiSource.CHORD_PROG)
    expect(direct).toEqual([])
    expect(link[0]).toMatchObject({ port: 'MIDIWIN (B)', data: [0x83, 60, 0], at: undefined })
  })

  it('Link unable (Live stopped, no bridge 1.4): the port directly, as before', () => {
    const { svc, direct, link, setCan } = setup()
    setCan(false)
    svc.sendNoteOff(60, 0, 3, MidiSource.CHORD_PROG)
    expect(link).toEqual([])
    expect(direct).toEqual([[0x83, 60, 0]])
  })

  it('a port not marked: directly', () => {
    const { svc, direct, link } = setup(false)
    svc.sendNoteOff(60, 0, 3, MidiSource.CHORD_PROG)
    expect(link).toEqual([])
    expect(direct).toEqual([[0x83, 60, 0]])
  })

  it('sendNoteTo (the Chord Prog bass) to a marked port: through the bridge', () => {
    const { svc, direct, link } = setup()
    const at = performance.now() + 100
    svc.sendNoteTo('MIDIWIN (B)', 'noteon', 40, 90, 1, MidiSource.CHORD_PROG, at, { workerTimed: true, beat: 4 })
    expect(direct).toEqual([])
    expect(link).toEqual([{ port: 'MIDIWIN (B)', data: [0x91, 40, 90], at, beat: 4 }])
  })

  it('panic clears the bridge too', () => {
    const { svc, clears } = setup()
    svc.panic()
    expect(clears()).toBe(1)
  })

  it('a virtual instrument on a port (E-MU X3 MULTI → MIDIWIN (B)), marked: the bridge plays its port', () => {
    const svc = new MidiService() as any
    const viaFn: number[][] = []
    svc.midiAccess = { inputs: new Map(), outputs: new Map() }
    svc.setRoutingConfig({ registrations: { 'E-MU X3 MULTI': { name: 'E-MU X3 MULTI', outEnabled: true, notes: true, outChannel: -1, viaLink: true } } })
    svc.registerVirtualOutput('E-MU X3 MULTI', (data: number[]) => viaFn.push(data), 'MIDIWIN (B)')
    svc.router.matrix.set(MidiSource.CHORD_PROG, new Set(['E-MU X3 MULTI']))
    const link: any[] = []
    svc.setLinkPort({ can: () => true, send: (port: string, data: number[], at?: number, beat?: number) => { link.push({ port, data, at, beat }); return true }, clear: () => {} })
    const at = performance.now() + 100
    svc.sendNoteOn(64, 100, 2, MidiSource.CHORD_PROG, null, at, { workerTimed: true, beat: 12 })
    expect(viaFn).toEqual([])
    expect(link).toEqual([{ port: 'MIDIWIN (B)', data: [0x92, 64, 100], at, beat: 12 }])
  })
})
