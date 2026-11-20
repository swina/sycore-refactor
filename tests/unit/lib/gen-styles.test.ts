import { describe, it, expect } from 'vitest'
import { GEN_STYLE_NAMES, genStyleName } from '@/lib/gen-styles'
import { parseDrumRow, EXTRA_DRUM_STYLES } from '@/lib/drum-styles-extra'
import { CHORD_GEN_STYLE_NAMES } from '@/lib/chord-gen-style'
import { STYLES, BASS_STYLES } from '@/core/engines/sequencer'
import { DRUM_STYLE_NAMES, drumStyleOf } from '@/stores/useDrumMachineStore'
import { DRUM_STYLE_LIST } from '@/types/drum-machine'

const sorted = (a: readonly string[]) => [...a].sort()

describe('the styles are aligned across the generators', () => {
  it('Drum Machine, Sequencer (without its basslines) and Chord Prog offer the same styles', () => {
    expect(sorted(DRUM_STYLE_NAMES)).toEqual(sorted(GEN_STYLE_NAMES))
    expect(sorted(DRUM_STYLE_LIST)).toEqual(sorted(GEN_STYLE_NAMES))
    expect(sorted(Object.keys(STYLES).filter(n => !(BASS_STYLES as readonly string[]).includes(n)))).toEqual(sorted(GEN_STYLE_NAMES))
    expect(sorted(CHORD_GEN_STYLE_NAMES)).toEqual(sorted(GEN_STYLE_NAMES))
  })
  it('old names map onto them', () => {
    expect(genStyleName('Jungle/DnB')).toBe('Drum&Bass')
    expect(genStyleName('hip hop')).toBe('HipHop')
    expect(genStyleName('berlin school')).toBe('Berlin School')
    expect(genStyleName('Polka')).toBeNull()
    expect(drumStyleOf('Jungle/DnB')).toBe('Drum&Bass')
    expect(drumStyleOf('nope')).toBe('House')
  })
})

describe('drum rows', () => {
  it('parse 16 cells', () => {
    expect(parseDrumRow('x...A...r...g..o')).toEqual([1, 0, 0, 0, 'A', 0, 0, 0, [1, 2], 0, 0, 0, 0.3, 0, 0, 0.6])
    expect(() => parseDrumRow('x...')).toThrow()
  })
  it('every new style has 3 variants of 8 tracks × 16 steps, a kick on the grid', () => {
    for (const [name, st] of Object.entries(EXTRA_DRUM_STYLES)) {
      expect(st.variants.length, name).toBe(3)
      for (const vr of st.variants) {
        expect(vr.length, name).toBe(8)
        expect(vr.every(r => r.length === 16), name).toBe(true)
        expect(vr[0].some(c => c !== 0), `${name} kick`).toBe(true)
      }
    }
  })
})
