import { describe, it, expect } from 'vitest'
import { melodyLine, motifLength, repeatOnsets } from '@/lib/seq-gen/melody'
import { seededRng } from '@/lib/seq-gen/rhythm'

const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const MINOR = [0, 2, 3, 5, 7, 8, 10]
const all16 = new Set([0, 2, 3, 4, 6, 8, 10, 11, 12, 14])

// degree index of a note in C major (or A minor) from its pitch: for interval statistics
const degIdx = (n: number, key: number, scale: number[]) => {
  const rel = n - key, oct = Math.floor(rel / 12), pc = ((rel % 12) + 12) % 12
  return oct * scale.length + scale.indexOf(pc)
}

describe('motif helpers', () => {
  it('motif length: half a bar at 16, a bar from 32', () => {
    expect(motifLength(16)).toBe(8)
    expect(motifLength(32)).toBe(16)
    expect(motifLength(8)).toBe(8)
  })
  it('repeatOnsets', () => {
    expect([...repeatOnsets(new Set([0, 3]), 8, 16)].sort((a, b) => a - b)).toEqual([0, 3, 8, 11])
  })
})

describe('melodyLine', () => {
  it('every onset gets a note in the scale and the range', () => {
    for (let seed = 1; seed < 30; seed++) {
      const m = melodyLine({ steps: 16, onsets: all16, keyPc: 0, scale: MAJOR, octMin: 4, octMax: 5, motifLen: 8, rng: seededRng(seed) })
      expect([...m.keys()].sort((a, b) => a - b)).toEqual([...all16].sort((a, b) => a - b))
      for (const n of m.values()) {
        expect(MAJOR).toContain(n % 12)
        expect(n).toBeGreaterThanOrEqual(60)
        expect(n).toBeLessThanOrEqual(84)
      }
    }
  })
  it('mostly steps: ≥ 60 % of the intervals within 2 degrees, none over an octave', () => {
    let small = 0, total = 0
    for (let seed = 1; seed < 60; seed++) {
      const m = melodyLine({ steps: 16, onsets: all16, keyPc: 0, scale: MAJOR, octMin: 4, octMax: 5, motifLen: 16, rng: seededRng(seed) })
      const notes = [...m.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1])
      for (let i = 1; i < notes.length; i++) {
        const d = Math.abs(degIdx(notes[i], 0, MAJOR) - degIdx(notes[i - 1], 0, MAJOR))
        expect(Math.abs(notes[i] - notes[i - 1])).toBeLessThanOrEqual(12)
        total++
        if (d <= 2) small++
      }
    }
    expect(small / total).toBeGreaterThan(0.6)
  })
  it('strong steps on the tonic triad most of the time; the phrase ends on the tonic', () => {
    let triad = 0, strong = 0, endsOnTonic = 0
    const runs = 80
    for (let seed = 1; seed <= runs; seed++) {
      const m = melodyLine({ steps: 16, onsets: all16, keyPc: 9, scale: MINOR, octMin: 4, octMax: 4, motifLen: 8, rng: seededRng(seed) })
      for (const st of [0, 4, 8, 12]) {
        const n = m.get(st)
        if (n === undefined) continue
        strong++
        if ([9, 0, 4].includes(n % 12)) triad++ // A C E
      }
      if (m.get(14)! % 12 === 9) endsOnTonic++
    }
    expect(triad / strong).toBeGreaterThan(0.7)
    expect(endsOnTonic / runs).toBeGreaterThan(0.6)
  })
  it('motif: the second block repeats the first, but for its last notes', () => {
    const m = melodyLine({ steps: 16, onsets: all16, keyPc: 0, scale: MAJOR, octMin: 4, octMax: 5, motifLen: 8, rng: seededRng(7) })
    // block A: 0 2 3 4 6 · block B: 8 10 11 12 14 — the first three of B copy A
    expect(m.get(8)).toBe(m.get(0))
    expect(m.get(10)).toBe(m.get(2))
    expect(m.get(11)).toBe(m.get(3))
  })
  it('a bass range (top octave ≤ 3) sits on the root more', () => {
    let roots = 0, total = 0
    for (let seed = 1; seed < 60; seed++) {
      const m = melodyLine({ steps: 16, onsets: all16, keyPc: 0, scale: MAJOR, octMin: 2, octMax: 3, motifLen: 8, rng: seededRng(seed) })
      for (const n of m.values()) { total++; if (n % 12 === 0) roots++ }
    }
    expect(roots / total).toBeGreaterThan(0.3)
  })
})
