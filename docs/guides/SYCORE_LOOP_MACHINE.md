# Samples Machine

The **Samples Machine** is a 24-pad simultaneous loop player built for live performance. Load a sound on a pad — from a local audio file or straight from the Freesound Browser — and trigger it as a seamless, gapless loop. Pads can play together, start quantized to a master loop, retune the global BPM, drive Audio Capture recording, and be mixed in real time from an always-visible 24-channel mixer. Every control is MIDI-learnable with a right-click.

> **Not to be confused with the [Audio Looper](./SYCORE_LOOPER.md)** — the Looper *records* live audio into layered tracks; the Samples Machine *plays back* pre-loaded loop samples on pads.

<img src="/help/guides/sycore-loop-machine.png"/>

---

## Opening the Panel

| Method | Action |
|--------|--------|
| **Home page** | Click the **Samples Machine** tile |
| **Toolbar** | Add "Samples Machine" via Toolbar Settings |

The panel opens as a floating, **draggable and resizable** window (initial 1020 × 600 px, minimum 720 × 440 px). It can be **minimised** to a title chip without stopping playback. Position and size are saved to `localStorage` and restored on next open.

---

## Interface Layout

| Area | Content |
|------|---------|
| **Header** | Sync toggle, Rec Sync toggle, manual Rec/Stop, Stop All, minimize/close |
| **Performance Sets** | 16 violet pads — one-touch recall of complete device preset configurations |
| **Loop Pads** | 24 amber pads in an 8 × 3 grid — the loops themselves |
| **Loops Mixer** | Right column, always visible — fade controls, BPM options, 24 volume sliders, Drum Machine controls |
| **Footer** | Quick hints · Session BPM rate indicator (when Session BPM is active) |

---

## Loop Pads (24)

### Pad states

| State | Appearance | Meaning |
|-------|-----------|---------|
| **Empty** | Dashed border, `+ Load` | Click to load a local audio file |
| **Loaded** | Amber tint, label + duration + BPM | Click to start |
| **Pending** | Pulsing clock icon | Armed — waiting for the next master loop boundary (Sync ON) |
| **Active** | Bright amber, cyan dot, volume badge | Playing — click again to stop |

### Loading sounds

There are two ways to fill a pad:

1. **Local file** — click any empty pad and pick an audio file (wav, mp3, ogg…). The file is decoded for its duration and stored in the local cache, so it survives page reloads and works offline.
2. **Freesound Browser** — use the **LM** action on any search result to assign it to a Samples Machine pad. See the [Freesound Browser guide](./SYCORE_FREESOUND_BROWSER.md).

Hover a loaded pad and click the small **✕** in the corner to clear it. Pad assignments persist in `localStorage` and are restored automatically.

### Gapless playback engine

Each pad runs a **dual audio element + Web Audio gain crossfade** engine: while one element plays, a twin element is pre-armed at the loop start. Just before the end of the sound the engine performs an instant gain swap to the second element, producing seamless, click-free looping regardless of file format.

---

## Sync — Quantized Pad Starts

With **Sync ON** (header toggle, fuchsia), the first pad you start becomes the **master loop**:

- If the sound has a BPM, the master cycle is **one bar** at that tempo (`4 × 60 / BPM`).
- Otherwise the master cycle is the sound's full duration.

Every pad started afterwards is **armed** (pulsing clock) and fires exactly on the next master loop boundary — everything stays locked. Clicking an armed pad cancels the pending start. With Sync OFF, pads start immediately.

When the last pad stops, the master is released; the next started pad defines a new master.

### BPM propagation

By default, starting a pad that carries BPM metadata updates the **global BPM everywhere**: the footer display, the arpeggiator, `midiStore.currentBpm`, and the outgoing MIDI clock. Enable **Session BPM** mode (see Loops Mixer) to suppress this and time-stretch loops to the current session tempo instead.

---

## Audio Capture Integration

The Samples Machine can drive the [Audio Capture](./SYCORE_AUDIO_CAPTURE.md) recorder without opening its panel:

| Control | Behaviour |
|---------|-----------|
| **REC SYNC** (toggle) | When ON, Capture recording starts automatically in the background the moment the **first pad fires**, and stops automatically on **Stop All** (after the fade-out completes) |
| **Rec / Stop** (button) | Manually start or stop a background Capture recording at any time |

The Rec button pulses red while a recording is in progress. The result lands in Audio Capture, ready to crop, normalize, and send to the playlist — so you can resample your whole pad jam in one pass.

---

## Stop All & Fade Out

**Stop All** stops every active and pending pad at once. The **Fade Out** field in the Loops Mixer sidebar sets a global fade-out duration (0 – 10 000 ms, 0 = instant); the value is persisted across sessions. Individual pads always stop instantly when clicked.

---

## Performance Sets (16)

The violet pad row mirrors the **Performance Sets** from the [Live Set](./SYCORE_LIVE_PERFORMANCE_PAD.md) panel — same sets, same slot assignments, shared storage. Triggering a set pad:

