/**
 * Preset types for SY.CORE
 *
 * Reflects the exact shapes used in usePresetStore.js — both
 * the current symmetric A/B variant structure and the
 * legacy/migration paths.
 */

import type { S1Category } from '@/constants/s1-config';

// Re-export S1Category for convenience
export type { S1Category };

/** Arpeggiator configuration stored per-variant */
export interface ArpConfig {
  enabled: boolean;
  mode: string;
  bpm: number;
  subdivision: string;
  hold: boolean;
}

/** LFO configuration stored per-variant */
export interface LfoConfig {
  active: boolean;
  targetParameter: string;
  waveform: 'sine' | 'triangle' | 'square' | 'saw' | 'sh';
  mode: 'sync' | 'free';
  rate: number;
  syncDivision: string;
  depth: number;
  offset: number;
  lastSentValue: number | null;
}

/** Velocity modulation configuration stored per-variant */
export interface VelocityConfig {
  active: boolean;
  targetParameter: string;
  amount: number;
  curve: 'linear' | 'exp' | 'log';
}

/** Sequencer step — used in seqConfig/seqConfig2 */
export interface SeqStep {
  active: boolean;
  notes: number[];
  velocity: number;
  gate: number;
  tieSteps: number;
  param1Value: number;
  param2Value: number;
}

/** Sequencer configuration (for seqConfig and seqConfig2) */
export interface SeqConfig {
  numSteps: number;
  steps: SeqStep[];
}

/** One of the two symmetric preset variants (A or B) */
export interface PresetVariant {
  data: Record<string, number>;
  patchNotes: string;
  arpConfig: ArpConfig | null;
  velocityConfig: VelocityConfig | null;
  lfo1Config: LfoConfig | null;
  lfo2Config: LfoConfig | null;
  seqConfig: SeqConfig | null;
  seqConfig2: SeqConfig | null;
  seqActiveSlot: number;
  seqLinked?: boolean;
}

/** A fully-hydrated preset as stored in IndexedDB */
export interface Preset {
  id: string;
  name: string;
  category: S1Category | string;
  device: 'S-1';
  aVariant: PresetVariant;
  bVariant: PresetVariant;
  patchNotes: string;
  isFavorite?: boolean;
  createdAt?: any; // serverTimestamp or ISO string
  updatedAt?: any;
  pc?: number | null;

  // Legacy fields — still present during migration, deleted after
  data?: Record<string, number>;
  abVariant?: any;
  arpConfig?: any;
  velocityConfig?: any;
  lfo1Config?: any;
  lfo2Config?: any;
  seqConfig?: any;
  seqConfig2?: any;
  seqActiveSlot?: number;
}

/** Extra metadata accepted by importPreset / savePreset */
export interface PresetImportOptions {
  id?: string;
  patchNotes?: string;
  arpConfig?: ArpConfig;
  seqConfig?: SeqConfig;
  abVariant?: any;
  aVariant?: PresetVariant;
  bVariant?: PresetVariant;
  isFavorite?: boolean;
  createdAt?: any;
}