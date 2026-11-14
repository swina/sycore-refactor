import { describe, it, expect } from 'vitest'
import { mixSteps, varyFromMidi, mutateAmount } from '@/lib/seq-gen/mutate'
import { seededRng } from '@/lib/seq-gen/rhythm'

const old16 = Array.from({ length: 16 }, (_, i) => `o${i}`)
const new16 = Array.from({ length: 16 }, (_, i) => `n${i}`)

describe('mixSteps', () => {
  it('0: unchanged; 100: all new; another length: all new', () => {
    expect(mixSteps(old16, new16, 0)).toEqual(old16)
    expect(mixSteps(old16, new16, 100)).toEqual(new16)
    expect(mixSteps(old16.slice(0, 8), new16, 30)).toEqual(new16)
  })
  it('about the amount of positions change', () => {
    let changed = 0
    for (let seed = 1; seed <= 200; seed++) changed += mixSteps(old16, new16, 25, { rng: seededRng(seed) }).filter(s => s.startsWith('n')).length
    expect(changed / (200 * 16)).toBeGreaterThan(0.2)
    expect(changed / (200 * 16)).toBeLessThan(0.32)
  })
  it('a change lands in every repeat of the motif', () => {
    for (let seed = 1; seed < 30; seed++) {
      const m = mixSteps(old16, new16, 40, { motifLen: 8, rng: seededRng(seed) })
      for (let i = 0; i < 8; i++) expect(m[i].startsWith('n')).toBe(m[i + 8].startsWith('n'))
    }
  })
  it('a small amount still changes something', () => {
    for (let seed = 1; seed < 30; seed++) expect(mixSteps(old16, new16, 1, { motifLen: 8, rng: seededRng(seed) }).some(s => s.startsWith('n'))).toBe(true)
  })
})

describe('helpers', () => {
  it('varyFromMidi, mutateAmount', () => {
    expect(varyFromMidi(0)).toBe(0)
    expect(varyFromMidi(127)).toBe(100)
    expect(mutateAmount(100)).toBe(25)
    expect(mutateAmount(40)).toBe(40)
    expect(mutateAmount(0)).toBe(25)
  })
})
