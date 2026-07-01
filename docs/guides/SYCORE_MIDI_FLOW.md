# MIDI Flow

**Purpose:** Visual, drag-and-drop MIDI routing canvas for connecting virtual apps and hardware devices.

<img src="/help/guides/sycore-midi-wizard-flow.png"/>

---

## Overview

The MIDI Flow panel provides a graphical canvas to build your MIDI routing topology. Drag sources from the sidebar, drop them onto the canvas, and connect them by drawing cables between ports. Once configured, commit the wiring to the active routing matrix.

---

## Sidebar

Two sidebar sections list draggable items:

### MIDI Apps (Virtual Sources)

| App | Source ID |
|---|---|
| Step Sequencer | `SEQUENCER` |
| Arpeggiator | `ARP` |
| Virtual Keyboard | `KEYBOARD` |
| Chord Progression | `CHORD_PROG` |
| Drum Machine | `DRUM_MACHINE` |
| Loop Machine | `LOOP_MACHINE` |
| MIDI Learn / CC | `MIDI_CC` |

Each app has only an **OUT** port — it sends MIDI but cannot receive.

### MIDI Devices (Hardware)

All registered hardware devices from `midiStore.routingConfig.registrations`. Each device shows IN/OUT capability badges and has both an **OUT** port and an **IN** port.

---

## Canvas

Drop sidebar items onto the dot-grid canvas. Each dropped item becomes a movable node card:

- **App nodes** — purple-toned cards with app icon, OUT port only
- **Device nodes** — dark cards with device name, IN port (left) and OUT port (right), flag toggles, and channel selectors

### Building Connections

1. **OUT port** → **IN port**: Click and drag from a node's green OUT dot (right side) to another node's blue IN dot (left side)
2. A dashed bezier preview follows the cursor while dragging
3. Cables appear as colored SVG bezier curves:
   - **Purple** (`#8b5cf6`) — app to device connections
   - **Lime** (`#a3e635`) — device to device connections

### Removing Connections

Click on any cable to delete it. An invisible wide hit-area path makes clicking easy.

### Removing Nodes

Click the **X** button on a node card to remove both the node and all its connected cables.

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

## Apply Routing

Once connections are built, click **Apply Routing** in the footer to commit the visual wiring to the store. This calls `midiStore.addRegistration`, `midiStore.updateRegistration`, and `midiStore.setRouting` for each source/destination pair. The connection count is displayed in the footer.

Use the header **Reload** button (`:RefreshCw:`) to re-read the current store state and rebuild the canvas from existing routing data.

---

## Controller Designer

The header **CPU** button toggles the MIDI Controller Designer panel, accessible alongside the MIDI Flow canvas for a complete routing and control-mapping workflow.