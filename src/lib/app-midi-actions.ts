export type AppAction =
  | 'prev_preset'
  | 'next_preset'
  | 'first_preset'
  | 'last_preset'
  | 'new_sound'
  | 'select_sound_a'
  | 'select_sound_b'
  | 'toggle_sound_ab'
  | 'select_sound_ab_range'
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
  | 'global_start_stop'
  | 'playlist_play_stop'
  | 'smart_latch_cc'
  | 'pass_thru'
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
  | 'seq_reduce'
  | 'seq_skip_step'
  | 'seq_octave_cc'
  | 'seq_range_cc'
  | 'seq_step_select_cc'
  | 'seq_select_1'
  | 'seq_select_2'
  | 'toggle_lfo_1'
  | 'toggle_lfo_2'
  | 'toggle_velocity_mapping'
  | 'toggle_audio_capture'
  | 'lfo1_waveform_cc'
  | 'lfo1_mode_cc'
  | 'lfo1_target_cc'
  | 'lfo1_rate_cc'
  | 'lfo1_depth_cc'
  | 'lfo2_waveform_cc'
  | 'lfo2_mode_cc'
  | 'lfo2_target_cc'
  | 'lfo2_rate_cc'
  | 'lfo2_depth_cc'
  | 'velocity_target_cc'
  | 'velocity_amount_cc'
  | 'velocity_curve_cc'
  | 'arp_rate_cc'
  | 'arp_hold_cc';

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
  toggle_sound_ab:     'Toggle Sound A/B',
  select_sound_ab_range: 'Select A/B via Range (1-63=A, 64-127=B)',
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
  global_start_stop:    'MIDI START/STOP',
  smart_latch_cc:       'Smart Latch (Hold Notes)',
  pass_thru:            'PASS THRU (Routing/Feedback)',
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
  seq_skip_step:       'Seq: Skip Step (+2)',
  seq_octave_cc:      'Seq: Gen Base Octave',
  seq_range_cc:       'Seq: Gen Octave Range',
  seq_step_select_cc:  'Seq: Select Step via CC',
  seq_select_1:        'Select Seq 1',
  seq_select_2:        'Select Seq 2',
  toggle_lfo_1:        'Toggle LFO 1',
  toggle_lfo_2:        'Toggle LFO 2',
  toggle_velocity_mapping: 'Toggle Velocity Mapping',
  toggle_audio_capture:    'Toggle Audio Capture',
  lfo1_waveform_cc:     'LFO 1: Waveform via CC',
  lfo1_mode_cc:         'LFO 1: Timing Mode via CC',
  lfo1_target_cc:       'LFO 1: Modulation Target via CC',
  lfo1_rate_cc:         'LFO 1: Rate/Division via CC',
  lfo1_depth_cc:        'LFO 1: Depth via CC',
  lfo2_waveform_cc:     'LFO 2: Waveform via CC',
  lfo2_mode_cc:         'LFO 2: Timing Mode via CC',
  lfo2_target_cc:       'LFO 2: Modulation Target via CC',
  lfo2_rate_cc:         'LFO 2: Rate/Division via CC',
  lfo2_depth_cc:        'LFO 2: Depth via CC',
  velocity_target_cc:   'Velocity Map: Target Param via CC',
  velocity_amount_cc:   'Velocity Map: Modulation Amount via CC (-100%..+100%)',
  velocity_curve_cc:    'Velocity Map: Response Curve via CC',
  arp_rate_cc:          'Arp: Rate/Subdivision via CC',
  arp_hold_cc:          'Arp: Hold Toggle/State via CC',
};

export const MIDI_ACTION_GROUPS: Record<string, AppAction[]> = {
  'Sound & Presets': [
    'prev_preset', 'next_preset', 'first_preset', 'last_preset',
    'new_sound', 'generate', 'regenerate', 'save_preset',
    'select_sound_a', 'select_sound_b', 'toggle_sound_ab', 'select_sound_ab_range'
  ],
  'Arpeggiator': [
    'toggle_arp', 'arp_mode_cc', 'arp_subdivision_cc', 'arp_rate_cc', 'arp_hold_cc'
  ],
  'Sequencer': [
    'toggle_sequencer', 'seq_play', 'seq_stop', 'seq_bpm_up', 'seq_bpm_down', 'seq_bpm_cc',
    'seq_swing_cc', 'seq_density_cc', 'seq_length_cc', 'seq_key_cc', 'seq_scale_cc', 'seq_style_cc',
    'seq_transpose_cc', 'seq_gen_trigger', 'seq_duplicate', 'seq_reduce', 'seq_skip_step',
    'seq_octave_cc', 'seq_range_cc', 'seq_step_select_cc', 'seq_select_1', 'seq_select_2'
  ],
  'Modulation': [
    'toggle_lfo_1', 'toggle_lfo_2', 'toggle_velocity_mapping',
    'lfo1_waveform_cc', 'lfo1_mode_cc', 'lfo1_target_cc', 'lfo1_rate_cc', 'lfo1_depth_cc',
    'lfo2_waveform_cc', 'lfo2_mode_cc', 'lfo2_target_cc', 'lfo2_rate_cc', 'lfo2_depth_cc',
    'velocity_target_cc', 'velocity_amount_cc', 'velocity_curve_cc'
  ],
  'Audio & Looper': [
    'toggle_audio_capture', 'toggle_looper', 'looper_record', 'looper_clear_all',
    'looper_mute_take_1', 'looper_mute_take_2', 'looper_mute_take_3', 'looper_mute_take_4'
  ],
  'UI & Panels': [
    'toggle_panel', 'toggle_visualizer', 'toggle_liveset', 'open_sound_types',
    'open_sound_history', 'open_midi_matrix'
  ],
  'Transport & Performance': [
    'global_start_stop', 'smart_latch_cc', 'playlist_play_stop', 'playlist_next',
    'playlist_volume_cc', 'transpose_cc', 'pass_thru', 'capture_rec_toggle'
  ],
  'Live Set': [
    'liveset_up', 'liveset_down',
    'liveset_pad_1', 'liveset_pad_2', 'liveset_pad_3', 'liveset_pad_4',
    'liveset_pad_5', 'liveset_pad_6', 'liveset_pad_7', 'liveset_pad_8',
    'liveset_pad_9', 'liveset_pad_10', 'liveset_pad_11', 'liveset_pad_12',
    'liveset_pad_13', 'liveset_pad_14', 'liveset_pad_15', 'liveset_pad_16'
  ]
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
  'seq_transpose_cc',
  'seq_octave_cc',
  'seq_range_cc',
  'seq_step_select_cc',
  'global_start_stop',
  'smart_latch_cc',
  'select_sound_ab_range',
  'lfo1_waveform_cc',
  'lfo1_mode_cc',
  'lfo1_target_cc',
  'lfo1_rate_cc',
  'lfo1_depth_cc',
  'lfo2_waveform_cc',
  'lfo2_mode_cc',
  'lfo2_target_cc',
  'lfo2_rate_cc',
  'lfo2_depth_cc',
  'velocity_target_cc',
  'velocity_amount_cc',
  'velocity_curve_cc',
  'arp_rate_cc',
  'arp_hold_cc'
]);
