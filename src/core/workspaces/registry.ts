/**
 * Workspaces (Scenario Workspaces, Phases 3–5, tiled variant): a workspace opens the panels of a
 * scenario side by side — floating windows, tiled, without overlap — and closes the others. The
 * engines (core/engines/*) keep playing whatever is shown. 'classic' manages nothing (as before).
 */
export interface TileRect { x: number; y: number; w: number; h: number }

export interface WorkspaceManifest {
  id: string
  label: string
  /** Panel ids (uiStore PANEL_ID_REF_LOOKUP) opened by the workspace; null: no management. */
  panels: string[] | null
  /** Each panel's tile, as fractions of the free area (0–1). */
  tiles?: Record<string, TileRect>
  /** With Ableton Live configured in MIDI Flow ("Live (M4L)"): more panels, and the tiles then. */
  withLive?: { panels: string[]; tiles: Record<string, TileRect> }
  /** No backdrop blur and no CSS transitions (blinking / pulsing animations stay). */
  lowEffects?: boolean
  /** The players show what plays (their settings folded away; EDIT opens them). */
  playViews?: boolean
}

export const WORKSPACES: WorkspaceManifest[] = [
  { id: 'classic', label: 'Classic', panels: null },
  {
    id: 'performance',
    label: 'Performance',
    // Left: the players stacked (Drum, Chord Prog, Sequencer); middle: the Rig's controls, Now / Next
    // above Play; right: the Rig (its Launchpad layout), with Live the Map below it.
    panels: ['drum-machine', 'chord-prog', 'sequencer2', 'rig-controls', 'rig-controller'],
    tiles: {
      'drum-machine':   { x: 0, y: 0, w: 0.475, h: 0.525 },
      'chord-prog':     { x: 0, y: 0.525, w: 0.475, h: 0.21 },
      'sequencer2':     { x: 0, y: 0.735, w: 0.475, h: 0.265 },
      'rig-controls':   { x: 0.475, y: 0, w: 0.155, h: 1 },
      'rig-controller': { x: 0.63, y: 0, w: 0.37, h: 1 },
    },
    // + Map · Live Instruments under the Rig when Live (M4L) is set up in MIDI Flow
    withLive: {
      panels: ['live-map'],
      tiles: {
        'drum-machine':   { x: 0, y: 0, w: 0.475, h: 0.525 },
        'chord-prog':     { x: 0, y: 0.525, w: 0.475, h: 0.21 },
        'sequencer2':     { x: 0, y: 0.735, w: 0.475, h: 0.265 },
        'rig-controls':   { x: 0.475, y: 0, w: 0.155, h: 1 },
        'rig-controller': { x: 0.63, y: 0, w: 0.37, h: 0.73 },
        'live-map':       { x: 0.63, y: 0.73, w: 0.37, h: 0.27 },
      },
    },
    lowEffects: true,
    playViews: true,
  },
]

export const workspaceById = (id: string): WorkspaceManifest =>
  WORKSPACES.find(w => w.id === id) ?? WORKSPACES[0]

/** The panels a workspace shows and their tiles, with or without Live (M4L) set up. */
export function layoutOf(ws: WorkspaceManifest, live: boolean): { key: string; panels: string[]; tiles: Record<string, TileRect> } | null {
  if (!ws.panels) return null
  if (live && ws.withLive) return { key: `${ws.id}+live`, panels: [...ws.panels, ...ws.withLive.panels], tiles: ws.withLive.tiles }
  return { key: ws.id, panels: ws.panels, tiles: ws.tiles ?? {} }
}

/** The geometry storage key of each managed panel (its useDraggableResizable storageKey). */
export const PANEL_STORAGE_KEYS: Record<string, string> = {
  'rig-controller': 'SYCORE_POS_RIG_CONTROLLER',
  'chord-prog':     'SYCORE_POS_CHORD_PROG',
  'drum-machine':   'S1_DRUM_MACHINE_DR',
  'sequencer2':     'S1_SEQUENCER2_MODAL',
  'live-map':       'SYCORE_POS_LIVE_MAP',
  'rig-controls':   'SYCORE_POS_RIG_CONTROLS',
  'chord-now':      'SYCORE_POS_CHORD_NOW',
}

/** A tile in pixels: the free area is the window minus the footer, `gap` px between tiles. */
export function tileToPx(t: TileRect, area: { w: number; h: number }, gap = 4) {
  const x = Math.round(t.x * area.w + (t.x > 0 ? gap / 2 : 0))
  const y = Math.round(t.y * area.h + (t.y > 0 ? gap / 2 : 0))
  const right = Math.round((t.x + t.w) * area.w - (t.x + t.w < 1 ? gap / 2 : 0))
  const bottom = Math.round((t.y + t.h) * area.h - (t.y + t.h < 1 ? gap / 2 : 0))
  return { x, y, w: right - x, h: bottom - y }
}
