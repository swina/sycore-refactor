# Drum Machine

The **Drum Machine** is an 8-track, 16-step pattern sequencer built for live electronic performance. Each track holds a loaded sample and an independent step sequence with per-step velocity, accent, and ratchet. Six pattern banks (A–F) let you switch between arrangements on the fly, a Fill system overlays a one-bar variation without interrupting the main loop, and a Generate engine produces style-aware patterns in one click. Every control is MIDI-learnable with a right-click.

---

## Opening the Panel

| Method | Action |
|--------|--------|
| **Home page** | Click the **Drum Machine** tile |
| **Toolbar / Main Menu** | Add "Drum Machine" via Toolbar Settings |

The panel opens as a floating, **draggable and resizable** window (initial 960 × 520 px, minimum 720 × 380 px). Drag any free area of the header to reposition; drag any edge or corner to resize. Position and size persist in `localStorage`.

---

## Interface Layout

<img src="/help/guides/sycore-drum-machine.png"/>

| Area | Content |
|------|---------|
| **Header** | Title · BPM · Style picker · Generate · Presets · Init · minimize/close |
| **Step ruler** | Step numbers 1–16 grouped in four beats of four |
| **Track grid** | 8 track rows — label, load, mute, solo, volume, FX toggle, randomize, step count, 16 step buttons |
| **FX strip** | Per-track expandable row — Pan, Pitch, Tone, Reverb, Delay, Copy/Paste FX |
| **Transport bar** | Sequence tabs A–F · Play/Stop · REC SYNC · active preset name |
| **Footer** | Swing · Master Volume · Repeat (÷2/÷3/÷4) · Fill (trigger / Gen / step range / Save) · sequence position display |

---

## Sequences A–F

Six independent pattern banks share the same 8 tracks but hold separate step data and sound assignments.

| Action | Result |
|--------|--------|
| Click a tab (A–F) while **stopped** | Switches immediately |
| Click a tab (A–F) while **playing** | Switch is **quantized** — applied at the next bar boundary (step 1). The tab pulses until the switch fires |
| **Copy pattern** (header) | Copies the active sequence into a chosen target bank |
| **Clear pattern** (header) | Erases all steps in the active sequence |

### Sound inheritance

If a slot in sequence B (or C, D, E, F) has no sample loaded, it falls back to the nearest earlier sequence that does. The sample label displays in **purple** when it belongs to the current sequence, or **grey** when inherited from a previous one.

---

## Track Controls

Each row exposes the following controls from left to right:

| Control | Description |
|---------|-------------|
| **Label / load button** | Click the folder icon to pick a local audio file. Drag a URL onto the label to load from a link. Hover for the full sample name |
| **Preview (▶)** | Plays the sample once at full volume for quick auditioning |
| **M** | Mute this track. Red when active |
| **S** | Solo this track. Amber when active. Multiple solos stack |
| **Volume slider** | Per-track gain (0–1). Right-click to MIDI-learn |
| **FX** | Toggle the FX strip for this track. Cyan-outlined when the track has non-default FX |
| **Shuffle icon** | Randomizes velocity of all active steps in this row (70–127 range) |
| **Step count** | Sets the track's active step length (1–16). Click to increment, right-click to decrement, scroll to adjust. Tracks can have different lengths for polyrhythmic patterns. Highlighted purple when shorter than 16 |

---

## FX Strip

Clicking the **FX** button on any track expands a horizontal FX strip below that row. Changes apply in real time.

| Parameter | Range | Description |
|-----------|-------|-------------|
| **Pan** | −1 (L) → +1 (R) | Stereo placement |
| **Pitch** | −12 → +12 semitones | Pitch shift in whole semitones |
| **Tone** | 200 Hz → 20 kHz | Low-pass filter cut-off frequency |
| **Rev** | 0 → 100 | Reverb send amount |
| **Dly** | 0 → 100 | Delay send amount (1/8-note, BPM-synced) |

### FX Copy / Paste

- **COPY FX** — copies the current track's five FX values to a clipboard.
- After copying, six sequence buttons (A–F) appear. Click any to paste those values into the same track slot in that sequence. Click **ALL** to paste to every sequence at once.
- A **FX COPIED** toast confirms the copy. The active sequence is highlighted cyan; other sequences are dim.

FX settings are stored per track per sequence and are included in presets.

---

## Step Grid

### Step ruler

A numbered ruler above the grid shows steps **1–16** grouped into four beats of four (matching the visual gap between columns). The current playhead step turns **white** while playing.

### Step button states

| State | Appearance |
|-------|------------|
| **Inactive** | Dark grey |
| **Active** | Purple glow |
| **Active + accent** | Yellow glow |
| **Active + ratchet** | Purple with a small number badge (2/3/4) in the top-right corner |
| **Current step** | White ring overlay |
| **Beyond track length** | Dimmed, not clickable |

A faint white line marks the first step of each beat group (steps 1, 5, 9, 13).

### Velocity transparency

Active steps reflect their velocity visually:

| Velocity | Opacity |
|----------|---------|
| 1–30 | 30% |
| 31–50 | 50% |
| 51–100 | 75% |
| 101–127 | Full |

### Right-click step context menu

Right-clicking any active step opens a popover with:

- **Velocity** — drag slider (0–127)
- **Accent** — toggle yellow boost
- **Ratchet** — 1 / 2 / 3 / 4 hits per step slot

---

## Polymetry — Per-Track Step Count

