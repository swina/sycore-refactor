export interface PreviewSequence {
  id: number;
  name: string;
  type: string;
  genre: string;
  poly: number; // 1=mono/arp, 2=poly chords, 3=single notes
  notes: number[] | number[][];
  timings?: number[];
  step?: number;
  loopSec: number;
}

export interface ToolbarButtonConfig {
  id: string;
  label: string;
  icon: string;
  enabled: boolean;
  toolbar?: 'main' | 'secondary';
}

export const DEFAULT_TOOLBAR: ToolbarButtonConfig[] = [
  { id: 'types', label: 'Sound Types', icon: 'LayoutGrid', enabled: true, toolbar: 'main' },
  { id: 'history', label: 'Sounds', icon: 'Layers', enabled: true, toolbar: 'main' },
  { id: 'favorites', label: 'Favorites', icon: 'Heart', enabled: true, toolbar: 'main' },
  { id: 'keyboard', label: 'Virtual Keyboard', icon: 'Music', enabled: true, toolbar: 'main' },
  { id: 'sequencer', label: 'Step Sequencer', icon: 'ListMusic', enabled: true, toolbar: 'main' },
  { id: 'panic', label: 'PANIC: All Notes Off', icon: 'AlertTriangle', enabled: true, toolbar: 'main' },
  { id: 'profile', label: 'User Profile', icon: 'User', enabled: true, toolbar: 'main' },
  { id: 'portal', label: 'Back to S1CORE Portal', icon: 'BookOpen', enabled: true, toolbar: 'main' },
  { id: 'routing', label: 'MIDI Routing', icon: 'Cable', enabled: true, toolbar: 'main' },
  { id: 'midilearn', label: 'MIDI Mapping (Learn CC)', icon: 'Workflow', enabled: true, toolbar: 'main' },
  { id: 'manual', label: 'User Manual', icon: 'BookOpen', enabled: true, toolbar: 'main' },
  { id: 'help', label: 'Help & Info', icon: 'HelpCircle', enabled: true, toolbar: 'main' },
  { id: 'support', label: 'Support Request', icon: 'Mail', enabled: true, toolbar: 'main' },
  { id: 'settings', label: 'S1CORE SETTINGS', icon: 'Settings', enabled: true, toolbar: 'main' },
  { id: 'experimental', label: 'Experimental Multi-MIDI', icon: 'Settings2', enabled: true, toolbar: 'main' },
  { id: 'liveset', label: 'Live Set', icon: 'Music', enabled: true, toolbar: 'main' },
  { id: 'midiactions', label: 'MIDI Actions', icon: 'Workflow', enabled: true, toolbar: 'main' }
];