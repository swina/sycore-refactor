# MIDI Mapping Reference

Complete reference for all registered MIDI mappings in sy.core.

---

## Synth Parameter CC Map (S1 Hardware)

Direct CC → synth parameter mappings sent to the connected S1 hardware.

| CC # | Parameter Field | Description |
|------|----------------|-------------|
| 3    | `lfoRate`       | LFO Rate |
| 11   | `expression`    | Expression |
| 12   | `lfoWave`       | LFO Waveform |
| 13   | `oscLFO`        | OSC LFO Amount |
| 14   | `oscRange`      | OSC Range |
| 15   | `pwWidth`       | Pulse Width |
| 16   | `pwmSrc`        | PWM Source |
| 17   | `lfoMod`        | LFO Modulation |
| 19   | `oscSq`         | OSC Square |
| 20   | `oscSaw`        | OSC Saw |
| 21   | `oscSub`        | OSC Sub |
| 23   | `oscNoise`      | OSC Noise |
| 24   | `envFilt`       | Envelope Filter |
| 25   | `lfoFilt`       | LFO Filter |
| 30   | `sustain`       | Sustain |
| 71   | `res`           | Resonance |
| 72   | `release`       | Release |
| 73   | `attack`        | Attack |
| 74   | `cutoff`        | Filter Cutoff |
| 75   | `decay`         | Decay |
| 77   | `transpose`     | Transpose |
| 79   | `lfoMode`       | LFO Mode |
| 89   | `reverbType`    | Reverb Type |
| 90   | `delayTime`     | Delay Time |
| 91   | `reverb`        | Reverb Level |
| 92   | `delayLvl`      | Delay Level |
| 93   | `chorusMode`    | Chorus Mode |
| 102  | `drawMultiply`  | Draw Multiply |
| 103  | `oscChopOvertone` | OSC Chop Overtone |
| 104  | `oscChopComb`   | OSC Chop Comb |
| 105  | `btnKeyTrig`    | Key Trigger Button |
| 106  | `lfoSync`       | LFO Sync |
| 107  | `drawMode`      | Draw Mode |

---

## App MIDI Actions

Mappable actions for controlling the sy.core application via any MIDI controller.
Mappings are stored per-preset and configured via the MIDI Manager panel.

### Mapping Key Format

User-learned mappings use composite keys:

- **CC:** `DeviceName:CH{n}:CC{n}` — e.g. `Launchpad Mini:CH1:CC74`
- **Note:** `DeviceName:CH{n}:NOTE{n}` — e.g. `Launchpad Mini:CH1:NOTE36`
- **NRPN:** `DeviceName:CH{n}:NRPN:{msb}:{lsb}`

### `AppMidiMapping` Interface

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique mapping ID |
| `device` | `string` | MIDI input device name |
| `cc` | `number?` | CC number 0–127 |
| `note` | `number?` | MIDI Note number 0–127 |
| `channel` | `number` | `-1` = any channel, `0–15` = specific channel |
| `value` | `number` | `-1` = threshold/any, `0–127` = exact match |
| `minValue` | `number?` | Minimum value for threshold trigger (default >63) |
| `action` | `AppAction` | Action identifier |
| `feedbackOn` | `number?` | MIDI value sent back when state is ON |
| `feedbackOff` | `number?` | MIDI value sent back when state is OFF |
| `consume` | `boolean?` | If `true`, message is not passed through (thru) |

---

### Sound & Presets

| Action ID | Label | Trigger Behavior |
|-----------|-------|-----------------|
| `prev_preset` | Prev Preset ↑ | CC > 63 |
| `next_preset` | Next Preset ↓ | CC > 63 |
| `first_preset` | First Preset | CC > 63 |
| `last_preset` | Last Preset | CC > 63 |
| `new_sound` | New Sound | Any value |
| `generate` | Generate Sound | Any value |
| `regenerate` | Regenerate (A/B) | Any value |
| `save_preset` | Save Preset | Any value |
| `select_sound_a` | Select Sound A | CC > 63 |
| `select_sound_b` | Select Sound B | CC > 63 |
| `toggle_sound_ab` | Toggle Sound A/B | CC > 63 |
| `select_sound_ab_range` | Select A/B via Range | CC 0–63 → A, 64–127 → B |

---

### Arpeggiator

| Action ID | Label | Trigger Behavior |
|-----------|-------|-----------------|
| `toggle_arp` | ARP On/Off | CC > 63 = ON, CC ≤ 63 = OFF |
| `arp_mode_cc` | Arp: Mode via CC | CC 0–127 → up / down / up-down / random |
| `arp_subdivision_cc` | Arp: Division via CC | CC 0–127 → subdivision steps |
| `arp_rate_cc` | Arp: Rate/Subdivision via CC | CC 0–127 → subdivision steps |
| `arp_hold_cc` | Arp: Hold Toggle/State via CC | CC ≥ 64 = hold ON |

