# MIDI Controller Designer

**Purpose:** Visual canvas for designing custom MIDI controller layouts with draggable controls, real-time feedback, and preset management. Auto-generate surface layouts from built-in templates (Akai MIDI Mix, Novation Launchpad Mini MK1, Novation Launchkey 49 MK4). Attach SysEx init strings that fire on preset activate.

<img src="../../help/guides/sycore-controller-designer.png"/>

---

## Canvas & Controls

- Drag from the **toolbar palette** (Switch, Moment, Slider, Encoder) onto the canvas to place controls.
- **Select** a control by clicking it — drag to reposition, resize via handles on edges/corners.
- **Lasso select** by holding Shift + dragging on the canvas to select multiple controls.
- **Delete** selected controls with the toolbar Trash button or the `Delete` key.
- **Clear All** removes every control from the canvas.

### Control Types

| Type | Behavior |
|---|---|
| **Switch** | Toggle on/off pad — sends CC value 127/0 on each press |
| **Moment** | Momentary pad — sends CC 127 while held, 0 on release |
| **Slider** | Vertical fader — sends CC values 0–127 based on position |
| **Encoder** | Rotary knob — sends CC increment/decrement values |

### Control Properties

Each control has editable properties via the **Properties Panel** (right sidebar):
- **Label** — display name shown on the control
- **Color** — visual color (can also be set from the toolbar palette)
- **MIDI CC** — the CC number to send
- **MIDI Channel** — per-control channel (overrides device default)
- **Min / Max** — output value range clamping

---

## Preset Management

- **New Preset** (`:Plus:`) — creates a blank preset with a chosen name
- **Duplicate Preset** (`:Copy:`) — clones the active preset with all controls, prompting for a new name
- **Preset Selector** — dropdown to switch between saved presets
- **Save** (`:Save:`) — persists all presets to IndexedDB via `persistControllerPresets()`

### Auto-Generate Surface Layout

If the currently selected device has a known template (Akai MIDI Mix, Novation Launchpad Mini MK1, Novation Launchkey 49 MK4), a **Generate Layout** button appears in the toolbar. One click populates the canvas with correctly positioned and pre-wired controls matching that controller's physical layout, with CC numbers and channels pre-assigned.

### SysEx Init

Attach a SysEx dump string to any controller preset via the **Preset Settings** drawer (visible in the right panel when no control is selected). The SysEx fires automatically on preset activate, with a manual **Send Now** button. Supports hex (`F0 … F7`), 0x-prefixed, and decimal formats.

### Presets are setups: turn them on and off

A preset holds the mappings of its controls. Only the presets that are **on** are mapped. Turn them on and off from the footer's **Controller Presets** (hover the icon, tick the presets). The choice is kept when you reload.

- **On**: its actions and parameters work, with LEDs, whether the Designer is open or not.
- **Off**: its mappings are removed. Your own MIDI Learn and App MIDI Mapper mappings are not touched.
- Several presets can be on together, for different controllers or for the same one. When two presets that are on use the same button, the one later in the list wins.
- So one controller can have several setups (e.g. *MIDImix Mixer* and *MIDImix Slots*): tick the one your rig needs.
- A MIDI Learn mapping you made by hand on a button a preset uses is replaced while that preset is on.

### Projects: a setup with its controllers

A **project** is your rig: its MIDI Flow setup plus the controller presets that are on with it. You always work in a project. The footer shows the current one (violet button, next to the workspaces).

