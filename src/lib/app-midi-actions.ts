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
  | 'panel_category_cc'
  | 'panel_tab_grid'
  | 'panel_tab_flow'
  | 'panel_tab_lfo'
  | 'panel_tab_osc'
  | 'panel_tab_env'
  | 'panel_tab_filter'
  | 'panel_tab_efx'
  | 'panel_tab_poly'
  | 'panel_tab_advanced'
  | 'panel_tab_dynamic'
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
  | 'arp_hold_cc'
  | 'toggle_main_menu'
  | 'main_menu_scroll_cc'
  | 'main_menu_select'
  | 'pc_device_cc'
  | 'pc_bank_cc'
  | 'pc_category_cc'
  | 'pc_preset_cc'
  | 'pc_preset_up'
  | 'pc_preset_down'
  | 'pc_pad_a1' | 'pc_pad_a2' | 'pc_pad_a3' | 'pc_pad_a4'
  | 'pc_pad_b1' | 'pc_pad_b2' | 'pc_pad_b3' | 'pc_pad_b4'
  | 'backing_track_pad_1'  | 'backing_track_pad_2'  | 'backing_track_pad_3'  | 'backing_track_pad_4'
  | 'backing_track_pad_5'  | 'backing_track_pad_6'  | 'backing_track_pad_7'  | 'backing_track_pad_8'
  | 'backing_track_pad_9'  | 'backing_track_pad_10' | 'backing_track_pad_11' | 'backing_track_pad_12'
  | 'backing_track_pad_13' | 'backing_track_pad_14' | 'backing_track_pad_15' | 'backing_track_pad_16'
  | 'midi_config_preset_1' | 'midi_config_preset_2' | 'midi_config_preset_3' | 'midi_config_preset_4'
  | 'midi_config_preset_5' | 'midi_config_preset_6' | 'midi_config_preset_7' | 'midi_config_preset_8'
  | 'sysex_send'
  | 'focus_next_modal'
  | 'channel_up'
  | 'channel_down'
  | 'channel_cc'
  | 'open_lpp'
  | 'open_sampler'
  | 'open_drum_machine'
  | 'open_chord_prog'
  | 'open_sound_engine'
  | 'open_live_timeline'
  | 'open_tracks_player'
  | 'timeline_add_dm_rec_sync'
  | 'timeline_add_audio_trim_start'
  | 'timeline_add_audio_set_loop'
  | 'timeline_add_audio_crop'
  | 'timeline_add_audio_save_wav'
  | 'transport_play_all'
  | 'transport_stop_all'
  | 'toggle_audio_mixer'
  | 'mixer_master_volume_cc'
  | 'mixer_ch1_volume_cc'  | 'mixer_ch2_volume_cc'  | 'mixer_ch3_volume_cc'  | 'mixer_ch4_volume_cc'
  | 'mixer_ch5_volume_cc'  | 'mixer_ch6_volume_cc'  | 'mixer_ch7_volume_cc'  | 'mixer_ch8_volume_cc'
  | 'mixer_ch9_volume_cc'  | 'mixer_ch10_volume_cc' | 'mixer_ch11_volume_cc' | 'mixer_ch12_volume_cc'
  | 'mixer_ch13_volume_cc' | 'mixer_ch14_volume_cc' | 'mixer_ch15_volume_cc' | 'mixer_ch16_volume_cc'
  | 'mixer_ch1_mute'  | 'mixer_ch2_mute'  | 'mixer_ch3_mute'  | 'mixer_ch4_mute'
  | 'mixer_ch5_mute'  | 'mixer_ch6_mute'  | 'mixer_ch7_mute'  | 'mixer_ch8_mute'
  | 'mixer_ch9_mute'  | 'mixer_ch10_mute' | 'mixer_ch11_mute' | 'mixer_ch12_mute'
  | 'mixer_ch13_mute' | 'mixer_ch14_mute' | 'mixer_ch15_mute' | 'mixer_ch16_mute'
  | 'mixer_ch1_solo'  | 'mixer_ch2_solo'  | 'mixer_ch3_solo'  | 'mixer_ch4_solo'
  | 'mixer_ch5_solo'  | 'mixer_ch6_solo'  | 'mixer_ch7_solo'  | 'mixer_ch8_solo'
  | 'mixer_ch9_solo'  | 'mixer_ch10_solo' | 'mixer_ch11_solo' | 'mixer_ch12_solo'
  | 'mixer_ch13_solo' | 'mixer_ch14_solo' | 'mixer_ch15_solo' | 'mixer_ch16_solo';

