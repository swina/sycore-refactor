# MIDI Management Plan — Unified MIDI Manager

## Overview

The existing codebase already has strong MIDI foundations (`MidiService.ts`, `useMidiStore`, `useMappingStore`, multiple panels). The goal is **not a rewrite** — it is a **consolidation and extension** into a single, coherent Unified MIDI Manager surface. New features slot in as layered additions; existing logic is preserved and migrated incrementally.

---

## Phase 1 — Device Model & Auto-Detection

**Goal**: Classify devices automatically into three types and persist that metadata.

### 1.1 — Device Type Model (`src/core/midi/DeviceRegistry.ts`)

Create a typed device descriptor:

```typescript
type DeviceType = 'controller' | 'instrument-single' | 'instrument-multi' | 'audio-interface'

interface MidiDeviceDescriptor {
  id: string           // Stable internal key (name-based)
  name: string
  hasInput: boolean
  hasOutput: boolean
  type: DeviceType
  audioInterface: boolean
  online: boolean
  addedAt: number      // timestamp
}
```

- On device connect, heuristically classify by name keywords (known audio interfaces: "Focusrite", "SSL", "Motu", etc.; known controllers: "Launchpad", "Keystep", etc.)
- Persist the registry in `localStorage` so user overrides survive reloads
- Expose `useDeviceRegistry()` composable wrapping the registry store

**Files to create/modify**:
- `src/core/midi/DeviceRegistry.ts` — new
- `src/stores/useMidiStore.js` — integrate registry, replace ad-hoc name arrays
- `src/composables/useMidiInit.js` — call `DeviceRegistry.sync()` on connect/disconnect events


### Phase 1 — What was built

  src/core/midi/DeviceRegistry.ts (new)
  - DeviceType union: controller | instrument-single | instrument-multi | audio-interface
  - MidiDeviceDescriptor interface (id, name, hasInput/Output, type, online, addedAt, userOverride)
  - Heuristic classifyDevice() — matches ~60+ named devices/brands across all four categories; defaults unknown hardware to instrument-single
  - DeviceRegistry class — sync(), getAll(), getOnline(), setType(), remove(), clear(), onChange() for reactive subscriptions
  - Persists to localStorage under SYCORE_DEVICE_REGISTRY; survives reconnects and page reloads
  - Exported singleton deviceRegistry

  src/composables/useDeviceRegistry.ts (new)
  - Single shared onChange listener keeps a module-level ref in sync with the registry
  - Exposes: devices, onlineDevices, offlineDevices, controllers, instruments, audioInterfaces
  - Actions: setDeviceType(id, type), removeDevice(id), clearOffline()

  src/stores/useMidiStore.js (modified)
  - Imports deviceRegistry
  - refreshDevices() now calls deviceRegistry.sync(inputs, outputs) after every device list update — covers initial load, hot-plug, and disconnect events automatically (since addStateChangeListener →
  refreshDevices was already wired)

---

## Phase 2 — Routing & Filtering Expansion

**Goal**: Extend the existing routing matrix to cover all RFP requirements.

### 2.1 — Registration Config Extension (`useMidiStore`)

Extend the per-device `registration` object with the following new fields:

| New field | Type | Default |
|---|---|---|
| `receiveSyncIn` | boolean | false |
| `receiveSyncOut` | boolean | false |
| `receiveTransport` | boolean | true |
| `receiveNotes` | boolean | true |
| `receiveCC` | boolean | true |
| `midiThru` | boolean | false |
| `velocityMin` | 0–127 | 0 |
| `velocityMax` | 0–127 | 127 |
| `velocityMap` | `'linear' \| 'log' \| 'exp' \| 'fixed'` | 'linear' |

### 2.2 — Keyboard Split (`MidiService.ts`)

Add a `SplitConfig` type and processing step in `sendNote()`:

```typescript
interface SplitConfig {
  enabled: boolean
  splitNote: number      // 0–127
  lowDevice: string      // device name
  highDevice: string
  lowTranspose: number   // semitones
  highTranspose: number
}
```

Integrate into the KEYBOARD routing source path — notes below `splitNote` route to `lowDevice`, above to `highDevice`.

