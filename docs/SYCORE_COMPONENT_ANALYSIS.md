# SY.CORE Application Component Analysis

## Executive Summary

SY.CORE is a professional-grade, local-first web application designed for live electronic music performance, specifically targeting the Roland S-1 Tweak Synth. Built with Vue 3 and modern web technologies, it provides MIDI orchestration, preset management, and synchronized audio playback capabilities for stage performers.

## 1. Technology Stack & Architectural Decisions

### Core Technologies
- **Frontend Framework**: Vue 3.5.32 (Composition API)
- **Build Tool**: Vite 8.0.10 (dev server on port 3094)
- **State Management**: Pinia 3.0.4 (modular store architecture)
- **Styling**: Tailwind CSS 4.2.4 + PostCSS 8.5.14
- **Type Safety**: TypeScript 6.0.3
- **Icons**: Lucide-Vue-Next 1.0.0

### Audio & MIDI Processing
- **Audio Synthesis**: Tone.js 15.1.22
- **Low-latency Audio**: Web Audio API
- **MIDI Communication**: Web MIDI API + WebMIDI.js 3.1.16
- **Audio Export**: lamejs 1.2.7 (client-side MP3 encoding)

### Data Persistence
- **Primary Storage**: IndexedDB (for presets, audio files, large datasets)
- **Secondary Storage**: LocalStorage (for settings, UI state, session data)
- **Persistence Layer**: Custom IndexedDB abstraction (`idb.ts`)

### Architectural Patterns
1. **Modular Component Architecture**: UI decomposed into 40+ reusable Vue components
2. **Reactive State Management**: Pinia stores for centralized, predictable state
3. **Event-Driven Communication**: Custom global event system (`window.dispatchEvent`) for high-performance inter-component communication
4. **Offline-First Design**: All essential data stored locally for stage reliability
5. **Layered Architecture**: Clear separation between UI, state, engines, and persistence layers

## 2. Detailed Breakdown of Major Subsystems

### 2.1 State Management (Pinia Stores)

SY.CORE employs 10+ specialized Pinia stores for modular state management:

#### Core Stores
- **useMidiStore.js**: Manages MIDI device connections, BPM clock, Smart Latch (polyphonic note holding), and routing matrix configuration
- **usePresetStore.js**: Handles sound library management, preset generation (including AI), history tracking, favorites, and active preset data
- **useLivePadStore.js**: Controls the 16-pad performance grid, playlist management, backing track playback, and crossfade configuration
- **useLooperStore.js**: Manages 8-track audio looper state, recording buffers, and track synchronization
- **useMappingStore.js**: Handles MIDI CC learning, parameter mapping, and velocity modulation curves
- **useArpStore.js**: Controls arpeggiator patterns, subdivision, held notes, and timing
- **useLfoStore.js**: Manages dual LFO engines with waveform selection, sync/free modes, and modulation depth/offset
- **useConfigStore.js**: Stores application settings, system configuration, and user preferences
- **useAuthStore.js**: Manages user authentication and role-based permissions
- **useUiStore.js**: Controls UI panel visibility, modal states, and loading indicators

### 2.2 Core Engines

#### MIDI Engine
- **MidiService.ts** (`src/core/midi/`): Web MIDI API abstraction layer providing:
  - Multi-output routing matrix with source-based device targeting
  - Echo suppression and message throttling for performance
  - Transport handling (clock/start/stop messages)
  - Smart Latch implementation for polyphonic note management
  - Device discovery and connection lifecycle management

#### Audio Engine
- **Looper Engine** (`src/lib/looper-engine.js`): 8-track audio looping system featuring:
  - Sample-accurate timing using Web Audio API ScriptProcessorNode
  - Soft-clipping limiter to prevent digital distortion
  - Offline rendering pipeline for MP3 export
  - Parallel processing during export operations
  - Integration with `@breezystack/lamejs` for client-side MP3 encoding

#### Supporting Systems
- **App MIDI Actions** (`src/lib/app-midi-actions.ts`): Unified MIDI controller action system mapping hardware inputs to application functions
- **Session Manager** (`src/lib/session-manager.js`): Application state snapshot/restore functionality
- **IDB Service** (`src/lib/idb.ts`): IndexedDB abstraction wrapper for data persistence