export interface AppMidiMapping {
  id: string;
  device: string;   // MIDI input device name
  cc?: number;      // CC# 0–127
  note?: number;    // MIDI Note# 0–127
  channel: number;  // -1 = any channel, 0–15 = specific
  value: number;    // -1 = threshold/any, 0–127 = exact match
  minValue?: number; // when set and value===-1: triggers when val >= minValue (default threshold is >63)
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
  panel_category_cc:    'Select Control Category via CC',
  panel_tab_grid:       'Select Controls Grid Tab',
  panel_tab_flow:       'Select Signal Flow Tab',
  panel_tab_lfo:        'Select LFO Tab',
  panel_tab_osc:        'Select Oscillator Tab',
  panel_tab_env:        'Select Envelope Tab',
  panel_tab_filter:     'Select Filter Tab',
  panel_tab_efx:        'Select EFX Tab',
  panel_tab_poly:       'Select Poly Tab',
  panel_tab_advanced:    'Select Advanced Tab',
  panel_tab_dynamic:     'Select Dynamic Tab',
  open_sound_types:    'Toggle Sound Types',
  open_sound_history:  'Toggle Sound History',
  transpose_cc:        'Global Transpose via CC  (−24…+24)',
  toggle_looper:       'Toggle Looper Panel',
  looper_record:       'Looper: Record/Stop',
  looper_clear_all:    'Looper: Clear All',
  looper_mute_take_1:  'Looper: Mute/Unmute Take 1',
  looper_mute_take_2:  'Looper: Mute/Unmute Take 2',
  looper_mute_take_3:  'Looper: Mute/Unmute Take 3',
  looper_mute_take_4:  'Looper: Mute/Unmute Take 4',
  open_midi_matrix:    'Toggle MIDI MATRIX',
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
  toggle_main_menu:     'Toggle Main Menu (Speed Dial)',
  main_menu_scroll_cc:  'Scroll Main Menu via CC',
  main_menu_select:     'Select Main Menu Item (Click)',
  pc_device_cc:         'PC Browser: Select Target Device via CC',
  pc_bank_cc:           'PC Browser: Select Bank via CC',
  pc_category_cc:       'PC Browser: Select Category via CC',
  pc_preset_cc:         'PC Browser: Select & Send Preset via CC',
  pc_preset_up:         'PC Browser: Preset List ↑ (works when panel is closed)',
  pc_preset_down:       'PC Browser: Preset List ↓ (works when panel is closed)',
  pc_pad_a1:            'PC Pad A — Slot 1',
  pc_pad_a2:            'PC Pad A — Slot 2',
  pc_pad_a3:            'PC Pad A — Slot 3',
  pc_pad_a4:            'PC Pad A — Slot 4',
  pc_pad_b1:            'PC Pad B — Slot 1',
  pc_pad_b2:            'PC Pad B — Slot 2',
  pc_pad_b3:            'PC Pad B — Slot 3',
  pc_pad_b4:            'PC Pad B — Slot 4',
  backing_track_pad_1:  'Backing Track Pad 1',
  backing_track_pad_2:  'Backing Track Pad 2',
  backing_track_pad_3:  'Backing Track Pad 3',
  backing_track_pad_4:  'Backing Track Pad 4',
  backing_track_pad_5:  'Backing Track Pad 5',
  backing_track_pad_6:  'Backing Track Pad 6',
  backing_track_pad_7:  'Backing Track Pad 7',
  backing_track_pad_8:  'Backing Track Pad 8',
  backing_track_pad_9:  'Backing Track Pad 9',
  backing_track_pad_10: 'Backing Track Pad 10',
  backing_track_pad_11: 'Backing Track Pad 11',
  backing_track_pad_12: 'Backing Track Pad 12',
  backing_track_pad_13: 'Backing Track Pad 13',
  backing_track_pad_14: 'Backing Track Pad 14',
  backing_track_pad_15: 'Backing Track Pad 15',
  backing_track_pad_16: 'Backing Track Pad 16',
  midi_config_preset_1: 'MIDI Config Preset 1',
  midi_config_preset_2: 'MIDI Config Preset 2',
  midi_config_preset_3: 'MIDI Config Preset 3',
  midi_config_preset_4: 'MIDI Config Preset 4',
  midi_config_preset_5: 'MIDI Config Preset 5',
  midi_config_preset_6: 'MIDI Config Preset 6',
  midi_config_preset_7: 'MIDI Config Preset 7',
  midi_config_preset_8: 'MIDI Config Preset 8',
  sysex_send: 'Send SysEx (requires payload config)',
  focus_next_modal: 'Focus Next Open Panel (any CC value)',
  channel_up:   'MIDI Channel +1 (wraps 16→1)',
  channel_down: 'MIDI Channel −1 (wraps 1→16)',
  channel_cc:   'MIDI Channel via CC (0–127 → Ch 1–16)',
  open_lpp:          'Toggle Live Performance Pad',
  open_sampler:      'Toggle Sampler',
  open_drum_machine: 'Toggle Drum Machine',
  open_chord_prog:   'Toggle Chord Prog Sequencer',
  open_sound_engine:  'Toggle Sound Engine',
  open_live_timeline: 'Toggle Live Timeline',
  open_tracks_player: 'Toggle Tracks Library',
  timeline_add_dm_rec_sync: 'TL Add Marker: DM Rec Sync',
  timeline_add_audio_trim_start: 'TL Add Marker: Audio Trim Start',
  timeline_add_audio_set_loop: 'TL Add Marker: Audio Set Loop',
  timeline_add_audio_crop: 'TL Add Marker: Audio Crop',
  timeline_add_audio_save_wav: 'TL Add Marker: Audio Save WAV',
  transport_play_all: 'Transport: Play All (Synced)',
  transport_stop_all: 'Transport: Stop All',
  toggle_audio_mixer: 'Toggle Audio Mixer',
  mixer_master_volume_cc: 'Mixer Master: Volume via CC',
  mixer_ch1_volume_cc:  'Mixer Ch 1: Volume via CC',
  mixer_ch2_volume_cc:  'Mixer Ch 2: Volume via CC',
  mixer_ch3_volume_cc:  'Mixer Ch 3: Volume via CC',
  mixer_ch4_volume_cc:  'Mixer Ch 4: Volume via CC',
  mixer_ch5_volume_cc:  'Mixer Ch 5: Volume via CC',
  mixer_ch6_volume_cc:  'Mixer Ch 6: Volume via CC',
  mixer_ch7_volume_cc:  'Mixer Ch 7: Volume via CC',
  mixer_ch8_volume_cc:  'Mixer Ch 8: Volume via CC',
  mixer_ch9_volume_cc:  'Mixer Ch 9: Volume via CC',
  mixer_ch10_volume_cc: 'Mixer Ch 10: Volume via CC',
  mixer_ch11_volume_cc: 'Mixer Ch 11: Volume via CC',
  mixer_ch12_volume_cc: 'Mixer Ch 12: Volume via CC',
  mixer_ch13_volume_cc: 'Mixer Ch 13: Volume via CC',
  mixer_ch14_volume_cc: 'Mixer Ch 14: Volume via CC',
  mixer_ch15_volume_cc: 'Mixer Ch 15: Volume via CC',
  mixer_ch16_volume_cc: 'Mixer Ch 16: Volume via CC',
  mixer_ch1_mute:  'Mixer Ch 1: Mute',
  mixer_ch2_mute:  'Mixer Ch 2: Mute',
  mixer_ch3_mute:  'Mixer Ch 3: Mute',
  mixer_ch4_mute:  'Mixer Ch 4: Mute',
  mixer_ch5_mute:  'Mixer Ch 5: Mute',
  mixer_ch6_mute:  'Mixer Ch 6: Mute',
  mixer_ch7_mute:  'Mixer Ch 7: Mute',
  mixer_ch8_mute:  'Mixer Ch 8: Mute',
  mixer_ch9_mute:  'Mixer Ch 9: Mute',
  mixer_ch10_mute: 'Mixer Ch 10: Mute',
  mixer_ch11_mute: 'Mixer Ch 11: Mute',
  mixer_ch12_mute: 'Mixer Ch 12: Mute',
  mixer_ch13_mute: 'Mixer Ch 13: Mute',
  mixer_ch14_mute: 'Mixer Ch 14: Mute',
  mixer_ch15_mute: 'Mixer Ch 15: Mute',
  mixer_ch16_mute: 'Mixer Ch 16: Mute',
  mixer_ch1_solo:  'Mixer Ch 1: Solo',
  mixer_ch2_solo:  'Mixer Ch 2: Solo',
  mixer_ch3_solo:  'Mixer Ch 3: Solo',
  mixer_ch4_solo:  'Mixer Ch 4: Solo',
  mixer_ch5_solo:  'Mixer Ch 5: Solo',
  mixer_ch6_solo:  'Mixer Ch 6: Solo',
  mixer_ch7_solo:  'Mixer Ch 7: Solo',
  mixer_ch8_solo:  'Mixer Ch 8: Solo',
  mixer_ch9_solo:  'Mixer Ch 9: Solo',
  mixer_ch10_solo: 'Mixer Ch 10: Solo',
  mixer_ch11_solo: 'Mixer Ch 11: Solo',
  mixer_ch12_solo: 'Mixer Ch 12: Solo',
  mixer_ch13_solo: 'Mixer Ch 13: Solo',
  mixer_ch14_solo: 'Mixer Ch 14: Solo',
  mixer_ch15_solo: 'Mixer Ch 15: Solo',
  mixer_ch16_solo: 'Mixer Ch 16: Solo',
};

