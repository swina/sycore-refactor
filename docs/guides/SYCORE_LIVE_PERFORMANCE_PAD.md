# LIVE SET


## Overview

Live Set is the dedicated **show-mode** control center. It consolidates three essential live tools into a single panel:

1. **Performance Sets** — 16 one-touch recall pads for complete device program change states
2. **Backing Tracks** — a 16-slot playlist pad grid for click-and-play audio tracks
3. **Volume Mix** — per-device MIDI CC volume faders with mute and MIDI learn

All three can run simultaneously. MIDI mappings allow any pad, track, or fader to be triggered from a hardware controller. Pad layouts can be saved and recalled as **Snapshots**.

---

## Interface Layout

<img src="/help/guides/sycore-live-set.png"/>

---

## Tabs

### Performance Tab (default)

The show mode view. All pads, backing tracks, volume mix, and the player footer are visible here.

### Setup Tab

Three sub-tabs for configuration:

| Sub-tab | Purpose |
|---------|---------|
| **Performance Sets** | Assign saved PC sets to each of the 16 pads |
| **Playlist** | Full playlist editor (reuses `PlayList` component) |
| **Snapshots** | Save/load/delete complete pad layout snapshots |

---

## Performance Sets

### What is a Performance Set?

A Performance Set is a saved state created in the **Device Program Change Panel**. It stores:
- The SY.CORE MIDI channel
- For each device: program change channel, bank, program, and multi-channel assignments
- For the "UI device" (Roland S-1): the last recalled preset ID

### 16 Pads (Rows A and B)

- **Row A (1–8):** Primary sets, highest stage.
- **Row B (9–16):** Secondary sets, labeled "Performance Sets B".

Each pad shows the set name. Empty pads display `— N —`.

**Active pad:** Highlighted in solid violet with a glow and a pulsing white overlay animation.

### Triggering a Pad

1. Click the pad (or send a mapped MIDI CC/note).
2. All devices receive `All Notes Off` (CC 123 = 0) on every channel.
3. The PC set is applied: bank select + program change sent per device channel configuration.
4. For the "UI device", the preset from history is recalled silently.

### MIDI Learn

Right-click any pad to open the MIDI learn context menu. Param name: `lpp_set_N` (where N = 0-based index).

---

## Backing Tracks

The backing track section uses the `PlaylistPadGrid` component — 16 clickable track pads driven by `livePadStore.playlist`.

- Click a pad to start that track immediately (dispatches `playlist-play` with crossfade).
- MIDI learn prefix: `lpp_bt_N` (0-based).
- The playlist state is shared with `LiveSet` via `livePadStore` and the `BackingTrackPlayer` event bus.

### Player Footer

A persistent transport bar at the bottom of the Performance tab:

| Control | Action |
|---------|--------|
| **◀** | Previous track |
| **▶ / ⏸** | Play / Pause (right-click for MIDI learn → `lpp_playstop`) |
| **▶▶** | Next track |
| **REC SYNC** | Toggle — see below |

**Total progress bar** runs the full width below the footer, showing `totalCurrentTime / totalPlaylistDuration`.

### REC SYNC

When **REC SYNC** is on and a backing track is playing, the footer background pulses red. This is a visual indicator for the performer to know that backing track playback is synced to Audio Capture recording.


---

## Volume Mix

Appears when at least one registered device.

### Per-Device Row

```
[🔇 Mute]  ● 🎵  Roland S-1  CH3  [─────────────────────]  84  CC[7]
```

| Element | Description |
|---------|-------------|
| Mute button | Wraps `port.send()` to block Note On/Off silently; sends `CC 123` first |
| Online dot | Green if the MIDI output is detected; grey if offline |
| Device type icon | CPU = audio-interface; Music = instrument |
| Name + CH badge | CH badge shows only for multitimbral (`instrument-multi`) devices |
| Volume slider | 0–127; sends the configured CC on value change |
| CC# input | Which CC to send for volume (default 7 = MIDI Volume) |

### Multitimbral Devices

For `instrument-multi` devices, the mix key includes the current MIDI channel: `DeviceName:CH`. Each MIDI channel of a multitimbral device has its own stored volume and CC number. The badge `CH3` updates when the active part changes.

### Mute Implementation

This intercepts all outgoing messages at the WebMIDI level. CC, PC, SysEx, and clock messages still pass through. The patch is removed on unmute, on component unmount, and on device reconnect (reapplied on reconnect if still muted).

Mute state is persisted in `SYCORE_LPP_MIX` (localStorage) so it survives a page reload.

### MIDI Learn (Volume)

Right-click any device row → opens MIDI learn for `lpp_mix_DeviceName`. When a CC arrives mapped to this param name, the CC value (0–127) is applied directly as the volume for that device.

---

## Snapshots

A snapshot saves the complete assignment of all 16 pads (which PC set is assigned to each pad). This does not save the PC set contents — only the pad → set ID mapping.

| Action | Result |
|--------|--------|
| **Save** | Opens a name dialog; creates a new snapshot |
| **Save** (when active snapshot exists) | Updates the currently active snapshot in-place |
| **Save New** | Always creates a new snapshot |
| **Load** | Restores pad assignments from the snapshot |
| **Delete** | Removes snapshot from storage |

The active snapshot is highlighted in the list and its name appears in the header. Snapshots are persisted in `SYCORE_LPP_SNAPSHOTS` (localStorage).

**Old 8-pad snapshots** are automatically migrated to 16 pads (padded with empty entries) on load.

---

## MIDI Listener

A dedicated raw MIDI listener runs independently of the main CC listener. It monitors all inputs and resolves mapped param names:

| Param pattern | Trigger |
|--------------|---------|
| `lpp_set_N` | Triggers pad N (fires on note-on or CC > 0) |
| `lpp_bt_N` | Plays backing track N |
| `lpp_mix_DeviceName` | Sets device volume to the CC value |
| `lpp_playstop` | Toggles playlist play/stop |


---

## Tips

- **Set order matters:** Pad 1 should be your opener set — it's the first pad a controller will hit if mapped sequentially.
- **REC SYNC workflow:** Enable REC SYNC before the set. Hit Play — the backing track starts, and a connected Audio Capture will know to start recording simultaneously.
- **Snapshot discipline:** Save a snapshot before every show with the set name (e.g. `Show 2026-06-01`). Use **Save New** at the top of each show, not **Update**, so you keep historical show configs.
- **Multitimbral volume:** On multitimbral devices, switch to each MIDI part and set its volume independently. The mix state stores a separate level per part per device.
- **Mute on reconnect:** If a MIDI device disconnects and reconnects mid-show, SY.CORE reapplies mutes automatically via the `watch(midiStore.outputs)` watcher.
