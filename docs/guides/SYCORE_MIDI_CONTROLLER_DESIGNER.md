# MIDI Controller Designer

**Purpose:** Visual canvas for designing custom MIDI controller layouts with draggable controls, real-time feedback, and preset management.

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