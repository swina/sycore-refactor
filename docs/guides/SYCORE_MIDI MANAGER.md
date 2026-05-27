# MIDI MANAGER — Technical & Commercial Reference

**Component:** `src/components/UnifiedMidiManager.vue`  
**Module:** SY.CORE — Unified MIDI Control Center  
**Version context:** release/0.0.6

---

## Overview

`UnifiedMidiManager` is the top-level modal shell that consolidates every MIDI management surface in SY.CORE into a single, tab-navigated workspace. It acts as a pure orchestrator: it holds no MIDI logic of its own, delegating all functionality to eight specialist sub-panels rendered conditionally by tab.

The panel opens via `uiStore.showUnifiedMidiManager` and is permanently available at `z-[900]` — the highest z-index in the application — ensuring it sits above all other overlays.

---

## Architecture

```
UnifiedMidiManager.vue  (orchestrator shell)
│
├─ DeviceListPanel.vue          [tab: devices]
├─ MidiMatrix.vue               [tab: routing]
├─ MidiPerformancePanel.vue     [tab: performance]
├─ MidiMappingPanel.vue         [tab: mapping]
├─ AppMidiMapper.vue            [tab: actions]
├─ MidiMonitorPanel.vue         [tab: monitor]
├─ MidiSyncMatrix.vue           [tab: sync]
└─ MidiSettingsPanel.vue        [tab: settings]
```

### State management

The shell owns only two pieces of state, both delegated to `useUiStore`:

| State | Key | Default |
|---|---|---|
| Panel visibility | `uiStore.showUnifiedMidiManager` | `false` |
| Active tab | `uiStore.unifiedMidiManagerTab` | `'devices'` |

Tab persistence across close/reopen is handled naturally because `uiStore` is a Pinia singleton — the last active tab survives without explicit persistence.

### Layout

- **Size:** `min(90vw, 1200px)` wide × `min(85vh, 860px)` tall — scales down on smaller viewports without breakpoints.
- **Tab bar:** centered in the header, between the title and the close button. Icons are always shown; labels are hidden below `sm` breakpoint.
- **Content area:** `flex-1 overflow-hidden` — each child panel is responsible for its own internal scrolling.
- **Dismiss:** clicking the backdrop (`@click.self`) closes the panel, as does the explicit close button.
- **Animation:** `umm` transition — 150ms opacity + scale(0.97) on enter/leave.

---

## Tab Reference

### Tab 1 — Devices (`DeviceListPanel.vue`)

**Purpose:** Device discovery, type classification, and per-device capability registration.

**Data source:** `useDeviceRegistry` composable + `useMidiStore.routingConfig.registrations`

**Capabilities:**

- Lists all known MIDI devices (online and offline), discovered via the Web MIDI API.
- Per-device type assignment: Controller, Instrument (Single), Instrument (Multi), Audio Interface. User overrides are flagged with an "custom type" badge.
- Online/offline status indicator per device.
- Per-device capability toggles for registered devices: **Notes**, **CC**, **Clock** (Sync), **Transport**, **MIDI Thru**.
- Per-device MIDI channel assignment: IN channel (OMNI or 1–16), OUT channel (pass-through or fixed 1–16).
- **Add to routing** button for unregistered hardware.
- **Refresh** — calls `midiStore.refreshDevices()` to re-scan Web MIDI API.
- **Clear offline** — removes stale devices no longer physically connected.

**Color scheme:** Sky (controller), Emerald (instrument-single), Violet (instrument-multi), Amber (audio interface).

---

### Tab 2 — Routing (`MidiMatrix.vue`, `embedded: true`)

**Purpose:** The core MIDI routing registry — which devices are active, what message types they pass, and how they interconnect.

**Data source:** `useMidiStore.routingConfig`, `useConfigStore`, `midiService`

**Dual view modes:**

| Mode | Description |
|---|---|
| **Grid** | Table with one row per registered device; toggle columns for In/Out/Sync/Transport/Notes/CC/PC |
| **Flow** | SVG animated graph — inputs on the left, ENGINE CORE in the center, outputs on the right, with animated dashed bezier curves |

**Grid columns:**

| Column | Notes |
|---|---|
| MIDI IN | Enable/disable + channel (OMNI or 1–16) |
| MIDI OUT | Enable/disable + channel (OMNI or fixed 1–16); multi-timbral devices show "DYNAMIC PART" when Part Selector is enabled |
| SYNC | Forwards MIDI clock (0xF8) to this device |
| TRSP | Forwards MIDI transport (Start/Stop/Continue) |
| NOTE | Forwards note data |
| CC | Forwards CC messages |
| PC | Enables Program Change; only shown when OUT is enabled |