1. Sends **All Notes Off** (CC 123) on all 16 channels of every output — no hanging notes,
2. Recalls the full multi-device configuration: Bank Select MSB/LSB + Program Change per device (multitimbral channel maps supported), and the saved internal preset for the UI device.

The active set is highlighted; the selection stays in sync with the Live Set panel. Sets are created and assigned to slots from Live Set — the Samples Machine gives you instant access to them while you work the pads.

---

## Loops Mixer

The right-hand column is a permanent 24-channel mixer with additional transport controls.

### Fade Controls

| Control | Description |
|---------|-------------|
| **Fade Out** | Duration (0–10 000 ms) applied when Stop All is triggered (0 = instant) |
| **Fade In** | Toggle + duration (ms). When enabled, a pad that starts at volume 0 ramps up to the configured target volume over the fade-in time instead of jumping to silence. Highlighted amber when active |
| **→ Vol** | Target volume reached at the end of a fade-in (0.0–1.0). Visible only while Fade In is enabled |

### BPM & Playback Rate

| Control | Description |
|---------|-------------|
| **BPM** | Editable session tempo field (sky). Updates the global BPM everywhere — arpeggiator, MIDI clock, other modules |
| **Session BPM** | Checkbox (sky). When checked, loops with known BPM are **time-stretched** via playback rate to match the current session BPM instead of retuning the global tempo when triggered |
| **Vol Reset** | Checkbox (rose). When checked, a pad's mixer volume is reset to 0 whenever that pad stops — useful for swell automations via Fade In |

> **Session BPM + Vol Reset + Fade In** together enable a performance workflow: set all pad volumes to 0, arm a loop, and it fades itself up to the target level at the session tempo automatically.

### Sliders (24)

- One **volume slider per pad** (0 – 100), applied live to the playing audio.
- A cyan activity dot marks playing pads; active rows are tinted.
- **Right-click any row** to MIDI-learn that pad's volume to a hardware CC — perfect for a fader bank.

### Drum Machine Controls

The bottom of the mixer sidebar provides quick access to the Drum Machine without switching panels:

| Control | Description |
|---------|-------------|
| **Drum Machine header** | Click to open the Drum Machine panel (↗) |
| **Preset selector** | Dropdown of all saved Drum Machine presets — selecting one loads it immediately |
| **A–F pattern buttons** | Switch the active Drum Machine sequence (rose-highlighted = current) |
| **Play / Stop Drums** | Start or stop the Drum Machine sequencer |

---

## MIDI Learn Reference

Right-click any control to open the MIDI Learn context menu. While learning, an orange dot pulses on the target control.

| Parameter | Control | Type |
|-----------|---------|------|
| `lm_pad_0` … `lm_pad_23` | Toggle loop pad 1–24 | Trigger (Note or CC) |
| `lm_vol_0` … `lm_vol_23` | Pad volume 1–24 | Continuous (CC 0–127) |
| `lpp_set_0` … `lpp_set_15` | Trigger Performance Set pad 1–16 | Trigger |
| `lm_sync` | Toggle Sync | Trigger |
| `lm_rec_sync` | Toggle Rec Sync | Trigger |
| `lm_rec` | Start/stop Capture recording | Trigger |
| `lm_stop_all` | Stop All | Trigger |
| `lm_dm_seq_a` … `lm_dm_seq_f` | Switch Drum Machine pattern A–F | Trigger |
| `lm_dm_play_stop` | Drum Machine Play / Stop | Trigger |

Triggers respond to Note On or any non-zero CC value; mappings are device- and channel-aware (configured in [MIDI Mapping](./SYCORE_MIDI_MAPPING.md)).

---

## Persistence

| Data | Storage | Survives reload |
|------|---------|-----------------|
| Pad assignments (24) | `localStorage` | ✔ |
| Loaded local files / Freesound audio | Local cache (IndexedDB) | ✔ — fully offline |
| Sync, Rec Sync | `localStorage` | ✔ |
| Fade Out / Fade In settings | `localStorage` | ✔ |
| Session BPM value, Session BPM toggle, Vol Reset toggle | `localStorage` | ✔ |
| Panel position / size / minimized | `localStorage` | ✔ |
| Performance Sets & slot layout | Shared with Live Set | ✔ |

---

## Related Guides

- [Live Set](./SYCORE_LIVE_PERFORMANCE_PAD.md) — Performance Sets, the 16 Loop Pads, and snapshots
- [Freesound Browser](./SYCORE_FREESOUND_BROWSER.md) — assigning freesound.org sounds to pads
- [Audio Capture](./SYCORE_AUDIO_CAPTURE.md) — the recorder driven by Rec Sync
- [Audio Looper](./SYCORE_LOOPER.md) — live audio loop *recording*
- [MIDI Mapping](./SYCORE_MIDI_MAPPING.md) — managing learned mappings
- [Drum Machine](./SYCORE_DRUM_MACHINE.md) — the sequencer controllable from the Samples Machine mixer
