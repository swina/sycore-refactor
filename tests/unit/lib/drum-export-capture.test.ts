import { describe, it, expect } from 'vitest'
import { sliceCaptured } from '@/lib/drum-export-capture'

const block = (time: number, vals: number[], chans = 2) => ({ time, channels: Array.from({ length: chans }, () => Float32Array.from(vals)) })

describe('drum-export-capture sliceCaptured', () => {
  it('cuts exactly the window starting at the given context time', () => {
    // sampleRate 10: one sample per 0.1 s
    const blocks = [block(0, [0, 1, 2, 3, 4]), block(0.5, [5, 6, 7, 8, 9])]
    const out = sliceCaptured(blocks, 0.3, 0.4, 10)
    expect(Array.from(out[0])).toEqual([3, 4, 5, 6])
    expect(Array.from(out[1])).toEqual([3, 4, 5, 6])
  })
  it('leaves missing audio silent and copies mono to both channels', () => {
    const out = sliceCaptured([block(0.2, [1, 1], 1)], 0, 0.5, 10)
    expect(Array.from(out[0])).toEqual([0, 0, 1, 1, 0])
    expect(Array.from(out[1])).toEqual([0, 0, 1, 1, 0])
  })
  it('ignores blocks outside the window', () => {
    const out = sliceCaptured([block(-1, [9]), block(5, [9])], 0, 0.2, 10)
    expect(Array.from(out[0])).toEqual([0, 0])
  })
})
