# DECK

**Purpose:** A performance-time synthesis of your MIDI Flow rig — one view showing every connected controller, app, and instrument, with live patch names, active channels, volume, and quick links into each device's real editor. Custom background image support, save/recall Performance Sets, independent Play/Stop for Drum Machine and Chord Prog.

<img src="../../help/guides/sycore-cockpit.png"/>

---

## Overview

DECK is not a wiring tool — [MIDI Flow](./SYCORE_MIDI_FLOW.md) is still where you drag nodes and draw cables to build your rig. DECK is what you glance at (and lightly touch) once that rig is wired: it reads the exact same live routing state MIDI Flow produces and lays it out as a single console — Controllers on the left, Apps on the right, a central display, and your Instruments docked along the bottom.

Everything in it is reactive. Add a device or app to the MIDI Flow canvas and it appears here immediately; change a patch in the Program Change panel and the patch list updates without reopening anything.

### Custom Background Image

Click the image icon in the DECK title bar to upload any image as the panel's background (stored locally, per browser). An X icon appears next to it to reset back to the default background.

### Performance Sets

DECK includes a **Save/Recall Performance Set** button in its bottom bar. This saves and restores the current instrument patches and device configuration using the same `usePerformanceSets` composable as the Multi Sound panel — useful for switching between complete patch configurations mid-performance.

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
| **SY.CORE / Mini Scope** | A compact oscilloscope reusing the Audio Visualizer's mic-capture engine, stripped down to just a waveform. Opt-in — click to start (no automatic mic prompt), and it stops capturing whenever DECK is closed. **Click the scope itself to toggle between waveform and a small spectrum view.** It shares its input-device choice with the full Audio Visualizer panel. |
| **Patch list** | One line per routed instrument, per **active channel** — a multi-timbral instrument with several channels active gets one line per channel, each with its own patch name and category. Updates live as patches change elsewhere. |
| **Play / Stop** (bottom-left) | The same global transport play/stop as the main Transport Bar — starts/stops every sync-enabled app together. Drum Machine and Chord Prog summary cards also have their own independent Play/Stop buttons, so either engine can be started without touching the main transport. |
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

- For a real controller or app (an actual MIDI Flow canvas node), DECK traces forward through the canvas's own cables — so multi-hop chains like *Controller → Step Sequencer → S-1* highlight correctly, not just direct connections.
- For a synthesized virtual-output-port entry (the **Port** badge), it highlights whichever virtual instruments are actually bound to that port, since there's no cable to trace.

If nothing highlights, the hovered controller/app simply has no cable drawn to it yet in MIDI Flow.

---

## Hardware Navigation (MIDI)

DECK can be driven entirely from a controller, without touching the mouse. Navigation moves a single focus cursor through four zones, in this order: **Controllers → Display → Apps → Instruments**. Moving zones jumps to the first item of the new zone; moving items cycles through the current zone's cards, wrapping at both ends. The focused card gets a dashed orange outline — the ring only appears once you've navigated at least once, so it stays out of the way if you never use hardware nav.

Seven actions make up the full control set:

| Action | Effect |
|---|---|
| **Prev / Next Zone** | Step the focus cursor to the previous/next zone. |
| **Zone Encoder** | A rotary alternative to Prev/Next Zone — turn either direction to step zones. |
| **Prev / Next Item** | Step the focus cursor to the previous/next card within the current zone. |
| **Item Encoder** | A rotary alternative to Prev/Next Item. |
| **Select** | Activates the focused card — same as clicking it (opens the app/panel, jumps to the instrument's Program Change, etc). |

**Mapping a controller** — two ways to assign them, both writing to the same underlying paramNames so either can be used interchangeably or combined:

- **Right on the panel** — the small nav cluster in DECK's bottom-left corner (zone buttons, item buttons, and the Select dot) is right-clickable: right-click any of the seven controls to open its own MIDI Learn menu and assign a note, button, or encoder directly.
- **From MIDI Controller Designer** — pick the **DECK Navigation** group in the app-param picker to assign any control on a custom preset (e.g. a whole hardware controller dedicated to running DECK) to these same seven actions.

**Encoders** are read as plain absolute CC — the default mode almost every hardware encoder ships in, no special "relative"/two's-complement controller configuration needed. Direction is derived from the wrap-safe delta between successive ticks, so continuous turning in one direction keeps stepping the same way even as the CC value wraps around 0/127. Buttons and notes fire once per press; CC-driven "buttons" get a rising-edge guard so holding one down doesn't repeat.

---

## Opening DECK

Launch it from the Performance Tools section of the app launcher/dock, or via Module Manager. It's a standard floating panel — drag, resize, minimize, and its position is remembered across sessions, same as every other panel.
