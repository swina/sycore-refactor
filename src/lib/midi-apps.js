/**
 * midi-apps.js — the fixed list of internal "app" MIDI sources shown as
 * canvas nodes in MIDI Flow (MidiWizardFlow.vue) and as the Apps column in
 * the Instrument Cockpit (InstrumentCockpitPanel.vue). Single source of
 * truth so both stay in sync if an app is ever added/renamed.
 */
import { ListMusic, Music2, Keyboard as KeyboardIcon, Music, Zap, Layers, Drum, Disc3, Grid3X3, Lock, Rows3 } from 'lucide-vue-next'
import { MidiSource } from '@/core/midi/midi-service'

export const MIDI_APPS = [
  { name: 'Step Sequencer',    sourceId: MidiSource.SEQUENCER,  icon: ListMusic,    hasIn: true },
  { name: 'Sequencer',         sourceId: MidiSource.SEQUENCER2, icon: Rows3,        hasIn: true },
  { name: 'Chord Sequencer',   sourceId: MidiSource.CHORD_PROG, icon: Music2,       hasIn: true },
  { name: 'Virtual Keyboard',  sourceId: MidiSource.KEYBOARD,   icon: KeyboardIcon, hasIn: true },
  { name: 'Arpeggiator',       sourceId: MidiSource.ARP,        icon: Music,        hasIn: true },
  { name: 'Transport / Clock', sourceId: MidiSource.TRANSPORT,  icon: Zap       },
  { name: 'Sound Engine',      sourceId: MidiSource.UI,         icon: Layers    },
  { name: 'Drum Machine',      sourceId: MidiSource.DRUM_MACHINE, icon: Drum,   hasIn: true },
  { name: 'Sampler',           sourceId: MidiSource.SAMPLER,    icon: Disc3,        hasIn: true },
  { name: 'Piano Roll',        sourceId: MidiSource.CAPTURE,    icon: Grid3X3   },
  { name: 'Note Latch',        sourceId: MidiSource.NOTE_LATCH, icon: Lock,   hasIn: true },
]

// Maps a MIDI_APPS sourceId to the uiStore panel id it opens (Transport/Clock
// has no dedicated panel of its own, so it's intentionally absent here).
export const APP_PANEL_ID = {
  [MidiSource.SEQUENCER]:    'sequencer',
  [MidiSource.SEQUENCER2]:   'sequencer2',
  [MidiSource.CHORD_PROG]:   'chord-prog',
  [MidiSource.KEYBOARD]:     'keyboard',
  [MidiSource.ARP]:          'arp',
  [MidiSource.UI]:           'sound-engine',
  [MidiSource.DRUM_MACHINE]: 'drum-machine',
  [MidiSource.SAMPLER]:      'sampler',
  [MidiSource.CAPTURE]:      'capture',
  [MidiSource.NOTE_LATCH]:   'note-latch',
}

const NOTE_LATCH_BASE = MidiSource.NOTE_LATCH

// Note Latch supports multiple simultaneous instances, each a distinct
// source key (`NOTE_LATCH:1`, `NOTE_LATCH:2`, ...) so MIDI FLOW can cable
// several into the same flow and each panel owns its own latch state. The
// base instance `NOTE_LATCH` (no suffix) is the original, backward-compatible
// node. Helpers below keep the suffix convention shared across the canvas,
// the store, panels, and MIDI-learn param names.
export function isNoteLatchSourceKey(sourceKey) {
  return sourceKey === NOTE_LATCH_BASE || String(sourceKey).startsWith(NOTE_LATCH_BASE + ':')
}

export function latchInstanceSuffix(sourceKey) {
  return sourceKey === NOTE_LATCH_BASE ? '' : String(sourceKey).slice((NOTE_LATCH_BASE + ':').length)
}

export function latchSourceKey(suffix) {
  return suffix ? `${NOTE_LATCH_BASE}:${suffix}` : NOTE_LATCH_BASE
}

export function nextLatchSourceKey(existingKeys) {
  for (let i = 1; ; i++) {
    const key = latchSourceKey(String(i))
    if (!existingKeys.includes(key)) return key
  }
}

// MIDI-learn param-name suffix for an instance ('' for the base, ':N' for N)
export function latchParamSuffix(sourceKey) {
  const s = latchInstanceSuffix(sourceKey)
  return s ? `:${s}` : ''
}