### 2.3 — Velocity Mapping in Service

Move velocity curve logic from `useMappingStore` into `MidiService.ts` as a transform step applied before dispatch. `useMappingStore` keeps the config state only.

**Files to modify**:
- `src/core/midi/MidiService.ts` — split processing, velocity transform
- `src/stores/useMidiStore.js` — new registration fields
- `src/stores/useMappingStore.js` — delegate velocity processing

 ---
###  Phase 2 — What was built

  MidiService.ts — 6 changes

  - DeviceRegistration interface extended with 5 new fields: midiThru, velocityMin, velocityMax, velocityMap, receiveSyncIn
  - SplitConfig interface exported — enabled, splitNote, lowDevice, highDevice, lowTranspose, highTranspose
  - splitConfig private property + setSplitConfig() public method with SY_LOG feedback
  - applyVelocityCurve() private helper — maps linear / log / exp / fixed curves to a 1–127 output
  - sendDirectToOutputByName() + sendNoteSplit() private helpers — send a note directly to a named output (used by split), applying per-device channel override and transposition
  - sendNoteOn / sendNoteOff — intercept KEYBOARD source when split is active; route to the correct half-device before the normal broadcast runs
  - handleIngress — input device hoisted for reuse; velocity gate (min/max) blocks notes outside range; velocity curve reshapes the byte before THRU routing and listener dispatch; receiveSyncIn === false
  suppresses clock/transport listeners per device
  - routeMessageToOutputs — midiThru === false on an output device blocks it from receiving THRU'd messages while still receiving direct sends

  useMidiStore.js — 3 changes

  - defaultRegistration() extended with midiThru: true, velocityMin: 0, velocityMax: 127, velocityMap: 'linear', receiveSyncIn: false
  - splitConfig reactive ref — loaded from localStorage (SYCORE_KEYBOARD_SPLIT), auto-synced to midiService.setSplitConfig() via a deep watcher on every change
  - setSplitConfig(patch) action — shallow-merges a partial update into splitConfig; both the state and service stay in sync automatically

---

## Phase 3 — MIDI Mapping Overhaul

**Goal**: Full mapping preset system with NRPN support, visual feedback, and per-preset save.

### 3.1 — Mapping Preset Model (`src/lib/midi-mapping-presets.ts`)

```typescript
interface MappingPreset {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  mappings: Record<string, string>       // key → param (existing format)
  appMappings: AppMidiMapping[]          // app actions
  velocityConfig: VelocityConfig
}
```

Store in IndexedDB (via existing `idb.ts`) under a `midi-mapping-presets` object store.

### 3.2 — Active Preset in `useMappingStore`

- `activePresetId: string | null`
- `presets: MappingPreset[]` (loaded on init)
- Actions: `savePreset(name)`, `loadPreset(id)`, `deletePreset(id)`, `duplicatePreset(id)`
- Auto-save current state to the active preset on any mapping change (debounced 500ms)

### 3.3 — NRPN Mapping

`MidiService.ts` already tracks NRPN assembly. Expose via a new key format: `"NRPN:MSB:LSB"` in the mappings dictionary. `useMidiCCListener.js` extends its lookup to handle NRPN keys.

### 3.4 — Visual Feedback

- Computed property `mappedParams: Set<string>` in `useMappingStore` — re-computed on any mapping change
- All param knobs/sliders consume `mappedParams` and apply a CSS class (e.g., `ring-2 ring-cyan-400`) when their field is mapped
- MIDI Learn indicator: existing `isMidiLearning` already drives a highlight — extend to show "mapped" state persistently

**Files to create/modify**:
- `src/lib/midi-mapping-presets.ts` — new
- `src/stores/useMappingStore.js` — preset system, NRPN keys
- `src/composables/useMidiCCListener.js` — NRPN lookup
- `src/core/midi/MidiService.ts` — expose NRPN value events
- Synth param components — consume `mappedParams`


