# MIDI Actions Summary

This document provides a tabular overview of all the **MIDI Actions** defined in the SY.CORE ecosystem. The actions are grouped by their functional types (`MIDI_ACTION_GROUPS`) and characterized as either **Continuous (0–127)** or **Trigger (Toggle / Push)**.

---

## 1. Sound & Presets
Controls presets loading, variation switching, and sound generation.

| Action Key (`AppAction`) | Description / Label | Type |
| :--- | :--- | :--- |
| `prev_preset` | Prev Preset ↑ | Trigger (Toggle / Push) |
| `next_preset` | Next Preset ↓ | Trigger (Toggle / Push) |
| `first_preset` | First Preset | Trigger (Toggle / Push) |
| `last_preset` | Last Preset | Trigger (Toggle / Push) |
| `new_sound` | New Sound | Trigger (Toggle / Push) |
| `generate` | Generate Sound | Trigger (Toggle / Push) |
| `regenerate` | Regenerate (A/B) | Trigger (Toggle / Push) |
| `save_preset` | Save Preset | Trigger (Toggle / Push) |
| `select_sound_a` | Select Sound A | Trigger (Toggle / Push) |
| `select_sound_b` | Select Sound B | Trigger (Toggle / Push) |
| `toggle_sound_ab` | Toggle Sound A/B | Trigger (Toggle / Push) |
| `select_sound_ab_range` | Select A/B via Range (1-63=A, 64-127=B) | Continuous (0–127) |

---

## 2. Arpeggiator
Controls real-time playback modes, subdivisions/rates, and hold latch states.

| Action Key (`AppAction`) | Description / Label | Type |
| :--- | :--- | :--- |
| `toggle_arp` | ARP On/Off | Trigger (Toggle / Push) |
| `arp_mode_cc` | Arp: Mode via CC | Continuous (0–127) |
| `arp_subdivision_cc` | Arp: Division via CC | Continuous (0–127) |
| `arp_rate_cc` | Arp: Rate/Subdivision via CC | Continuous (0–127) |
| `arp_hold_cc` | Arp: Hold Toggle/State via CC | Continuous (0–127) |

---

## 3. Sequencer
Controls step sequence playback, generative parameters, density, styles, and scales.

| Action Key (`AppAction`) | Description / Label | Type |
| :--- | :--- | :--- |
| `toggle_sequencer` | Toggle Sequencer | Trigger (Toggle / Push) |
| `seq_play` | Sequencer Play | Trigger (Toggle / Push) |
| `seq_stop` | Sequencer Stop | Trigger (Toggle / Push) |
| `seq_bpm_up` | BPM +1 | Trigger (Toggle / Push) |
| `seq_bpm_down` | BPM −1 | Trigger (Toggle / Push) |
| `seq_bpm_cc` | BPM via CC value (20–300) | Continuous (0–127) |
| `seq_swing_cc` | Seq: Swing via CC | Continuous (0–127) |
| `seq_density_cc` | Seq: Density via CC | Continuous (0–127) |
| `seq_length_cc` | Seq: Length via CC (2–64) | Continuous (0–127) |
| `seq_key_cc` | Seq: Key via CC | Continuous (0–127) |
| `seq_scale_cc` | Seq: Scale via CC | Continuous (0–127) |
| `seq_style_cc` | Seq: Style via CC | Continuous (0–127) |
| `seq_transpose_cc` | Seq: Transpose via CC (−24…+24) | Continuous (0–127) |
| `seq_gen_trigger` | Seq: Trigger Generation | Trigger (Toggle / Push) |
| `seq_duplicate` | Seq: Double Length (x2) | Trigger (Toggle / Push) |
| `seq_reduce` | Seq: Half Length (/2) | Trigger (Toggle / Push) |
| `seq_skip_step` | Seq: Skip Step (+2) | Trigger (Toggle / Push) |
| `seq_octave_cc` | Seq: Gen Base Octave | Continuous (0–127) |
| `seq_range_cc` | Seq: Gen Octave Range | Continuous (0–127) |
| `seq_step_select_cc` | Seq: Select Step via CC | Continuous (0–127) |
| `seq_select_1` | Select Seq 1 | Trigger (Toggle / Push) |
| `seq_select_2` | Select Seq 2 | Trigger (Toggle / Push) |

