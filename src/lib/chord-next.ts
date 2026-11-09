/**
 * chord-next.ts — the chord after the one sounding, in a Chord Prog sequence (a slot, or a chain
 * flattened): the next active step with notes. Rests (inactive or empty steps) are skipped.
 * `wraps`: it is past the end, so the sequence restarts first (where a queued slot takes over).
 */
export interface ChordStepLike { active?: boolean; notes?: number[]; chordName?: string; duration?: string }

export const isChord = (st: ChordStepLike | null | undefined): boolean => !!st?.active && (st.notes?.length ?? 0) > 0

export function chordAfter<T extends ChordStepLike>(steps: T[], numSteps: number, pointer: number, loop = true): { step: T; wraps: boolean } | null {
  const n = Math.min(numSteps, steps.length)
  for (let i = 1; i <= n; i++) {
    const idx = pointer + i
    if (idx >= n && !loop) return null
    const st = steps[idx % n]
    if (isChord(st)) return { step: st, wraps: idx >= n }
  }
  return null
}

/** The first chord of a sequence (a queued slot's). */
export function firstChord<T extends ChordStepLike>(steps: T[], numSteps: number): T | null {
  const n = Math.min(numSteps, steps.length)
  for (let i = 0; i < n; i++) if (isChord(steps[i])) return steps[i]
  return null
}

/** What the SY.CORE Rig device shows: the chord sounding and the next one, with their durations
 *  as labels ('1/1', '1/4'…). Past the end, a queued slot's first chord is next. null: no chord. */
export interface RigChord { now: string; dur: string; next: string; nextDur: string }
export function rigChord(
  now: { name: string; duration: string },
  next: { name: string; duration: string; wraps: boolean } | null,
  queued: { steps: ChordStepLike[]; numSteps: number } | null,
  labels: Record<string, string>,
): RigChord | null {
  const after = next?.wraps && queued ? firstChord(queued.steps, queued.numSteps) : null
  const nx = after ? { name: after.chordName ?? '', duration: after.duration ?? '' } : next
  if (!now.name && !nx) return null
  const label = (d: string) => labels[d] ?? d
  return { now: now.name, dur: now.name ? label(now.duration) : '', next: nx?.name ?? '', nextDur: nx ? label(nx.duration) : '' }
}
