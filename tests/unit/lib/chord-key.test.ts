import { describe, it, expect } from 'vitest'
import { keyRoot, keyFile, keyLabel, keyPhrase, generateMajor, MAJOR_PROGRESSIONS } from '@/lib/chord-key'

describe('chord-key', () => {
  it('maps a library pair and a mode to the tonic, and back', () => {
    expect(keyRoot(3, 'major')).toBe(3)   // Eb
    expect(keyRoot(3, 'minor')).toBe(0)   // Cm
    expect(keyRoot(3, null)).toBe(3)
    expect(keyRoot(13, 'minor')).toBeNull() // a genre library
    expect(keyFile(0, 'minor')).toBe(3)   // Cm → "Eb Major / C min"
    expect(keyFile(11, 'major')).toBe(11) // B
    expect(keyFile(-1 + 12, 'minor')).toBe(2) // Bm → "D Major / B min"
  })

  it('labels the key and phrases it for the AI', () => {
    expect(keyLabel(3, 'minor')).toBe('Cm')
    expect(keyLabel(10, 'major')).toBe('Bb')
    expect(keyLabel(3, null)).toBe('Eb/Cm')
    expect(keyLabel(14, 'major')).toBe('')
    expect(keyPhrase(3, 'minor')).toBe('C minor')
    expect(keyPhrase(3, null)).toBe('Eb major / C minor')
    expect(keyPhrase(13, 'major')).toBeNull()
  })

  it('generates a major progression in key: diatonic triads, voiced close, with a bass', () => {
    const rnd = () => 0 // template 0: I V vi IV
    expect(MAJOR_PROGRESSIONS[0]).toEqual([0, 4, 5, 3])
    const g = generateMajor(0, 8, rnd)
    expect(g.map(c => c.chordName)).toEqual(['C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F'])
    for (const c of g) {
      expect(c.notes).toHaveLength(4)
      const [a, b, d, bass] = c.notes
      expect(a).toBeGreaterThanOrEqual(55)
      expect(d).toBeLessThanOrEqual(80)
      expect(a < b && b < d).toBe(true)
      expect(bass).toBeGreaterThanOrEqual(36)
      expect(bass).toBeLessThanOrEqual(47)
    }
    const pcs = (n: number[]) => n.slice(0, 3).map(x => x % 12).sort((x, y) => x - y)
    expect(pcs(g[2].notes)).toEqual([0, 4, 9]) // Am
    expect(generateMajor(10, 4, () => 0.99).every(c => /^(Bb|Eb|F|Gm|Cm|Dm|Adim)/.test(c.chordName))).toBe(true)
  })
})