---

## 4. Modulation
Handles LFO enabling, waveforms, destinations, rate/divisions, depths, and velocity dynamic mapping.

| Action Key (`AppAction`) | Description / Label | Type |
| :--- | :--- | :--- |
| `toggle_lfo_1` | Toggle LFO 1 | Trigger (Toggle / Push) |
| `toggle_lfo_2` | Toggle LFO 2 | Trigger (Toggle / Push) |
| `toggle_velocity_mapping` | Toggle Velocity Mapping | Trigger (Toggle / Push) |
| `lfo1_waveform_cc` | LFO 1: Waveform via CC | Continuous (0–127) |
| `lfo1_mode_cc` | LFO 1: Timing Mode via CC | Continuous (0–127) |
| `lfo1_target_cc` | LFO 1: Modulation Target via CC | Continuous (0–127) |
| `lfo1_rate_cc` | LFO 1: Rate/Division via CC | Continuous (0–127) |
| `lfo1_depth_cc` | LFO 1: Depth via CC | Continuous (0–127) |
| `lfo2_waveform_cc` | LFO 2: Waveform via CC | Continuous (0–127) |
| `lfo2_mode_cc` | LFO 2: Timing Mode via CC | Continuous (0–127) |
| `lfo2_target_cc` | LFO 2: Modulation Target via CC | Continuous (0–127) |
| `lfo2_rate_cc` | LFO 2: Rate/Division via CC | Continuous (0–127) |
| `lfo2_depth_cc` | LFO 2: Depth via CC | Continuous (0–127) |
| `velocity_target_cc` | Velocity Map: Target Param via CC | Continuous (0–127) |
| `velocity_amount_cc` | Velocity Map: Modulation Amount via CC (-100%..+100%) | Continuous (0–127) |
| `velocity_curve_cc` | Velocity Map: Response Curve via CC | Continuous (0–127) |

---

## 5. Audio & Looper
Manages live audio recording/capturing, looper panels, and multitrack looper takes.

| Action Key (`AppAction`) | Description / Label | Type |
| :--- | :--- | :--- |
| `toggle_audio_capture` | Toggle Audio Capture | Trigger (Toggle / Push) |
| `toggle_looper` | Toggle Looper Panel | Trigger (Toggle / Push) |
| `looper_record` | Looper: Record/Stop | Trigger (Toggle / Push) |
| `looper_clear_all` | Looper: Clear All | Trigger (Toggle / Push) |
| `looper_mute_take_1` | Looper: Mute/Unmute Take 1 | Trigger (Toggle / Push) |
| `looper_mute_take_2` | Looper: Mute/Unmute Take 2 | Trigger (Toggle / Push) |
| `looper_mute_take_3` | Looper: Mute/Unmute Take 3 | Trigger (Toggle / Push) |
| `looper_mute_take_4` | Looper: Mute/Unmute Take 4 | Trigger (Toggle / Push) |

---

## 6. UI & Panels
Provides remote MIDI control for showing, hiding, and switching various layout tabs and views.

