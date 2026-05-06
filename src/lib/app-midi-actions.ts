export type AppAction =
  | 'prev_preset'
  | 'next_preset'
  | 'first_preset'
  | 'last_preset'
  | 'new_sound'
  | 'select_sound_a'
  | 'select_sound_b'
  | 'generate'
  | 'regenerate'
  | 'save_preset'
  | 'toggle_arp'
  | 'toggle_sequencer'
  | 'seq_play'
  | 'seq_stop'
  | 'seq_bpm_up'
  | 'seq_bpm_down'
  | 'seq_bpm_cc'
  | 'toggle_visualizer'
  | 'toggle_midi_capture'
  | 'toggle_track_player'
  | 'playlist_play_stop'
  | 'playlist_next'
  | 'liveset_up'
  | 'liveset_down'
  | 'toggle_liveset'
  | 'toggle_panel'
  | 'open_sound_types'
  | 'open_sound_history'
  | 'transpose_cc';

export interface AppMidiMapping {
  id: string;
  device: string;   // MIDI input device name
  cc: number;       // CC# 0–127
  channel: number;  // -1 = any channel, 0–15 = specific
  value: number;    // -1 = any (triggers when val > 63), 0–127 = exact match
  action: AppAction;
}

export const APP_ACTION_LABELS: Record<AppAction, string> = {
  prev_preset:         'Prev Preset ↑',
  next_preset:         'Next Preset ↓',
  first_preset:        'First Preset',
  last_preset:         'Last Preset',
  new_sound:           'New Sound',
  select_sound_a:      'Select Sound A',
  select_sound_b:      'Select Sound B',
  generate:            'Generate Sound',
  regenerate:          'Regenerate (A/B)',
  save_preset:         'Save Preset',
  toggle_arp:          'ARP On/Off',
  toggle_sequencer:    'Toggle Sequencer',
  seq_play:            'Sequencer Play',
  seq_stop:            'Sequencer Stop',
  seq_bpm_up:          'BPM +1',
  seq_bpm_down:        'BPM −1',
  seq_bpm_cc:          'BPM via CC value  (20–300)',
  toggle_visualizer:   'Toggle Visualizer',
  toggle_midi_capture: 'Toggle MIDI Capture',
  toggle_track_player:  'Track Player ON/OFF',
  playlist_play_stop:   'Playlist Play / Stop',
  playlist_next:        'Playlist Next Track (Crossfade)',
  liveset_up:           'Live Set Prev Sound ↑',
  liveset_down:         'Live Set Next Sound ↓',
  toggle_liveset:       'Toggle Live Set Layer',
  toggle_panel:         'Expand Control Panel',
  open_sound_types:    'Open Sound Types',
  open_sound_history:  'Open Sound History',
  transpose_cc:        'Global Transpose via CC  (−24…+24)',
};

// Actions where the CC value (0–127) is mapped to a range (not just trigger on >63)
export const CONTINUOUS_ACTIONS = new Set<AppAction>(['seq_bpm_cc', 'transpose_cc']);
