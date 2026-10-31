import { describe, it, expect, vi, afterEach } from 'vitest'
import { audioTimeToPerfMs } from '@/lib/audio-clock'

describe('audio clock → performance.now()', () => {
  afterEach(() => vi.restoreAllMocks())

  it('uses the output timestamp (output latency included)', () => {
    const ctx = { currentTime: 10, getOutputTimestamp: () => ({ contextTime: 9.95, performanceTime: 5000 }) } as any
    expect(audioTimeToPerfMs(10.2, ctx)).toBeCloseTo(5000 + 250)
  })

  it('falls back to currentTime ↔ now', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    const ctx = { currentTime: 3 } as any
    expect(audioTimeToPerfMs(3.1, ctx)).toBeCloseTo(1100)
    const zero = { currentTime: 3, getOutputTimestamp: () => ({ contextTime: 0, performanceTime: 0 }) } as any
    expect(audioTimeToPerfMs(3.1, zero)).toBeCloseTo(1100)
  })
})
