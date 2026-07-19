import {
  Radio, GitBranch, Piano, Monitor, Zap, Disc3, Music, Layers, Cable, Package,
  Mic, Search, FolderOpen, Clock, Drum, ListMusic, Infinity as InfinityIcon,
} from 'lucide-vue-next'
import type { ModuleManifest } from './types'

/**
 * The set of modules currently exposed on the MainPageOptimized.vue launcher.
 * This is the first slice of a wider module registry — most panels reachable
 * only from the in-workspace toolbar/footer/sidebar (see useUiStore.ts's
 * PANEL_ID_REF_LOOKUP) aren't listed here yet. See
 * docs/plans/modular-panel-system.md for the migration plan.
 */
export const moduleRegistry: ModuleManifest[] = [
  // ── MIDI Configuration ──────────────────────────────────────────────────
  { id: 'midi-devices', label: 'Devices', icon: Radio, category: 'midi-config', bg: '/midi-core-engine.png' },
  { id: 'midi-flow', label: 'MIDI Flow', icon: GitBranch, category: 'midi-config', bg: '/midi-flow.png' },
  { id: 'controller-designer', label: 'Controller Designer', icon: Piano, category: 'midi-config', bg: '/midi-knob.png' },
  { id: 'midi-monitor', label: 'MIDI Monitor', icon: Monitor, category: 'midi-config', bg: '/midi-monitor.png' },

  // ── Sound Design ─────────────────────────────────────────────────────────
  { id: 'sound-engine', label: 'Sound Engine', icon: Zap, category: 'sound-design', bg: '/bg-sound-design-2.png' },
  { id: 'sampler', label: 'Sampler', icon: Disc3, category: 'sound-design', bg: '/sycore-lab.png', badge: 'Beta' },

  // ── MIDI Tools ───────────────────────────────────────────────────────────
  { id: 'sequencer', label: 'Step Sequencer', icon: Music, category: 'midi-tools', bg: '/step-sequencer-square.png' },
  { id: 'chord-prog', label: 'Chord Progression', icon: Layers, category: 'midi-tools', bg: '/chord-progression-sequencer.png' },
  { id: 'capture', label: 'Piano Roll', icon: Cable, category: 'midi-tools', bg: '/midi-capture.jpg' },
  { id: 'device-program-change', label: 'Multi Sounds', icon: Package, category: 'midi-tools', bg: '/device-program-change.png' },

  // ── Audio Tools ──────────────────────────────────────────────────────────
  { id: 'audio-capture', label: 'Audio Capture', icon: Mic, category: 'audio-tools', bg: '/audio-capture-mixer.jpg' },
  { id: 'freesound-browser', label: 'Freesound Browser', icon: Search, category: 'audio-tools', bg: '/bg-sound-design.png' },
  { id: 'sound-folder-browser', label: 'Sound Folder Browser', icon: FolderOpen, category: 'audio-tools', bg: '/bg-settings.png' },

  // ── Performance Tools ────────────────────────────────────────────────────
  { id: 'live-timeline', label: 'Live Timeline', icon: Clock, category: 'performance', bg: '/home-performance-synths.png' },
  { id: 'drum-machine', label: 'Drum Machine', icon: Drum, category: 'performance', bg: '/drum-machine.png' },
  { id: 'live-performance-pad', label: 'Live Set', icon: ListMusic, category: 'performance', bg: '/live-performance-2.png' },
  { id: 'loop-machine', label: 'Samples Machine', icon: InfinityIcon, category: 'performance', bg: '/loop-machine.png' },
  { id: 'tracks-player', label: 'Tracks Player', icon: Music, category: 'performance', bg: '/backing-tracks.jpg' },
]

/** Groups the registry by category, preserving first-seen category order. */
export function modulesByCategory(): { category: string; items: ModuleManifest[] }[] {
  const order: string[] = []
  const groups: Record<string, ModuleManifest[]> = {}
  for (const m of moduleRegistry) {
    if (!groups[m.category]) { groups[m.category] = []; order.push(m.category) }
    groups[m.category].push(m)
  }
  return order.map(category => ({ category, items: groups[category] }))
}