**Global actions available within this tab:**

- **Panic** — sends All Notes Off on all active outputs via `midiStore.panic()`
- **Reset Matrix** — clears all registrations via `midiStore.clearRegistrations()`
- **Program Change** → opens `MidiDeviceProgramChangePanel` as a sub-overlay (see separate document)
- **Add Device** — searchable dropdown of all unregistered hardware detected by Web MIDI API

**Global settings (bottom of Grid view):**

| Setting | Store | Effect |
|---|---|---|
| Global Thru Bridge | `midiStore.routingConfig.globalThruEnabled` | Bridges all active inputs to all active outputs |
| Thru filters | `midiStore.routingConfig.thruFilters` | Limit bridge to Notes and/or CC |
| Live Pad Sync | `configStore.syncMidiTransportFromLivePad` | Sync MIDI Start/Stop with Live Pad transport |
| Part Selector | `configStore.enablePartSelector` | Show/hide multi-channel part selection UI |

**Reactive sync:** a `watch` on `routingConfig.registrations` (deep) calls `midiService.setRoutingConfig()` on every change, keeping the MIDI engine in sync without page reload.

---

### Tab 3 — Performance (`MidiPerformancePanel.vue`, `embedded: true`)

**Purpose:** Source-to-output routing matrix — controls which SY.CORE internal sources (and physical inputs) route to which hardware outputs.

**Data source:** `useMidiStore.routingMatrix`, `midiService`

**Sources (rows):**

| Source ID | Label | Role |
|---|---|---|
| `MidiSource.TRANSPORT` | Transport / Clock | Sends 0xF8/0xFA/0xFC |
| `MidiSource.SEQUENCER` | Sequencer | Step sequencer MIDI out |
| `MidiSource.ARP` | Arpeggiator | Arpeggiated note output |
| `MidiSource.KEYBOARD` | Keyboard | On-screen keyboard |
| `MidiSource.UI` | UI / Preview | Sound library preview |
| *(dynamic)* | Physical inputs (inEnabled) | MIDI Thru from hardware inputs |

**Outputs (columns):** All registered devices with `outEnabled: true`, sorted with the experimental thru output first.

**Dual view modes:** Grid (checkbox matrix) and Flow (SVG bezier visualization — sources left, outputs right).

**Features beyond the matrix:**

- **Smart Latch** — holds incoming notes. Configurable: max notes (1–8), fade-out time (0–5000ms), FIFO replace mode.
- **Broadcast Mode** — overrides the matrix; sends all messages to all active devices simultaneously. Dims the matrix UI when active.
- **Sequencer Sync** — links global MIDI Start/Stop to internal sequencer playback.
- **Smart Latch per-device** toggle (lock icon on each output column header).
- **Experimental THRU** — dedicated USB icon marks the experimental thru output.

---

### Tab 4 — Mapping (`MidiMappingPanel.vue`, `embedded: true`)

**Purpose:** MIDI CC → application parameter mapping with preset management.

**Data source:** `useMappingStore`, `useConfigStore.midiConfig`, `S1_CC_MAP`, `midiService`

**MIDI Learn workflow:**

1. Press **MIDI LEARN** → raw listener attached via `midiService.addRawListener()`.
2. Move a physical knob/fader → CC number, device name, and channel are detected and displayed.
3. Select a target parameter from the dropdown (S-1 hardware parameters + registered configStore params, deduplicated and sorted).
4. Press **Confirm Mapping** → stored in `mappingStore.midiMappings`.

**Preset management:**

- Named presets stored in `mappingStore`. CRUD: save, load, duplicate, delete.
- Active preset shown with mapping count.

**Mapping entry format:**

```ts
{ cc: number, paramName: string, device: string, channel: number }
```

**Parameter sources merged into the dropdown:**

| Source | Category label |
|---|---|
| `S1_CC_MAP` constants | `S-1 HARDWARE` |
| `configStore.midiConfig` entries | `REGISTERED` or entry-provided category |

---

### Tab 5 — Actions (`AppMidiMapper.vue`, `embedded: true`)

**Purpose:** Per-device app action binding — maps MIDI CC/Note inputs to high-level SY.CORE actions (e.g. start sequencer, toggle looper, change preset).

**Data source:** `useMappingStore`, `useMidiStore`, `APP_ACTION_LABELS`, `MIDI_ACTION_GROUPS`, `useMidiFeedback`

