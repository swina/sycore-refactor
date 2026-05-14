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
  | 'liveset_pad_1'  | 'liveset_pad_2'  | 'liveset_pad_3'  | 'liveset_pad_4'
  | 'liveset_pad_5'  | 'liveset_pad_6'  | 'liveset_pad_7'  | 'liveset_pad_8'
  | 'liveset_pad_9'  | 'liveset_pad_10' | 'liveset_pad_11' | 'liveset_pad_12'
  | 'liveset_pad_13' | 'liveset_pad_14' | 'liveset_pad_15' | 'liveset_pad_16'
  | 'toggle_liveset'
  | 'toggle_panel'
  | 'open_sound_types'
  | 'open_sound_history'
  | 'transpose_cc'
  | 'toggle_looper'
  | 'looper_record'
  | 'looper_clear_all'
  | 'looper_mute_take_1'
  | 'looper_mute_take_2'
  | 'looper_mute_take_3'
  | 'looper_mute_take_4'
  | 'open_midi_matrix'
  | 'playlist_volume_cc'
  | 'capture_rec_toggle'
  | 'arp_mode_cc'
  | 'arp_subdivision_cc'
  | 'seq_swing_cc'
  | 'seq_density_cc'
  | 'seq_length_cc'
  | 'seq_key_cc'
  | 'seq_scale_cc'
  | 'seq_style_cc'
  | 'seq_transpose_cc'
  | 'seq_gen_trigger'
  | 'seq_duplicate'
  | 'seq_reduce';

export interface AppMidiMapping {
  id: string;
  device: string;   // MIDI input device name
  cc?: number;      // CC# 0–127
  note?: number;    // MIDI Note# 0–127
  channel: number;  // -1 = any channel, 0–15 = specific
  value: number;    // -1 = any (triggers when val > 63 or Note On), 0–127 = exact match
  action: AppAction;
  feedbackOn?: number;  // MIDI value to send back when state is ON
  feedbackOff?: number; // MIDI value to send back when state is OFF
  consume?: boolean;    // If true, the message will not be passed through (thru)
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
  liveset_pad_1:        'Live Set Pad 1',
  liveset_pad_2:        'Live Set Pad 2',
  liveset_pad_3:        'Live Set Pad 3',
  liveset_pad_4:        'Live Set Pad 4',
  liveset_pad_5:        'Live Set Pad 5',
  liveset_pad_6:        'Live Set Pad 6',
  liveset_pad_7:        'Live Set Pad 7',
  liveset_pad_8:        'Live Set Pad 8',
  liveset_pad_9:        'Live Set Pad 9',
  liveset_pad_10:       'Live Set Pad 10',
  liveset_pad_11:       'Live Set Pad 11',
  liveset_pad_12:       'Live Set Pad 12',
  liveset_pad_13:       'Live Set Pad 13',
  liveset_pad_14:       'Live Set Pad 14',
  liveset_pad_15:       'Live Set Pad 15',
  liveset_pad_16:       'Live Set Pad 16',
  toggle_liveset:       'Toggle Live Set Layer',
  toggle_panel:         'Expand Control Panel',
  open_sound_types:    'Open Sound Types',
  open_sound_history:  'Open Sound History',
  transpose_cc:        'Global Transpose via CC  (−24…+24)',
  toggle_looper:       'Toggle Looper Panel',
  looper_record:       'Looper: Record/Stop',
  looper_clear_all:    'Looper: Clear All',
  looper_mute_take_1:  'Looper: Mute/Unmute Take 1',
  looper_mute_take_2:  'Looper: Mute/Unmute Take 2',
  looper_mute_take_3:  'Looper: Mute/Unmute Take 3',
  looper_mute_take_4:  'Looper: Mute/Unmute Take 4',
  open_midi_matrix:    'Open MIDI MATRIX',
  playlist_volume_cc:  'Track Player Volume via CC',
  capture_rec_toggle:  'Capture: Record Start/Stop',
  arp_mode_cc:         'Arp: Mode via CC',
  arp_subdivision_cc:  'Arp: Division via CC',
  seq_swing_cc:        'Seq: Swing via CC',
  seq_density_cc:      'Seq: Density via CC',
  seq_length_cc:       'Seq: Length via CC (2–64)',
  seq_key_cc:          'Seq: Key via CC',
  seq_scale_cc:        'Seq: Scale via CC',
  seq_style_cc:        'Seq: Style via CC',
  seq_transpose_cc:    'Seq: Transpose via CC (−24…+24)',
  seq_gen_trigger:     'Seq: Trigger Generation',
  seq_duplicate:       'Seq: Double Length (x2)',
  seq_reduce:          'Seq: Half Length (/2)',
};

// Actions where the CC value (0–127) is mapped to a range (not just trigger on >63)
export const CONTINUOUS_ACTIONS = new Set<AppAction>([
  'seq_bpm_cc', 
  'transpose_cc', 
  'playlist_volume_cc', 
  'arp_mode_cc', 
  'arp_subdivision_cc',
  'seq_swing_cc',
  'seq_density_cc',
  'seq_length_cc',
  'seq_key_cc',
  'seq_scale_cc',
  'seq_style_cc',
  'seq_transpose_cc'
]);
