import { describe, it, expect } from 'vitest'
import { emptyNames, parseNames, withAuto, withCustom, labelOf } from '@/lib/slot-names'

describe('slot names', () => {
  it('label: name-letter, or the letter alone', () => {
    expect(labelOf('Verse', 0)).toBe('Verse-A')
    expect(labelOf('', 7)).toBe('H')
  })

  it('auto names never replace a custom one (unless forced: new content)', () => {
    const d = emptyNames()
    withAuto(d, 'drum', 1, 'House')
    expect(d.drum[1]).toEqual({ name: 'House', custom: false })
    withAuto(d, 'drum', 1, 'Techno')
    expect(d.drum[1]!.name).toBe('Techno')
    withCustom(d, 'drum', 1, 'Fill')
    withAuto(d, 'drum', 1, 'Breakbeat')
    expect(d.drum[1]).toEqual({ name: 'Fill', custom: true })
    withAuto(d, 'drum', 1, 'Chorus', true)
    expect(d.drum[1]).toEqual({ name: 'Chorus', custom: false })
    withCustom(d, 'drum', 1, '  ')
    expect(d.drum[1]).toBeNull()
  })

  it('names are trimmed to 16 characters; parse repairs bad data', () => {
    const d = emptyNames()
    withCustom(d, 'chord', 0, '  A very long section name  ')
    expect(d.chord[0]!.name).toBe('A very long sect')
    const p = parseNames({ chord: [{ name: 'Verse', custom: true }, 'junk', { name: '' }], drum: 'x' })
    expect(p.chord.slice(0, 3)).toEqual([{ name: 'Verse', custom: true }, null, null])
    expect(p.drum).toHaveLength(8)
    expect(p.seq.every(x => x === null)).toBe(true)
  })
})
