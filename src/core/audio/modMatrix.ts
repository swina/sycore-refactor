// Modulation Matrix -- ported from Xynchrony's `applyModMatrix`/
// `ModMatrixSlot` (see docs/plans/Sycore-DSP-Integration-Feasibility.md,
// Phase 5), but restructured for sycore's architecture rather than a
// verbatim port:
//
// - Xynchrony builds a fresh Tone.Filter/Tone.Gain/Tone.Panner/EffectChain
//   per VOICE (one per note-on, disposed when the voice ends), so one
//   `applyModMatrix()` call per voice construction naturally handles both
//   live (continuous) and one-time (resolved-at-note-on) sources together.
// - sycore's filter/padGain/panner/fxChain are shared, PERSISTENT per pad
//   (Phases 1-3) -- there's no per-voice node to build fresh each note. So
//   this file splits the two source kinds into two entry points instead:
//   `applyModMatrix()` rebuilds the LIVE cables (lfo1/lfo2 -> Tone.Scale ->
//   param), an editing-time operation like EffectChain.rebuild(), NOT
//   something to call on every trigger (that would click/glitch an
//   in-progress LFO sweep). `applyVelocityModulation()` is the one-time
//   source, called fresh on every trigger, nudging the pad's shared nodes
//   from their cached dial-in baseline (see ModMatrixTargets.baseValues) --
//   never from the node's live `.value`, which drifts once any modulation
//   has touched it.
//
// Known limitation, not fixed here: a destination with BOTH a live lfo1/2
// cable AND a velocity slot can double-count its baseline (once via the
// live cable's Tone.Scale range, once via applyVelocityModulation's direct
// write) -- unreachable in practice today since no UI exists yet to build
// such a routing, revisit if/when one does.
import * as Tone from 'tone'
import type { EffectChain } from './effects'
import type { ModMatrixSlot, ModDestination } from './types'

export interface ModMatrixTargets {
  filter: Tone.Filter
  padGain: Tone.Gain
  panner: Tone.Panner
  fxChain: EffectChain
  // Shared, app-wide LFO signals (useLfoStore.ts) -- undefined until that
  // store has actually started (see useLfoStore's lfo1Signal/lfo2Signal).
  // Bipolar -1..1, matching processLfo()'s raw waveform value.
  lfo1Signal: Tone.Signal<'audioRange'> | undefined
  lfo2Signal: Tone.Signal<'audioRange'> | undefined
  // This pad's true dialed-in values, independent of whatever a connected
  // Tone.Scale may have left the underlying Signal/Param at -- connecting a
  // Scale to a Tone.Param resets its own intrinsic value (Tone.js's
  // connectSignal(), not a plain additive Web Audio connection), so reading
  // `.value` back after any cable has connected would be unreliable. Each
  // engine keeps these in sync with its own setters (setPadFilter, etc.).
  baseValues: {
    filterFreq: number
    filterQ: number
    ampVolume: number
    ampPan: number
    wetDryMix: number // 0-100, matches FxChain.wetDry's own scale
  }
}

const FILTER_FREQ_MOD_RANGE_HZ = 4000 // +/- range a full-depth mod can sweep the cutoff
const FILTER_Q_MOD_RANGE = 20 // matches Xynchrony's own filterQ mod range
const AMP_VOLUME_MOD_RANGE = 1.0 // +/- linear gain a full-depth mod can add/subtract
const AMP_PAN_MOD_RANGE = 1.0 // +/- pan a full-depth mod can add/subtract (Panner clamps -1..1)

const warnedOnce = new Set<string>()
function warnUnhandled(source: string, destination: string) {
  const key = `${source}->${destination}`
  if (warnedOnce.has(key)) return
  warnedOnce.add(key)
  console.warn(`[modMatrix] unhandled routing "${key}" -- pad will play unmodulated for this slot`)
}

function resolveLfoSource(source: 'lfo1' | 'lfo2', targets: ModMatrixTargets): Tone.Signal<'audioRange'> | undefined {
  return source === 'lfo1' ? targets.lfo1Signal : targets.lfo2Signal
}

/** Rebuilds this pad's LIVE modulation cables (lfo1/lfo2 sources only --
 * velocity is one-time, see applyVelocityModulation() below). Tears down
 * and reconstructs Tone.Scale nodes -- an editing-time operation, not a
 * hot path, same as EffectChain.rebuild()/setPadFx(). Returns the new
 * disposables; caller disposes the previous batch before calling this
 * again (see each engine's setPadModMatrix()). */