export const MIDI_ACTION_GROUPS: Record<string, AppAction[]> = {
  'Arpeggiator': [
    'toggle_arp', 'arp_mode_cc', 'arp_subdivision_cc', 'arp_rate_cc', 'arp_hold_cc'
  ],
  'Audio & Looper': [
    'toggle_audio_capture', 'toggle_looper', 'looper_record', 'looper_clear_all',
    'looper_mute_take_1', 'looper_mute_take_2', 'looper_mute_take_3', 'looper_mute_take_4'
  ],
  'Audio Mixer': [
    'toggle_audio_mixer',
    'mixer_ch1_volume_cc',  'mixer_ch1_mute',  'mixer_ch1_solo',
    'mixer_ch2_volume_cc',  'mixer_ch2_mute',  'mixer_ch2_solo',
    'mixer_ch3_volume_cc',  'mixer_ch3_mute',  'mixer_ch3_solo',
    'mixer_ch4_volume_cc',  'mixer_ch4_mute',  'mixer_ch4_solo',
    'mixer_ch5_volume_cc',  'mixer_ch5_mute',  'mixer_ch5_solo',
    'mixer_ch6_volume_cc',  'mixer_ch6_mute',  'mixer_ch6_solo',
    'mixer_ch7_volume_cc',  'mixer_ch7_mute',  'mixer_ch7_solo',
    'mixer_ch8_volume_cc',  'mixer_ch8_mute',  'mixer_ch8_solo',
    'mixer_ch9_volume_cc',  'mixer_ch9_mute',  'mixer_ch9_solo',
    'mixer_ch10_volume_cc', 'mixer_ch10_mute', 'mixer_ch10_solo',
    'mixer_ch11_volume_cc', 'mixer_ch11_mute', 'mixer_ch11_solo',
    'mixer_ch12_volume_cc', 'mixer_ch12_mute', 'mixer_ch12_solo',
    'mixer_ch13_volume_cc', 'mixer_ch13_mute', 'mixer_ch13_solo',
    'mixer_ch14_volume_cc', 'mixer_ch14_mute', 'mixer_ch14_solo',
    'mixer_ch15_volume_cc', 'mixer_ch15_mute', 'mixer_ch15_solo',
    'mixer_ch16_volume_cc', 'mixer_ch16_mute', 'mixer_ch16_solo',
  ],
  'Backing Tracks': [
    'open_tracks_player',
    'backing_track_pad_1',  'backing_track_pad_2',  'backing_track_pad_3',  'backing_track_pad_4',
    'backing_track_pad_5',  'backing_track_pad_6',  'backing_track_pad_7',  'backing_track_pad_8',
    'backing_track_pad_9',  'backing_track_pad_10', 'backing_track_pad_11', 'backing_track_pad_12',
    'backing_track_pad_13', 'backing_track_pad_14', 'backing_track_pad_15', 'backing_track_pad_16',
  ],
  'Live Set': [
    'liveset_up', 'liveset_down',
    'liveset_pad_1', 'liveset_pad_2', 'liveset_pad_3', 'liveset_pad_4',
    'liveset_pad_5', 'liveset_pad_6', 'liveset_pad_7', 'liveset_pad_8',
    'liveset_pad_9', 'liveset_pad_10', 'liveset_pad_11', 'liveset_pad_12',
    'liveset_pad_13', 'liveset_pad_14', 'liveset_pad_15', 'liveset_pad_16'
  ],
  'MIDI Channel': [
    'channel_up', 'channel_down', 'channel_cc'
  ],
  'MIDI Config': [
    'midi_config_preset_1', 'midi_config_preset_2', 'midi_config_preset_3', 'midi_config_preset_4',
    'midi_config_preset_5', 'midi_config_preset_6', 'midi_config_preset_7', 'midi_config_preset_8',
    'sysex_send',
  ],
  'Modulation': [
    'toggle_lfo_1', 'toggle_lfo_2', 'toggle_velocity_mapping',
    'lfo1_waveform_cc', 'lfo1_mode_cc', 'lfo1_target_cc', 'lfo1_rate_cc', 'lfo1_depth_cc',
    'lfo2_waveform_cc', 'lfo2_mode_cc', 'lfo2_target_cc', 'lfo2_rate_cc', 'lfo2_depth_cc',
    'velocity_target_cc', 'velocity_amount_cc', 'velocity_curve_cc'
  ],
  'Program Change Browser': [
    'pc_device_cc', 'pc_bank_cc', 'pc_category_cc', 'pc_preset_cc',
    'pc_preset_up', 'pc_preset_down',
    'pc_pad_a1', 'pc_pad_a2', 'pc_pad_a3', 'pc_pad_a4',
    'pc_pad_b1', 'pc_pad_b2', 'pc_pad_b3', 'pc_pad_b4',
  ],
  'Sequencer': [
    'toggle_sequencer', 'seq_play', 'seq_stop', 'seq_bpm_up', 'seq_bpm_down', 'seq_bpm_cc',
    'seq_swing_cc', 'seq_density_cc', 'seq_length_cc', 'seq_key_cc', 'seq_scale_cc', 'seq_style_cc',
    'seq_transpose_cc', 'seq_gen_trigger', 'seq_duplicate', 'seq_reduce', 'seq_skip_step',
    'seq_octave_cc', 'seq_range_cc', 'seq_step_select_cc', 'seq_select_1', 'seq_select_2'
  ],
  'Sound & Presets': [
    'prev_preset', 'next_preset', 'first_preset', 'last_preset',
    'new_sound', 'generate', 'regenerate', 'save_preset',
    'select_sound_a', 'select_sound_b', 'toggle_sound_ab', 'select_sound_ab_range'
  ],
  'Timeline Macro': [
    'timeline_add_dm_rec_sync',
    'timeline_add_audio_trim_start',
    'timeline_add_audio_set_loop',
    'timeline_add_audio_crop',
    'timeline_add_audio_save_wav',
  ],
  'Transport & Performance': [
    'global_start_stop', 'transport_play_all', 'transport_stop_all', 'smart_latch_cc', 'playlist_play_stop', 'playlist_next',
    'playlist_volume_cc', 'transpose_cc', 'pass_thru', 'capture_rec_toggle'
  ],
  'UI & Panels': [
    'toggle_panel', 'toggle_visualizer', 'toggle_liveset', 'open_sound_types',
    'open_sound_history', 'open_midi_matrix', 'panel_category_cc',
    'panel_tab_grid', 'panel_tab_flow', 'panel_tab_lfo', 'panel_tab_osc',
    'panel_tab_env', 'panel_tab_filter', 'panel_tab_efx', 'panel_tab_poly',
    'panel_tab_advanced', 'panel_tab_dynamic', 'toggle_main_menu', 'main_menu_scroll_cc', 'main_menu_select',
    'focus_next_modal',
    'open_lpp', 'open_sampler', 'open_drum_machine', 'open_chord_prog', 'open_sound_engine', 'open_live_timeline',
  ],
};