Each track wraps independently at its configured step count. A track set to 12 steps cycles through steps 1–12 while other tracks complete their full 16. The global 16-step clock still governs the bar boundary (used for quantized sequence switching, Fill auto-stop, and REC SYNC).

---

## Transport Bar

Located between the track grid and the footer, the transport bar holds the main playback controls:

| Control | Description |
|---------|-------------|
| **Sequence tabs A–F** | Switch patterns (quantized while playing). MIDI-learnable |
| **▶ / ■** | Start / Stop the sequencer. BPM syncs from the global arpeggiator BPM on open |
| **BPM display** | Read-only; reflects the current global tempo |
| **REC SYNC** | Arms a synchronized Audio Capture recording (see below) |
| **Preset name** | Displays the currently loaded preset name (right side, truncated) |

---

## Master Volume

A **Vol** slider in the footer controls the overall output gain of all 8 tracks simultaneously (0–100). This is separate from per-track volume and is not stored in presets.

---

## Generate

Select a style from the dropdown next to the header, then click **Generate**.

### Styles

`House` · `Techno` · `HipHop` · `Trap` · `Funk` · `Jungle/DnB` · `Latin` · `Rock`

Each style has multiple variants; one is chosen randomly on each press so repeated generates produce unique results within the genre feel.

---

## Fill

A one-bar overlay pattern that temporarily replaces (or augments) the main sequence for exactly one bar, then auto-stops.

| Control | Description |
|---------|-------------|
| **Fill button** | Triggers the fill for one bar. Pulses cyan while active |
| **Gen** | Generates a new random fill pattern (kick-on-1, snare hits, cymbal runs) |
| **Step range inputs** | Two number fields (default 1–16). Defines which steps are written when saving |
| **Save icon** | Writes the fill steps within the configured range into the current active sequence |

> Use the step range to blend fill elements into your pattern — set `13–16` to replace only the last beat, leaving the rest of the sequence unchanged.

---

## REC SYNC

Arms a synchronized [Audio Capture](./SYCORE_AUDIO_CAPTURE.md) recording that starts exactly on the next bar boundary and records for precisely 16 steps, then stops automatically.

| State | Indicator |
|-------|-----------|
| **Idle** | Grey dot · "REC SYNC" label |
| **Armed** | Pulsing orange · "ARMED" |
| **Recording** | Pulsing red · "REC" |

Click once to arm. Click again to cancel. Recording fires and stops at actual audio playback time (not transport lookahead), ensuring sample-accurate capture. AudioCapture is pre-warmed when REC SYNC is armed so the monitor is ready the moment recording starts.

---

## Repeater

When **Repeat** is active (orange), every playing step is retriggered at a sub-step division:

| Division | Effect |
|----------|--------|
| **÷2** | Two hits per step |
| **÷3** | Three hits per step |
| **÷4** | Four hits per step |

Velocity tapers per retrigger (each hit is slightly softer) for a natural machine-gun feel. Repeater overrides the per-step ratchet setting while active.

---

## Presets

Click the **Presets** button in the header to open the preset drawer.

| Action | How |
|--------|-----|
| **Save new** | Type a name and press Enter or click Save |
| **Load** | Click a preset row |
| **Overwrite** | Hover a preset row → click the amber save icon. A **PRESET SAVED** toast confirms the write |
| **Delete** | Hover a preset row → click the red trash icon |

Presets store all six sequences (A–F) including step data, per-track sound assignments, per-track FX settings, and the active sequence at save time.

---

## Init

The **Init** button in the header clears all six sequences and all sound assignments, resetting the Drum Machine to a blank state. An inline confirmation ("Clear all? Yes / No") must be acknowledged before the data is erased.

---

## MIDI Learn Reference

Right-click any labelled control to open the MIDI Learn context menu. An orange dot pulses on the target while learning.

| Parameter | Control | Type |
|-----------|---------|------|
| `dm_play_stop` | Play / Stop | Trigger or toggle CC |
| `dm_seq_a` … `dm_seq_f` | Switch to sequence A–F | Trigger |
| `dm_fill` | Trigger Fill | Trigger |
| `dm_generate` | Generate pattern | Trigger |
| `dm_repeat` | Toggle Repeater | Trigger or toggle CC |
| `dm_vol_0` … `dm_vol_7` | Track volume 1–8 | Continuous CC (0–127) |

Triggers respond to Note On or any CC value > 0. Sequence switches are quantized to the bar when playing, exactly as when clicking the tabs.

---

## Persistence

| Data | Storage | Survives reload |
|------|---------|-----------------|
| All 6 sequences (steps, velocity, accent, ratchet, lengths) | `localStorage` | ✔ |
| Sound assignments per sequence per track | `localStorage` (blob keys in IndexedDB) | ✔ |
| FX settings (pan, pitch, tone, reverb, delay) per track per sequence | `localStorage` | ✔ |
| BPM, Swing, Repeater settings | `localStorage` | ✔ |
| Presets | `localStorage` | ✔ |
| Panel position / size / minimized | `localStorage` | ✔ |

---

## Related Guides

- [Audio Capture](./SYCORE_AUDIO_CAPTURE.md) — recorder driven by REC SYNC
- [Samples Machine](./SYCORE_LOOP_MACHINE.md) — pad-based loop playback with DrumMachine automation controls
- [Step Sequencer](./SYCORE_STEP_SEQUENCER.md) — melodic MIDI sequencing engine
- [MIDI Mapping](./SYCORE_MIDI_MAPPING.md) — managing learned CC mappings
- [Freesound Browser](./SYCORE_FREESOUND_BROWSER.md) — loading samples from freesound.org
