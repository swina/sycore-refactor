import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { useDrumMachineStore, DRUM_STYLE_NAMES } from '@/stores/useDrumMachineStore'
import { DRUM_STYLE_LIST } from '@/types/drum-machine'

describe('drum machine styles', () => {
  beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()) })

  it('lists Ambient and Urban, sorted alphabetically, matching DRUM_STYLE_LIST', () => {
    expect(DRUM_STYLE_NAMES).toContain('Ambient')
    expect(DRUM_STYLE_NAMES).toContain('Urban')
    expect(DRUM_STYLE_NAMES).toEqual([...DRUM_STYLE_NAMES].sort((a, b) => a.localeCompare(b)))
    expect([...DRUM_STYLE_LIST].sort()).toEqual([...DRUM_STYLE_NAMES].sort())
  })

  it.each(['Ambient', 'Urban'])('%s generates an 8×16 pattern of valid steps', (style) => {
    const store = useDrumMachineStore()
    for (let i = 0; i < 20; i++) {
      const raw = store.generateDrumPatternRaw(style as any)!
      expect(raw).toHaveLength(8)
      raw.forEach(track => {
        expect(track).toHaveLength(16)
        track.forEach(s => {
          expect(s.velocity).toBeGreaterThanOrEqual(1)
          expect(s.velocity).toBeLessThanOrEqual(127)
          expect(s.ratchet).toBeGreaterThanOrEqual(1)
          expect(s.ratchet).toBeLessThanOrEqual(4)
        })
      })
    }
  })
})
