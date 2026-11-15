/**
 * Play views (Performance workspace) and the Rig's Launchpad in them: one color scheme for slots
 * and pads — empty: dark; filled, not playing: dark amber; queued / armed: amber, blinking;
 * playing: full amber. No glow (lowEffects).
 */
export type SlotLook = 'empty' | 'filled' | 'queued' | 'playing'

export const SLOT_CLASS: Record<SlotLook, string> = {
  empty:   'bg-neutral-900 border-neutral-800 text-neutral-600',
  filled:  'bg-amber-950/60 border-amber-900/70 text-amber-200/70',
  queued:  'bg-amber-500 border-amber-300 text-black animate-pulse',
  playing: 'bg-amber-400 border-amber-200 text-black',
}

/** The Rig's Launchpad colors (lib/rig-controller LpColor) in the play view's scheme. */
export const PLAY_LED_CLASS: Record<string, string> = {
  off:        SLOT_CLASS.empty,
  amber:      SLOT_CLASS.filled,
  amberFlash: SLOT_CLASS.queued,
  green:      SLOT_CLASS.playing,
  red:        'bg-red-700 border-red-500 text-white',
  redDim:     'bg-red-950/70 border-red-900/80 text-red-300/80',
  redFlash:   'bg-red-600 border-red-400 text-white animate-pulse',
}

/** A slot's look from a rig-live snapshot ({ filled, playing, queued }). */
export function slotLook(snap: { filled: boolean[]; playing: number | null; queued: number | null }, i: number): SlotLook {
  if (snap.queued === i && snap.playing !== i) return 'queued'
  if (snap.playing === i) return 'playing'
  return snap.filled[i] ? 'filled' : 'empty'
}

/** A Sequencer step's velocity as its background (play view): low green, medium orange, high red. */
export type VelLevel = 'low' | 'mid' | 'high'
export const velLevel = (v: number): VelLevel => (v >= 105 ? 'high' : v >= 70 ? 'mid' : 'low')
export const VEL_CLASS: Record<VelLevel, string> = {
  low:  'bg-emerald-500/25 border-emerald-500/40 text-emerald-100',
  mid:  'bg-orange-500/30 border-orange-500/45 text-orange-100',
  high: 'bg-red-500/30 border-red-500/50 text-red-100',
}
