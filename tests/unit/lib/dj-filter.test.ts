import { describe, it, expect } from 'vitest'
import { djCutoff, DJ_FILTER_OPEN, DJ_FILTER_FLOOR, DJ_FILTER_SWEEP_MS } from '@/lib/dj-filter'

describe('djCutoff', () => {
  it('starts open and closes to the floor over the sweep', () => {
    expect(djCutoff(0)).toBe(DJ_FILTER_OPEN)
    expect(djCutoff(DJ_FILTER_SWEEP_MS)).toBe(DJ_FILTER_FLOOR)
    expect(djCutoff(DJ_FILTER_SWEEP_MS * 3)).toBe(DJ_FILTER_FLOOR)
    expect(djCutoff(-5)).toBe(DJ_FILTER_OPEN)
  })
  it('goes down steadily, faster at first', () => {
    const a = djCutoff(DJ_FILTER_SWEEP_MS / 4), b = djCutoff(DJ_FILTER_SWEEP_MS / 2)
    expect(a).toBeLessThan(DJ_FILTER_OPEN)
    expect(b).toBeLessThan(a)
    expect(DJ_FILTER_OPEN - a).toBeGreaterThan(a - b)
  })
})

describe('djFilterCc', () => {
  it('keeps a CC 0–127, else the default 21', async () => {
    const { djFilterCc, DJ_FILTER_CC } = await import('@/lib/dj-filter')
    expect(DJ_FILTER_CC).toBe(21)
    expect(djFilterCc(74)).toBe(74)
    expect(djFilterCc('0')).toBe(0)
    expect(djFilterCc(128)).toBe(21)
    expect(djFilterCc('x')).toBe(21)
    expect(djFilterCc(undefined)).toBe(21)
  })
})
