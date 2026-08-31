// Shared ADSR envelope helper -- see
// docs/plans/Sycore-DSP-Integration-Feasibility.md, Phase 4.
//
// Xynchrony's own `Envelope` (`toAdsr()`, `Voice.ts`) is a 6-stage,
// hardware-byte-encoded shape (0-127 rate/level bytes converted through a
// curve) -- that doesn't apply here: sycore's pads already store
// attack/decay/release in plain seconds and sustain normalized 0-1
// (SamplerPad's existing fields; DrumTrack's new ones below match that
// convention exactly), so there's no byte-conversion layer to port. What's
// actually shared is the defensive NaN/undefined guarding (same reasoning
// as filterMath.ts's safeCutoffHz) applied to these already-plain values,
// and the DEFAULT_ADSR both engines construct a `Tone.AmplitudeEnvelope`
// from.

export interface AdsrParams {
  attack: number
  decay: number
  sustain: number
  release: number
}

// Matches SamplerPad's existing `defaultPad()` values (useSamplerStore.ts).
export const DEFAULT_ADSR: AdsrParams = { attack: 0.005, decay: 0, sustain: 1, release: 0.05 }

function safeSeconds(v: number | undefined, fallback: number): number {
  return Number.isFinite(v) && (v as number) >= 0 ? (v as number) : fallback
}

function safeNormalized(v: number | undefined, fallback: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v as number)) : fallback
}

/** A NaN/undefined value must never reach a `Tone.AmplitudeEnvelope`'s
 * attack/decay/sustain/release -- a bad upstream value (stale persisted
 * data, a lossy clone) should degrade to a safe default instead of
 * silently breaking playback. */
export function safeAdsr(env: Partial<AdsrParams>, defaults: AdsrParams = DEFAULT_ADSR): AdsrParams {
  return {
    attack: safeSeconds(env.attack, defaults.attack),
    decay: safeSeconds(env.decay, defaults.decay),
    sustain: safeNormalized(env.sustain, defaults.sustain),
    release: safeSeconds(env.release, defaults.release),
  }
}
