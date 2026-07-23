# User Session — Backup & Restore

**Purpose:** Export your entire SY.CORE user data set to a single JSON file, and restore it later (or on another device/browser) with one import.

---

## Overview

Click the **Save** icon in the footer toolbar (requires being logged in) to open the **User Session** dialog. It has two actions:

- **Export** — downloads a snapshot of your data as `SYCORE_Session_<timestamp>.json`
- **Import** — pick a previously exported `.json` file to restore it

Loading a session **overwrites** your current data — there's no merge. Export a fresh backup before importing an older one if you want to keep what you currently have.

---

## What's Included

| Category | Data |
|---|---|
| **S-1 Presets** | Your full preset library |
| **Chord Progressions** | Your saved Chord Progression Sequencer library (separate from the 8 in-app slots below) |
| **Controller Designer** | All saved MIDI Controller Designer layouts (controls + background image) |
| **Audio Mixer** | Saved mixer configurations and the 16 numbered channel-slot assignments |
| **MIDI Flow routing** | Device registrations, the routing matrix, device/app→app input routing, output note-range filters, keyboard split, virtual instruments, and all named saved MIDI Flow canvas configurations |
| **MIDI mappings** | MIDI Learn CC mappings and App Actions (MIDI CC/Note → high-level action) bindings |
| **Chord Prog slots & chain** | The 8 progression slots (A–H) and the chain sequence that links them |
| **Arp settings** | Enabled state, mode, BPM, subdivision, hold |
| **MIDI settings** | Output/input channel, send-clock |
| **UI settings** | Global mod CC, global transpose, toolbar icon size, active visualizer category, last sequencer config name |

**Not included** (by design): your login credentials, the Freesound API key, window/panel layout, theme preference, and pinned launcher apps — these are local device/browser preferences, not "session" data worth round-tripping.

---

## Export

1. Open **User Session** from the footer toolbar.
2. Click **Export**.
3. A `SYCORE_Session_<ISO-timestamp>.json` file downloads immediately — store it wherever you keep backups.

---

## Import

1. Open **User Session** from the footer toolbar.
2. Click **Import** and choose a previously exported `.json` file.
3. Presets, Chord Progressions, Controller Designer presets, and Audio Mixer configs restore immediately.
4. The page **automatically reloads** a moment later — this is required for the restored MIDI Flow routing, Chord Prog slots/chain, and Audio Mixer channel-slot assignments to actually take effect, since that data is only picked up when each store initializes.

---

## Notes

- Presets and Chord Progressions are restored in **snapshot mode** — the existing library is wiped first, then replaced with the imported one (not merged).
- Import requires being logged in, same as export.
- If the file isn't valid JSON or doesn't look like a SY.CORE session export, the import is rejected with an error message and nothing is changed.