### 2.3 Major UI Components

#### Performance & Playback
- **LiveSet.vue**: Main performance interface with 16 sound pads for instant preset recall
- **BackingTrackPlayer.vue**: Professional audio player with auto-crossfade and playlist management
- **AudioLooper.vue**: Real-time audio looping and overdubbing interface for the 8-track looper

#### Sequencing & Arpeggiation
- **StepSequencer.vue**: Advanced sequencer with 16-64 steps, note/velocity/gate control, style presets, and scale quantization
- **ArpeggiatorPanel.vue**: Arpeggiator configuration with mode selection (up/down/up-down/random) and subdivision controls

#### Sound Design & MIDI
- **MidiMatrix.vue**: Central hub for MIDI routing visualization and device management
- **MidiPerformancePanel.vue**: Visual MIDI controller mapping and performance grid
- **MidiMappingPanel.vue**: MIDI Learn interface for CC to parameter mapping configuration
- **AdsrEnvelope.vue**: Attack-Decay-Sustain-Release envelope editor
- **FilterEnvelope.vue**: Filter cutoff and resonance envelope controls
- **LfoMappingDialog.vue**: LFO target parameter mapping configuration

#### Utilities & Admin
- **VirtualKeyboard.vue**: On-screen MIDI keyboard for testing and performance
- **AudioVisualizer.vue**: Real-time waveform and spectral analysis of audio output
- **AdminPanel.vue**: System configuration interface (role management, engine tuning)
- **AuthModal.vue**: Authentication and user management interface
- **ResultsPanel.vue**: Display for AI-generated preset results

### 2.4 Supporting Components
- **SoundTypesPanel.vue**: Sound category browser and adaptive engine initiation
- **PresetHistoryPanel.vue**: Historical preset browsing with filtering by category/favorites
- **MidiLoggerPanel.vue**: MIDI message debugging utility
- **VelocityMappingDialog.vue**: Velocity modulation curve configuration
- **MainMenuDial.vue**: Left-side radial menu for primary application modules
- **SideBar.vue**: Right-side floating action menu for secondary settings
- **QuickChannelSelector.vue**: Footer widget for rapid MIDI channel (Part) switching

## 3. Component Interaction & Data Flow

### 3.1 State-to-Component Communication
Components interact with Pinia stores through:
- **Direct Store Imports**: Components import and use stores directly for state access and mutations
- **Computed Properties**: Reactive computed properties for derived state
- **Watcher Functions**: Watchers for responding to state changes
- **Action Dispatching**: Store methods triggered by user interactions

### 3.2 Engine-to-State Communication
Engines communicate state changes through:
- **Direct Store Mutations**: Engines import and modify stores directly (e.g., MidiStore updating BPM)
- **Custom Events**: Global `window.dispatchEvent` system for high-frequency updates
- **Sync Mechanisms**: Periodic synchronization between engine state and store state

### 3.3 Data Flow Patterns

#### UI → State → Engine
1. User interacts with UI component (e.g., clicks a pad in LiveSet.vue)
2. Component dispatches action to appropriate store (e.g., useLivePadStore)
3. Store updates state and notifies subscribers
4. Engine observes store changes (via watchers or events) and updates behavior
5. Engine may emit events to update other components or stores

#### Engine → State → UI
1. Engine detects change (e.g., MIDI input received)
2. Engine updates relevant store (e.g., MidiStore updates active notes)
3. Store notifies subscribed components
4. Components re-render with updated state
5. UI reflects the change (e.g., visual feedback on active pads)

#### Persistence Layer
1. Stores subscribe to their own changes for persistence
2. On state change, data is saved to IndexedDB/LocalStorage via idb.ts
3. On application load, state is hydrated from persistence layer
4. Session manager provides full app state snapshot/restore capabilities

### 3.4 Event-Driven Communication
For high-performance, low-latency communication:
- Custom events dispatched via `window.dispatchEvent('sycore-event', { detail: {...} })`
- Components listen via `window.addEventListener('sycore-event', handler)`
- Used for: Looper↔BackingTrackPlayer sync, MIDI hub updates, engine status changes
- Avoids Vue reactivity overhead for frequent, high-frequency updates

## 4. Recent Evolution Based on Commit History

