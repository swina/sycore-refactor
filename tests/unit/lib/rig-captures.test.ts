import { describe, it, expect } from 'vitest'
import { buildClip, clipEventsAt, targetSlot, clipSummary, type RecordedNote } from '@/lib/rig-captures'

const n = (s: number, pitch: number, len = 2, velocity = 100, channel = 1): RecordedNote => ({ s, pitch, len, velocity, channel })

describe('rig captures: buildClip', () => {
  it('from the bar line of the first note, quantized to 1/16, stop rounded to a bar', () => {
    // first note on bar 3 (song sixteenth 32.3), stop just after bar 5's line
    const clip = buildClip([n(32.3, 60), n(35.6, 64), n(47.9, 67)], 64.4)!
    expect(clip.steps).toBe(32) // 2 bars
    expect(clip.notes.map(x => [x.step, x.pitch])).toEqual([[0, 60], [4, 64], [16, 67]])
  })
  it('a first note just ahead of the bar line belongs to that bar', () => {
    const clip = buildClip([n(15.4, 60)], 31.8)!
    expect(clip.steps).toBe(16)
    expect(clip.notes[0].step).toBe(0) // 15.4 − 16 → −0.6 → clamped to 0
  })
  it('stopped early: at least one bar; notes after the loop dropped', () => {
    expect(buildClip([n(3, 60)], 5)!.steps).toBe(16)
    const clip = buildClip([n(0, 60), n(20, 62)], 14)!
    expect(clip.notes.map(x => x.pitch)).toEqual([60])
  })
  it('the same pitch on a step from several channels: once, the loudest', () => {
    const clip = buildClip([n(0, 69, 2, 100, 4), n(0.1, 69, 2, 110, 5), n(0, 69, 2, 90, 6), n(0, 64, 2, 100, 4)], 16)!
    expect(clip.notes.map(x => [x.pitch, x.velocity])).toEqual([[64, 100], [69, 110]])
  })
  it('no notes: no clip', () => {
    expect(buildClip([], 16)).toBeNull()
  })
  it('events per step', () => {
    const clip = buildClip([n(0, 60), n(0.1, 64), n(4, 67)], 16)!
    expect(clipEventsAt(clip, 0).map(x => x.pitch)).toEqual([60, 64])
    expect(clipEventsAt(clip, 1)).toEqual([])
    expect(clipSummary(clip)).toBe('1 bar · 3 notes')
  })
})

describe('rig captures: target slot', () => {
  it('the slot picked, else the first empty, null when full', () => {
    const c = { steps: 16, notes: [] }
    expect(targetSlot([c, null, null], 2)).toBe(2)
    expect(targetSlot([c, null, null], null)).toBe(1)
    expect(targetSlot([c, c], null)).toBeNull()
  })
})
