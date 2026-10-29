import { describe, it, expect } from 'vitest'
import { Fm1ControlMapper, findMapping, midiSource, FM1_CONTROLS, relClicks, inferRelMode, type Fm1Mapping } from '@/lib/fm1-controls'

const cc = (ch: number, n: number, v: number) => [0xb0 | ch, n, v]
const noteOn = (ch: number, n: number, v = 100) => [0x90 | ch, n, v]

describe('fm1-controls', () => {
  it('lists the FM-1 panel: 7 encoders, MASTER, 14 buttons', () => {
    expect(FM1_CONTROLS.filter(c => c.target.kind === 'enc')).toHaveLength(7)
    expect(FM1_CONTROLS.filter(c => c.target.kind === 'pot')).toHaveLength(1)
    expect(FM1_CONTROLS.filter(c => c.target.kind === 'key')).toHaveLength(14)
  })

  it('reads CCs and notes; note-on velocity 0 is a note-off', () => {
    expect(midiSource(cc(2, 20, 90))).toMatchObject({ type: 'cc', channel: 2, number: 20, value: 90 })
    expect(midiSource(noteOn(0, 60, 0))).toMatchObject({ type: 'note', on: false })
    expect(midiSource([0xe0, 0, 64])).toBeNull()
  })

  it('matches on type, channel and number', () => {
    const maps: Fm1Mapping[] = [{ control: 'pot', type: 'cc', channel: 0, number: 7 }]
    expect(findMapping(maps, cc(0, 7, 1))).toBeTruthy()
    expect(findMapping(maps, cc(1, 7, 1))).toBeUndefined()
    expect(findMapping(maps, noteOn(0, 7))).toBeUndefined()
  })

  it('absolute knob → encoder clicks from the change, divided', () => {
    const m = new Fm1ControlMapper(() => [{ control: 'enc:3', type: 'cc', channel: 0, number: 20, mode: 'abs', div: 2 }])
    expect(m.handle(cc(0, 20, 50))).toBeNull()                 // first value: no motion yet
    expect(m.handle(cc(0, 20, 51))).toBeNull()                 // 1 step: not a click yet
    expect(m.handle(cc(0, 20, 52))).toEqual({ kind: 'enc', index: 3, clicks: 1 })
    expect(m.handle(cc(0, 20, 46))).toEqual({ kind: 'enc', index: 3, clicks: -3 })
  })

  it('relative encoder → signed clicks (two\'s complement)', () => {
    const m = new Fm1ControlMapper(() => [{ control: 'enc:0', type: 'cc', channel: 0, number: 21, mode: 'rel' }])
    expect(m.handle(cc(0, 21, 1))).toEqual({ kind: 'enc', index: 0, clicks: 1 })
    expect(m.handle(cc(0, 21, 127))).toEqual({ kind: 'enc', index: 0, clicks: -1 })
    expect(m.handle(cc(0, 21, 0))).toBeNull()
  })

  it('CC → MASTER scaled to 0..1023', () => {
    const m = new Fm1ControlMapper(() => [{ control: 'pot', type: 'cc', channel: 0, number: 7 }])
    expect(m.handle(cc(0, 7, 127))).toEqual({ kind: 'pot', value: 1023 })
    expect(m.handle(cc(0, 7, 0))).toEqual({ kind: 'pot', value: 0 })
  })

  it('note / CC → button press and release', () => {
    const m = new Fm1ControlMapper(() => [
      { control: 'key:12', type: 'note', channel: 9, number: 36 },
      { control: 'key:13', type: 'cc', channel: 0, number: 64 },
    ])
    expect(m.handle(noteOn(9, 36))).toEqual({ kind: 'key', id: 12, down: true })
    expect(m.handle([0x89, 36, 0])).toEqual({ kind: 'key', id: 12, down: false })
    expect(m.handle(cc(0, 64, 127))).toEqual({ kind: 'key', id: 13, down: true })
    expect(m.handle(cc(0, 64, 0))).toEqual({ kind: 'key', id: 13, down: false })
  })

  it('encoders in fm1-emu panel order (panel.rs ENCS): PRESETS before ALGORITHM', () => {
    expect(FM1_CONTROLS.filter(c => c.target.kind === 'enc').map(c => c.label))
      .toEqual(['SELECT', 'PRESETS', 'ALGORITHM', 'K1', 'K2', 'K3', 'K4'])
  })

  it('relative encodings', () => {
    expect([relClicks('rel64', 65), relClicks('rel64', 63), relClicks('rel64', 67)]).toEqual([1, -1, 3])
    expect([relClicks('rel2c', 1), relClicks('rel2c', 127), relClicks('rel2c', 125)]).toEqual([1, -1, -3])
    expect([relClicks('relsm', 1), relClicks('relsm', 65), relClicks('relsm', 67)]).toEqual([1, -1, -3])
  })

  it('infers the relative encoding from the values', () => {
    expect(inferRelMode([65, 65, 63])).toBe('rel64')
    expect(inferRelMode([63, 63])).toBe('rel64')
    expect(inferRelMode([1, 1, 127])).toBe('rel2c')
    expect(inferRelMode([1, 65, 65])).toBe('relsm')
  })

  it('auto: an offset-64 encoder is detected on its first repeat and then turns freely', () => {
    const maps: Fm1Mapping[] = [{ control: 'enc:1', type: 'cc', channel: 0, number: 22, mode: 'auto', div: 2 }]
    const detected: string[] = []
    const m = new Fm1ControlMapper(() => maps, (control, mode) => { detected.push(mode); maps[0].mode = mode })
    m.handle(cc(0, 22, 65))
    expect(m.handle(cc(0, 22, 65))).toEqual({ kind: 'enc', index: 1, clicks: 1 })
    expect(detected).toEqual(['rel64'])
    expect(m.handle(cc(0, 22, 65))).toEqual({ kind: 'enc', index: 1, clicks: 1 })
    expect(m.handle(cc(0, 22, 63))).toEqual({ kind: 'enc', index: 1, clicks: -1 })
    expect(m.handle(cc(0, 22, 63))).toEqual({ kind: 'enc', index: 1, clicks: -1 })
  })

  it('auto: a knob (no repeats) stays absolute', () => {
    const maps: Fm1Mapping[] = [{ control: 'enc:3', type: 'cc', channel: 0, number: 20, mode: 'auto', div: 1 }]
    const m = new Fm1ControlMapper(() => maps, () => { throw new Error('should not detect') })
    m.handle(cc(0, 20, 10))
    expect(m.handle(cc(0, 20, 11))).toEqual({ kind: 'enc', index: 3, clicks: 1 })
    expect(m.handle(cc(0, 20, 14))).toEqual({ kind: 'enc', index: 3, clicks: 3 })
  })

  it('ignores unmapped messages', () => {
    const m = new Fm1ControlMapper(() => [])
    expect(m.handle(cc(0, 1, 1))).toBeNull()
  })
})
