/**
 * Shared MIDI types for SY.CORE
 *
 * These interfaces reflect the exact shapes used in MidiService.ts,
 * the routing system, and the MIDI monitor.
 */

/** Per-device registration stored in the routing config */
export interface DeviceRegistration {
  name: string;
  inEnabled: boolean;
  inChannel: number; // -1 for OMNI
  outEnabled: boolean;
  outChannel: number; // -1 for pass-through
  clock: boolean;
  transport: boolean;
  notes: boolean;
  cc: boolean;
  pc: boolean;
  isMulti: boolean;
  smartLatch: boolean;
  midiThru: boolean;
  velocityMin: number;
  velocityMax: number;
  velocityMap: 'linear' | 'log' | 'exp' | 'fixed';
  receiveSyncIn: boolean;
}

/** Full routing configuration, persisted as 'S1_MIDI_ROUTING' */
export interface RoutingConfig {
  registrations: Record<string, DeviceRegistration>;
  globalThruEnabled: boolean;
  thruFilters: { notes: boolean; cc: boolean };
}

/** Keyboard split configuration */
export interface SplitConfig {
  enabled: boolean;
  splitNote: number;
  lowDevice: string;
  highDevice: string;
  lowTranspose: number;
  highTranspose: number;
}

/** Categorised MIDI message types for the monitor */
export type MidiMessageType =
  | 'noteon' | 'noteoff' | 'cc' | 'pc' | 'pitchbend'
  | 'clock' | 'start' | 'stop' | 'sysex' | 'other'

/** A single entry in the MIDI monitor ring buffer */
export interface MidiMonitorEntry {
  id: number;
  timestamp: number;
  direction: 'in' | 'out';
  device: string;
  channel: number;
  type: MidiMessageType;
  data: number[];
  decoded: string;
}

/** Well-known sources of MIDI messages within the app */
export enum MidiSource {
  SEQUENCER = 'SEQUENCER',
  CHORD_PROG = 'CHORD_PROG',
  KEYBOARD = 'KEYBOARD',
  ARP = 'ARP',
  UI = 'UI',
  TRANSPORT = 'TRANSPORT',
  DRUM_MACHINE = 'DRUM_MACHINE',
}

/** Shape passed to CC listeners */
export interface MidiCCEvent {
  cc: number;
  value: number;
  channel: number;
  inputId?: string;
}

/** Shape passed to Note listeners */
export interface MidiNoteEvent {
  type: 'on' | 'off';
  note: number;
  velocity: number;
  channel: number;
  inputId?: string;
}

/** Shape passed to Pitch Bend listeners */
export interface MidiPitchBendEvent {
  value: number;
  channel: number;
  inputId?: string;
}

/** A latched note held by Smart Latch */
export interface LatchedNote {
  inputId: string;
  channel: number;
  note: number;
  velocity: number;
}

/** A virtual instrument — a standalone app that receives MIDI but can't be discovered via WebMIDI */
export interface VirtualRegistration {
  name: string;
  channel: number;   // MIDI channel (0-15)
  bankMsb: number;
  bankLsb: number;
  program: number;
  midiOutputPort: string; // real MIDI output port to route data through (e.g. "LoopBe Internal MIDI")
}