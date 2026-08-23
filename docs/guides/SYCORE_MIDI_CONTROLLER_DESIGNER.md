# MIDI Controller Designer

**Purpose:** Visual canvas for designing custom MIDI controller layouts with draggable controls, real-time feedback, and preset management. Auto-generate surface layouts from built-in templates (Akai MIDI Mix, Novation Launchpad Mini MK1, Novation Launchkey 49 MK4). Attach SysEx init strings that fire on preset activate.

<img src="/help/guides/sycore-controller-designer.png"/>

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

### Preset Enable/Disable

Enabled presets (toggled from the footer indicator) broadcast their controls to the MIDI engine. Multiple presets can be active simultaneously — controls merge by device assignment.

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