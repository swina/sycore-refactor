# MIDI Flow

**Purpose:** Visual, drag-and-drop MIDI routing canvas for connecting virtual apps and hardware devices — including device→app and app→app input routing.

<img src="/help/guides/sycore-midi-wizard-flow.png"/>

---

## Overview

The MIDI Flow panel provides a graphical canvas to build your MIDI routing topology. Drag sources from the sidebar, drop them onto the canvas, and connect them by drawing cables between ports. Routing applies **live** — every change is committed to the store automatically, no separate "apply" step required.

---

## Sidebar

The sidebar has two collapsible sections. Click a section header to expand/collapse it (chevron indicates state).

### MIDI Devices

All registered hardware/virtual devices from `midiStore.routingConfig.registrations`, color-coded by type:

| Type | Color |
|---|---|
| Controller | Sky blue |
| Instrument (Single) | Rose |
| Instrument (Multi) | Violet |
| Virtual Instrument | Amber |

Each device shows **IN**/**OUT** capability badges and has both an OUT port and an IN port on the canvas.

### MIDI Apps (Virtual Sources)

| App | Source ID | Has IN |
|---|---|---|
| Step Sequencer | `SEQUENCER` | ✓ |
| Chord Sequencer | `CHORD_PROG` | ✓ |
| Virtual Keyboard | `KEYBOARD` | ✓ |
| Arpeggiator | `ARP` | |
| Transport / Clock | `TRANSPORT` | |
| Sound Engine | `UI` | |
| Drum Machine | `DRUM_MACHINE` | ✓ |
| Sampler | `SAMPLER` | ✓ |

Every app has an **OUT** port. Apps marked "Has IN" also expose an **IN** port, so they can receive routed MIDI from a device or from another app (e.g. Chord Sequencer OUT → Virtual Keyboard IN).

---

## Canvas

Drop sidebar items onto the dot-grid canvas. Each dropped item becomes a movable node card:

- **App nodes** — purple-toned cards with the app icon, an OUT port, and an IN port if the app accepts input
- **Device nodes** — color-coded cards (by device type) with device name, IN port (left), OUT port (right), flag toggles, and channel selectors

Each app node's header also has an **open-app** shortcut (external-link icon) that jumps straight to that app's panel. Instrument device nodes (Instrument Single/Multi and Virtual Instrument — not Controllers) get the same icon, but it opens the **Device Program Change** panel pre-selected to that device instead. Every node's header also has the **X** button to remove it.

### Building Connections

1. **OUT port** → **IN port**: click and drag from a node's green OUT dot (right side) to another node's blue IN dot (left side)
2. A dashed bezier preview follows the cursor while dragging
3. Cables are colored by connection type:
   - **Lime** (`#a3e635`) — device to device
   - **Blue** (`#3b82f6`) — device to app (device→app input routing)
   - **Purple** (`#8b5cf6`) — app to app (app→app input routing)
4. A dashed cable indicates a device→app connection with an active note-range filter

### Note-Range Filters (Keyboard Split)

Click any device→app cable to open its note-range popover. Set **Low**/**High** (0–127) to restrict which notes flow through that connection — e.g. split one keyboard so the low half feeds the Drum Machine and the high half feeds the Step Sequencer. Leaving the full 0–127 range means no filtering.

### Removing Connections

Click on any cable to delete it (or open its note-range popover and use the remove action). An invisible wide hit-area path makes clicking easy.

### Removing Nodes

Click the **X** button on a node card to remove the node along with all its connected cables and any input-routing entries tied to it.

---

## Per-Device Configuration

Hardware device nodes expose inline controls:

| Control | Options |
|---|---|
| **SYNC** | Toggle MIDI clock sync on this device |
| **TRSP** | Toggle transport (Start/Stop/Continue) messages |
| **NOTE** | Toggle note on/off messages |
| **CC** | Toggle control change messages |
| **PC** | Toggle program change messages |
| **IN ch** | Input channel: OMNI or 1–16 |
| **OUT ch** | Output channel: OMNI or 1–16 |

---

## Virtual Instrument Configuration

Virtual Instrument nodes get two extra controls beyond the standard device controls above, since a virtual instrument isn't a real WebMIDI port:

| Control | Description |
|---|---|
| **Output port** | The real MIDI output that physically carries this virtual instrument's data. Also editable from [MIDI Devices](./SYCORE_MIDI_DEVICES.md)'s Virtual Instruments list — both controls update the same setting. |
| **Multi-CH out** | A 16-button channel grid for multi-timbral fanout — select any combination of channels (e.g. 1, 2, 4) to duplicate every outgoing note/CC/PC onto all of them at once, instead of a single channel. Useful for a virtual multi-instrument rack where several parts should sound together from one source (e.g. Chord Sequencer OUT feeding three layered parts). When at least one channel is selected here, it overrides the regular **OUT ch** selector above (shown disabled while overridden). Leave empty to fall back to OUT ch's single-channel behavior. |

---

## Saved Configurations

Use the **folder** button in the header to save, load, overwrite, or delete named canvas snapshots (nodes + cables):

- **Save** the current canvas under a new name
- Click a saved entry to **load** it — replaces the current canvas
- Hover an entry for **overwrite** (save icon) and **delete** (trash icon) actions
- The footer shows the currently loaded configuration name with a quick overwrite button
- The last loaded/saved configuration is remembered and automatically reloaded the next time MIDI Flow opens

---

## Live Routing

Routing changes apply automatically as you build the canvas — the footer's **Live** indicator confirms this. The **Re-apply** button forces a manual re-sync if needed, and the header **Reload** button (`RefreshCw`) re-reads the current store state and rebuilds the canvas from scratch, discarding unsaved canvas edits.

---

## Controller Designer

The header **CPU** button toggles the MIDI Controller Designer panel, accessible alongside the MIDI Flow canvas for a complete routing and control-mapping workflow.