### Phase 3 — What was built

  src/lib/midi-mapping-presets.ts (new)
  - MappingPreset and VelocityConfig TypeScript interfaces
  - loadMappingPresets() / persistMappingPresets() — IDB CRUD using the existing system store (no schema migration needed)
  - createPreset(name, partial) — factory with sensible defaults
  - AUTOSAVE_ID constant for the implicit auto-save slot

  src/stores/useMappingStore.js — 5 additions

  ┌──────────────────────────────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │                 What                 │                                                                              Detail                                                                               │
  ├──────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ learnedNRPN ref                      │ { msb, lsb } set during NRPN learn, cleared on cancel/confirm                                                                                                     │
  ├──────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ incomingNRPN(msb, lsb, device,       │ Called by the CC listener when NRPN is assembled during learn mode                                                                                                │
  │ channel)                             │                                                                                                                                                                   │
  ├──────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ confirmLearn                         │ Now handles both NRPN keys (Device:CH1:NRPN:0:74) and CC keys; CC branch unchanged                                                                                │
  ├──────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ mappedParams computed                │ Set<string> of all paramName values with an active mapping — re-computes on every mapping change; ready to drive CSS highlighting on synth knobs                  │
  ├──────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Preset CRUD                          │ loadPresets, savePreset, loadPreset, deletePreset, duplicatePreset; active preset id persisted to localStorage; deep watcher auto-saves to active preset 500 ms   │
  │                                      │ after any mapping change                                                                                                                                          │
  └──────────────────────────────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

  src/composables/useMidiCCListener.js — NRPN assembly added before the existing CC path
  - nrpnState plain object keyed by deviceName:channel — tracks partial NRPN (CC 99 → MSB, CC 98 → LSB)
  - CC 6 (Data Entry MSB) closes the NRPN: dispatches incomingNRPN in learn mode, or looks up Device:CH:NRPN:MSB:LSB → Device:NRPN:MSB:LSB → NRPN:MSB:LSB in mappings and calls applyParam; falls through to
  normal CC 6 handling if no NRPN state is pending

  src/composables/useMidiInit.js — loadPresets() now runs in parallel with loadAppMidiMappings() at startup
---

## Phase 4 — MIDI Monitor Upgrade

**Goal**: Replace/extend `MidiLoggerPanel.vue` with a full-featured real-time monitor.

### 4.1 — Message Model

```typescript
interface MidiLogEntry {
  id: number          // auto-increment
  timestamp: number
  direction: 'in' | 'out'
  device: string
  channel: number     // 1–16 or 0 for sysex/transport
  type: MidiMessageType
  data: number[]      // raw bytes
  decoded: string     // human-readable
  mapped: boolean     // true if this CC is in a mapping
}
```

Store max 500 entries in a non-reactive plain array (same pattern as `useMidiCapture`); expose a reactive `ref` that is replaced (not mutated) when UI wants a snapshot.

### 4.2 — Filters

- Direction toggle (IN / OUT / BOTH)
- Device multi-select
- Channel multi-select (1–16 + All)
- Message type checkboxes: Note, CC, PC, Transport, Clock, SysEx, NRPN
- Text search on the `decoded` field

### 4.3 — UI (`MidiMonitorPanel.vue`)

- Replaces `MidiLoggerPanel.vue`
- Virtualized list (only render visible rows) to handle high message volume
- Color-coded rows: green = Note On, red = Note Off, blue = CC, yellow = Transport, grey = Clock
- "Mapped" badge on CC rows that have an active mapping
- Pause / Clear / Export (JSON) controls

**Files to create/modify**:
- `src/components/MidiMonitorPanel.vue` — new (replaces/extends MidiLoggerPanel)
- `src/core/midi/MidiService.ts` — add outbound message logging hooks
- `src/stores/useMidiStore.js` — expose monitor log ref