**Capabilities:**

- MIDI Learn for app actions (CC and Note detection).
- Action selection organized in collapsible category groups (`MIDI_ACTION_GROUPS`).
- Trigger mode: `any` value, or exact value (for velocity/value-specific triggers).
- Per-device output selection (registered outputs with online/offline status).
- Built-in **Program Change sub-panel** (`ProgramChangeBrowser`): select channel, optional MSB (CC 0) / LSB (CC 32), program number (1–128) with live auto-send on value change.
- MIDI feedback testing via `useMidiFeedback.testFeedback`.
- Clock restart after Program Change (if `midiStore.sendClock` is active).

---

### Tab 6 — Monitor (`MidiMonitorPanel.vue`, `embedded: true`)

**Purpose:** Real-time MIDI message logger with filtering, pause, and JSON export.

**Data source:** `midiService.addMonitorListener()`, `window` event `app-system-log`

**Buffer:** Up to 500 entries (circular; oldest entry dropped when limit is reached). Uses `shallowRef` for the log array to avoid deep Vue reactivity overhead on high-frequency events.

**Controls:**

| Control | Description |
|---|---|
| Start / Stop | Attach / detach the monitor listener |
| Pause | Freeze the display while still capturing (messages buffered) |
| Direction filter | IN only / OUT only / Both |
| Type checkboxes | Note ON, Note OFF, CC, PC, Pitch Bend, Start, Stop, SysEx, Clock, Other |
| Device filter | Dynamically populated from devices seen in the current session |
| Channel filter | 1–16 or All |
| Search | Text filter on decoded message string and device name |
| Clear | Wipes the log buffer and calls `midiService.clearMonitorBuffer()` |
| Export | Downloads `midi-monitor-{timestamp}.json` of the filtered view |

**Color coding per message type:**

| Type | Color |
|---|---|
| Note ON | Emerald |
| Note OFF | Emerald (dim) |
| CC | Cyan |
| PC | Violet |
| Start | Yellow |
| Stop | Yellow (dim) |
| Pitch Bend | Blue |
| SysEx | Orange |
| Clock | Neutral (dimmed) |
| SYSTEM log | Indigo italic |

**Mapped badge:** CC entries whose CC number matches an active `mappingStore` mapping are tagged with a `mapped` badge.

**System log integration:** listens to the custom DOM event `app-system-log` (emitted by internal SY.CORE components via `window.SY_LOG`), surfacing internal log messages inside the same stream.

---

### Tab 7 — Sync (`MidiSyncMatrix.vue`)

**Purpose:** Cross-subsystem transport synchronization matrix — which playback sources trigger which other playback targets when started/stopped.

**Data sources:** `useMidiStore`, `useConfigStore`, `useSyncStore`

**Matrix structure (rows = trigger sources, columns = targets):**

| Source \ Target | MIDI START/STOP | Step Sequencer | Backing Track | Audio Looper | Audio Capture |
|---|---|---|---|---|---|
| **Backing Track** | `syncMidiTransport` | `syncStore.syncTrack` | — | `syncStore.syncBackingTrackToLooper` | `syncStore.syncRecordAudioCapture` |
| **Step Sequencer** | `syncSequencerTransport` | — | `syncStore.syncTrack` | `syncStore.syncSequencerToLooper` | — |
| **Live Performance Pad** | (configurable) | (configurable) | (configurable) | (configurable) | (configurable) |

Each cell is an independent boolean toggle. Enabling a cell means "when this row's transport changes state, also trigger the column's transport." `null` cells (self-sync) are rendered as N/A and are not interactive.

---

### Tab 8 — Settings (`MidiSettingsPanel.vue`)

**Purpose:** MIDI configuration persistence — named presets for the full routing configuration, plus full JSON export/import.

**Data source:** `useMidiStore.configPresets`, `useMappingStore`

**Config Presets:**

- Named snapshots saved to `midiStore` via `saveConfigPreset(name)`.
- Load via `loadConfigPreset(id)`, delete via `deleteConfigPreset(id)`.
- The `__autosave__` preset ID is reserved and excluded from the user-visible list.

**Export snapshot keys (written to `sy-midi-config-{timestamp}.json`):**

| Key | localStorage source |
|---|---|
| `routing` | `SYCORE_ADVANCED_MIDI_ROUTING` |
| `matrix` | `S1_MIDI_ROUTING` |
| `split` | `SYCORE_KEYBOARD_SPLIT` |
| `smartLatch` | `SYCORE_SMARTLATCH_*` (active, max, replace, fade) |
| `mappings` | `midiMappings` |
| `channel` | `midiChannel` |
| `inChannel` | `midiInputChannel` |

