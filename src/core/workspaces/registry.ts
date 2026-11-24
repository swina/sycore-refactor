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
  /** With Ableton Live configured in MIDI Flow ("Live (M4L)"): more panels, and the tiles then.
   *  needsLink: only while SY.CORE Link is on and connected. */
  withLive?: { panels: string[]; tiles: Record<string, TileRect>; needsLink?: boolean }
  /** Panels it leaves open (floating, not tiled): e.g. the Audio Mixer opened from Rig Controls. */
  floating?: string[]
  /** No backdrop blur and no CSS transitions (blinking / pulsing animations stay). */
  lowEffects?: boolean
  /** The players show what plays (their settings folded away; EDIT opens them). */
  playViews?: boolean
  /** One tile shared by several panels, one shown at a time (Sound Design: the device's editor) — the one
   *  shown is remembered; `default` the first time. */
  slot?: { tile: TileRect; panels: string[]; default: string }
}

export const WORKSPACES: WorkspaceManifest[] = [
  { id: 'classic', label: 'Classic', panels: null },
  {
    // (the Performance workspace before the four contexts) composing / trying parts: the players, the
    // Rig's controls, the Rig
    id: 'studio',
    label: 'Studio',
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
  {
    // Four contexts, Arrange: the song built — the Session Browser alone, full screen, in EDIT (sections, lanes,
    // clips, its Slots pane, Save presets, Preview). The engines play on behind it.
    id: 'arrange',
    label: 'Arrange',
    panels: ['session-browser'],
    tiles: { 'session-browser': { x: 0, y: 0, w: 1, h: 1 } },
    lowEffects: true,
  },
  {
    // Four contexts C1: the stage — the song (the Session Browser as in EDIT, without its Slots pane),
    // the Rig's controls with Play, the Rig (its Launchpad layout) and the Virtual Device (the presets,
    // changed on the fly); Rig Controls' Mixer opens the Audio Mixer floating over them. The players are not
    // shown (the song drives them; their views are in Studio). With SY.CORE Link connected: the Map.
    id: 'performance',
    label: 'Performance',
    panels: ['session-browser', 'rig-controls', 'rig-controller', 'virtual-device'],
    tiles: {
      'session-browser': { x: 0, y: 0, w: 0.6, h: 1 },
      'rig-controls':    { x: 0.6, y: 0, w: 0.13, h: 1 },
      'rig-controller':  { x: 0.73, y: 0, w: 0.27, h: 0.55 },
      'virtual-device':  { x: 0.73, y: 0.55, w: 0.27, h: 0.45 },
    },
    withLive: {
      panels: ['live-map'],
      needsLink: true,
      tiles: {
        'session-browser': { x: 0, y: 0, w: 0.6, h: 1 },
        'rig-controls':    { x: 0.6, y: 0, w: 0.13, h: 1 },
        'rig-controller':  { x: 0.73, y: 0, w: 0.27, h: 0.48 },
        'live-map':        { x: 0.73, y: 0.48, w: 0.27, h: 0.2 },
        'virtual-device':  { x: 0.73, y: 0.68, w: 0.27, h: 0.32 },
      },
    },
    floating: ['audio-mixer'],
    lowEffects: true,
    playViews: true,
  },
  {
    // Four contexts, Sound Design: the sound of each device — the sound devices cabled in MIDI Flow on the left
    // (lib/sound-design.ts), the device's editor in the middle (S-1: the Sound Engine, MicroFreak: its editor,
    // any other: the Virtual Device, large), Multi Sound (banks and presets) on the right. The Sound Folder,
    // the Program Change drawer, the Sampler and Freesound stay open when opened from here (floating).
    id: 'sound-design',
    label: 'Sound Design',
    panels: ['sound-devices', 'device-program-change'],
    tiles: {
      'sound-devices':         { x: 0, y: 0, w: 0.14, h: 1 },
      'device-program-change': { x: 0.64, y: 0, w: 0.36, h: 1 },
    },
    slot: { tile: { x: 0.14, y: 0, w: 0.5, h: 1 }, panels: ['sound-engine', 'microfreak-editor', 'virtual-device'], default: 'virtual-device' },
    floating: ['sound-folder-browser', 'program-change', 'sampler', 'freesound-browser'],
  },
  {
    // Four contexts, MIDI Flow (was "MIDI Orchestrator"): the setup, what goes where — MIDI Flow large on the
    // left (devices · canvas · apps), the projects and MIDI Flow setups on the right (loaded only with their Load
    // button). The MIDI devices, the Virtual Device, the Controller Designer, the MIDI Manager, Live Input, the
    // controller profiles, the FM-1 and the MIDI Monitor stay open when opened from here (floating).
    id: 'midi-flow',
    label: 'MIDI Flow',
    panels: ['midi-flow', 'projects-list'],
    tiles: {
      'midi-flow':     { x: 0, y: 0, w: 0.78, h: 1 },
      'projects-list': { x: 0.78, y: 0, w: 0.22, h: 1 },
    },
    floating: ['midi-devices', 'virtual-device', 'controller-designer', 'midi-manager', 'live-input', 'midi-performance', 'fm1-emulator', 'midi-monitor'],
  },
]

export const workspaceById = (id: string): WorkspaceManifest =>
  WORKSPACES.find(w => w.id === id) ?? WORKSPACES[0]

/** The panels a workspace shows and their tiles, with or without Live (M4L) set up (`linked`: SY.CORE
 *  Link on and connected, for a withLive that needs it). */
export function layoutOf(ws: WorkspaceManifest, live: boolean, opts: { linked?: boolean } = {}): { key: string; panels: string[]; tiles: Record<string, TileRect> } | null {
  if (!ws.panels) return null
  const withLive = live && ws.withLive && (!ws.withLive.needsLink || opts.linked)
  return withLive
    ? { key: `${ws.id}+live`, panels: [...ws.panels, ...ws.withLive!.panels], tiles: ws.withLive!.tiles }
    : { key: ws.id, panels: ws.panels, tiles: ws.tiles ?? {} }
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
  'session-browser': 'SYCORE_POS_SESSION_BROWSER',
  'virtual-device': 'SYCORE_POS_VIRTUAL_DEVICE',
  'sound-engine':   'SYCORE_POS_SOUND_ENGINE',
  'microfreak-editor': 'SYCORE_POS_MICROFREAK_EDITOR',
  'sound-devices':  'SYCORE_POS_SOUND_DEVICES',
  'device-program-change': 'SYCORE_POS_DEVICE_PC',
  'midi-flow':      'SYCORE_POS_MIDI_FLOW',
  'projects-list':  'SYCORE_POS_PROJECTS_LIST',
}

/** A tile in pixels: the free area is the window minus the footer, `gap` px between tiles. */
export function tileToPx(t: TileRect, area: { w: number; h: number }, gap = 4) {
  const x = Math.round(t.x * area.w + (t.x > 0 ? gap / 2 : 0))
  const y = Math.round(t.y * area.h + (t.y > 0 ? gap / 2 : 0))
  const right = Math.round((t.x + t.w) * area.w - (t.x + t.w < 1 ? gap / 2 : 0))
  const bottom = Math.round((t.y + t.h) * area.h - (t.y + t.h < 1 ? gap / 2 : 0))
  return { x, y, w: right - x, h: bottom - y }
}