- **First start**: SY.CORE asks you to name your first project, then opens MIDI Flow. **Later** creates it and lets you set it up afterwards. If you already used SY.CORE, it makes **My project** from what you have (and your earlier MIDI Flow projects), so nothing changes.
- **The current project follows what you do**: load a setup in MIDI Flow, or turn a preset on / off in Controller Presets, and the project keeps it.
- **Switch**: click the project button in the footer, then a project. SY.CORE loads its setup and turns on exactly its presets.
- **Same setup, different controllers**: two projects on one setup, e.g. *Studio · Perf* (MIDImix Mixer on) and *Studio · Live* (none on). The routing is saved once.
- **Saving a setup** in MIDI Flow asks **Controllers for this setup**. Keep the current project's name to update it, or type another to make a new project. **Setup only** saves just the routing.
- **New** (footer): a project from what is on screen now. **Rename**, **Duplicate**, **Delete** (the setup and the presets stay; the last project can't be deleted).
- **Export** saves a project as a file with its setup and the presets it uses. **Import** adds it as a new project, so nothing of yours is overwritten. An identical setup or preset is reused; a different one with the same name is added beside yours.

---

## Device Assignment

Each preset can be assigned to a specific MIDI input device. When assigned, controls only respond to and send on that device. Unassigned presets apply globally.

Controls inherit the preset's device assignment but can override it per-control via the Properties Panel.

---

## Simulate Mode

Toggle **Simulate** (`:Radio:`) to interact with controls visually without sending MIDI. Useful for testing layout and behavior before assigning real CC numbers.

---

## Sweep & Automation

Drag vertically across any pad control in **Simulate Mode** to trigger a MIDI CC sweep — the control smoothly ramps through its value range, useful for testing parameter response on your hardware.

---

## Feedback & Monitor

Controls show real-time value feedback when receiving MIDI CC messages from assigned devices. The value indicator updates on every incoming CC matching the control's configured number and channel.

---

## Mappable Actions & Apps

The **Actions** and **Apps** lists in the mapping drawer are sorted alphabetically by group/section name for easier scanning.

### Virtual Instrument CC Table

Each virtual instrument can have a named CC table (CC number + label), edited from a button on its card in [MIDI Devices](./SYCORE_MIDI_DEVICES.md). Named entries appear as an assignable action group in the Controller Designer's action picker, with a per-assignment **Target Channel** selector — useful since one CC table is shared across every channel of a multitimbral instrument, but a physical controller can usually only transmit on one fixed channel.

### DECK Navigation

The **DECK Navigation** group in the app-param picker exposes seven actions for driving DECK from a hardware controller without touching the mouse:

| Action | Effect |
|--------|--------|
| **Next/Prev Zone** | Step the focus cursor between Controllers, Display, Apps, and Instruments |
| **Zone Encoder** | Rotary alternative to Prev/Next Zone |
| **Next/Prev Item** | Step through cards within the current zone |
| **Item Encoder** | Rotary alternative to Prev/Next Item |
| **Select** | Activate the focused card (opens app/panel/jumps to Program Change) |

These write to the same paramNames that DECK's on-screen right-click MIDI Learn menus use, so either approach can be used interchangeably.

### Audio Mixer

The **Audio Mixer** action group provides per-channel Volume, Mute, and Solo controls (up to 16 channels), plus a Toggle Mixer action — each with numbered channel-slot assignments and a save/update/load configuration system.

## LED feedback

SY.CORE lights the LEDs of mapped buttons from the app's state, with every panel closed. It sends the button's own note / CC back to the controller: 127 / 0 for MIDI Learn mappings, the **LED Feedback** values for app mappings. Only changes are sent. A mapping with no device gives no LED.

| Mapping | Lit while |
|---|---|
| `mix_ch<N>_mute`, `mix_<source>_mute` (MIDI Learn), **Mixer ch N Mute** (app) | that mixer channel is muted |
| `dm_play_stop` | the Drum Machine plays |
| `dm_seq_<a–h>` | that pattern is the current one |
| `cp_play` | the Chord Prog plays |
| `cp_slot_<0–7>` | that Chord Prog slot is the current one |
| `seq_play`, `seq_play_stop` | the Sequencer plays |
| `arp_active`, **Toggle Arp** | the arpeggiator is on |
| panel toggles (app) | the panel is open |

A controller in **Live** mode (footer **Live / Perf**, see the Ableton Live guide) gets no LEDs. Its LEDs are turned off when Live mode starts and sent again in full when it comes back to Performance.

**AKAI MIDImix**: one LED of one colour per button. The Mute row is amber, the Rec Arm row is red, and Bank ◀ ▶ light too. A strip can show four states with its two buttons: off, amber, red, both. The LEDs answer the factory notes (Mute 1, 4, 7 … 22; Rec Arm 3, 6, 9 … 24), so map those buttons as notes.
