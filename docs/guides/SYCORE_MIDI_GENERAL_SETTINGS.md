# MIDI GENERAL SETTINGS

Open **MIDI Settings** — the gear icon in the MIDI Flow header, or the **Settings** tab of the MIDI Manager window.

This is the global, app-wide MIDI configuration: channel defaults, clock/transport behavior, Smart Latch, saved configuration presets, and emergency controls. It's separate from per-device routing, which lives in [MIDI Flow](./SYCORE_MIDI_FLOW.md) and [Devices](./SYCORE_MIDI_DEVICES.md).

## Global MIDI I/O

| Field | Meaning |
|---|---|
| **Output Channel** | Default channel (1–16) used when sending notes/CC that don't have a more specific per-device channel override |
| **Input Channel** | Filters incoming notes/CC to a single channel, or **OMNI** to accept all channels |

## Clock & Transport

| Toggle | Meaning |
|---|---|
| **Send MIDI Clock** | Broadcasts MIDI Clock pulses (24 PPQN) from the app's own tempo to every registered output that has Clock enabled |
| **Block Incoming Clock Thru** | See callout below — **keep this ON** |
| **Sync MIDI Transport** | The app's global Start/Stop follows incoming MIDI transport messages from an input device |
| **Sync Sequencer Transport** | The Step Sequencer's play/stop follows incoming MIDI transport |
| **Incoming Clock BPM** | Read-only display — the tempo detected from whatever clock is arriving on any input, smoothed over a 24-pulse ring buffer. Only shown once clock is actually being received |

### ⚠️ Preventing MIDI echo — Block Incoming Clock Thru

If notes or CC values on a device repeat and fade out on their own — often only on **one channel** — the cause is almost always an input device broadcasting its own MIDI Clock into the app. With MIDI Thru enabled, that foreign clock was previously being blindly re-sent to every other output, colliding with the app's own internally generated clock on shared devices and producing exactly that decaying-echo symptom.

**Fix:** set **Block Incoming Clock Thru** to **ON** (the default). Incoming Clock/Start/Continue/Stop is still used for the *Incoming Clock BPM* display above, but is never re-sent to your other outputs — the app's own generated clock stays the single source of truth for every device. This is confirmed to stop the echo; if you still see it after enabling this, the loop is happening outside SY.CORE (check the receiving device's own MIDI Thru/local-echo setting, or a delay/echo audio effect loaded on that device's channel-1 patch).

Only turn this off if you deliberately want one connected device's clock relayed to your other gear instead of the app being the master clock.

## Advanced

| Toggle | Meaning |
|---|---|
| **SysEx Support** | Re-requests WebMIDI access with `sysex: true`. The browser will prompt for permission again — needed for controller preset SysEx init strings and manual SysEx sending |

## Smart Latch

A global "hold notes after release" mode, independent of the per-device Latch available on each MIDI Flow node.

| Control | Meaning |
|---|---|
| **Enable Smart Latch** | Turns global latch on/off |
| **Max Notes** | How many held notes to keep sounding at once (1–32) |
| **Fade Time (ms)** | How long held notes ring out after latch is disabled, instead of cutting off instantly |

## Setups (Config Presets retired)

Config Presets are gone. A setup is now saved in a **project**: its MIDI Flow routing and its controllers (see *Projects* in the Controller Designer guide). Save and switch projects from the project button in the footer.

- The App Actions **Project 1–8** (the former MIDI Config Preset 1–8 slots) load the footer's projects in their order. Mappings made to the old slots keep working.

## Configuration — Export / Import / Reset

- **Export MIDI config as JSON** downloads routing, matrix, split, Smart Latch, mappings, and channel settings as a single file — useful for backups or moving your setup between machines.
- **Import MIDI config from JSON** restores from a previously exported file.
- **Reset all MIDI settings to defaults** — destructive, clears routing/registrations/mappings back to a clean install. Export first if in doubt.

## Emergency — PANIC

Sends All Notes Off / Reset All Controllers / Sustain Off on every channel to every connected output (real and virtual). Use this if notes get stuck. See also the per-instrument **Reconnect** button on a MIDI Flow node if a specific device stops responding after a stale connection.
