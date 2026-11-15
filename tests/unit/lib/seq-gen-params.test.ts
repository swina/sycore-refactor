import { describe, it, expect } from 'vitest'
import { paramValue } from '@/lib/seq-gen/params'

describe('seq-gen paramValue (P1 / P2)', () => {
  it('RND 0: the preset value as is', () => {
    expect(paramValue(80, 0, () => 0.9)).toBe(80)
  })
  it('positive: up toward 127, by at most that share of the way', () => {
    expect(paramValue(27, 50, () => 1)).toBe(77)   // 27 + 100 · 0.5
    expect(paramValue(27, 50, () => 0)).toBe(27)
    expect(paramValue(127, 100, () => 1)).toBe(127)
    expect(paramValue(0, 100, () => 0.5)).toBe(64) // a value at 0 can still vary
  })
  it('negative: down toward 0', () => {
    expect(paramValue(100, -50, () => 1)).toBe(50)
    expect(paramValue(0, -100, () => 1)).toBe(0)
  })
  it('always in 0–127, whatever comes in', () => {
    for (const b of [-20, 0, 64, 127, 300]) for (const v of [-200, -100, 0, 100, 200]) for (const r of [0, 0.5, 1]) {
      const x = paramValue(b, v, () => r)
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(127)
    }
  })
})
