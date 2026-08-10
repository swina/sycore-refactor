/**
 * Shared MIDI types for SY.CORE
 *
 * These interfaces reflect the exact shapes used in MidiService.ts,
 * the routing system, and the MIDI monitor.
 */

/** Per-device Program Change bank/patch template — see src/constants/pc-templates.ts */
export type PcTemplateId = 'mfprojz' | 'roland-s1' | 'emulatorx3' | 'seqtrak' | 'json' | 'kawai-k1' | 'arturia';

/** Per-device registration stored in the routing config */
export interface DeviceRegistration {
  name: string;
  inEnabled: boolean;
  inChannel: number; // -1 for OMNI
  outEnabled: boolean;
  outChannel: number; // -1 for pass-through
  // Multi-timbral fanout — when non-empty, outgoing notes/CC/PC are
  // duplicated onto every channel listed here instead of the single
  // outChannel remap (e.g. a virtual multi-instrument split across parts
  // on CH 1, 2, and 4). Values are 0-based (channel 1 === 0).
  outChannels?: number[];
  clock: boolean;
  transport: boolean;
  notes: boolean;
  cc: boolean;
  pc: boolean;
  isMulti: boolean;
  smartLatch: boolean;
  latchEnabled?: boolean;   // per-device latch on/off (independent of global smartLatch)
  latchMaxNotes?: number;   // 1–16, default 4
  latchReplace?: boolean;   // true = FIFO (oldest dropped), false = block (new note rejected)
  midiThru: boolean;
  velocityMin: number;
  velocityMax: number;
  velocityMap: 'linear' | 'log' | 'exp' | 'fixed';
  receiveSyncIn: boolean;
  // Which Program Change bank/patch template MidiDeviceProgramChangePanel
  // should show for this device — unset means "legacy/auto" (today's fuzzy
  // catalog-name-match + show-every-import-button behavior), so devices
  // nobody has migrated to an explicit template keep working unchanged.
  pcTemplate?: PcTemplateId;
}

/** Full routing configuration, persisted as 'S1_MIDI_ROUTING' */
export interface RoutingConfig {
  registrations: Record<string, DeviceRegistration>;
  globalThruEnabled: boolean;
  thruFilters: { notes: boolean; cc: boolean };
  // When true (default, including for configs saved before this field
  // existed — checked as `!== false`), incoming MIDI Clock/Start/Continue/Stop
  // from any input is used only for the incoming-BPM display and is never
  // re-sent via Global Thru, so it can't compete with the app's own generated
  // clock on other outputs.
  blockIncomingClockThru?: boolean;
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
  SAMPLER = 'SAMPLER',
  CAPTURE = 'CAPTURE',
  NOTE_LATCH = 'NOTE_LATCH',
}

/** Optional note-range gate on a device→app input route (the "keyboard split" filter) */
export interface InputRouteFilter {
  lowNote?: number;   // 0-127; omitted/undefined = 0 (no lower bound)
  highNote?: number;  // 0-127; omitted/undefined = 127 (no upper bound)
}

/** One app fed by a given input device, in MIDI FLOW's device→app routing */
export interface InputRouteEntry {
  app: string;   // a MidiSource value, e.g. MidiSource.SEQUENCER
  filter?: InputRouteFilter;
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

/** One named CC entry in a virtual instrument's CC table (e.g. { cc: 74, name: 'Filter Cutoff' }) */
export interface VirtualCcMapping {
  cc: number;   // 0-127, unique within one instrument's table
  name: string; // user-assigned label
}

/** A virtual instrument — a standalone app that receives MIDI but can't be discovered via WebMIDI */
export interface VirtualRegistration {
  name: string;
  channel: number;   // MIDI channel (0-15)
  bankMsb: number;
  bankLsb: number;
  program: number;
  midiOutputPort: string; // real MIDI output port to route data through (e.g. "LoopBe Internal MIDI")
  ccTable?: VirtualCcMapping[]; // user-defined named CC controllers, exposed in MIDI Controller Designer
  // Virtual instruments have no real WebMIDI connection state to detect, so
  // "online" is a manual flag the user sets from its MIDI Flow card — e.g.
  // to mark it offline while the standalone synth/app it represents isn't
  // actually running. Undefined (pre-existing instruments) is treated as
  // online, matching the old always-online behavior.
  online?: boolean;
}