**Import:** reads a previously exported JSON and restores all keys into localStorage.

---

## Store Dependencies Summary

| Store | Tabs that use it |
|---|---|
| `useMidiStore` | Routing, Performance, Mapping, Actions, Sync, Settings |
| `useUiStore` | Shell (visibility + tab), Monitor, Actions |
| `useConfigStore` | Routing, Performance, Mapping |
| `useMappingStore` | Mapping, Actions, Monitor, Settings |
| `useSyncStore` | Sync |
| `useDeviceRegistry` | Devices |
| `midiService` (singleton) | Routing, Performance, Mapping, Monitor |

---

## Visual Design

- **Framework:** Vue 3 `<script setup>` + Tailwind CSS
- **Icons:** Lucide Vue Next
- **Container:** `bg-neutral-950`, `border-neutral-800`, `rounded-2xl`, `shadow-2xl`
- **Tab bar:** centered in header; active tab has `bg-emerald-500/20 text-emerald-400 border border-emerald-500/30`; icon labels hidden on small screens
- **Entry animation:** `umm` transition — 150ms, opacity + scale(0.97)
- **Accent color per tab:**
  - Devices: Emerald / Sky / Violet / Amber (by device type)
  - Routing: Emerald
  - Performance: `synth-neon` (custom brand color, `#00FFCC`)
  - Mapping: `synth-neon`
  - Actions: Violet / Emerald
  - Monitor: Cyan
  - Sync: Emerald / Amber
  - Settings: Neutral

---

## Commercial Value Proposition

### Single entry point for all MIDI configuration

Before `UnifiedMidiManager`, users had to navigate multiple separate panels scattered across the application to complete a common workflow like "add a new device, configure its routing, map a knob to a parameter, and verify the messages arrive." The manager collapses this into a single modal with a tab bar — the entire MIDI setup workflow is contained in one place.

### Suitable for complex live rigs

A performer with multiple hardware devices (synthesizers, drum machines, controllers) can use the Routing tab to configure every device once, then save the entire state as a named preset in the Settings tab. On the next session, one preset recall restores the full rig configuration, including bank select, channel assignments, and CC mappings.

### Visibility without separate tools

The Monitor tab gives the user a real-time MIDI traffic view that is typically only available in dedicated standalone applications (e.g. MIDI Monitor, MIDI-OX). Having this built in means debugging routing problems, verifying CC values, and identifying unexpected messages does not require switching to an external tool.

### Broadcast Mode for rehearsal

Broadcast Mode (Performance tab) allows a performer to send all internal sources to all connected devices simultaneously — useful during sound checks or when the user wants to quickly audition a sequence or arpeggio across the whole rig without setting up individual routes first.

### Smart Latch for solo performance

Smart Latch (Performance tab) holds notes that are released from a keyboard, allowing single-handed performance with sustained chords. The configurable FIFO replace and fade-out time make it usable across a range of musical styles from simple drone to chord cycling.

### Sync Matrix for multi-engine coordination

The Sync tab exposes cross-engine transport coupling as a grid that even non-technical users can read. A single toggle cell answers the question "when the backing track starts, should the sequencer also start?" — without any scripting or external DAW integration.

### No external dependencies

The entire MIDI stack — routing, monitoring, CC mapping, transport sync, Program Change dispatch — runs in the browser using the Web MIDI API. There is no required plugin, driver, or companion app. `UnifiedMidiManager` is the operational surface for this stack.

---

## Constraints & Limitations

- Tab switching does **not** animate between panels — children mount/unmount via `v-if`/`v-else-if`, so any ephemeral in-panel state (e.g. Monitor log, scroll position) is lost when switching tabs.
- The Flow view in both Routing and Performance tabs uses fixed pixel coordinates in SVG bezier paths. With a large number of devices (> 6–8), nodes will overlap. The view is informational, not interactive.
- `MidiMatrix` and `MidiPerformancePanel` both support `embedded: true` but include their own full headers when not embedded. When used inside `UnifiedMidiManager`, these headers render inside the tab content area, creating a secondary header below the main tab bar. This is cosmetically redundant but functionally harmless.
- Settings export reads directly from `localStorage` by key — if another part of the app uses different keys for the same data, those values will be missed.
- The 500-entry monitor buffer is not persisted; closing the panel or switching tabs clears the log.
