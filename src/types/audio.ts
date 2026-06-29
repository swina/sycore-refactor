/**
 * Audio-related types for SY.CORE
 *
 * Drawn from the looper, sampler, and audio mixer stores.
 */

// ---------------------------------------------------------------------------
// Looper
// ---------------------------------------------------------------------------

/** A single take (track) in the looper */
export interface LooperTake {
  id: number;
  buffer: AudioBuffer | null;
  isMuted: boolean;
  isEmpty: boolean;
  name: string;
  volume: number;
}

/** Full looper state */
export interface LooperState {
  measures: number;
  beatsPerMeasure: number;
  takeMeasures: number;
  isArmed: boolean;
  isRecording: boolean;
  isPlaying: boolean;
  currentMeasure: number;
  currentBeat: number;
  progress: number;
  rewindOnRecord: boolean;
  midiTriggerEnabled: boolean;
  isExporting: boolean;
  takes: LooperTake[];
  activeTakeIndex: number;
}

// ---------------------------------------------------------------------------
// Sampler
// ---------------------------------------------------------------------------

/** A single sample pad */
export interface SamplerPad {
  id: string;
  label: string;
  url: string;
  author: string;
  duration: number;
  bpm: number | null;
  volume: number;
  pan: number;
  pitch: number;
  startPoint: number;
  endPoint: number;
  loopMode: boolean;
  filterFreq: number;
  reverbSend: number;
  delaySend: number;
  sampleRate: number;
  rootKey: number;
  minKey: number;
  maxKey: number;
  midiInput: string;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  chromatic: boolean;
  polyMode: boolean;
  // Granular (pad idx 6 only)
  granular?: boolean;
  grainSize?: number;
  grainOverlap?: number;
  grainPosition?: number;
  grainPitch?: number;
}

/** A single step in a sampler pattern */
export interface SamplerStep {
  active: boolean;
  velocity: number;
  accent: boolean;
  probability: number;
  microTiming: number;
  pitchOffset: number;
  automation: Record<string, number>;
}

/** A sampler bank (A–H) with 7 pads and their step sequences */
export interface SamplerBank {
  pads: SamplerPad[];
  steps: SamplerStep[][];
}

/** A sampler pattern containing all 8 banks */
export interface SamplerPattern {
  id: string;
  name: string;
  bpm: number;
  stepCount: number;
  activeBank: string;
  banks: Record<string, SamplerBank>;
}

/** Sampler bank IDs */
export type SamplerBankId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

// ---------------------------------------------------------------------------
// Audio Mixer
// ---------------------------------------------------------------------------

/** Channel identifiers available in the audio mixer */
export type MixerChannelId =
  | 'backing' | 'tracks' | 'looper' | 'lm'
  | 'drums' | 'drumsLevel' | 'sampler' | 'liveperf';

/** Per-channel mixer state */
export interface MixerChannelState {
  volume: number;
  muted: boolean;
}

/** Full mixer snapshot */
export interface MixerState {
  masterVol: number;
  enabledChannels: MixerChannelId[];
  channels: Record<MixerChannelId, MixerChannelState>;
  instrumentVols: Record<string, number>;
  instrumentMuted: Record<string, boolean>;
}