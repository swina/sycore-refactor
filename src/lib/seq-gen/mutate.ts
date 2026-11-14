// GEN with Lock / Vary (plan: docs/plans/sequencer-generation.md, phase 4), after the Turing Machine:
// a new pattern is generated with the same rules, then only `amount` % of the positions take it, the
// rest keep the pattern as it was. Positions are counted within the motif block, so a change lands in
// every repeat of the motif and the repetition survives. 0 = nothing changes, 100 = all new.

export function mixSteps<T>(oldSteps: readonly T[], newSteps: readonly T[], amount: number, opts: { motifLen?: number; rng?: () => number } = {}): T[] {
  const a = Math.max(0, Math.min(100, Number(amount) || 0)) / 100
  if (a >= 1 || oldSteps.length !== newSteps.length) return newSteps.slice()
  if (a <= 0) return oldSteps.slice()
  const rng = opts.rng ?? Math.random
  const n = newSteps.length
  const block = opts.motifLen && opts.motifLen > 0 && opts.motifLen < n ? opts.motifLen : n
  const take = Array.from({ length: block }, () => rng() < a)
  // at least one position changes (a Vary of a few % on a short block could change nothing)
  if (!take.some(Boolean)) take[Math.floor(rng() * block)] = true
  return newSteps.map((st, i) => (take[i % block] ? st : oldSteps[i]))
}

/** A Vary amount from a MIDI value (0–127) → 0–100. */
export const varyFromMidi = (v: number) => Math.round(Math.max(0, Math.min(127, v)) / 127 * 100)

/** The Rig's Mutate (Shift + GEN): the Vary amount when it is partial, else a quarter. */
export const MUTATE_DEFAULT = 25
export const mutateAmount = (vary: number) => (vary > 0 && vary < 100 ? vary : MUTATE_DEFAULT)
