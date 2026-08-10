/**
 * midi-apps.js — the fixed list of internal "app" MIDI sources shown as
 * canvas nodes in MIDI Flow (MidiWizardFlow.vue) and as the Apps column in
 * the Instrument Cockpit (InstrumentCockpitPanel.vue). Single source of
 * truth so both stay in sync if an app is ever added/renamed.
 */
import { ListMusic, Music2, Keyboard as KeyboardIcon, Music, Zap, Layers, Drum, Disc3, Grid3X3, Lock } from 'lucide-vue-next'
import { MidiSource } from '@/core/midi/midi-service'

export const MIDI_APPS = [
  { name: 'Step Sequencer',    sourceId: MidiSource.SEQUENCER,  icon: ListMusic,    hasIn: true },
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
  [MidiSource.CHORD_PROG]:   'chord-prog',
  [MidiSource.KEYBOARD]:     'keyboard',
  [MidiSource.ARP]:          'arp',
  [MidiSource.UI]:           'sound-engine',
  [MidiSource.DRUM_MACHINE]: 'drum-machine',
  [MidiSource.SAMPLER]:      'sampler',
  [MidiSource.CAPTURE]:      'capture',
  [MidiSource.NOTE_LATCH]:   'note-latch',
}