---

### Sequencer

| Action ID | Label | Trigger Behavior |
|-----------|-------|-----------------|
| `toggle_sequencer` | Toggle Sequencer | Any value (toggle) |
| `seq_play` | Sequencer Play | CC > 63 |
| `seq_stop` | Sequencer Stop | CC > 63 |
| `seq_bpm_up` | BPM +1 | CC > 63 |
| `seq_bpm_down` | BPM −1 | CC > 63 |
| `seq_bpm_cc` | BPM via CC value | CC 0–127 → 20–300 BPM |
| `seq_swing_cc` | Seq: Swing via CC | CC 0–127 |
| `seq_density_cc` | Seq: Density via CC | CC 0–127 |
| `seq_length_cc` | Seq: Length via CC | CC 0–127 → 2–64 steps |
| `seq_key_cc` | Seq: Key via CC | CC 0–127 |
| `seq_scale_cc` | Seq: Scale via CC | CC 0–127 |
| `seq_style_cc` | Seq: Style via CC | CC 0–127 |
| `seq_transpose_cc` | Seq: Transpose via CC | CC 0–127 → −24…+24 |
| `seq_gen_trigger` | Seq: Trigger Generation | Any value |
| `seq_duplicate` | Seq: Double Length (x2) | Any value |
| `seq_reduce` | Seq: Half Length (/2) | Any value |
| `seq_skip_step` | Seq: Skip Step (+2) | Any value |
| `seq_octave_cc` | Seq: Gen Base Octave | CC 0–127 |
| `seq_range_cc` | Seq: Gen Octave Range | CC 0–127 |
| `seq_step_select_cc` | Seq: Select Step via CC | CC 0–127 |
| `seq_select_1` | Select Seq 1 | CC > 63 |
| `seq_select_2` | Select Seq 2 | CC > 63 |

---

### Modulation

| Action ID | Label | Trigger Behavior |
|-----------|-------|-----------------|
| `toggle_lfo_1` | Toggle LFO 1 | CC > 63 = ON, CC ≤ 63 = OFF |
| `toggle_lfo_2` | Toggle LFO 2 | CC > 63 = ON, CC ≤ 63 = OFF |
| `toggle_velocity_mapping` | Toggle Velocity Mapping | CC > 63 = ON, CC ≤ 63 = OFF |
| `lfo1_waveform_cc` | LFO 1: Waveform via CC | CC 0–127 → sine / triangle / square / saw / s&h |
| `lfo1_mode_cc` | LFO 1: Timing Mode via CC | CC < 64 = free, ≥ 64 = sync |
| `lfo1_target_cc` | LFO 1: Modulation Target via CC | CC 0–127 → target param |
| `lfo1_rate_cc` | LFO 1: Rate/Division via CC | CC 0–127 → rate (free) or sync division |
| `lfo1_depth_cc` | LFO 1: Depth via CC | CC 0–127 → 0–100% |
| `lfo2_waveform_cc` | LFO 2: Waveform via CC | CC 0–127 → sine / triangle / square / saw / s&h |
| `lfo2_mode_cc` | LFO 2: Timing Mode via CC | CC < 64 = free, ≥ 64 = sync |
| `lfo2_target_cc` | LFO 2: Modulation Target via CC | CC 0–127 → target param |
| `lfo2_rate_cc` | LFO 2: Rate/Division via CC | CC 0–127 → rate (free) or sync division |
| `lfo2_depth_cc` | LFO 2: Depth via CC | CC 0–127 → 0–100% |
| `velocity_target_cc` | Velocity Map: Target Param via CC | CC 0–127 → target param |
| `velocity_amount_cc` | Velocity Map: Modulation Amount via CC | CC 0–127 → −100%…+100% |
| `velocity_curve_cc` | Velocity Map: Response Curve via CC | CC 0–127 → linear / exp / log |

**LFO Target Params (indices 0–18):** `cutoff`, `res`, `attack`, `decay`, `sustain`, `release`, `oscLFO`, `pwWidth`, `pwmSrc`, `lfoRate`, `lfoMod`, `oscSq`, `oscSaw`, `oscSub`, `oscNoise`, `delayLvl`, `reverb`, `delayTime`, `expression`

---

### Audio & Looper

