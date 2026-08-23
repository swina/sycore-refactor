# Audio Mixer

The **Audio Mixer** provides per-channel volume, mute, and solo control for up to 16 instrument channels — accessible both as a standalone panel and as a mappable MIDI action group in the Controller Designer.

---

## Interface

The mixer shows each channel as a vertical strip with:

| Control | Range | Description |
|---------|-------|-------------|
| **Volume fader** | 0–127 | Sends MIDI CC#7 for the corresponding channel. Right-click to MIDI Learn. |
| **Mute (M)** | Toggle | Sends CC#7 = 0 when muted. Restores previous volume when unmuted. |
| **Solo (S)** | Toggle | Isolates soloed channels; others are heard at reduced volume. |

---

## EXT Mode

Each external MIDI device strip shows a **CC7** badge at the bottom. Click it to switch to **EXT** mode: the mixer stops sending CC#7 entirely for that device (fader and mute go inactive), and you control volume physically on the hardware or via a hardware mixer. The flag is persisted per device. Useful for synths that don't implement MIDI CC#7 volume.

---

## MIDI Mapping

The Audio Mixer is available as a mappable action group in the [MIDI Controller Designer](./SYCORE_MIDI_CONTROLLER_DESIGNER.md):

| Action | Description |
|--------|-------------|
| **Toggle Audio Mixer** | Opens/closes the mixer panel |
| **Master Volume** | Continuous CC — sets master volume via `useAudioMixerStore.setMasterVol` |
| **Ch 1–16 Volume** | Per-channel volume fader |
| **Ch 1–16 Mute** | Per-channel mute toggle |
| **Ch 1–16 Solo** | Per-channel solo toggle |

Assignments include a numbered channel-slot parameter, so you can map a single physical fader to any mixer channel. Save/update/load configuration is built in.

---

## Persistence

Mixer configuration (per-channel volumes, mute/solo states, EXT flags) is persisted in `localStorage` and included in [Session export/import](./SYCORE_SESSION_MANAGER.md).