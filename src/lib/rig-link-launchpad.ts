// The Rig Controller's Launchpad layout for the SY.CORE Rig device in Live (through SY.CORE Link):
// the device draws exactly what the panel / the Launchpad shows — top 8, pads 8×8, side 8, each with
// its short label and LED colour — and sends back each press and release as `lp_<kind>_<i>_<down|up>`.

/** The LED colours of the Rig's Launchpad view (RigControllerPanel's LED_CLASS keys). */
export const RIG_LP_COLORS = ['off', 'amber', 'amberFlash', 'green', 'red', 'redDim', 'redFlash'] as const
export type RigLpColor = typeof RIG_LP_COLORS[number]

export interface RigLpCell { label: string; color: RigLpColor }
export interface RigLpView { top: RigLpCell[]; pads: RigLpCell[]; side: RigLpCell[] }

const LABEL_MAX = 10
const cell = (c: { label?: unknown; color?: unknown } | undefined): RigLpCell => ({
  label: String(c?.label ?? '').trim().slice(0, LABEL_MAX),
  color: (RIG_LP_COLORS as readonly string[]).includes(c?.color as string) ? (c!.color as RigLpColor) : 'off',
})
const fixed = (arr: unknown, n: number) => Array.from({ length: n }, (_, i) => cell(Array.isArray(arr) ? arr[i] : undefined))

/** The view as sent: 8 top, 64 pads (row by row), 8 side; labels trimmed, unknown colours off. */
export function rigLinkLaunchpad(v: { top?: unknown; pads?: unknown; side?: unknown }): RigLpView {
  return { top: fixed(v.top, 8), pads: fixed(v.pads, 64), side: fixed(v.side, 8) }
}

export type RigLpPress =
  | { kind: 'pad'; row: number; col: number; down: boolean }
  | { kind: 'side' | 'top'; index: number; down: boolean }

/** A press from the device: `lp_pad_<0–63>_down`, `lp_side_<0–7>_up`, `lp_top_<0–7>_down`… */
export function parseRigLinkPress(name: unknown): RigLpPress | null {
  const m = /^lp_(pad|side|top)_(\d{1,2})_(down|up)$/.exec(String(name))
  if (!m) return null
  const i = Number(m[2]), down = m[3] === 'down'
  if (m[1] === 'pad') return i < 64 ? { kind: 'pad', row: Math.floor(i / 8), col: i % 8, down } : null
  return i < 8 ? { kind: m[1] as 'side' | 'top', index: i, down } : null
}