Recent commits indicate active development and refinement of core systems:

### 4.1 Preset System Improvements
- **Commit 62a9b9f**: Preset data structure refactoring - Improved organization and handling of preset data
- **Commit c2a4df9**: Fixed step sequencer to save data to preset and sequencer - Enhanced data persistence between sequencer and preset systems
- **Commit 1515cc3**: Fixed other issues about localStorage. Now save always to IndexedDB - Migration from localStorage to IndexedDB for better performance with larger datasets

### 4.2 Performance & Reliability Enhancements
- **Commit 3096d60**: Bug fix VELOCITY MAPPING - Resolved issues with velocity modulation and mapping
- **Commit 4075f7f**: Fixed Live Pad sound management - Improved reliability of the 16-pad performance grid
- **Commit 72b718b**: Bug fix - General stability improvements
- **Commit 8b30501**: Smart Latch & Fade-out - Enhanced MIDI note handling with polyphonic latch and note fade-out functionality
- **Commit 8f24f08**: MIDI routing matrix system - Implementation of advanced MIDI routing capabilities

### 4.3 MIDI System Advancements
- Improved MIDI device management and connection handling
- Enhanced Smart Latch feature for polyphonic performance
- Advanced routing matrix with source-based targeting
- Better MIDI clock synchronization and transport handling

### 4.4 Audio System Refinements
- Looper engine stability improvements
- Better audio buffering and synchronization
- Enhanced MP3 export functionality
- Improved crossfade implementation in backing track player

## 5. File Organization & Key Implementation Details

### 5.1 Directory Structure
```
src/
├── main.js                 # Vue 3 application entry point
├ App.vue                  # Root component
├ types.ts                 # Global TypeScript interfaces
├
├── components/            # 40+ Vue Single File Components
│   ├── Layout & Navigation
│   │   ├── MainMenuDial.vue
│   │   ├── SideBar.vue
│   │   └── QuickChannelSelector.vue
│   │
│   ├── Performance
│   │   ├── LiveSet.vue
│   │   ├── PlaylistPadGrid.vue
│   │   └── BackingTrackPlayer.vue
│   │
│   ├── Sequencing
│   │   ├── StepSequencer.vue
│   │   └── ArpeggiatorPanel.vue
│   │
│   ├── Sound Design
│   │   ├── AdsrEnvelope.vue
│   │   ├── FilterEnvelope.vue
│   │   └── LfoMappingDialog.vue
│   │
│   ├── MIDI & Routing
│   │   ├── MidiMatrix.vue
│   │   ├── MidiPerformancePanel.vue
│   │   ├── MidiMappingPanel.vue
│   │   └── MidiLoggerPanel.vue
│   │
│   ├── Audio & Looper
│   │   ├── AudioLooper.vue
│   │   ├── AudioVisualizer.vue
│   │   └── EfxMixerVisualizer.vue
│   │
│   ├── Admin & Utilities
│   │   ├── AdminPanel.vue
│   │   ├── AuthModal.vue
│   │   ├── ResultsPanel.vue
│   │   └── PresetHistoryPanel.vue
│   │
│   └── ui/                # Reusable UI components
│       ├── ControlsCard.vue
│       ├── DraggableGridButton.vue
│       └── VisualizerPanel.vue
│
├── stores/                # Pinia state management (10+ stores)
│   ├── useMidiStore.js
│   ├── usePresetStore.js
│   ├── useLivePadStore.js
│   ├── useLooperStore.js
│   ├── useMappingStore.js
│   ├── useArpStore.js
│   ├── useLfoStore.js
│   ├── useConfigStore.js
│   ├── useAuthStore.js
│   └── useUiStore.js
│
├── lib/                   # Core utilities and engines
│   ├── midi-service.ts    # MIDI service abstraction
│   ├── looper-engine.js   # 8-track audio looper
│   ├── app-midi-actions.ts# MIDI action routing
│   ├── idb.ts             # IndexedDB abstraction
│   ├── session-manager.js # State persistence
│   ├── auth.ts            # Authentication logic
│   ├── firebase.ts        # Firebase integration (optional)
│   ├── midi-file.ts       # MIDI file I/O
│   ├── tag-generator.ts   # Sound tagging utilities
│   └── usb-device.ts      # USB device management
│
├── composables/           # Vue 3 Composition API utilities
│   ├── useMidiCapture.js      # MIDI input capture
│   ├── useMidiInit.js         # MIDI initialization lifecycle
│   ├── useMidiFeedback.js     # MIDI feedback/CC listener
│   ├── useLocalStorage.js     # Local storage wrapper
│   ├── useDraggable.js        # Drag-and-drop behavior
│   ├── useResizable.js        # Window resizing
│   ├── useAppActions.js       # App event dispatching
│   ├── useControllerManager.js# Hardware controller management
│   └── useSeedConfig.js       # Configuration seeding
│
├── core/                  # Core engine implementations
│   └── midi/              # MIDI service
│       └── MidiService.ts # Web MIDI API wrapper
│
├── constants/             # Hardware-specific configurations
│   ├── s1-config.ts       # Roland S-1 MIDI implementation
│   └── s1-musical-variations.ts # S-1 preset/patch data
│
├── views/                 # Page-level components
│   └── SynthApp.vue       # Main application view
│
├── assets/                # Static resources
│   └── main.css           # Global stylesheet
│
├── data/                  # Application data and seed files
│   ├── BANK_DEFAULT.json  # Factory preset bank
│   ├── NRPN.json          # NRPN mapping data
│   └── [audio files]      # Looper recordings and samples
│
└── types.ts               # Global TypeScript type definitions
```