// Actions where the CC value (0–127) is mapped to a range (not just trigger on >63)
export const CONTINUOUS_ACTIONS = new Set<AppAction>([
  'panel_category_cc',
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
  'arp_hold_cc',
  'main_menu_scroll_cc',
  'pc_device_cc',
  'pc_bank_cc',
  'pc_category_cc',
  'pc_preset_cc',
  'channel_cc',
  'mixer_master_volume_cc',
  'mixer_ch1_volume_cc',  'mixer_ch2_volume_cc',  'mixer_ch3_volume_cc',  'mixer_ch4_volume_cc',
  'mixer_ch5_volume_cc',  'mixer_ch6_volume_cc',  'mixer_ch7_volume_cc',  'mixer_ch8_volume_cc',
  'mixer_ch9_volume_cc',  'mixer_ch10_volume_cc', 'mixer_ch11_volume_cc', 'mixer_ch12_volume_cc',
  'mixer_ch13_volume_cc', 'mixer_ch14_volume_cc', 'mixer_ch15_volume_cc', 'mixer_ch16_volume_cc',
]);

// ── Virtual instrument CC table actions ─────────────────────────────────────
// Unlike the rest of AppAction (a fixed, hand-enumerated union), a virtual
// instrument's CC table is user-defined and open-ended — any number of
// instruments, any number of named CC rows each. These can't be pre-declared
// as literal union members, so they're dynamic action ids, built at runtime
// by MidiControllerDesigner.vue from each virtual instrument's
// VirtualRegistration.ccTable and resolved by the helpers below instead of a
// static lookup table.
//
// Two forms:
//   vi_cc:<instrumentName>:<cc>            — picker option (no channel chosen yet)
//   vi_cc:<instrumentName>:<cc>:<channel>  — stored/confirmed assignment (0-based channel)
//
// The channel is appended separately at confirm time (not baked into the
// picker list) because the same CC table is shared across every channel of a
// multitimbral instrument — which channel a control should target depends on
// the assignment, not the CC's name, and most hardware controllers can only
// transmit on one fixed channel of their own.
const VI_CC_PREFIX = 'vi_cc:';

