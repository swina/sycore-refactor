import { describe, it, expect } from 'vitest'
import { bassLine, BASS_STYLES } from '@/lib/seq-gen/bass'

const MINOR = [0, 2, 3, 5, 7, 8, 10]
const PENTA = [0, 3, 5, 7, 10]
const seeded = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
const A2 = 45 // A, octave 2

describe('seq-gen bass lines', () => {
  it('every style: the pattern length, the root on the 1 (Offbeat: on the first "and"), in the key', () => {
    for (const style of BASS_STYLES) {
      for (const steps of [8, 16, 32]) {
        const line = bassLine({ style, steps, keyPc: 9, scale: MINOR, oct: 2, rng: seeded(7) })
        expect(line).toHaveLength(steps)
        const first = style === 'Offbeat' ? line[2] : line[0]
        expect(first.active).toBe(true)
        expect(first.note).toBe(A2)
        for (const s of line.filter(x => x.active)) expect(MINOR).toContain(((s.note - 9) % 12 + 12) % 12)
      }
    }
  })

  it('Root-5-Oct: only root, 5th and octave (and the low 5th)', () => {
    for (let k = 1; k < 20; k++) {
      const line = bassLine({ style: 'Root-5-Oct', steps: 16, keyPc: 9, scale: MINOR, oct: 2, rng: seeded(k) })
      for (const s of line.filter(x => x.active)) expect([A2, A2 + 7, A2 + 12, A2 - 5]).toContain(s.note)
    }
  })

  it('Offbeat: on the "and"s only, short', () => {
    const line = bassLine({ style: 'Offbeat', steps: 16, keyPc: 0, scale: MINOR, oct: 2, rng: seeded(3) })
    for (const i of [2, 6, 10, 14]) expect(line[i].active).toBe(true)
    for (const i of [0, 4, 8, 12]) expect(line[i].active).toBe(false)
    expect(line[2].gate).toBeLessThanOrEqual(45)
  })

  it('Walking: quarter notes, root on each bar\'s 1', () => {
    const line = bassLine({ style: 'Walking', steps: 32, keyPc: 9, scale: MINOR, oct: 2, rng: seeded(5) })
    line.forEach((s, i) => expect(s.active).toBe(i % 4 === 0))
    expect(line[0].note).toBe(A2)
    expect(line[16].note).toBe(A2)
  })

  it('Acid Slide: slides only into a note; downbeats always play; a pentatonic scale works', () => {
    for (let k = 1; k < 20; k++) {
      const line = bassLine({ style: 'Acid Slide', steps: 16, keyPc: 4, scale: PENTA, oct: 1, rng: seeded(k) })
      for (const i of [0, 4, 8, 12]) expect(line[i].active).toBe(true)
      line.forEach((s, i) => { if (s.tie) expect(line[(i + 1) % 16].active).toBe(true) })
      for (const s of line.filter(x => x.active)) expect(PENTA).toContain(((s.note - 4) % 12 + 12) % 12)
    }
  })
})
