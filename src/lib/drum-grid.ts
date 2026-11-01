// Drum grids as text — one character per 16th, see DRUM_GRID_CHARS (lib/song-plan.ts) — turned
// into Drum Machine steps (velocity / accent / ratchet / tie). Used by the AI Song Composer and the
// Drum Machine's own AI prompt. Pure: no stores.

import { DRUM_TRACK_LABELS, type DrumStep } from '@/types/drum-machine'
import { normalizeDrumGrid, drumLabelFor, SONG_GRID_STEPS, SONG_SWING_MAX } from './song-plan'

function emptyDrumStep(): DrumStep { return { active: false, velocity: 100, accent: false, ratchet: 1, tie: 0 } }

/**
 * A drum grid (song-plan DRUM_GRID_CHARS) as Drum Machine steps. The velocity comes from the cell
 * (accent / hit / soft / ghost) and the section's energy, shaped by where the hit falls (on the
 * beat a little louder, on the 16th in between softer) and varied a little, the same way every
 * time (`seed`), so plain 'x' grids don't play like a machine gun.
 */
export function drumGridToSteps(grid: string | undefined, energy: number, seed = 0): DrumStep[] {
  const base = 80 + energy * 8                            // 88..120
  const steps = Array.from({ length: SONG_GRID_STEPS }, () => emptyDrumStep())
  if (!grid) return steps
  let last = -1
  for (let i = 0; i < SONG_GRID_STEPS; i++) {
    const c = grid[i] ?? '.'
    if (c === '.') { last = -1; continue }
    if (c === '-') { if (last >= 0) steps[last].tie++; continue }
    const metric = i % 4 === 0 ? 6 : i % 2 === 0 ? 0 : -8
    const jitter = ((((seed + 1) * 7919 + i * 104729) % 9) - 4)   // -4..4, fixed per track / step
    let vel: number
    if (c === 'X') vel = base + 15
    else if (c === 'o') vel = base * 0.65 + metric / 2
    else if (c === 'g') vel = base * 0.38
    else vel = base + metric
    steps[i] = {
      ...emptyDrumStep(), active: true, accent: c === 'X',
      velocity: Math.round(Math.max(20, Math.min(127, vel + jitter))),
      ratchet: c === '2' || c === '3' || c === '4' ? Number(c) : 1,
    }
    last = i
  }
  return steps
}

// ── The Drum Machine's AI prompt ──────────────────────────────────────────

export const DRUM_AI_SYSTEM_PROMPT = [
  'You are a drummer and drum programmer. Write one bar of a drum pattern for a 16-step drum machine.',
  'Output ONLY one valid JSON object, no markdown fences, no text around it:',
  `{ track: 16-character grid, ..., "swing": 0-${SONG_SWING_MAX}, "Bassline": [16 MIDI notes 36-60, 0 = rest] }`,
  `Tracks among ${DRUM_TRACK_LABELS.map(l => `"${l}"`).join(', ')}; omit tracks that don't play.`,
  'Grid characters, one per 16th note: "X" accent, "x" hit, "o" soft hit, "g" ghost note, "2" / "3" / "4" ratchet (2-4 quick hits in that 16th, e.g. hi-hat rolls), "-" holds the previous hit one more 16th (open hats, cymbals), "." rest.',
  'Play it like a drummer, not a grid: accents where the style puts them, ghost notes on the snare in funk / hip hop / jazz, softer and louder hats (mix "x", "o", "g"), rolls where the style uses them; "swing" for shuffled styles (house, hip hop, funk, jazz often 10-40; straight techno / rock 0). "Bassline" is optional.',
].join('\n')

export interface AiDrumPattern {
  rows: Array<DrumStep[] | null>   // per track (DRUM_TRACK_LABELS order); null = not in the answer
  swing: number | null
  bassline: number[] | null        // 16 MIDI notes, 0 = rest
}

/**
 * An AI answer for the Drum Machine: { track: grid } with the characters above, or the older
 * arrays of 0 / 1 (1 = hit, 2 = accent); track names as the model writes them ("hihat", "bd"…).
 * null when there's no JSON object or no track at all.
 */
export function parseAiDrumPattern(raw: string, energy = 3): AiDrumPattern | null {
  const text = raw.replace(/```(?:json)?/gi, '')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  let obj: any
  try { obj = JSON.parse(text.slice(start, end + 1)) } catch { return null }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const rows: Array<DrumStep[] | null> = DRUM_TRACK_LABELS.map(() => null)
  let any = false
  for (const [name, v] of Object.entries(obj)) {
    const label = drumLabelFor(name)
    if (!label) continue
    const g = normalizeDrumGrid(Array.isArray(v) ? v.map(x => (typeof x === 'string' ? x : Number(x))) : v)
    if (!g) continue
    const ti = DRUM_TRACK_LABELS.indexOf(label)
    rows[ti] = drumGridToSteps(g.grid, energy, ti)
    any = true
  }
  if (!any) return null
  const sw = Number(obj.swing)
  const swing = Number.isFinite(sw) ? Math.round(Math.max(0, Math.min(SONG_SWING_MAX, sw > 0 && sw < 1 ? sw * SONG_SWING_MAX : sw))) : null
  const bl = Array.isArray(obj.Bassline ?? obj.bassline) ? (obj.Bassline ?? obj.bassline).slice(0, 16).map((n: any) => { const x = Number(n); return Number.isFinite(x) && x > 0 ? Math.round(x) : 0 }) : null
  return { rows, swing, bassline: bl && bl.some((n: number) => n > 0) ? bl : null }
}