export interface ParsedViCcAction {
  instrumentName: string;
  cc: number;
  channel: number | null; // null when parsed from a channel-less picker id
}

export function parseViCcAction(action: string): ParsedViCcAction | null {
  if (!action.startsWith(VI_CC_PREFIX)) return null;
  const parts = action.slice(VI_CC_PREFIX.length).split(':');
  if (parts.length >= 3) {
    return {
      channel: parseInt(parts[parts.length - 1], 10),
      cc: parseInt(parts[parts.length - 2], 10),
      instrumentName: parts.slice(0, -2).join(':'), // instrument name may itself contain ':'
    };
  }
  return {
    channel: null,
    cc: parseInt(parts[parts.length - 1], 10),
    instrumentName: parts.slice(0, -1).join(':'),
  };
}

// ── Virtual instrument per-channel toggle action ─────────────────────────────
// One mappable action per virtual instrument per channel (16 total) that lets
// a button enable/disable that channel in the instrument's multi-channel
// fanout — the mapped equivalent of clicking that channel in the "Multi-CH
// out" grid on the instrument's MIDI FLOW card by hand. A discrete on/off
// trigger (button press), not a continuous fader value.
const VI_CH_PREFIX = 'vi_ch:';

export interface ParsedViChannelAction {
  instrumentName: string;
  channel: number; // 0-15
}

