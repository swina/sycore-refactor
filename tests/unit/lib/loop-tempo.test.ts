import { describe, it, expect } from 'vitest'
import { bpmFromName, bpmCandidates, loopBpm, loopPlaybackRate } from '@/lib/loop-tempo'

describe('loop tempo', () => {
  it('reads an explicit tempo in the name', () => {
    expect(bpmFromName('Funk Groove 96bpm')).toBe(96)
    expect(bpmFromName('kick_128_BPM')).toBe(128)
    expect(bpmFromName('loop bpm120 dry')).toBe(120)
    expect(bpmFromName('Take 5 - 2024')).toBeNull()
  })

  it('lists the whole-bar tempos of a length', () => {
    expect(bpmCandidates(8).map(c => [c.bars, c.bpm])).toEqual([[2, 60], [4, 120]])
    expect(bpmCandidates(4).map(c => [c.bars, c.bpm])).toEqual([[1, 60], [2, 120]])
  })

  it('the name first, then the length agreeing with the detection, then the detection', () => {
    expect(loopBpm({ name: 'x 100bpm', duration: 8, detected: 140 })).toBe(100)
    expect(loopBpm({ duration: 7.68, detected: 123 })).toBe(125)          // 4 bars at 125, detected a bit off
    expect(loopBpm({ duration: 3.84, detected: 250 })).toBe(125)          // detected at double tempo (2 bars)
    expect(loopBpm({ duration: 7.3, detected: 97 })).toBe(97)             // the length disagrees: detected
    expect(loopBpm({ duration: 8 })).toBe(120)                            // nothing detected: the length
    expect(loopBpm({})).toBeNull()
  })

  it('the rate closest to ×1 by octaves', () => {
    expect(loopPlaybackRate(120, 100)).toBeCloseTo(1.2)
    expect(loopPlaybackRate(140, 70)).toBeCloseTo(1)
    expect(loopPlaybackRate(90, 174)).toBeCloseTo(180 / 174)
    expect(loopPlaybackRate(120, null)).toBe(1)
  })
})
