import { describe, it, expect } from 'vitest'
import { chordRootPc, degreeShift, transposeDiatonic } from '@/lib/seq-gen/harmony'

const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const MINOR = [0, 2, 3, 5, 7, 8, 10]
const C = 0, A = 9

describe('chordRootPc', () => {
  it('reads the root from the name', () => {
    expect(chordRootPc('Cm7')).toBe(0)
    expect(chordRootPc('F#')).toBe(6)
    expect(chordRootPc('Bbmaj7')).toBe(10)
    expect(chordRootPc('Dm')).toBe(2)
    expect(chordRootPc('Cb')).toBe(11)
  })
  it('a slash chord: the root, not the bass', () => {
    expect(chordRootPc('C/E')).toBe(0)
  })
  it('a custom chord name (G3G4): its first note', () => {
    expect(chordRootPc('G3G4')).toBe(7)
  })
  it('no name: the lowest note; nothing: null', () => {
    expect(chordRootPc('', [64, 60, 67])).toBe(0)
    expect(chordRootPc('—', [57])).toBe(9)
    expect(chordRootPc(undefined)).toBeNull()
  })
})

describe('degreeShift', () => {
  it('the tonic: none', () => {
    expect(degreeShift(C, C, MAJOR)).toBe(0)
    expect(degreeShift(A, A, MINOR)).toBe(0)
  })
  it('the nearest way: Dm, F, G up; Am, Bdim down (C major)', () => {
    expect(degreeShift(2, C, MAJOR)).toBe(1)
    expect(degreeShift(5, C, MAJOR)).toBe(3)
    expect(degreeShift(7, C, MAJOR)).toBe(-3)
    expect(degreeShift(9, C, MAJOR)).toBe(-2)
    expect(degreeShift(11, C, MAJOR)).toBe(-1)
  })
  it('a root outside the scale: the degree below', () => {
    expect(degreeShift(1, C, MAJOR)).toBe(0) // Db → C
  })
})

describe('transposeDiatonic', () => {
  const up = (notes: number[], shift: number, key = C, scale = MAJOR) => notes.map(n => transposeDiatonic(n, shift, key, scale))
  it('C major C-E-G over Dm → D-F-A (no F#, no C#)', () => {
    expect(up([60, 64, 67], 1)).toEqual([62, 65, 69])
  })
  it('down: C-E-G two degrees down → A-C-E', () => {
    expect(up([60, 64, 67], -2)).toEqual([57, 60, 64])
  })
  it('a line that starts on G stays on G over the tonic', () => {
    expect(up([67, 65, 64], 0)).toEqual([67, 65, 64])
  })
  it('crosses octaves both ways', () => {
    expect(transposeDiatonic(71, 1, C, MAJOR)).toBe(72) // B → C above
    expect(transposeDiatonic(60, -1, C, MAJOR)).toBe(59) // C → B below
  })
  it('stays in key every time (A minor, every shift)', () => {
    const inKey = new Set(MINOR.map(i => (A + i) % 12))
    for (let s = -6; s <= 6; s++) for (const n of [57, 59, 60, 62, 64, 65, 67, 69]) expect(inKey.has(transposeDiatonic(n, s, A, MINOR) % 12)).toBe(true)
  })
  it('a chromatic note keeps its distance from the degree below', () => {
    expect(transposeDiatonic(61, 1, C, MAJOR)).toBe(63) // C# over Dm → D#
  })
})
