# SY.CORE Application Structure

This document provides an overview of the key files used in the application, categorized by their function and type.

| Template | Type | Description | MIDI Action |
| :--- | :--- | :--- | :--- |
| **App.vue** | View | Root component of the Vue application. | - |
| **SynthApp.vue** | View | Main application shell containing the UI layout, toolbar, and panel mounting logic. | `new_sound`, `generate`, `regenerate`, `save_preset`, `transpose_cc` |
| **MidiMatrix.vue** | Component | Central hub for MIDI routing, device management, and engine configuration. | `open_midi_matrix` |
| **LiveSet.vue** | Component | Interface for managing and launching tracks and performance patterns. | `toggle_liveset`, `liveset_up`, `liveset_down`, `liveset_pad_*` |
| **SoundTypesPanel.vue** | Component | Panel for selecting sound categories and initiating Adaptive Engine sound generation. | `open_sound_types` |
| **PresetHistoryPanel.vue** | Component | Browsing and management of generated sounds and historical presets. | `open_sound_history`, `prev_preset`, `next_preset`, `first_preset`, `last_preset` |
| **ArpeggiatorPanel.vue** | Component | UI for configuring arpeggiation patterns, timing, and latch modes. | `toggle_arp`, `arp_mode_cc`, `arp_subdivision_cc` |
| **StepSequencer.vue** | Component | Advanced sequencer for pattern creation with MIDI and parameter automation. | `toggle_sequencer`, `seq_play`, `seq_stop`, `seq_bpm_up`, `seq_bpm_down`, `seq_bpm_cc` |
| **MidiMappingPanel.vue** | Component | Interface for MIDI Learn and CC mapping configuration. | - |
| **BackingTrackPlayer.vue** | Component | Audio player for backing tracks and playlists with crossfade support. | `toggle_track_player`, `playlist_play_stop`, `playlist_next`, `playlist_volume_cc` |
| **AudioLooper.vue** | Component | Real-time audio looping and overdubbing interface. | `toggle_looper`, `looper_record`, `looper_clear_all`, `looper_mute_take_*` |
| **MidiCapture.vue** | Component | Utility for capturing, recording, and exporting MIDI performance data. | `toggle_midi_capture`, `capture_rec_toggle` |
| **AudioVisualizer.vue** | Component | Real-time waveform and spectral analysis of the audio output. | `toggle_visualizer` |
| **SideBar.vue** | Component | Right-side floating action menu for secondary application settings. | - |
| **MainMenuDial.vue** | Component | Left-side floating radial menu for primary application modules. | - |
| **AdminPanel.vue** | Component | Restricted interface for system configuration, role management, and engine tuning. | - |
| **QuickChannelSelector.vue** | Component | Footer widget for rapid switching between MIDI channels (Parts). | - |
| **MidiService.ts** | Script | Core MIDI engine handling WebMIDI initialization, routing, and clock synchronization. | - |
| **useMidiStore.js** | Script | Pinia store for MIDI state, device lists, and global transport controls. | - |
| **useUiStore.js** | Script | Pinia store for application-wide UI state, panel visibility, and navigation. | - |
| **usePresetStore.js** | Script | Pinia store for sound generation state, history, and active preset data. | - |
| **useConfigStore.js** | Script | Pinia store for application settings, roles, and persistent database config. | - |
| **useMidiInit.js** | Script | Composable handling the lifecycle of MIDI device connection and restoration. | - |
| **useControllerManager.js** | Script | Logic for native hardware integration (e.g., Launchpad Mini MK1) and LED feedback. | - |
| **app-midi-actions.ts** | Script | Definition and mapping of application commands triggerable via MIDI. | - |
| **idb.ts** | Script | IndexedDB abstraction layer for local-first data persistence. | - |
| **s1-config.ts** | Script | Constant definitions for Roland S-1 MIDI implementation and parameter maps. | - |
| **types.ts** | Settings | Global TypeScript interfaces and default toolbar configuration definitions. | - |
| **system_config.json** | Settings | Seed data and default system configuration for the local database. | - |
| **pinia-state.json** | Settings | Persistent snapshot of the global application state for session restoration. | - |
| **BANK_DEFAULT.json** | Settings | Factory sound bank used as a starting point for new users. | - |
| **notes.txt** | Settings | Project development notes and future implementation roadmap. | - |
