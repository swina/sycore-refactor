import { describe, it, expect } from 'vitest'
import { metricWeights, euclid, rotate, pickOnsets, euclidOnsets, randomOnsets, seededRng } from '@/lib/seq-gen/rhythm'

describe('metricWeights', () => {
  it('16 steps: 1 > half > beats > 8ths > 16ths', () => {
    expect(metricWeights(16)).toEqual([5, 1, 2, 1, 3, 1, 2, 1, 4, 1, 2, 1, 3, 1, 2, 1])
  })
  it('32 steps repeat the bar', () => {
    const w = metricWeights(32)
    expect(w[16]).toBe(5)
    expect(w.slice(16)).toEqual(w.slice(0, 16))
  })
})

describe('euclid', () => {
  it('E(3,8) tresillo, E(5,16), E(4,16) four on the floor', () => {
    expect(euclid(8, 3)).toEqual([1, 0, 0, 1, 0, 0, 1, 0])
    expect(euclid(16, 4)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])
    expect(euclid(16, 5).filter(Boolean)).toHaveLength(5)
  })
  it('edges: 0 pulses, all pulses', () => {
    expect(euclid(8, 0)).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    expect(euclid(4, 4)).toEqual([1, 1, 1, 1])
  })
  it('rotate', () => {
    expect(rotate([1, 0, 0, 1], 1)).toEqual([0, 0, 1, 1])
    expect(rotate([1, 0, 0, 1], -1)).toEqual([1, 1, 0, 0])
    expect([...euclidOnsets(8, 3, 1)]).toEqual([2, 5, 7])
  })
})

describe('pickOnsets (weighted)', () => {
  it('exactly count steps, all different', () => {
    for (let seed = 1; seed < 30; seed++) expect(pickOnsets(16, 7, { rng: seededRng(seed) }).size).toBe(7)
  })
  it('the 1 is always there at Density ≥ 25 % with Sync under 50', () => {
    for (let seed = 1; seed < 50; seed++) expect(pickOnsets(16, 4, { sync: 30, rng: seededRng(seed) }).has(0)).toBe(true)
  })
  it('Sync 0 at low density: the strong steps (beats) almost always', () => {
    let strong = 0, total = 0
    for (let seed = 1; seed < 200; seed++) {
      for (const i of pickOnsets(16, 4, { sync: 0, rng: seededRng(seed) })) { total++; if (i % 4 === 0) strong++ }
    }
    expect(strong / total).toBeGreaterThan(0.75)
  })
  it('Sync 100: the weak steps first', () => {
    let weak = 0, total = 0
    for (let seed = 1; seed < 200; seed++) {
      for (const i of pickOnsets(16, 4, { sync: 100, rng: seededRng(seed) })) { total++; if (i % 2 === 1) weak++ }
    }
    expect(weak / total).toBeGreaterThan(0.75)
  })
  it("the style's accents weigh more", () => {
    const grid = [false, false, true, false] // off-beat 8ths (Electronic-like)
    let onGrid = 0, total = 0
    for (let seed = 1; seed < 200; seed++) {
      for (const i of pickOnsets(16, 4, { sync: 0, styleGrid: grid, rng: seededRng(seed) })) { total++; if (i % 4 === 2) onGrid++ }
    }
    expect(onGrid / total).toBeGreaterThan(0.2)
  })
  it('0 and all', () => {
    expect(pickOnsets(16, 0).size).toBe(0)
    expect(pickOnsets(16, 16).size).toBe(16)
  })
})

describe('randomOnsets', () => {
  it('count steps (as before)', () => {
    expect(randomOnsets(16, 6, seededRng(3)).size).toBe(6)
  })
})
