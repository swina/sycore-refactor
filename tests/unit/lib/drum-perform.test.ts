import { describe, it, expect, beforeEach, vi } from 'vitest'
import { applyDynamics, humanizeOffsets, drumPerform, reloadDrumPerform } from '@/lib/drum-perform'

describe('drum perform', () => {
  beforeEach(() => { localStorage.clear(); reloadDrumPerform() })

  it('Dyn: 100 as written, 0 all at 64, 200 spread (clamped 1–127)', () => {
    expect(applyDynamics(40, 100)).toBe(40)
    expect(applyDynamics(40, 0)).toBe(64)
    expect(applyDynamics(100, 0)).toBe(64)
    expect(applyDynamics(40, 200)).toBe(16)
    expect(applyDynamics(120, 200)).toBe(127)
    expect(applyDynamics(10, 200)).toBe(1)
  })

  it('Humanize: none at 0; at 100 up to ±8 ms and ±12', () => {
    expect(humanizeOffsets(0)).toEqual({ time: 0, velocity: 0 })
    expect(humanizeOffsets(100, () => 1)).toEqual({ time: 0.008, velocity: 12 })
    const lo = humanizeOffsets(100, () => 0)
    expect(lo.time).toBeCloseTo(-0.008)
    expect(lo.velocity).toBe(-12)
    expect(humanizeOffsets(50, () => 1).velocity).toBe(6)
  })

  it('defaults: 4 knobs (Cutoff 74 …), Dyn 100, Density 127, Humanize 0; saved and read back', async () => {
    expect(drumPerform.knobs.map(k => k.cc)).toEqual([74, 71, 75, 91])
    expect(drumPerform.dynamics).toBe(100)
    expect(drumPerform.density).toBe(127)
    drumPerform.knobs[0].cc = 20
    drumPerform.knobs[0].name = 'Filter'
    drumPerform.humanize = 30
    await new Promise(r => setTimeout(r, 0))
    drumPerform.humanize = 0
    reloadDrumPerform()
    expect(drumPerform.knobs[0]).toMatchObject({ cc: 20, name: 'Filter' })
    expect(drumPerform.humanize).toBe(30)
  })

  it('a bad stored value falls back', () => {
    localStorage.setItem('SYCORE_DRUM_PERFORM', JSON.stringify({ knobs: [{ cc: 999, name: '' }], dynamics: 'x', density: -5 }))
    reloadDrumPerform()
    expect(drumPerform.knobs[0]).toMatchObject({ cc: 127, name: 'Cutoff' })
    expect(drumPerform.dynamics).toBe(100)
    expect(drumPerform.density).toBe(0)
  })
})
