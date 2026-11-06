import { describe, it, expect } from 'vitest'
import { MidiService } from '@/core/midi/midi-service'
import { controlActionForNote, controlActionEvent, describeControlAction, liveNoteName } from '@/lib/control-map'

describe('Control Map — notes to actions', () => {
  it('Live note names (C3 = 60)', () => {
    expect(liveNoteName(60)).toBe('C3')
    expect(liveNoteName(36)).toBe('C1')
    expect(liveNoteName(43)).toBe('G1')
  })

  it('C1–G1 Chord Prog, C2–G2 Drum Machine, C3–G3 Sequencer slots A–H', () => {
    expect(controlActionForNote(36)).toEqual({ app: 'chord', type: 'slot', index: 0 })
    expect(controlActionForNote(43)).toEqual({ app: 'chord', type: 'slot', index: 7 })
    expect(controlActionForNote(50)).toEqual({ app: 'drum', type: 'slot', index: 2 })
    expect(controlActionForNote(67)).toEqual({ app: 'seq', type: 'slot', index: 7 })
    expect(controlActionForNote(44)).toBeNull()
  })

  it('C4 Fill, F4 Generate; other notes do nothing', () => {
    expect(controlActionForNote(72)).toEqual({ app: 'drum', type: 'fill' })
    expect(controlActionForNote(77)).toEqual({ app: 'drum', type: 'generate' })
    expect(controlActionForNote(73)).toBeNull()
  })

  it('maps actions to the events the apps listen to', () => {
    expect(controlActionEvent({ app: 'chord', type: 'slot', index: 1 })).toEqual({ name: 'cp-slot-cue', detail: { idx: 1 } })
    expect(controlActionEvent({ app: 'drum', type: 'slot', index: 2 })).toEqual({ name: 'dm-seq-switch', detail: { seq: 'C', quantize: true } })
    expect(controlActionEvent({ app: 'seq', type: 'slot', index: 3 })).toEqual({ name: 'seq-bank-cue', detail: { idx: 3 } })
    expect(controlActionEvent({ app: 'drum', type: 'fill' })).toEqual({ name: 'dm-trigger-fill' })
    expect(describeControlAction({ app: 'drum', type: 'slot', index: 2 })).toBe('Drum Machine → C')
  })
})

// The clock source port ("SYC CTRL B"): its control notes are consumed and nothing from it is
// forwarded to devices; other inputs are untouched.
function setup() {
  const svc = new MidiService() as any
  const ctrl = { id: 'in-ctrl', name: 'SYC CTRL B' }
  const keys = { id: 'in-keys', name: 'Keys' }
  svc.midiAccess = { inputs: new Map([[ctrl.id, ctrl], [keys.id, keys]]), outputs: new Map() }
  svc.setRoutingConfig({
    globalThruEnabled: true,
    registrations: {
      'SYC CTRL B': { name: 'SYC CTRL B', inEnabled: true, inChannel: -1 },
      Keys: { name: 'Keys', inEnabled: true, inChannel: -1 },
      X3: { name: 'X3', outEnabled: true, notes: true, cc: true, outChannel: -1 },
    },
  })
  const thru: number[][] = []
  svc.registerVirtualOutput('X3', (data: number[]) => thru.push(data))
  svc.router.matrix.set('SYC CTRL B', new Set(['X3']))
  svc.router.matrix.set('Keys', new Set(['X3']))
  const notes: number[] = []
  svc.addNoteListener((_t: string, note: number) => notes.push(note))
  const consumed: number[] = []
  svc.setThruBlockedInput((name: string) => name === 'SYC CTRL B')
  svc.setControlConsumer((data: ArrayLike<number>, name: string) => {
    if (name !== 'SYC CTRL B' || (data[0] & 0x0f) !== 15) return false
    consumed.push(data[1]); return true
  })
  let t = 1000
  const receive = (input: any, bytes: number[]) => { t += 100; svc.handleIngress({ data: new Uint8Array(bytes), target: input, timeStamp: t }) }
  return { ctrl, keys, thru, notes, consumed, receive }
}

describe('Control Map — the source port in the MIDI service', () => {
  it('a control note (ch 16) is consumed: no Thru, no app note listener', () => {
    const { ctrl, thru, notes, consumed, receive } = setup()
    receive(ctrl, [0x9F, 48, 100])
    expect(consumed).toEqual([48])
    expect(thru).toEqual([])
    expect(notes).toEqual([])
  })

  it('other channels of the source port reach the apps but are never forwarded to devices', () => {
    const { ctrl, thru, notes, receive } = setup()
    receive(ctrl, [0x90, 60, 100])
    expect(notes).toEqual([60])
    expect(thru).toEqual([])
  })

  it('other inputs are untouched (Thru as before)', () => {
    const { keys, thru, notes, receive } = setup()
    receive(keys, [0x9F, 48, 100])
    expect(notes).toEqual([48])
    expect(thru).toHaveLength(1)
  })
})