| Action ID | Label | Trigger Behavior |
|-----------|-------|-----------------|
| `toggle_audio_capture` | Toggle Audio Capture | CC > 63 = ON, CC ≤ 63 = OFF |
| `toggle_looper` | Toggle Looper Panel | CC > 63 |
| `looper_record` | Looper: Record/Stop | Any value |
| `looper_clear_all` | Looper: Clear All | Any value |
| `looper_mute_take_1` | Looper: Mute/Unmute Take 1 | Any value |
| `looper_mute_take_2` | Looper: Mute/Unmute Take 2 | Any value |
| `looper_mute_take_3` | Looper: Mute/Unmute Take 3 | Any value |
| `looper_mute_take_4` | Looper: Mute/Unmute Take 4 | Any value |
| `capture_rec_toggle` | Capture: Record Start/Stop | CC > 63 |

---

### UI & Panels

| Action ID | Label | Trigger Behavior |
|-----------|-------|-----------------|
| `toggle_panel` | Expand Control Panel | CC > 63 |
| `toggle_visualizer` | Toggle Visualizer | CC > 63 |
| `toggle_liveset` | Toggle Live Set Layer | CC > 63 |
| `open_sound_types` | Open Sound Types | Any value |
| `open_sound_history` | Open Sound History | Any value |
| `open_midi_matrix` | Open MIDI MATRIX | CC > 63 |
| `panel_category_cc` | Select Control Category via CC | CC 0–127 → category index |
| `panel_tab_grid` | Select Controls Grid Tab | Any value |
| `panel_tab_flow` | Select Signal Flow Tab | Any value |
| `panel_tab_lfo` | Select LFO Tab | Any value |
| `panel_tab_osc` | Select Oscillator Tab | Any value |
| `panel_tab_env` | Select Envelope Tab | Any value |
| `panel_tab_filter` | Select Filter Tab | Any value |
| `panel_tab_efx` | Select EFX Tab | Any value |
| `panel_tab_poly` | Select Poly Tab | Any value |
| `panel_tab_advanced` | Select Advanced Tab | Any value |
| `panel_tab_dynamic` | Select Dynamic Tab | Any value |
| `toggle_main_menu` | Toggle Main Menu (Speed Dial) | CC > 63 |
| `main_menu_scroll_cc` | Scroll Main Menu via CC | CC 0–127 |
| `main_menu_select` | Select Main Menu Item (Click) | CC > 63 |
| `focus_next_modal` | Focus Next Open Panel | Any value > 0 |

---

### Transport & Performance

| Action ID | Label | Trigger Behavior |
|-----------|-------|-----------------|
| `global_start_stop` | MIDI START/STOP | CC > 63 = Start, CC < 64 = Stop |
| `smart_latch_cc` | Smart Latch (Hold Notes) | CC ≥ 64 = ON, CC < 64 = OFF |
| `playlist_play_stop` | Playlist Play / Stop | CC > 63 |
| `playlist_next` | Playlist Next Track (Crossfade) | CC > 63 |
| `playlist_volume_cc` | Track Player Volume via CC | CC 0–127 → 0–100% |
| `transpose_cc` | Global Transpose via CC | CC 0–127 → −24…+24 |
| `pass_thru` | PASS THRU (Routing/Feedback) | No app action, LED feedback only |
| `capture_rec_toggle` | Capture: Record Start/Stop | CC > 63 |
| `toggle_track_player` | Track Player ON/OFF | CC > 63 |
| `toggle_midi_capture` | Toggle MIDI Capture | CC > 63 |

---

### MIDI Channel

| Action ID | Label | Trigger Behavior |
|-----------|-------|-----------------|
| `channel_up` | MIDI Channel +1 (wraps 16→1) | CC > 63 |
| `channel_down` | MIDI Channel −1 (wraps 1→16) | CC > 63 |
| `channel_cc` | MIDI Channel via CC | CC 0–127 → Ch 1–16 |

---

### Program Change Browser

| Action ID | Label | Trigger Behavior |
|-----------|-------|-----------------|
| `pc_device_cc` | PC Browser: Select Target Device via CC | CC 0–127 |
| `pc_bank_cc` | PC Browser: Select Bank via CC | CC 0–127 |
| `pc_category_cc` | PC Browser: Select Category via CC | CC 0–127 |
| `pc_preset_cc` | PC Browser: Select & Send Preset via CC | CC 0–127 |
| `pc_preset_up` | PC Browser: Preset List ↑ | CC > 63 |
| `pc_preset_down` | PC Browser: Preset List ↓ | CC > 63 |
| `pc_pad_a1` | PC Pad A — Slot 1 | CC > 63 |
| `pc_pad_a2` | PC Pad A — Slot 2 | CC > 63 |
| `pc_pad_a3` | PC Pad A — Slot 3 | CC > 63 |
| `pc_pad_a4` | PC Pad A — Slot 4 | CC > 63 |
| `pc_pad_b1` | PC Pad B — Slot 1 | CC > 63 |
| `pc_pad_b2` | PC Pad B — Slot 2 | CC > 63 |
| `pc_pad_b3` | PC Pad B — Slot 3 | CC > 63 |
| `pc_pad_b4` | PC Pad B — Slot 4 | CC > 63 |

