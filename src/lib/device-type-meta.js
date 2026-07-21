import { Gamepad2, Music, Layers, Radio } from 'lucide-vue-next'

/**
 * Shared device-type color/icon system — single source of truth for
 * MidiWizardFlow.vue's canvas nodes and AudioMixerPanel.vue's instrument
 * channel strips, so both read the same way instead of drifting apart.
 */
export const DEVICE_TYPE_META = {
  controller: {
    label: 'Controller', icon: Gamepad2,
    dot: 'bg-sky-400', text: 'text-sky-400', accent: 'border-l-sky-500',
    card: 'bg-sky-950/20 border-sky-800/50 hover:border-sky-500/50',
    header: 'bg-sky-900/20 border-sky-900/40',
  },
  'instrument-single': {
    label: 'Instrument (Single)', icon: Music,
    dot: 'bg-rose-300', text: 'text-rose-300', accent: 'border-l-rose-400',
    card: 'bg-rose-900/15 border-rose-700/40 hover:border-rose-400/50',
    header: 'bg-rose-900/15 border-rose-800/30',
  },
  'instrument-multi': {
    label: 'Instrument (Multi)', icon: Layers,
    dot: 'bg-violet-400', text: 'text-violet-400', accent: 'border-l-violet-500',
    card: 'bg-violet-950/20 border-violet-800/50 hover:border-violet-500/50',
    header: 'bg-violet-900/20 border-violet-900/40',
  },
  virtual: {
    label: 'Virtual Instrument', icon: Radio,
    dot: 'bg-amber-400', text: 'text-amber-400', accent: 'border-l-amber-500',
    card: 'bg-amber-950/20 border-amber-800/50 hover:border-amber-500/50',
    header: 'bg-amber-900/20 border-amber-900/40',
  },
}

export function typeMeta(type) {
  return DEVICE_TYPE_META[type] ?? DEVICE_TYPE_META['instrument-single']
}
