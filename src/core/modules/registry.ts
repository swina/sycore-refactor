import {
  Radio, Monitor, Zap, Music, Music2, Layers, Cable,
  Mic, FolderOpen, Clock, Drum, ListMusic,
  Cpu, Headphones, Play, LayoutGrid, KeyboardMusic, Activity, Network,
  Gamepad2, Heart, User, HelpCircle, Mail, BookOpen, RotateCw,
  Settings, Repeat, SlidersHorizontal, History, Settings2, Sparkles, Bot,
} from 'lucide-vue-next'
import type { ModuleManifest, ModuleCategory } from './types'

/** Section title + icon per category — shared by MainPageOptimized.vue's launcher and ModuleManagerPanel.vue. */
export const CATEGORY_META: Record<ModuleCategory, { title: string; icon: unknown }> = {
  'midi-config': { title: 'MIDI Configuration', icon: Cpu },
  'sound-design': { title: 'Sound Design', icon: Zap },
  'midi-tools': { title: 'MIDI Tools', icon: Music },
  'audio-tools': { title: 'Audio Tools', icon: Headphones },
  performance: { title: 'Performance Tools', icon: Play },
  system: { title: 'System', icon: Settings },
}

/**
 * The full set of toolbar-addressable modules — launcher tiles (18, most
 * with showOnLauncher unset/true) plus toolbar/footer-only utilities (the
 * rest, showOnLauncher: false). This is the single source of truth for
 * AppFooter.vue/MainMenuDial.vue's main menu and ModuleManagerPanel.vue —
 * see docs/plans/modular-panel-system.md. SideBar.vue's separate
 * "settings" gear-menu still reads configStore.toolbarConfig's fab field
 * directly and isn't driven by this registry (out of scope for now).
 */
