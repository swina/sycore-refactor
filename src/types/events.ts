/**
 * Typed event dispatch helpers for SY.CORE
 *
 * Provides a type-safe wrapper around the ~47 CustomEvent names
 * used across the app for component-to-component communication.
 */

// ---------------------------------------------------------------------------
// Event payload map
// ---------------------------------------------------------------------------

export interface SyCoreEventMap {
  // System
  'app-system-log': string;

  // Sequencer / Transport
  'toggle-sequencer': { play: boolean; source?: 'backing-track' | 'timeline' | 'loop-pads' };
  'toggle-backing-track': { play: boolean; restart?: boolean };
  'bpm-update': { bpm: number };
  'sequencer-action': { action: string; val: number };

  // Volume channels
  'playlist-volume': number;
  'tracks-player-volume': number;
  'lm-master-volume': number;
  'dm-master-volume': number;
  'sampler-master-volume': number;
  'liveperf-master-volume': number;

  // Drum Machine
  'dm-trigger-fill': void;
  'dm-generate': void;
  'dm-seq-switch': { seq: string };
  'dm-pad-trigger': { trackIdx: number; velocity: number };

  // Playlist / Tracks
  'playlist-mutate': { key: string; value: any };
  'playlist-play': { idx: number; playlist?: any; crossfade?: any; source?: string };
  'playlist-seek': number;
  'player-state-sync': { currentTime: number; duration: number };
  'playlist-add-from-capture': { tracks: any[] };
  'playlist-clear': void;
  'playlist-loop-toggle': void;
  'playlist-next': void;
  'playlist-prev': void;
  'playlist-play-stop': void;
  'player-state-request': void;

  // Audio Capture
  'capture-start-rec': { background?: boolean };
  'capture-stop-rec': void;
  'capture-rec-toggle': void;
  'capture-monitor-pre-arm': void;

  // MIDI / Controller
  'midi-main-menu': { action: 'toggle' | 'scroll' | 'select'; val: number };
  'device-pc-preset-navigate': { delta: number };
  'device-pc-open': { deviceName: string };

  // Timeline
  'timeline-lm-start': { padIdx: number; bpm: number };
  'timeline-lm-stop': void;
  'timeline-dm-start': { presetName: string; seqKey: string; chainEnabled: boolean; bpm: number };
  'timeline-dm-stop': void;
  'timeline-dm-rec-sync': { measures: number };
  'timeline-audio-trim-start': void;
  'timeline-audio-set-loop': { measures: number };
  'timeline-audio-crop': void;
  'timeline-audio-save-wav': { filename: string };
  'timeline-trigger-perf-set': { idx: number };
  'timeline-load-perf-set': { setId: string };
  'timeline-add-mkr-dm-rec-sync': void;
  'timeline-add-mkr-audio-trim-start': void;
  'timeline-add-mkr-audio-set-loop': void;
  'timeline-add-mkr-audio-crop': void;
  'timeline-add-mkr-audio-save-wav': void;

  // LiveSet / Performance pad
  'liveset-navigate': { dir: 'up' | 'down' };
  'liveset-select-pad': { idx: number };

  // Loop Machine
  'lm-state-changed': void;
  'loop-machine-assign': { padIdx: number; track: any };
  'loop-pad-assign': { padIdx: number; track: any };
  'lpp-set-assign': { setId: string; padIdx: number };

  // Sampler
  'sampler-pad-assign': { padIdx: number; track: any };

  // Freesound
  'freesound-add-to-playlist': { track: any };
  'freesound-send-to-capture': { track: any; target: string; padIdx?: number; options?: any };

  // Grid
  'grid-pad-press': number;
}

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

/** Extract the detail type for a given event name */
export type SyCoreEventDetail<K extends keyof SyCoreEventMap> = SyCoreEventMap[K];

/** Determine whether an event has a detail payload or is void */
type DetailOrVoid<K extends keyof SyCoreEventMap> =
  SyCoreEventMap[K] extends void ? undefined : SyCoreEventMap[K];

// ---------------------------------------------------------------------------
// Dispatch helper
// ---------------------------------------------------------------------------

/**
 * Type-safe dispatch of a SY.CORE custom event.
 *
 * Usage:
 * ```ts
 * dispatch('toggle-sequencer', { play: true })
 * dispatch('dm-generate') // void events — no detail arg
 * ```
 */
export function dispatch<K extends keyof SyCoreEventMap>(
  name: K,
  ...[detail]: SyCoreEventMap[K] extends void ? [] : [DetailOrVoid<K>]
): void {
  window.dispatchEvent(
    new CustomEvent(name, detail !== undefined ? { detail } : undefined)
  );
}

// ---------------------------------------------------------------------------
// Listener helper
// ---------------------------------------------------------------------------

/**
 * Type-safe listener for a SY.CORE custom event.
 * Returns an unsubscribe function.
 *
 * Usage:
 * ```ts
 * const unsub = on('bpm-update', ({ bpm }) => { ... })
 * ```
 */
export function on<K extends keyof SyCoreEventMap>(
  name: K,
  handler: SyCoreEventMap[K] extends void
    ? () => void
    : (detail: SyCoreEventMap[K]) => void
): () => void {
  const wrapper = (event: Event) => {
    const ce = event as CustomEvent<SyCoreEventDetail<K>>;
    (handler as any)(ce.detail);
  };
  window.addEventListener(name, wrapper);
  return () => window.removeEventListener(name, wrapper);
}