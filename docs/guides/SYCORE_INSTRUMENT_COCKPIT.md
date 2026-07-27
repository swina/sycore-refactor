# Instrument Cockpit

**Purpose:** A performance-time synthesis of your MIDI Flow rig — one view showing every connected controller, app, and instrument, with live patch names, active channels, volume, and quick links into each device's real editor.

<img src="/help/guides/sycore-cockpit.png"/>

---

## Overview

Instrument Cockpit is not a wiring tool — [MIDI Flow](./SYCORE_MIDI_FLOW.md) is still where you drag nodes and draw cables to build your rig. The Cockpit is what you glance at (and lightly touch) once that rig is wired: it reads the exact same live routing state MIDI Flow produces and lays it out as a single console — Controllers on the left, Apps on the right, a central display, and your Instruments docked along the bottom.

Everything in it is reactive. Add a device or app to the MIDI Flow canvas and it appears here immediately; change a patch in the Program Change panel and the patch list updates without reopening anything.

---

## Controllers (left column)

Only controllers actually **present as a node on the MIDI Flow canvas** are listed here — a device merely registered via [MIDI Devices](./SYCORE_MIDI_DEVICES.md)'s "Add to routing" button, but never dragged onto the canvas, won't show up.

Each card shows the device's [uploaded image](./SYCORE_MIDI_DEVICES.md) if one is set, otherwise the standard controller icon, plus an online/offline dot.

**Virtual instrument output ports:** every Virtual Instrument's real output port (the physical or software MIDI destination it actually sends through) also appears here, tagged with a small **Port** badge instead of the online dot — even though it was never dragged onto the canvas as its own node. This makes the real hardware/software behind a virtual instrument visible instead of hidden behind a dropdown.

---

## Apps (right column)

Only the internal MIDI apps (Step Sequencer, Chord Sequencer, Virtual Keyboard, Arpeggiator, Transport/Clock, Sound Engine, Drum Machine, Sampler) that are **present as a node on the MIDI Flow canvas** are listed — same rule as Controllers. Click one to jump straight to its panel (Transport/Clock has no dedicated panel of its own, so it's inert).

---

## Main Display

The center LCD-styled screen is the console's core:

| Element | Description |
|---|---|
| **BPM** (top-left) | The shared global tempo. Editable directly; right-click for MIDI Learn. |
| **MIDI Flow shortcut** | Jumps to the MIDI Flow canvas to rewire the rig. |
| **Panic** (top-right) | All-notes-off across every channel — the same action as MIDI Settings' Panic button. |
| **SY.CORE / Mini Scope** | A compact oscilloscope reusing the Audio Visualizer's mic-capture engine, stripped down to just a waveform. Opt-in — click to start (no automatic mic prompt), and it stops capturing whenever the Cockpit is closed. **Click the scope itself to toggle between waveform and a small spectrum view.** It shares its input-device choice with the full Audio Visualizer panel. |
| **Patch list** | One line per routed instrument, per **active channel** — a multi-timbral instrument with several channels active gets one line per channel, each with its own patch name and category. Updates live as patches change elsewhere. |
| **Play / Stop** (bottom-left) | The same global transport play/stop as the main Transport Bar — starts/stops every sync-enabled app together. |
| **Sync badges** | Sequencer / Chord Prog / Drum Machine / Backing Track — click to toggle whether that app starts and stops with the global transport. Shared state with the Transport Bar's own sync toggles. |

---

## Instruments (bottom row)

Every routed hardware and virtual instrument (anything that isn't a controller), sorted with real instruments first and virtual instruments after, alphabetically within each group. Card color follows the same per-type scheme as MIDI Flow's canvas nodes (rose = single instrument, violet = multi-timbral, amber = virtual), so a device looks the same whether you're wiring it or just checking on it.

Each card shows:
- **Identity** — uploaded image or type icon, name, online status, active channel(s)
- **Current patch** and category (per active channel, for multi-timbral instruments)
- **Thru / Clock / Transp** flag chips — click to toggle, same fields as MIDI Flow's per-device controls
- **Volume fader** — the same per-device MIDI CC volume as the Audio Mixer panel; right-click for MIDI Learn
- **Open Sound Engine** — only shown if this exact device is the one currently wired to the Sound Engine app node in MIDI Flow (this is resolved dynamically from the actual routing, not hardcoded to any specific instrument)
- **Open Program Change** — always available, jumps to that device pre-selected in the [Device Program Change](./SYCORE_DEVICE_PROGRAM_CHANGE.md) browser

---

## Hover to Highlight

Hovering a Controller or App highlights every Instrument it actually reaches:

- For a real controller or app (an actual MIDI Flow canvas node), the Cockpit traces forward through the canvas's own cables — so multi-hop chains like *Controller → Step Sequencer → S-1* highlight correctly, not just direct connections.
- For a synthesized virtual-output-port entry (the **Port** badge), it highlights whichever virtual instruments are actually bound to that port, since there's no cable to trace.

If nothing highlights, the hovered controller/app simply has no cable drawn to it yet in MIDI Flow.

---

## Opening the Cockpit

Launch it from the Performance Tools section of the app launcher/dock, or via Module Manager. It's a standard floating panel — drag, resize, minimize, and its position is remembered across sessions, same as every other panel.