/** Parses a `vi_ch:<instrumentName>:<channel>` per-channel toggle action id, or null. */
export function parseViChannelAction(action: string): ParsedViChannelAction | null {
  if (!action.startsWith(VI_CH_PREFIX)) return null;
  const parts = action.slice(VI_CH_PREFIX.length).split(':');
  if (parts.length < 2) return null;
  return {
    channel: parseInt(parts[parts.length - 1], 10),
    instrumentName: parts.slice(0, -1).join(':'), // instrument name may itself contain ':'
  };
}

/** True for any action whose CC value should pass straight through (fader/knob), not be treated as a discrete on/off trigger. */
export function isContinuousAction(action: string): boolean {
  return action.startsWith(VI_CC_PREFIX) || CONTINUOUS_ACTIONS.has(action as AppAction);
}

/** Human-readable label for any action id, including dynamic vi_cc: virtual-instrument CC entries. */
export function actionLabel(
  action: string,
  virtualInstruments: { name: string; ccTable?: { cc: number; name: string }[] }[]
): string {
  const parsed = parseViCcAction(action);
  if (parsed) {
    const { instrumentName, cc, channel } = parsed;
    const row = virtualInstruments.find(v => v.name === instrumentName)?.ccTable
      ?.find(r => r.cc === cc);
    const base = `${instrumentName}: ${row?.name || `CC ${cc}`}`;
    return channel != null ? `${base} (Ch ${channel + 1})` : base;
  }
  const viCh = parseViChannelAction(action);
  if (viCh) return `${viCh.instrumentName}: Channel ${viCh.channel + 1} Enable/Disable`;
  return (APP_ACTION_LABELS as Record<string, string>)[action] ?? action;
}
