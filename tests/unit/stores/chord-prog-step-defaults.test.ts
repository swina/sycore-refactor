import { describe, it, expect } from 'vitest'
import { DEFAULT_CHORD_STEP } from '@/stores/useChordProgStore'

// The store backfills every loaded/old ChordStep via `{ ...DEFAULT_CHORD_STEP, ...saved }`
// (useChordProgStore.ts lines 100, 147, 371, etc.) — this is the actual
// migration mechanism for old saved progressions, so testing that spread
// directly against DEFAULT_CHORD_STEP is what proves new fields are free to add.
describe('DEFAULT_CHORD_STEP backfill for old saved steps (per-step mode fields)', () => {
  it('a step saved before chordMode/arpMode existed backfills to unset chordMode + "up" arpMode', () => {
    const oldSavedStep = {
      active: true,
      chordName: 'Cmaj7',
      notes: [60, 64, 67, 71],
      velocity: 100,
      duration: '4n',
      gate: 80,
      transpose: 0,
      // no chordMode/arpMode — this is what a pre-feature save looks like
    }

    const merged = { ...DEFAULT_CHORD_STEP, ...oldSavedStep }

    expect(merged.chordMode).toBeUndefined()   // unset = simultaneous, today's behavior preserved
    expect(merged.arpMode).toBe('up')          // matches today's hardcoded ascending-only arp behavior
    expect(merged.active).toBe(true)           // saved fields still win over defaults
    expect(merged.notes).toEqual([60, 64, 67, 71])
  })

  it('an explicitly-set chordMode/arpMode on a saved step is preserved, not overwritten by the default', () => {
    const savedStep = { ...DEFAULT_CHORD_STEP, chordMode: 'down-up' as const, arpMode: 'random' as const }
    const merged = { ...DEFAULT_CHORD_STEP, ...savedStep }
    expect(merged.chordMode).toBe('down-up')
    expect(merged.arpMode).toBe('random')
  })

  it('a brand-new default step has unset chordMode and "up" arpMode', () => {
    expect(DEFAULT_CHORD_STEP.chordMode).toBeUndefined()
    expect(DEFAULT_CHORD_STEP.arpMode).toBe('up')
  })

  it('a step saved before per-step stepMode existed backfills to unset (inherit the slot\'s global playMode)', () => {
    const oldSavedStep = { active: true, chordName: 'Cmaj7', notes: [60, 64, 67], velocity: 100, duration: '4n', gate: 80, transpose: 0 }
    const merged = { ...DEFAULT_CHORD_STEP, ...oldSavedStep }
    expect(merged.stepMode).toBeUndefined()
  })

  it('an explicitly-set stepMode override is preserved', () => {
    const savedStep = { ...DEFAULT_CHORD_STEP, stepMode: 'arp' as const }
    const merged = { ...DEFAULT_CHORD_STEP, ...savedStep }
    expect(merged.stepMode).toBe('arp')
  })
})