export const moduleRegistry: ModuleManifest[] = [
  // ── MIDI Configuration ──────────────────────────────────────────────────
  { id: 'midi-devices', label: 'Devices', icon: Network, category: 'midi-config', bg: '/midi-core-engine.png' },
  { id: 'midi-flow', label: 'MIDI Flow', icon: Cable, category: 'midi-config', bg: '/midi-flow.png' },
  { id: 'controller-designer', label: 'Controller Designer', icon: Gamepad2, category: 'midi-config', bg: '/midi-knob.png' },
  { id: 'midi-monitor', label: 'MIDI Monitor', icon: Activity, category: 'midi-config', bg: '/midi-monitor.png' },

  // ── Sound Design ─────────────────────────────────────────────────────────
  { id: 'sound-engine', label: 'Sound Engine', icon: Cpu, category: 'sound-design', bg: '/bg-sound-design-2.png' },
  { id: 'sampler', label: 'Sampler', icon: Music2, category: 'sound-design', bg: '/sycore-lab.png', badge: 'Beta' },

  // ── MIDI Tools ───────────────────────────────────────────────────────────
  { id: 'sequencer', label: 'Step Sequencer', icon: Music, category: 'midi-tools', bg: '/step-sequencer-square.png' },
  { id: 'sequencer2', label: 'Sequencer', icon: Music, category: 'midi-tools', bg: '/step-sequencer-square.png' },
  { id: 'chord-prog', label: 'Chord Progression', icon: Music2, category: 'midi-tools', bg: '/chord-progression-sequencer.png' },
  { id: 'capture', label: 'Piano Roll', icon: Music, category: 'midi-tools', bg: '/midi-capture.jpg' },
  { id: 'device-program-change', label: 'Multi Sounds', icon: Music2, category: 'midi-tools', bg: '/device-program-change.png' },

  // ── Audio Tools ──────────────────────────────────────────────────────────
  { id: 'audio-capture', label: 'Audio Capture', icon: Mic, category: 'audio-tools', bg: '/audio-capture-mixer.jpg' },
  { id: 'freesound-browser', label: 'Freesound Browser', icon: Repeat, category: 'audio-tools', bg: '/bg-sound-design.png' },
  { id: 'sound-folder-browser', label: 'Sound Folder Browser', icon: FolderOpen, category: 'audio-tools', bg: '/bg-settings.png' },

  // ── Performance Tools ────────────────────────────────────────────────────
  { id: 'live-timeline', label: 'Live Timeline', icon: Clock, category: 'performance', bg: '/home-performance-synths.png' },
  { id: 'drum-machine', label: 'Drum Machine', icon: Drum, category: 'performance', bg: '/drum-machine.png' },
  { id: 'live-performance-pad', label: 'Live Set', icon: ListMusic, category: 'performance', bg: '/live-performance-2.png' },
  { id: 'loop-machine', label: 'Samples Machine', icon: Layers, category: 'performance', bg: '/loop-machine.png' },
  { id: 'tracks-player', label: 'Tracks Player', icon: Music, category: 'performance', bg: '/backing-tracks.jpg' },
  { id: 'instrument-cockpit', label: 'DECK', icon: Sparkles, category: 'performance', bg: '/bg-performance.png' },

  // ── Toolbar/footer-only utilities (no launcher tile) ────────────────────
  { id: 'types', label: 'Sound Types', icon: Layers, category: 'sound-design', showOnLauncher: false },
  { id: 'history', label: 'Sounds History', icon: Layers, category: 'sound-design', showOnLauncher: false },
  { id: 'keyboard', label: 'Virtual Keyboard', icon: KeyboardMusic, category: 'midi-tools', showOnLauncher: false },
  { id: 'sequencer-modal', label: 'Step Sequencer Modal', icon: ListMusic, category: 'midi-tools', showOnLauncher: false },
  { id: 'arp', label: 'Arpeggiator', icon: ListMusic, category: 'midi-tools', showOnLauncher: false },
  { id: 'program-change', label: 'Program Change Browser', icon: Music2, category: 'midi-tools', showOnLauncher: false },
  { id: 'visualizer', label: 'Audio Visualizer', icon: Activity, category: 'audio-tools', showOnLauncher: false },
  { id: 'live-input', label: 'Live Input', icon: Mic, category: 'audio-tools', badge: 'Beta', bg: '/audio-capture-mixer.jpg' },
  { id: 'audio-mixer', label: 'Audio Mixer', icon: SlidersHorizontal, category: 'audio-tools', showOnLauncher: false },
  { id: 'midi-performance', label: 'MIDI Performance', icon: Network, category: 'midi-config', showOnLauncher: false, badge: 'Legacy' },
  { id: 'routing', label: 'MIDI Routing', icon: Cable, category: 'midi-config', showOnLauncher: false },
  { id: 'midilearn', label: 'MIDI Mapping', icon: Radio, category: 'midi-config', showOnLauncher: false },
  { id: 'midiactions', label: 'MIDI Actions', icon: Gamepad2, category: 'midi-config', showOnLauncher: false },
  { id: 'midi_matrix', label: 'MIDI Matrix', icon: Cpu, category: 'midi-config', showOnLauncher: false, badge: 'Legacy' },
  { id: 'midi-manager', label: 'MIDI Manager', icon: Cpu, category: 'midi-config', showOnLauncher: false, badge: 'Legacy' },
  { id: 'liveset', label: 'Live Set (Legacy)', icon: Zap, category: 'performance', showOnLauncher: false },
  { id: 'looper', label: 'Audio Looper', icon: RotateCw, category: 'performance', showOnLauncher: false },
  { id: 'session', label: 'Session', icon: History, category: 'system', showOnLauncher: false },
  { id: 'favorites', label: 'Favorites', icon: Heart, category: 'system', showOnLauncher: false },
  { id: 'profile', label: 'User Profile', icon: User, category: 'system', showOnLauncher: false },
  { id: 'help', label: 'Help', icon: HelpCircle, category: 'system', showOnLauncher: false },
  { id: 'support', label: 'Support', icon: Mail, category: 'system', showOnLauncher: false },
  { id: 'guides', label: 'Guides', icon: BookOpen, category: 'system', showOnLauncher: false },
  { id: 'portal', label: 'Portal', icon: BookOpen, category: 'system', showOnLauncher: false },
  { id: 'midilogger', label: 'MIDI Logger', icon: Settings2, category: 'system', showOnLauncher: false },
  { id: 'admin', label: 'Admin Panel', icon: Settings, category: 'system', showOnLauncher: false },
  { id: 'about', label: 'About', icon: Cpu, category: 'system', showOnLauncher: false },
  { id: 'module-manager', label: 'Module Manager', icon: LayoutGrid, category: 'system', showOnLauncher: false },
  { id: 'ai-agent', label: 'AI Agent', icon: Bot, category: 'system', bg: '/bg-settings.png' },
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