### Phase 4 — What was built

  MidiService.ts — monitor infrastructure added

  ┌────────────────────────┬───────────────────────────────────────────────────────────────────────────────────────────┐
  │                        │                                                                                           │
  ├────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
  │ MidiMessageType        │ Union type: noteon | noteoff | cc | pc | pitchbend | clock | start | stop | sysex | other │
  ├────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
  │ MidiMonitorEntry       │ Exported interface: id, timestamp, direction, device, channel, type, data[], decoded      │
  ├────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
  │ _monitorBuffer[]       │ Plain array (max 500), non-reactive — no Vue overhead on high-frequency MIDI              │
  ├────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
  │ addMonitorListener(cb) │ Pub/sub with unsub return — components self-subscribe                                     │
  ├────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
  │ getMonitorBuffer()     │ Returns current buffer for replay on component mount                                      │
  ├────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
  │ clearMonitorBuffer()   │ Called from the panel's Clear button                                                      │
  ├────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
  │ _decodeRaw()           │ Decodes raw IN bytes → human-readable string + type                                       │
  ├────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
  │ _decodeOut()           │ Decodes outgoing broadcast params → human-readable string                                 │
  ├────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
  │ _appendMonitor()       │ Caps buffer at 500, notifies all listeners                                                │
  ├────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
  │ broadcast() log        │ One OUT entry per send call (clock excluded to prevent flooding)                          │
  ├────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
  │ handleIngress log      │ One IN entry per message that passes echo suppression                                     │
  └────────────────────────┴───────────────────────────────────────────────────────────────────────────────────────────┘

  useUiStore.js — isMidiMonitorOpen ref added and exported

  MidiMonitorPanel.vue (new, 220 lines)
  - Subscribes to midiService.addMonitorListener on mount; replays existing buffer immediately
  - Integrates system log events from app-system-log window events
  - Filters: direction (IN/OUT/BOTH), message type checkboxes (Note ON/OFF, CC, PC, Bend, Transport, SysEx, Clock, Other), device dropdown (auto-populated from seen devices), channel 1–16 selector, text search
   across decoded + device
  - Color coding: green = Note ON, dim-green = Note OFF, cyan = CC, violet = PC, blue = Pitch Bend, yellow = Transport, orange = SysEx, gray = Clock
  - "mapped" badge: appears on CC rows where the CC number has an entry in mappingStore.midiMappings
  - Controls: Pause/Resume, Clear (also clears service buffer), Export JSON, collapse/expand filter panel
  - Footer: live filtered / total count, pulsing LIVE indicator

---

## Phase 5 — Unified UI Shell

**Goal**: Consolidate all MIDI panels into a single tabbed `UnifiedMidiManager.vue` modal/panel.

### 5.1 — Tab Structure

| Tab | Component | Status |
|---|---|---|
| Devices | `DeviceListPanel.vue` (new) | replaces `MidiPortConfig.vue` header section |
| Routing | `MidiMatrix.vue` | existing, minor extension |
| Performance | `MidiPerformancePanel.vue` | existing |
| Mapping | `MidiMappingPanel.vue` | existing + preset switcher |
| Monitor | `MidiMonitorPanel.vue` | new (Phase 4) |
| App Actions | `AppMidiMapper.vue` | existing |
| Settings | `MidiSettingsPanel.vue` (new) | global MIDI settings |

### 5.2 — `DeviceListPanel.vue`

Per-device card showing:
- Device name + type icon (controller / instrument / audio-interface)
- Online/offline pill
- Input channel selector (OMNI, 1–16)
- Output channel selector (OMNI, 1–16)
- Quick-toggle checkboxes: Notes / CC / Clock / Transport / THRU
- "Edit" expands routing detail inline or opens `MidiMatrix` focused on that device
- Type override dropdown (in case auto-detection is wrong)

### 5.3 — `MidiSettingsPanel.vue`

- Global default input/output selectors
- BPM sync master (internal / MIDI clock in)
- MIDI Thru global toggle
- SysEx enable toggle
- Export / Import configuration (JSON file)
- Reset to defaults button

### 5.4 — Mapping Preset Switcher

Header section of the Mapping tab: dropdown listing saved presets + "New Preset" + "Duplicate" + "Delete" buttons. Active preset name shown in breadcrumb.

**Files to create/modify**:
- `src/components/UnifiedMidiManager.vue` — new shell
- `src/components/DeviceListPanel.vue` — new
- `src/components/MidiSettingsPanel.vue` — new
- `src/components/MidiMappingPanel.vue` — add preset switcher header
- `src/stores/useUiStore.js` — add `showUnifiedMidiManager` state, replace individual panel booleans