---

### Live Set

| Action ID | Label | Trigger Behavior |
|-----------|-------|-----------------|
| `liveset_up` | Live Set Prev Sound ↑ | Any value |
| `liveset_down` | Live Set Next Sound ↓ | Any value |
| `liveset_pad_1` … `liveset_pad_16` | Live Set Pad 1–16 | Any value → select pad |

---

### Backing Tracks

| Action ID | Label | Trigger Behavior |
|-----------|-------|-----------------|
| `backing_track_pad_1` … `backing_track_pad_16` | Backing Track Pad 1–16 | CC > 63 → play (or stop if already active) |

---

### MIDI Config

| Action ID | Label | Trigger Behavior |
|-----------|-------|-----------------|
| `midi_config_preset_1` … `midi_config_preset_8` | MIDI Config Preset 1–8 | CC > 63 → load preset slot |
| `sysex_send` | Send SysEx | Requires payload config |

---

## Launchpad Mini MK1 — Hardware Profile

Fixed CC mappings on the Launchpad top row (auto-configured, not user-learned):

| CC # | Action | Description |
|------|--------|-------------|
| 104  | `toggle_visualizer` | Toggle Visualizer |
| 105  | `toggle_sequencer`  | Toggle Sequencer |
| 106  | `toggle_arp`        | ARP On/Off |
| 107  | `toggle_liveset`    | Toggle Live Set Layer |
| 108  | `open_midi_matrix`  | Open MIDI MATRIX |
| 109  | `toggle_audio_capture` | Toggle Audio Capture |
| 110  | `toggle_looper`     | Toggle Looper Panel |
| 111  | `toggle_panel`      | Expand Control Panel |

The 8×8 pad grid (Note On messages) is available for MIDI Learn — pads not assigned via Learn fall through to normal MIDI routing.

### Launchpad LED Feedback Colors

| Value | Color |
|-------|-------|
| 60    | Green (ON / active) |
| 51    | Amber/Yellow (OFF / inactive) |
| 0     | Off |

---

## Continuous Actions (CC Range Mapping)

These actions interpret the full CC 0–127 range rather than a simple on/off threshold:

`panel_category_cc`, `seq_bpm_cc`, `transpose_cc`, `playlist_volume_cc`, `arp_mode_cc`, `arp_subdivision_cc`, `seq_swing_cc`, `seq_density_cc`, `seq_length_cc`, `seq_key_cc`, `seq_scale_cc`, `seq_style_cc`, `seq_transpose_cc`, `seq_octave_cc`, `seq_range_cc`, `seq_step_select_cc`, `global_start_stop`, `smart_latch_cc`, `select_sound_ab_range`, `lfo1_waveform_cc`, `lfo1_mode_cc`, `lfo1_target_cc`, `lfo1_rate_cc`, `lfo1_depth_cc`, `lfo2_waveform_cc`, `lfo2_mode_cc`, `lfo2_target_cc`, `lfo2_rate_cc`, `lfo2_depth_cc`, `velocity_target_cc`, `velocity_amount_cc`, `velocity_curve_cc`, `arp_rate_cc`, `arp_hold_cc`, `main_menu_scroll_cc`, `pc_device_cc`, `pc_bank_cc`, `pc_category_cc`, `pc_preset_cc`, `channel_cc`

---

## Velocity Modulation Config

Configurable via the Velocity Mapping panel or via MIDI actions:

| Field | Description |
|-------|-------------|
| `active` | Enable/disable velocity modulation |
| `targetParameter` | Synth param to modulate (from S1 CC Map) |
| `amount` | Modulation depth −100% to +100% |
| `curve` | Response curve: `linear`, `exp`, `log` |

Velocity (0–127) is normalized to 0–1, the curve is applied, and the result scales `amount` against the current preset's base value. On Note Off the original value is restored.

---

## Preset Storage

Mappings are stored in two places:

| Store | Key/Location | Contents |
|-------|-------------|----------|
| `localStorage` | `midiMappings` | CC/Note/NRPN → param mappings (MIDI Learn) |
| IndexedDB `system/appMidiMappings` | — | App action mappings |
| IndexedDB `system/midiMappingPresets` | — | Named presets (snapshot of both mapping sets + velocity config) |
| `localStorage` | `midiMappingActivePresetId` | Currently active preset ID |
