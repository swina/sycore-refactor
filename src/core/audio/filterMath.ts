// Filter cutoff/resonance math -- ported from Xynchrony's
// `src/core/audio/Voice.ts` (`resonanceToQ`, `resonanceToShelfGainDb`,
// `safeCutoffHz`, `SHELF_PEAK_TYPES`; see
// docs/plans/Sycore-DSP-Integration-Feasibility.md, Phase 3).
//
// `resonance` throughout is a 0-127 byte, same MIDI-byte convention already
// used elsewhere in sycore (velocity, rootKey, minKey/maxKey, ...) rather
// than Xynchrony's own 0-127 "hardware dial byte" -- same numeric range,
// different justification, so the math ports over unchanged.

/** A NaN/undefined value must never reach a Tone.js AudioParam -- a single
 * NaN there corrupts that node's internal filter-coefficient/gain state,
 * which most browsers propagate as silence from that node onward. Every
 * conversion below goes through this first so a bad upstream value
 * degrades to a safe default instead of silently taking the pad out. */
function safeByte(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

export type FilterType =
  | 'lowpass' | 'highpass' | 'bandpass'
  | 'lowshelf' | 'highshelf' | 'notch' | 'allpass' | 'peaking'

// Q=0 is a degenerate value for the standard (RBJ cookbook) biquad filter
// formula that both browsers' native BiquadFilterNode and Tone.Filter use
// internally -- Q appears in a 1/(2*Q) term, so Q=0 produces NaN/unstable
// coefficients and silences the signal. Floor raised to 0.707 (the
// standard "flat"/Butterworth response for resonance=0), scaling up from
// there. Ceiling deliberately kept well short of "true" self-oscillation
// range (Q well above ~10-12 on a resonant lowpass/highpass rings hard at
// the cutoff frequency for almost any transient input, drowning out the
// actual sample in a pure tone).
export function resonanceToQ(resonance: number): number {
  const frac = Math.min(1, Math.max(0, safeByte(resonance) / 127))
  return 0.707 + frac * 8.3 // -> ~0.707..9
}

// lowshelf/highshelf/peaking are the only BiquadFilterNode types that use
// `gain` at all (WebAudio spec) -- Tone.Filter defaults it to 0dB, which is
// a literal no-op for those three types regardless of cutoff/Q. Reuses the
// same Resonance dial as a boost amount for these types -- 0 = no boost
// (matches Resonance's "neutral" meaning for every other type), up to
// +18dB at max.
export const SHELF_PEAK_TYPES = new Set<FilterType>(['lowshelf', 'highshelf', 'peaking'])

export function resonanceToShelfGainDb(resonance: number): number {
  const frac = Math.min(1, Math.max(0, safeByte(resonance) / 127))
  return frac * 18
}

// Cutoff is a raw Hz value (not a 0-127 byte), so it gets its own guard --
// same reasoning as safeByte() above, falling back to fully-open (silently
// inaudible, the safe direction to fail in) rather than passing NaN/an
// out-of-range value straight to a BiquadFilterNode.
export function safeCutoffHz(hz: number): number {
  return Number.isFinite(hz) ? Math.min(20000, Math.max(20, hz)) : 20000
}

/** The `gain` value to apply for a given type/resonance pair -- 0 for every
 * type except the shelf/peaking ones (WebAudio ignores `gain` for the rest
 * anyway, but this keeps callers from needing to know that). */
export function resonanceToGainDb(type: FilterType, resonance: number): number {
  return SHELF_PEAK_TYPES.has(type) ? resonanceToShelfGainDb(resonance) : 0
}