---

## Phase 6 — Preset Management (MIDI Config Presets)

**Goal**: Save/restore the entire MIDI configuration (routing + mappings + settings) as a named preset.

### 6.1 — Config Snapshot Model

```typescript
interface MidiConfigSnapshot {
  id: string
  name: string
  createdAt: number
  routingMatrix: Record<string, string[]>
  registrations: Record<string, DeviceRegistration>
  broadcastMode: boolean
  smartLatch: SmartLatchConfig
  activeMappingPresetId: string
  splitConfig: SplitConfig
}
```

Stored in IndexedDB under `midi-config-presets`.

### 6.2 — Actions in `useMidiStore`

- `saveConfigPreset(name)` — snapshot current state
- `loadConfigPreset(id)` — apply snapshot (device re-register if online)
- `autoSave()` — debounced save to `__autosave` id on every state mutation

### 6.3 — Preset Switching via MIDI

Extend `app-midi-actions.ts` with actions `midi-config-preset-1` through `midi-config-preset-8` so a MIDI CC value 0–7 can switch active config presets during performance.

---

## Phase 7 — Extended Features

Lower priority / post-MVP.

### 7.1 — MIDI Clock Sync with Drift Correction

In `MidiService.ts`, replace the simple BPM counter with a ring-buffer of 24 clock pulses to compute a rolling BPM average. Apply drift correction using exponential smoothing (α = 0.1). Emit `clockBpm` events with the smoothed value.

### 7.2 — SysEx Support

- Add SysEx enable flag (gated — WebMIDI requires `sysex: true` in `requestMIDIAccess`)
- Request SysEx permission separately with a user-facing explanation prompt
- `MidiLogEntry` handles raw bytes — SysEx renders hex in monitor
- `app-midi-actions.ts` can add a `sysex-send` action with a configurable hex payload

### 7.3 — MIDI Learn UX Polish

- "MIDI Learn" mode: blinking LED overlay on all knobs when active
- Timeout after 10s with toast notification
- After learn: flash the mapped knob green for 1s

---

## Migration Path (Zero Breakage)

1. All existing components remain functional throughout — new panels are additions
2. `useMidiStore` extended with new fields (all optional with defaults)
3. `DeviceRegistry` reads from existing registration data on first run
4. `UnifiedMidiManager.vue` wraps existing panels as tabs; old individual panel triggers remain working until explicitly removed in a cleanup PR
5. IndexedDB schema versioned — new object stores added without touching existing

---

## Branch & PR Structure

| PR | Scope |
|---|---|
| `feat/device-registry` | Phase 1 |
| `feat/routing-split-velocity` | Phase 2 |
| `feat/mapping-presets` | Phase 3 |
| `feat/midi-monitor` | Phase 4 |
| `feat/unified-ui-shell` | Phase 5 (depends on 1–4) |
| `feat/config-presets` | Phase 6 |
| `feat/sysex-clock-polish` | Phase 7 |

---

## Files Summary

| File | Action |
|---|---|
| `src/core/midi/DeviceRegistry.ts` | Create |
| `src/core/midi/MidiService.ts` | Extend (split, velocity, NRPN, SysEx, outbound log) |
| `src/stores/useMidiStore.js` | Extend (registry, split, config presets) |
| `src/stores/useMappingStore.js` | Extend (mapping presets, NRPN, visual feedback) |
| `src/lib/midi-mapping-presets.ts` | Create |
| `src/composables/useMidiCCListener.js` | Extend (NRPN lookup, mapped badge) |
| `src/composables/useMidiInit.js` | Extend (DeviceRegistry sync) |
| `src/components/UnifiedMidiManager.vue` | Create (tabbed shell) |
| `src/components/DeviceListPanel.vue` | Create |
| `src/components/MidiMonitorPanel.vue` | Create (replaces MidiLoggerPanel) |
| `src/components/MidiSettingsPanel.vue` | Create |
| `src/components/MidiMappingPanel.vue` | Extend (preset switcher) |
| `src/stores/useUiStore.js` | Extend (unified manager state) |
| `src/lib/app-midi-actions.ts` | Extend (config preset switch actions) |