export function applyModMatrix(slots: ModMatrixSlot[], targets: ModMatrixTargets): Array<{ dispose: () => void }> {
  const disposables: Array<{ dispose: () => void }> = []
  const basedDestinations = new Set<ModDestination>()

  // Only the FIRST cable to a given destination encodes its baseline into
  // the Scale's own range -- a second cable to the same destination would
  // otherwise double/triple-count it, since the destination Param already
  // sums every connected Scale's output on its own.
  function baseFor(destination: ModDestination): number {
    if (basedDestinations.has(destination)) return 0
    basedDestinations.add(destination)
    return targets.baseValues[destination]
  }

  for (const slot of slots) {
    if (slot.source === 'velocity') continue // one-time, not a live cable
    const depth = slot.amountPct / 100 // -1..1
    if (!Number.isFinite(depth)) { warnUnhandled(slot.source, slot.destination); continue }
    const sourceSignal = resolveLfoSource(slot.source, targets)
    if (!sourceSignal) { warnUnhandled(slot.source, slot.destination); continue }

    switch (slot.destination) {
      case 'filterFreq': {
        const base = baseFor('filterFreq')
        const scale = new Tone.Scale(base, base + depth * FILTER_FREQ_MOD_RANGE_HZ)
        sourceSignal.connect(scale)
        scale.connect(targets.filter.frequency)
        disposables.push(scale)
        break
      }
      case 'filterQ': {
        // Abs depth, always modulating upward from the real base Q -- same
        // deliberate direction as Xynchrony's own filterQ case, avoiding
        // the Q-near-zero self-silencing region.
        const base = baseFor('filterQ')
        const scale = new Tone.Scale(base, base + Math.abs(depth) * FILTER_Q_MOD_RANGE)
        sourceSignal.connect(scale)
        scale.connect(targets.filter.Q)
        disposables.push(scale)
        break
      }
      case 'ampVolume': {
        const base = baseFor('ampVolume')
        const scale = new Tone.Scale(base, base + depth * AMP_VOLUME_MOD_RANGE)
        sourceSignal.connect(scale)
        scale.connect(targets.padGain.gain)
        disposables.push(scale)
        break
      }
      case 'ampPan': {
        const base = baseFor('ampPan')
        const scale = new Tone.Scale(base, base + depth * AMP_PAN_MOD_RANGE)
        sourceSignal.connect(scale)
        scale.connect(targets.panner.pan)
        disposables.push(scale)
        break
      }
      case 'wetDryMix': {
        // wetDryFade is 0-1 (normalRange), unlike baseValues.wetDryMix's
        // 0-100 FxChain.wetDry scale -- convert once here.
        const base = baseFor('wetDryMix') / 100
        const scale = new Tone.Scale(base, base + depth)
        sourceSignal.connect(scale)
        scale.connect(targets.fxChain.wetDryFade)
        disposables.push(scale)
        break
      }
      default:
        warnUnhandled(slot.source, slot.destination)
    }
  }

  return disposables
}

/** Velocity is resolved once at note-on, not a live signal -- applied as a
 * one-time additive nudge from this pad's cached dial-in baseline
 * (targets.baseValues), called fresh on every trigger. Multiple velocity
 * slots to the same destination sum before writing once, matching how
 * multiple live routings to one destination already combine (Web Audio
 * auto-sums multiple `.connect()`s onto one AudioParam).
 *
 * Because sycore's filter/padGain/panner/fxChain are shared per-pad (not
 * per-voice like Xynchrony's), this nudges the SHARED node -- overlapping/
 * rapid triggers on the same pad (a ratchet, a fast poly roll) contend for
 * it, last-trigger-wins, unlike Xynchrony's true per-voice isolation.
 *
 * `time` is the Web Audio/Tone.js time this trigger is scheduled at (both
 * engines support scheduling ahead via a `time`/`fireAt` argument, e.g. the
 * step sequencer's lookahead) -- `setValueAtTime` is used instead of a
 * plain `.value =` write so a future-scheduled trigger's modulation lands
 * at the right instant instead of immediately. */
export function applyVelocityModulation(slots: ModMatrixSlot[], velocity01: number, targets: ModMatrixTargets, time: number): void {
  const deltas: Partial<Record<ModDestination, number>> = {}
  for (const slot of slots) {
    if (slot.source !== 'velocity') continue
    const depth = slot.amountPct / 100
    if (!Number.isFinite(depth)) { warnUnhandled(slot.source, slot.destination); continue }
    switch (slot.destination) {
      case 'filterFreq': deltas.filterFreq = (deltas.filterFreq ?? 0) + depth * velocity01 * FILTER_FREQ_MOD_RANGE_HZ; break
      case 'filterQ': deltas.filterQ = (deltas.filterQ ?? 0) + Math.abs(depth) * velocity01 * FILTER_Q_MOD_RANGE; break
      case 'ampVolume': deltas.ampVolume = (deltas.ampVolume ?? 0) + depth * velocity01 * AMP_VOLUME_MOD_RANGE; break
      case 'ampPan': deltas.ampPan = (deltas.ampPan ?? 0) + depth * velocity01 * AMP_PAN_MOD_RANGE; break
      case 'wetDryMix': deltas.wetDryMix = (deltas.wetDryMix ?? 0) + depth * velocity01 * 100; break
      default: warnUnhandled(slot.source, slot.destination)
    }
  }
  if (deltas.filterFreq !== undefined) {
    const v = Math.max(20, Math.min(20000, targets.baseValues.filterFreq + deltas.filterFreq))
    targets.filter.frequency.setValueAtTime(v, time)
  }
  if (deltas.filterQ !== undefined) {
    const v = Math.max(0.707, targets.baseValues.filterQ + deltas.filterQ)
    targets.filter.Q.setValueAtTime(v, time)
  }
  if (deltas.ampVolume !== undefined) {
    const v = Math.max(0, targets.baseValues.ampVolume + deltas.ampVolume)
    targets.padGain.gain.setValueAtTime(v, time)
  }
  if (deltas.ampPan !== undefined) {
    const v = Math.max(-1, Math.min(1, targets.baseValues.ampPan + deltas.ampPan))
    targets.panner.pan.setValueAtTime(v, time)
  }
  if (deltas.wetDryMix !== undefined) {
    const v = Math.min(1, Math.max(0, (targets.baseValues.wetDryMix + deltas.wetDryMix) / 100))
    targets.fxChain.wetDryFade.setValueAtTime(v, time)
  }
}
