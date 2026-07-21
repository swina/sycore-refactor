import type { ChordStrumMode } from '@/stores/useChordProgStore'

/**
 * Order a chord step's notes for a strummed playback pass.
 *
 * 'up-down'/'down-up' deliberately repeat the peak/trough note once,
 * matching the arp engine's own "Ableton ripete la prima e l'ultima nota"
 * up-down convention (see src/lib/arp-patterns.ts) — this is a one-shot
 * strum across a single step, not a continuously cycling arp, so unlike an
 * arp's up-down it isn't trying to avoid double-hitting the endpoints.
 */
export function orderChordStrumNotes(notes: number[], chordMode: ChordStrumMode): number[] {
  const ascending = [...notes].sort((a, b) => a - b)
  if (chordMode === 'up') return ascending
  if (chordMode === 'down') return [...ascending].reverse()
  if (chordMode === 'up-down') return [...ascending, ...[...ascending].reverse()]
  if (chordMode === 'down-up') return [...[...ascending].reverse(), ...ascending]
  return ascending
}
