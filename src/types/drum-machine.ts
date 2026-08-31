/**
 * Drum Machine types for SY.CORE
 *
 * Drawn from src/stores/useDrumMachineStore.js
 */

import type { FxChain, ModMatrixSlot } from '@/core/audio/types'
import type { FilterType } from '@/core/audio/filterMath'

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
  // Filter type/resonance (Phase 3 of
  // docs/plans/Sycore-DSP-Integration-Feasibility.md) -- absent = 'lowpass'
  // / 0 (resonance byte, same MIDI-byte convention as velocity/rootKey/etc),
  // same lazy-seed pattern as everything else here, and matches today's
  // hardcoded lowpass-only behavior exactly when unset.
  filterType?: FilterType;
  filterResonance?: number;
  // Amp envelope (Phase 4 of docs/plans/Sycore-DSP-Integration-Feasibility.md)
  // -- absent = envelope.ts's DEFAULT_ADSR. Plain seconds for attack/decay/
  // release, normalized 0-1 for sustain -- same convention as SamplerPad's
  // existing attack/decay/sustain/release fields, not Xynchrony's 6-stage
  // hardware-byte Envelope (nothing to convert from: these are already the
  // units Tone.AmplitudeEnvelope wants).
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  reverbSend: number;
  delaySend: number;
  midiOutEnabled?: boolean;
  midiNote?: number;
  steps: DrumStep[];
  // Optional per-track effects chain (Phase 2 of
  // docs/plans/Sycore-DSP-Integration-Feasibility.md) -- absent = no FX
  // node instantiated, same lazy-seed pattern as everything else here.
  fx?: FxChain;
  // Modulation Matrix cables (Phase 5 of
  // docs/plans/Sycore-DSP-Integration-Feasibility.md) -- absent = no live
  // cables built, same lazy-seed pattern as everything else here.
  modMatrix?: ModMatrixSlot[];
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
  filterType?: FilterType;
  filterResonance?: number;
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  reverbSend: number;
  delaySend: number;
  midiOutEnabled?: boolean;
  midiNote?: number;
  steps: DrumStep[];
  fx?: FxChain;
  modMatrix?: ModMatrixSlot[];
}

/** A complete sequence keyed by label A–H, each containing 8 tracks */
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
export type SequenceKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

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