| Action Key (`AppAction`) | Description / Label | Type |
| :--- | :--- | :--- |
| `toggle_panel` | Expand Control Panel | Trigger (Toggle / Push) |
| `toggle_visualizer` | Toggle Visualizer | Trigger (Toggle / Push) |
| `toggle_liveset` | Toggle Live Set Layer | Trigger (Toggle / Push) |
| `open_sound_types` | Open Sound Types | Trigger (Toggle / Push) |
| `open_sound_history` | Open Sound History | Trigger (Toggle / Push) |
| `open_midi_matrix` | Open MIDI MATRIX | Trigger (Toggle / Push) |
| `panel_category_cc` | Select Control Category via CC | Continuous (0–127) |
| `panel_tab_grid` | Select Controls Grid Tab | Trigger (Toggle / Push) |
| `panel_tab_flow` | Select Signal Flow Tab | Trigger (Toggle / Push) |
| `panel_tab_lfo` | Select LFO Tab | Trigger (Toggle / Push) |
| `panel_tab_osc` | Select Oscillator Tab | Trigger (Toggle / Push) |
| `panel_tab_env` | Select Envelope Tab | Trigger (Toggle / Push) |
| `panel_tab_filter` | Select Filter Tab | Trigger (Toggle / Push) |
| `panel_tab_efx` | Select EFX Tab | Trigger (Toggle / Push) |
| `panel_tab_poly` | Select Poly Tab | Trigger (Toggle / Push) |
| `panel_tab_advanced` | Select Advanced Tab | Trigger (Toggle / Push) |
| `panel_tab_dynamic` | Select Dynamic Tab | Trigger (Toggle / Push) |
| `toggle_main_menu` | Toggle Main Menu (Speed Dial) | Trigger (Toggle / Push) |
| `main_menu_scroll_cc` | Scroll Main Menu via CC | Continuous (0–127) |
| `main_menu_select` | Select Main Menu Item (Click) | Trigger (Toggle / Push) |

---

## 7. Transport & Performance
Global settings, playlist controls, volume, master transpose, expression routing, and smart note latches.

| Action Key (`AppAction`) | Description / Label | Type |
| :--- | :--- | :--- |
| `global_start_stop` | MIDI START/STOP | Continuous (0–127) |
| `smart_latch_cc` | Smart Latch (Hold Notes) | Continuous (0–127) |
| `playlist_play_stop` | Playlist Play / Stop | Trigger (Toggle / Push) |
| `playlist_next` | Playlist Next Track (Crossfade) | Trigger (Toggle / Push) |
| `playlist_volume_cc` | Track Player Volume via CC | Continuous (0–127) |
| `transpose_cc` | Global Transpose via CC (−24…+24) | Continuous (0–127) |
| `pass_thru` | PASS THRU (Routing/Feedback) | Trigger (Toggle / Push) |
| `capture_rec_toggle` | Capture: Record Start/Stop | Trigger (Toggle / Push) |

---

## 8. Live Set
Switches sounds rapidly inside live grid view layouts.

| Action Key (`AppAction`) | Description / Label | Type |
| :--- | :--- | :--- |
| `liveset_up` | Live Set Prev Sound ↑ | Trigger (Toggle / Push) |
| `liveset_down` | Live Set Next Sound ↓ | Trigger (Toggle / Push) |
| `liveset_pad_1` | Live Set Pad 1 | Trigger (Toggle / Push) |
| `liveset_pad_2` | Live Set Pad 2 | Trigger (Toggle / Push) |
| `liveset_pad_3` | Live Set Pad 3 | Trigger (Toggle / Push) |
| `liveset_pad_4` | Live Set Pad 4 | Trigger (Toggle / Push) |
| `liveset_pad_5` | Live Set Pad 5 | Trigger (Toggle / Push) |
| `liveset_pad_6` | Live Set Pad 6 | Trigger (Toggle / Push) |
| `liveset_pad_7` | Live Set Pad 7 | Trigger (Toggle / Push) |
| `liveset_pad_8` | Live Set Pad 8 | Trigger (Toggle / Push) |
| `liveset_pad_9` | Live Set Pad 9 | Trigger (Toggle / Push) |
| `liveset_pad_10` | Live Set Pad 10 | Trigger (Toggle / Push) |
| `liveset_pad_11` | Live Set Pad 11 | Trigger (Toggle / Push) |
| `liveset_pad_12` | Live Set Pad 12 | Trigger (Toggle / Push) |
| `liveset_pad_13` | Live Set Pad 13 | Trigger (Toggle / Push) |
| `liveset_pad_14` | Live Set Pad 14 | Trigger (Toggle / Push) |
| `liveset_pad_15` | Live Set Pad 15 | Trigger (Toggle / Push) |
| `liveset_pad_16` | Live Set Pad 16 | Trigger (Toggle / Push) |
