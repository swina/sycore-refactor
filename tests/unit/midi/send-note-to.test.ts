import { describe, it, expect, beforeEach } from 'vitest'
import { MidiService, MidiSource } from '@/core/midi/midi-service'

// An app's own dedicated output (Chord Prog Bass → SYC OUT ch 2): one device by name, exactly
// its channel, whatever the app's MIDI Flow cables are.
describe('midiService.sendNoteTo', () => {
  beforeEach(() => localStorage.clear())

  function setup() {
    const svc = new MidiService() as any
    const syc: number[][] = []
    const x3: number[][] = []
    svc.midiAccess = {
      inputs: new Map(),
      outputs: new Map([
        ['o1', { id: 'o1', name: 'SYC OUT A', send: (b: number[]) => syc.push(Array.from(b)) }],
        ['o2', { id: 'o2', name: 'E-MU X3 MULTI', send: (b: number[]) => x3.push(Array.from(b)) }],
      ]),
    }
    svc.routingConfig = { registrations: { 'E-MU X3 MULTI': { outEnabled: true, notes: true, outChannel: 2 } } }
    // The Chord Prog is cabled to the X3 only, not to SYC OUT.
    svc.router.matrix.set(MidiSource.CHORD_PROG, new Set(['E-MU X3 MULTI']))
    return { svc, syc, x3 }
  }

  it('reaches the named port on exactly its channel, not the cabled devices', () => {
    const { svc, syc, x3 } = setup()
    expect(svc.sendNoteTo('SYC OUT A', 'noteon', 36, 90, 1, MidiSource.CHORD_PROG)).toBe(true)
    svc.sendNoteTo('syc out a ', 'noteoff', 36, 0, 1, MidiSource.CHORD_PROG)
    expect(syc).toEqual([[0x91, 36, 90], [0x81, 36, 0]])
    expect(x3).toEqual([])
  })

  it('a virtual instrument by name; unknown device → false; a muted source plays no note-on', () => {
    const { svc, syc } = setup()
    const virt: number[][] = []
    svc.registerVirtualOutput('FM-1 Emulator', (d: number[]) => virt.push(d))
    svc.sendNoteTo('FM-1 Emulator', 'noteon', 40, 100, 4, MidiSource.CHORD_PROG)
    expect(virt).toEqual([[0x94, 40, 100]])
    expect(svc.sendNoteTo('Nope', 'noteon', 40, 100, 0, MidiSource.CHORD_PROG)).toBe(false)
    svc.setMutedSources([MidiSource.CHORD_PROG])
    svc.sendNoteTo('SYC OUT A', 'noteon', 36, 90, 1, MidiSource.CHORD_PROG)
    expect(syc).toEqual([])
  })
})
