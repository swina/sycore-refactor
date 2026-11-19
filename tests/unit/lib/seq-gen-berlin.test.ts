import { describe, it, expect } from 'vitest'
import { berlinLine, BERLIN_CELLS, degreeNote, sweepShape } from '@/lib/seq-gen/berlin'

const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const PENTA = [0, 3, 5, 7, 10]
const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length] }

describe('Berlin School line', () => {
  it('every step plays, the first cell repeated; the pedal on the root', () => {
    const line = berlinLine({ steps: 16, keyPc: 0, scale: MAJOR, octMin: 2, rng: seq(0) })
    expect(line).toHaveLength(16)
    // cell 0: [0, 7, 0, 4, 0, 9, 0, 4] in C major from C2 (36)
    expect(line.slice(0, 8).map(s => s.note)).toEqual([36, 48, 36, 43, 36, 52, 36, 43])
    expect(line.slice(8).map(s => s.note)).toEqual(line.slice(0, 8).map(s => s.note))
    expect(line[0].pedal).toBe(true)
    expect(line[1].pedal).toBe(false)
  })

  it('a 3-step cell over 16 steps: its start moves against the bar', () => {
    const idx = BERLIN_CELLS.findIndex(c => c.length === 3)
    const line = berlinLine({ steps: 16, keyPc: 0, scale: MAJOR, octMin: 3, rng: seq((idx + 0.5) / BERLIN_CELLS.length) })
    const starts = line.map((s, i) => (s.cellStart ? i : -1)).filter(i => i >= 0)
    expect(starts).toEqual([0, 3, 6, 9, 12, 15])
  })

  it('stays in the scale with a pentatonic key, octave kept as the octave', () => {
    const line = berlinLine({ steps: 16, keyPc: 9, scale: PENTA, octMin: 2, rng: seq(0) })
    for (const s of line) expect(PENTA).toContain(((s.note - 9) % 12 + 12) % 12)
    expect(line[1].note - line[0].note).toBe(12)
  })

  it('degreeNote passes the octave', () => {
    expect(degreeNote(9, 0, MAJOR, 3)).toBe(48 + 12 + 4)
  })

  it('P1 sweep: a triangle over the pattern, 0 → 1 → 0', () => {
    expect([0, 4, 8, 12].map(i => sweepShape(i, 16))).toEqual([0, 0.5, 1, 0.5])
    expect(sweepShape(0, 1)).toBe(0)
  })
})
