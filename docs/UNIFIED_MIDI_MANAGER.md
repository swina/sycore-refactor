# UNIFIED MIDI MANAGER

Request of proposal for a unified MIDI Management

This document is a request for proposals (RFP) for the creation of a comprehensive MIDI management system for the SY.CORE synthesizer application. The system will replace the existing MIDI functionality and provide a unified, user-friendly interface for MIDI configuration, mapping, and control.

## SCOPES

1. Automatic Device Detection:
    - MIDI IN/OUT Devices without Audio Interface (MIDI CONTROLLER)
    - MIDI IN/OUT Devices with Audio Interface (MIDI INSTRUMENTS SINGLE/MULTITIMBRAL)
    - Audio Interfaces with MIDI support

2. Routing and Filtering:
    - MIDI INPUT Channel assign (OMNI,1-16)
    - MIDI OUTPUT Channel assign (OMNI, 1-16)
    - RECEIVE SYNC IN/OUT assign (OFF, ON)
    - RECEIVE TRANSPORT 
    - RECEIVE NOTES
    - RECEIVE CC#
    - MIDI CONTROLLERS CAN BE ASSIGNED TO MULTIPLE MIDI INSTRUMENTS
    - MIDI THRU (PASS-THROUGH)
    - KEYBOARD SPLIT
    - VELOCITY MAPPING/FILTERING

3. MIDI MAPPING:
    - Dynamic Mapping: Allow users to map MIDI CC messages (including NRPN) to specific synthesizer parameters. This mapping should be saved with the preset and should persist when the device is disconnected and reconnected.
    - Mapping Presets: Users should be able to create, save, and manage multiple mapping presets.
    - Visual Feedback: Provide visual feedback in the UI to indicate which MIDI messages are mapped to which parameters.

4. MIDI Monitor:
    - Real-time Display: Display incoming and outgoing MIDI messages in real-time.
    - Filtering: Allow users to filter the displayed messages (e.g., by channel, message type).
    - Visual Indication: Highlight important messages (e.g., note on/off, CC changes).

5. Preset Management:
    - Preset Storage: Allow users to save their current MIDI configuration (including mappings, routing, and filter settings) as a named preset.
    - Preset Switching: Allow users to switch between saved presets, either through the UI or via MIDI messages.
    - Auto-Save: Automatically save the current MIDI configuration when the application is closed.

6. System Configuration:
    - MIDI Settings: Allow users to configure MIDI settings such as MIDI channel assignments, sync settings, and other MIDI-related options.
    - Device Preferences: Allow users to set default MIDI devices for input and output.

## USER INTERFACE REQUIREMENTS

The MIDI Management system should provide a clean, intuitive user interface with the following features:

- MIDI Devices View: A clear list of detected MIDI devices with their status (connected/disconnected).
- Routing Configuration: A dedicated section for configuring MIDI routing and filtering settings.
- Mapping Interface: A visual interface for creating and editing MIDI mappings.
- Monitor View: A real-time MIDI monitor with filtering capabilities.
- Preset Management: A section for managing MIDI presets.
- System Settings: A section for configuring MIDI system settings.

## TECHNICAL REQUIREMENTS

- The system should be implemented as a modular, reusable module that can be easily integrated into the existing application.
- The system should use the Web MIDI API for MIDI device communication.
- The system should provide a clear and consistent API for accessing and controlling MIDI functionality.
- The system should be fully compatible with the existing application's architecture.

## EXTENDED FEATURES (OPTIONAL)

- MIDI Learning: A "MIDI learn" mode that allows users to easily map MIDI controllers to parameters by simply moving the physical controller.
- MIDI Clock Synchronization: Robust MIDI clock synchronization with drift correction and phase alignment.
- SysEx Support: Support for System Exclusive messages for advanced device control and configuration.
- MIDI Thru: A " MIDI thru" mode that allows MIDI data to be passed through the application to other devices.

