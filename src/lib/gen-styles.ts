/**
 * gen-styles.ts — the styles shared by SY.CORE's generators: the Drum Machine, the Sequencer (its
 * lanes) and the Chord Prog's Generate all offer these names, so one style picked across the rig means
 * the same thing everywhere. The Sequencer adds its bassline styles (seq-gen/bass.ts) on top.
 */
export const GEN_STYLE_NAMES = [
  'House', 'Techno', 'HipHop', 'Trap', 'Acid', 'Funk', 'Jazz', 'Ambient', 'Drum&Bass', 'Minimal',
  'Latin', 'Industrial', 'Reggae', 'Pop', 'Rock', 'Electronic', 'EDM', 'Urban', 'Arpeggio', 'Berlin School',
] as const
export type GenStyleName = typeof GEN_STYLE_NAMES[number]

/** Old / other names of a style → its name here (e.g. a Drum Machine preset saved with 'Jungle/DnB'). */
export const GEN_STYLE_ALIASES: Record<string, GenStyleName> = {
  'Jungle/DnB': 'Drum&Bass', Jungle: 'Drum&Bass', DnB: 'Drum&Bass', 'D&B': 'Drum&Bass', 'Drum and Bass': 'Drum&Bass',
  'Hip Hop': 'HipHop', 'Hip-Hop': 'HipHop', 'R&B': 'Urban', RnB: 'Urban', 'Berlin': 'Berlin School',
}

/** A style name as given (any case, an alias) → its name here, or null. */
export function genStyleName(v: unknown): GenStyleName | null {
  if (typeof v !== 'string') return null
  if ((GEN_STYLE_NAMES as readonly string[]).includes(v)) return v as GenStyleName
  if (GEN_STYLE_ALIASES[v]) return GEN_STYLE_ALIASES[v]
  const key = v.toLowerCase().replace(/[^a-z]/g, '')
  const hit = GEN_STYLE_NAMES.find(n => n.toLowerCase().replace(/[^a-z]/g, '') === key)
    ?? Object.entries(GEN_STYLE_ALIASES).find(([a]) => a.toLowerCase().replace(/[^a-z]/g, '') === key)?.[1]
  return hit ?? null
}