### 5.2 Key Implementation Files

#### Entry Points
- **main.js**: Initializes Vue 3 app with Pinia, Vue Router, and root component
- **index.html**: HTML entry point with Vue 3 root div
- **App.vue**: Root Vue component providing basic layout structure

#### Configuration
- **vite.config.js**: Vite configuration with Vue plugin, alias (@/src), and dev server (port 3094)
- **tsconfig.json**: TypeScript configuration (ESNext target, path aliases, strict mode)
- **tailwind.config.js**: Tailwind CSS configuration with custom synth-themed color palette
- **postcss.config.js**: PostCSS configuration with Tailwind and Autoprefixer

#### Data Models
- **types.ts**: Global TypeScript interfaces for:
  - Preset data structures
  - MIDI message formats
  - Store state shapes
  - Engine configuration objects
  - UI state definitions

#### Persistence
- **idb.ts**: IndexedDB wrapper providing:
  - Database initialization and versioning
  - CRUD operations for object stores
  - Transaction handling
  - Error handling and debugging utilities

#### Session Management
- **session-manager.js**: Implements:
  - Full application state snapshots
  - LocalStorage persistence for session data
  - Restore functionality on app initialization
  - Selective state persistence (excluding volatile data)

### 5.3 Communication Mechanisms

#### Prop-Based Communication
- Parent-to-child component communication via Vue props
- Emitted events for child-to-parent communication
- Template refs for direct component access when needed

#### Store-Based Communication
- Pinia stores as single source of truth
- Components subscribe to store state via mapState/mapGetters
- Actions dispatched via mapActions for state mutations

#### Event-Based Communication
- Custom events via `window.dispatchEvent` for:
  - High-frequency updates (MIDI, audio parameters)
  - Decoupled component communication
  - Engine-to-engine synchronization
  - Low-latency requirements where Vue reactivity would add overhead

#### Direct Engine Access
- Some components import engines directly for:
  - Immediate parameter updates
  - Synchronous method calls
  - Performance-critical operations

## Conclusion

SY.CORE represents a sophisticated implementation of a professional music performance application, leveraging modern web technologies to deliver low-latency, reliable performance for stage use. Its architecture demonstrates careful consideration of:

1. **Performance Optimization**: Through Web Audio API, event-driven communication, and IndexedDB persistence
2. **Modularity**: Clear separation of concerns between UI, state, engines, and persistence layers
3. **Reliability**: Offline-first design with robust state persistence and recovery mechanisms
4. **Extensibility**: Modular Pinia stores and composable utilities facilitate feature addition
5. **Hardware Integration**: Deep MIDI integration with device-specific optimizations for Roland S-1 and other controllers

The application continues to evolve with recent commits focusing on stabilizing core systems (preset management, MIDI routing, velocity mapping) and enhancing performance through better data persistence strategies.