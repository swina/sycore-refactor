/**
 * theme-apply.ts — a theme's extracted patterns (lib/theme-extract.ts) written into the apps, each
 * journaled as a Session take (the slot / bank it replaces can be restored).
 *   chords → the Chord Prog's active slot (up to 16 steps)
 *   melody → the Sequencer's banks from the active one (a bar each, up to the last bank); with more
 *            than one bar, the chain is set to them (Chain itself left as it is)
 */
import { journaled } from '@/lib/session-takes'
import { useChordProgStore, DEFAULT_CHORD_STEP, type ChordStep } from '@/stores/useChordProgStore'
import { useStepSequencerStore, BANK_COUNT, CHAIN_COUNT } from '@/stores/useStepSequencerStore'
import { beatsToDuration, type ThemeChord, type SeqStepOut } from '@/lib/theme-extract'

export function applyThemeChords(chords: ThemeChord[]): { steps: number; dropped: number } {
  const cp = useChordProgStore()
  const use = chords.slice(0, 16)
  if (!use.length) return { steps: 0, dropped: 0 }
  journaled('chord', cp.activeSlotIndex, () => {
    use.forEach((c, i) => {
      cp.steps[i] = {
        ...DEFAULT_CHORD_STEP, chordName: c.name || 'Rest', notes: [...c.notes],
        active: !!c.name, duration: beatsToDuration(c.beats) as ChordStep['duration'],
      }
    })
    cp.numSteps = use.length
  }, { note: 'from the theme' })
  return { steps: use.length, dropped: chords.length - use.length }
}

export function applyThemeMelody(banks: SeqStepOut[][]): { banks: number[]; dropped: number } {
  const seq = useStepSequencerStore()
  const from = seq.activeBankIndex
  const use = banks.slice(0, BANK_COUNT - from)
  const written: number[] = []
  use.forEach((steps, k) => {
    const i = from + k
    journaled('seq', i, () => {
      seq.banks[i] = { ...seq.banks[i], steps: steps.map(s => ({ ...s })), numSteps: 16, basePatternLength: 16 }
      seq.banks = [...seq.banks]
    }, { note: 'melody from the theme' })
    written.push(i)
  })
  if (written.length > 1) seq.chain = Array.from({ length: CHAIN_COUNT }, (_, k) => written[k] ?? null)
  // the Sequencer plays its working copy of the active bank: reload it
  if (written.length) window.dispatchEvent(new CustomEvent('seq-banks-reloaded'))
  return { banks: written, dropped: banks.length - use.length }
}
