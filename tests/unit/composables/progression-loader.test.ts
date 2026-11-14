import { describe, it, expect } from 'vitest'
import { normalizeChord } from '@/composables/useProgressionLoader'

describe('progression loader: chord names', () => {
  it('names a key file chord from its notes (the file says "A" for A–C–E)', () => {
    expect(normalizeChord(['A', [81, 72, 76, 57]])).toEqual({ chordName: 'Am', notes: [81, 72, 76, 57] })
    expect(normalizeChord(['F#', [65, 69, 60, 41]])?.chordName).toBe('F')
    expect(normalizeChord(['C#', [60, 64, 67, 36]])?.chordName).toBe('C')
  })
  it("keeps the file's name when the notes are no known chord", () => {
    expect(normalizeChord(['B5', [59, 66]])?.chordName).toBe('B5')
  })
  it("custom files' display names unchanged", () => {
    expect(normalizeChord(['My chord', ['Minor', [57, 60, 64]]])?.chordName).toBe('My chord')
  })
})
