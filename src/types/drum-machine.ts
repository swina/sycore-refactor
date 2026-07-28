/**
 * Drum Machine types for SY.CORE
 *
 * Drawn from src/stores/useDrumMachineStore.js
 */

/** A single step in a drum track's pattern */
export interface DrumStep {
  active: boolean;
  velocity: number;
  accent: boolean;
  ratchet: number;
  tie: number;
  note?: number;
}

/** A single drum track (8 tracks per sequence) */
export interface DrumTrack {
  label: string;
  soundId: string;
  soundLabel: string;
  soundUrl: string;
  muted: boolean;
  solo: boolean;
  volume: number;
  length: number;
  pan: number;
  pitch: number;
  filterFreq: number;
  reverbSend: number;
  delaySend: number;
  midiOutEnabled?: boolean;
  midiNote?: number;
  steps: DrumStep[];
}

/** Serialized track (strips ephemeral soundUrl) */
export interface SerializedDrumTrack {
  label: string;
  soundId: string;
  soundLabel: string;
  muted: boolean;
  solo: boolean;
  volume: number;
  length: number;
  pan: number;
  pitch: number;
  filterFreq: number;
  reverbSend: number;
  delaySend: number;
  midiOutEnabled?: boolean;
  midiNote?: number;
  steps: DrumStep[];
}

/** A complete sequence keyed by label A–F, each containing 8 tracks */
export type DrumSequence = Record<string, DrumTrack[]>;

/** A style definition for drum pattern generation */
export interface DrumStyle {
  variants: any[];      // pattern grids
  velMin: number;
  velMax: number;
  ghostVelMax: number;
}

/** Saved drum-machine preset */
export interface DrumPreset {
  id: string;
  name: string;
  savedAt: string;
  activeSequence: string;
  sequences: Record<string, SerializedDrumTrack[]>;
}

/** A named kit of 8 sound assignments (one per track) */
export interface DrumKit {
  id: string;
  name: string;
  savedAt: string;
  sounds: { soundId: string; soundLabel: string }[];
}

/** Track label constants */
export type DrumTrackLabel =
  | 'Kick' | 'Snare' | 'Closed HH' | 'Open HH'
  | 'Clap' | 'Tom 1' | 'Tom 2' | 'Cymbal'
  | 'Rim Shot' | 'Cowbell' | 'Tambourine';

/** Sequence key */
export type SequenceKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** Drum style name */
export type DrumStyleName =
  | 'House' | 'Techno' | 'HipHop' | 'Trap' | 'Funk'
  | 'Jungle/DnB' | 'Latin' | 'Rock' | 'EDM' | 'Pop' | 'Jazz';

/** A single pattern imported from the DrumMachinePatterns book collections */
export interface ImportedPattern {
  title: string;
  signature: string;
  length: number;
  tracks: Record<string, string[]>;
  accent?: string[];
}

/** A category grouping of imported patterns (e.g. "Rock", "Funk", "Blues") */
export interface ImportedPatternCategory {
  name: string;
  patterns: ImportedPattern[];
}