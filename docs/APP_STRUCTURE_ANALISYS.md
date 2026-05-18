 ## 1. Tech Stack & Architecture Overview

 - Frontend: Vue 3, Vite, Pinia, TailwindCSS
 - Audio/MIDI: Web Audio API, Web MIDI API, Tone.js, WebMIDI.js, lamejs
 - AI Integration: Google GenAI SDK
 - State Management: Pinia stores (10+ modules)
 - Persistence: IndexedDB, LocalStorage
 - Build: TypeScript, ES modules

 ## 2. State Management Architecture (Pinia Stores)

 - usePresetStore: Sound library, preset generation, history
 - useMidiStore: MIDI routing, BPM clock, Smart Latch
 - useLivePadStore: 16-pad performance grid, playlist, backing tracks
 - useArpStore: Arpeggiator patterns and subdivision
 - useLfoStore: Dual LFO modulation engine
 - useMappingStore: MIDI CC learning, velocity modulation
 - Supporting stores: Config, Auth, UI

 ## 3. Core Engines

 - MidiService: Web MIDI API wrapper with routing matrix
 - Looper Engine: Multi-track audio recording/looping
 - App MIDI Actions: Unified controller action system
 - IndexedDB Service: Persistent storage layer
 - Session Manager: App state snapshot/restore

 ## 4. Major UI Components

 - Performance: LiveSet.vue, PlaylistPadGrid.vue, BackingTrackPlayer.vue
 - Sequencing: StepSequencer.vue, ArpeggiatorPanel.vue
 - Sound Design: AdsrEnvelope.vue, FilterEnvelope.vue, LfoMappingDialog.vue
 - MIDI: MidiMatrix.vue, MidiPerformancePanel.vue, MidiMappingPanel.vue
 - Utilities: VirtualKeyboard.vue, AudioLooper.vue, AudioVisualizer.vue
 - Admin/AdminPanel.vue, AuthModal.vue, ResultsPanel.vue

 ## 5. Key Features from Recent Commits

 - Velocity mapping fixes and improvements
 - Live Pad sound management enhancements
 - Step sequencer data persistence to preset/sequencer
 - Preset data structure refactoring
 - Smart Latch & Fade-out functionality
 - MIDI routing matrix system implementation
 - Migration from localStorage to IndexedDB for better performance

 ## 6. File Organization

 - src/stores/: Pinia state management
 - src/components/: Vue UI components (40+)
 - src/core/midi/: MidiService implementation
 - src/lib/: Core utilities (MIDI, audio, auth, IDB, etc.)
 - src/composables/: Vue 3 composables
 - src/constants/: Hardware-specific configurations
 - src/views/: Application views
 - src/assets/, src/data/: Static resources and data files