# PLAN
 Overview

  The existing codebase already has strong MIDI foundations (MidiService.ts, useMidiStore, useMappingStore, multiple panels). The goal is not a rewrite — it's a consolidation and extension into a single,
  coherent Unified MIDI Manager surface. New features slot in as layered additions; existing logic is preserved and migrated incrementally.

  ---
  Phase 1 — Device Model & Auto-Detection

  Goal: Classify devices automatically into three types and persist that metadata.

  1.1 — Device Type Model (src/core/midi/DeviceRegistry.ts)

  Create a typed device descriptor:

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

  - On device connect, heuristically classify by name keywords (known audio interfaces: "Focusrite", "SSL", "Motu", etc.; known controllers: "Launchpad", "Keystep", etc.)
  - Persist the registry in localStorage so user overrides survive reloads
  - Expose useDeviceRegistry() composable wrapping the registry store

  Files to create/modify:
  - src/core/midi/DeviceRegistry.ts — new
  - src/stores/useMidiStore.js — integrate registry, replace ad-hoc name arrays
  - src/composables/useMidiInit.js — call DeviceRegistry.sync() on connect/disconnect events

  ---
  Phase 2 — Routing & Filtering Expansion

  Goal: Extend the existing routing matrix to cover all RFP requirements.

  2.1 — Registration Config Extension (useMidiStore)

  Extend the per-device registration object:

  ┌──────────────────┬──────────────────────────────┬──────────┐
  │    New field     │             Type             │ Default  │
  ├──────────────────┼──────────────────────────────┼──────────┤
  │ receiveSyncIn    │ boolean                      │ false    │
  ├──────────────────┼──────────────────────────────┼──────────┤
  │ receiveSyncOut   │ boolean                      │ false    │
  ├──────────────────┼──────────────────────────────┼──────────┤
  │ receiveTransport │ boolean                      │ true     │
  ├──────────────────┼──────────────────────────────┼──────────┤
  │ receiveNotes     │ boolean                      │ true     │
  ├──────────────────┼──────────────────────────────┼──────────┤
  │ receiveCC        │ boolean                      │ true     │
  ├──────────────────┼──────────────────────────────┼──────────┤
  │ midiThru         │ boolean                      │ false    │
  ├──────────────────┼──────────────────────────────┼──────────┤
  │ velocityMin      │ 0–127                        │ 0        │
  ├──────────────────┼──────────────────────────────┼──────────┤
  │ velocityMax      │ 0–127                        │ 127      │
  ├──────────────────┼──────────────────────────────┼──────────┤
  │ velocityMap      │ 'linear'|'log'|'exp'|'fixed' │ 'linear' │
  └──────────────────┴──────────────────────────────┴──────────┘

  2.2 — Keyboard Split (MidiService.ts)

  Add a SplitConfig type and processing step in sendNote():

  interface SplitConfig {
    enabled: boolean
    splitNote: number      // 0–127
    lowDevice: string      // device name
    highDevice: string
    lowTranspose: number   // semitones
    highTranspose: number
  }

  Integrate into the KEYBOARD routing source path — notes below splitNote route to lowDevice, above to highDevice.

  2.3 — Velocity Mapping in Service

  Move velocity curve logic from useMappingStore into MidiService.ts as a transform step applied before dispatch. useMappingStore keeps the config state only.

  Files to modify:
  - src/core/midi/MidiService.ts — split processing, velocity transform
  - src/stores/useMidiStore.js — new registration fields
  - src/stores/useMappingStore.js — delegate velocity processing

  ---
  Phase 3 — MIDI Mapping Overhaul

  Goal: Full mapping preset system with NRPN support, visual feedback, and per-preset save.

  3.1 — Mapping Preset Model (src/lib/midi-mapping-presets.ts)

  interface MappingPreset {
    id: string
    name: string
    createdAt: number
    updatedAt: number
    mappings: Record<string, string>       // key → param (existing format)
    appMappings: AppMidiMapping[]          // app actions
    velocityConfig: VelocityConfig
  }

  Store in IndexedDB (via existing idb.ts) under a midi-mapping-presets object store.

  3.2 — Active Preset in useMappingStore

  - activePresetId: string | null
  - presets: MappingPreset[] (loaded on init)
  - Actions: savePreset(name), loadPreset(id), deletePreset(id), duplicatePreset(id)
  - Auto-save current state to the active preset on any mapping change (debounced 500ms)

  3.3 — NRPN Mapping

  MidiService.ts already tracks NRPN assembly. Expose via a new key format: "NRPN:MSB:LSB" in the mappings dictionary. useMidiCCListener.js extends its lookup to handle NRPN keys.

  3.4 — Visual Feedback

  - Computed property mappedParams: Set<string> in useMappingStore — re-computed on any mapping change
  - All param knobs/sliders (in SynthApp.vue or their individual components) consume mappedParams and apply a CSS class (e.g., ring-2 ring-cyan-400) when their field is mapped
  - MIDI Learn indicator: existing isMidiLearning already drives a highlight — extend to show "mapped" state persistently

  Files to create/modify:
  - src/lib/midi-mapping-presets.ts — new
  - src/stores/useMappingStore.js — preset system, NRPN keys
  - src/composables/useMidiCCListener.js — NRPN lookup
  - src/core/midi/MidiService.ts — expose NRPN value events
  - Synth param components — consume mappedParams

  ---
  Phase 4 — MIDI Monitor Upgrade

  Goal: Replace / extend MidiLoggerPanel.vue with a full-featured real-time monitor.

  4.1 — Message Model

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

  Store max 500 entries in a non-reactive plain array (same pattern as useMidiCapture); expose a reactive ref that is replaced (not mutated) when UI wants a snapshot.

  4.2 — Filters

  - Direction toggle (IN / OUT / BOTH)
  - Device multi-select
  - Channel multi-select (1–16 + All)
  - Message type checkboxes: Note, CC, PC, Transport, Clock, SysEx, NRPN
  - Text search on the decoded field

  4.3 — UI (MidiMonitorPanel.vue)

  - Replaces MidiLoggerPanel.vue
  - Virtualized list (only render visible rows) to handle high message volume
  - Color-coded rows: green = Note On, red = Note Off, blue = CC, yellow = Transport, grey = Clock
  - "Mapped" badge on CC rows that have an active mapping
  - Pause / Clear / Export (JSON) controls

  Files to create/modify:
  - src/components/MidiMonitorPanel.vue — new (replaces/extends MidiLoggerPanel)
  - src/core/midi/MidiService.ts — add outbound message logging hooks
  - src/stores/useMidiStore.js — expose monitor log ref

  ---
  Phase 5 — Unified UI Shell

  Goal: Consolidate all MIDI panels into a single tabbed UnifiedMidiManager.vue modal/panel.

  5.1 — Tab Structure

  ┌─────────────┬─────────────────────────────┬────────────────────────────────────────────┐
  │     Tab     │          Component          │                   Status                   │
  ├─────────────┼─────────────────────────────┼────────────────────────────────────────────┤
  │ Devices     │ DeviceListPanel.vue (new)   │ replaces MidiPortConfig.vue header section │
  ├─────────────┼─────────────────────────────┼────────────────────────────────────────────┤
  │ Routing     │ MidiMatrix.vue              │ existing, minor extension                  │
  ├─────────────┼─────────────────────────────┼────────────────────────────────────────────┤
  │ Performance │ MidiPerformancePanel.vue    │ existing                                   │
  ├─────────────┼─────────────────────────────┼────────────────────────────────────────────┤
  │ Mapping     │ MidiMappingPanel.vue        │ existing + preset switcher                 │
  ├─────────────┼─────────────────────────────┼────────────────────────────────────────────┤
  │ Monitor     │ MidiMonitorPanel.vue        │ new (Phase 4)                              │
  ├─────────────┼─────────────────────────────┼────────────────────────────────────────────┤
  │ App Actions │ AppMidiMapper.vue           │ existing                                   │
  ├─────────────┼─────────────────────────────┼────────────────────────────────────────────┤
  │ Settings    │ MidiSettingsPanel.vue (new) │ global MIDI settings                       │
  └─────────────┴─────────────────────────────┴────────────────────────────────────────────┘

  5.2 — DeviceListPanel.vue

  Per-device card showing:
  - Device name + type icon (controller / instrument / audio-interface)
  - Online/offline pill
  - Input channel selector (OMNI, 1–16)
  - Output channel selector (OMNI, 1–16)
  - Quick-toggle checkboxes: Notes / CC / Clock / Transport / THRU
  - "Edit" → expands routing detail inline or opens MidiMatrix focused on that device
  - Type override dropdown (in case auto-detection is wrong)

  5.3 — MidiSettingsPanel.vue

  - Global default input/output selectors
  - BPM sync master (internal / MIDI clock in)
  - MIDI Thru global toggle
  - SysEx enable toggle
  - Export / Import configuration (JSON file)
  - Reset to defaults button

  5.4 — Mapping Preset Switcher (header of Mapping tab)

  Dropdown listing saved presets + "New Preset" + "Duplicate" + "Delete" buttons. Active preset name shown in breadcrumb.

  Files to create/modify:
  - src/components/UnifiedMidiManager.vue — new shell
  - src/components/DeviceListPanel.vue — new
  - src/components/MidiSettingsPanel.vue — new
  - src/components/MidiMappingPanel.vue — add preset switcher header
  - src/stores/useUiStore.js — add showUnifiedMidiManager state, replace individual panel booleans

  ---
  Phase 6 — Preset Management (MIDI Config Presets)

  Goal: Save/restore the entire MIDI configuration (routing + mappings + settings) as a named preset.

  6.1 — Config Snapshot Model

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

  Stored in IndexedDB under midi-config-presets.

  6.2 — Actions in useMidiStore

  - saveConfigPreset(name) — snapshot current state
  - loadConfigPreset(id) — apply snapshot (device re-register if online)
  - autoSave() — debounced save to __autosave id on every state mutation

  6.3 — Preset Switching via MIDI

  Extend app-midi-actions.ts with actions midi-config-preset-1 … midi-config-preset-8 so a MIDI CC value 0–7 can switch active config presets during performance.

  ---
  Phase 7 — Extended Features

  These are lower priority / post-MVP.

  7.1 — MIDI Clock Sync with Drift Correction

  In MidiService.ts, replace the simple BPM counter with a ring-buffer of 24 clock pulses to compute a rolling BPM average. Apply drift correction using exponential smoothing (α = 0.1). Emit clockBpm events
  with the smoothed value.

  7.2 — SysEx Support

  - Add SysEx enable flag (gated — WebMIDI requires sysex: true in requestMIDIAccess)
  - Request SysEx permission separately; show user prompt explaining why
  - MidiLogEntry already handles raw bytes — SysEx renders hex in monitor
  - app-midi-actions.ts can add a sysex-send action with a configurable hex payload

  7.3 — MIDI Learn UX Polish

  - "MIDI Learn" mode: show blinking LED overlay on all knobs when active
  - Timeout after 10s with toast notification
  - After learn: flash the mapped knob green for 1s

  ---
  Migration Path (Zero Breakage)

  1. All existing components remain functional throughout — new panels are additions
  2. useMidiStore extended with new fields (all optional with defaults)
  3. DeviceRegistry reads from existing registration data on first run
  4. UnifiedMidiManager.vue wraps existing panels as tabs; old individual panel triggers remain working until explicitly removed in a cleanup PR
  5. IndexedDB schema versioned — new object stores added without touching existing

  ---
  Suggested Branch & PR Structure

  ┌─────────────────────────────┬──────────────────────────┐
  │             PR              │          Scope           │
  ├─────────────────────────────┼──────────────────────────┤
  │ feat/device-registry        │ Phase 1                  │
  ├─────────────────────────────┼──────────────────────────┤
  │ feat/routing-split-velocity │ Phase 2                  │
  ├─────────────────────────────┼──────────────────────────┤
  │ feat/mapping-presets        │ Phase 3                  │
  ├─────────────────────────────┼──────────────────────────┤
  │ feat/midi-monitor           │ Phase 4                  │
  ├─────────────────────────────┼──────────────────────────┤
  │ feat/unified-ui-shell       │ Phase 5 (depends on 1–4) │
  ├─────────────────────────────┼──────────────────────────┤
  │ feat/config-presets         │ Phase 6                  │
  ├─────────────────────────────┼──────────────────────────┤
  │ feat/sysex-clock-polish     │ Phase 7                  │
  └─────────────────────────────┴──────────────────────────┘

  ---
  Files Summary

  ┌───────────────────────────────────────┬─────────────────────────────────────────────────────┐
  │                 File                  │                       Action                        │
  ├───────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ src/core/midi/DeviceRegistry.ts       │ Create                                              │
  ├───────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ src/core/midi/MidiService.ts          │ Extend (split, velocity, NRPN, SysEx, outbound log) │
  ├───────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ src/stores/useMidiStore.js            │ Extend (registry, split, config presets)            │
  ├───────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ src/stores/useMappingStore.js         │ Extend (mapping presets, NRPN, visual feedback)     │
  ├───────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ src/lib/midi-mapping-presets.ts       │ Create                                              │
  ├───────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ src/composables/useMidiCCListener.js  │ Extend (NRPN lookup, mapped badge)                  │
  ├───────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ src/composables/useMidiInit.js        │ Extend (DeviceRegistry sync)                        │
  ├───────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ src/components/UnifiedMidiManager.vue │ Create (tabbed shell)                               │
  ├───────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ src/components/DeviceListPanel.vue    │ Create                                              │
  ├───────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ src/components/MidiMonitorPanel.vue   │ Create (replaces MidiLoggerPanel)                   │
  ├───────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ src/components/MidiSettingsPanel.vue  │ Create                                              │
  ├───────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ src/components/MidiMappingPanel.vue   │ Extend (preset switcher)                            │
  ├───────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ src/stores/useUiStore.js              │ Extend (unified manager state)                      │
  ├───────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ src/lib/app-midi-actions.ts           │ Extend (config preset switch actions)               │
  └───────────────────────────────────────┴─────────────────────────────────────────────────────┘