# SY.CORE

> A browser-based performance tools & sound design ecosystem for electronic musicians.

SY.CORE is a professional-grade, local-first web application that serves as a centralized hub for MIDI orchestration, sound design, audio processing, and live performance — all running in your browser with no installation required.

---

## Features

### Sound Engine
- **Roland S-1 Adaptive Generator** — preset identity management, real-time parameter control, modulation, and performance integration with the Roland S-1 Tweak Synth.
- **Generative Patch Creation** — create new sounds instantly based on musical parameters.
- **Unlimited Preset Library** — store, categorize, and recall thousands of sounds beyond the hardware's 64-pattern limit.

### Audio Tools
- **Audio Capture** — record audio directly within SY.CORE via the mic toolbar panel.
- **Audio Looper** *(Beta)* — sample-accurate 8-track looper for live instrumental and digital performance.
- **Samples Machine** — 24-pad simultaneous loop player with sync-quantized starts, mixer, Performance Sets, and Capture integration.
- **Sampler** *(Beta)* — 7-pad multi-bank sampler with MIDI velocity, chromatic pitch-shifting, ADSR envelopes, lo-fi modes, and granular synthesis.
- **Backing Track Player** — dual-slot playback engine with crossfade, playlist, and MIDI sync.
- **Freesound Browser** — search, preview, and inject sounds from [freesound.org](https://freesound.org) into playlists, loop pads, or Audio Capture.

### MIDI Tools
- **Devices** — auto-discover and register your MIDI hardware.
- **Flow** — visual drag-and-drop MIDI routing canvas for connecting virtual apps and hardware devices.
- **Controller Designer** — visual canvas for designing custom MIDI controller layouts with draggable controls and preset management.
- **Monitor** — real-time MIDI event monitoring and logging.
- **MIDI Manager** — unified MIDI control center for routing, mapping, and device management.
- **Mapping** — MIDI CC to application parameter binding.
- **Actions** — per-device app action binding (MIDI CC/Note → high-level actions: start sequencer, toggle looper, change preset).
- **Sync** — cross-subsystem transport synchronization matrix.
- **MIDI Capture** — record, view, and export MIDI events in real time.
- **Multi Sound / Program Change Browser** — browse and send Program Change messages to connected devices.

### Live Performance
- **Live Performance Pad** — pad-based performance panel for triggering sounds and sequences on stage.
- **Live Timeline** — visual arrangement timeline with segments, MIDI markers, and transport control.
- **Step Sequencer** — algorithmic composition and MIDI sequencing engine with style-based generation.
- **Chord Progression Sequencer** — step-based harmonic sequencer with built-in chord library, arpeggio mode, and algorithmic generation.
- **Drum Machine** — 8-track 16-step pattern sequencer with A–F sequence banks, Fill, Repeater, style generation, and REC SYNC.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Vue 3](https://vuejs.org/) (Composition API + `<script setup>`) |
| Language | [TypeScript](https://www.typescriptlang.org/) |
| State | [Pinia](https://pinia.vuejs.org/) |
| Routing | [vue-router](https://router.vuejs.org/) |
| Build | [Vite](https://vitejs.dev/) |
| Styles | [Tailwind CSS](https://tailwindcss.com/) |
| Icons | [Lucide](https://lucide.dev/) |
| Audio Engine | [Tone.js](https://tonejs.github.io/) / [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) |
| MIDI | [Web MIDI API](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API) / [webmidi.js](https://webmidijs.org/) |
| Audio Export | [lamejs](https://github.com/zhuker/lamejs) (MP3 encoder) |
| Persistence | IndexedDB / LocalStorage |
| PWA | [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) |
| Backend / Data | [Upstash Redis](https://upstash.com/) / [Vercel KV](https://vercel.com/docs/storage/vercel-kv) |

---

## Hardware Integration

SY.CORE is pre-calibrated for low-latency performance with professional gear:

- **Roland AIRA Series** (S-1 Tweak Synth, T-8 Beat Machine, J-6 Chord Synth) — deep integration with preset management, parameter control, and Program Change automation.
- **Arturia MicroFreak** *(coming soon via SY.CORE LAB)* — unlimited preset management and deep editing.
- **Any USB-MIDI device** — auto-detection, routing, and mapping.

SY.CORE connects over Web MIDI — plug in your hardware and it's recognized immediately with no drivers or installation.

---

## Getting Started

### Prerequisites

- **Node.js** >= 20
- **npm** >= 9
- A browser with **Web MIDI API** support (Chrome, Edge, Opera recommended)

### Install

```bash
git clone <repository-url>
cd sycore
npm install
```

### Run (Development)

<h3 style="color:red;">The current last version to run is branch is release/0.1.1</h2>

```bash
git branch release/0.1.1
```


```bash
npm run dev:refactor
```

Starts on port `3999` with an alternate database name (`sycore_2`).

### Build for Production

```bash
npm run build
```

Output in `dist/`. Deployable to any static host or Vercel.

### Preview Production Build

```bash
npm run preview
```

### Run Tests

```bash
npm test
```

### Deploy

```bash
npm run deploy:app
```

Deploys the app to Vercel.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              Layer 1: User Interface (Vue 3)        │
│  MainPage  │  SynthApp  │  All Panels / Modals      │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│           Layer 2: State Management (Pinia)         │
│  useUiStore  │  useMidiStore  │  usePresetStore     │
│  useMappingStore │ useAuthStore │ useConfigStore    │
│  useLivePadStore │ useArpStore │ useLfoStore        │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│           Layer 3: Core Engines (JS / Web Audio)    │
│  MidiService  │  LooperEngine  │  AudioContext      │
│  useMidiInit  │  useMidiCCListener                  │
│  useControllerManager │  MidiRouting                │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│           Layer 4: Data & Persistence               │
│  IndexedDB           │  LocalStorage                │
└─────────────────────────────────────────────────────┘
```

### Key Design Decisions

- **Offline-First** — everything runs locally in the browser. IndexedDB stores your sound library, playlists, and session state. No internet required during performance.
- **Event-Driven Communication** — components use a custom global event system (`window.dispatchEvent`) for cross-cutting communication without expensive re-renders.
- **Lazy-Loaded Panels** — all panels (Sampler, Sequencer, Drum Machine, etc.) are lazy-loaded and shown/hidden via the UI store, keeping the initial bundle lean.
- **Session Persistence** — every change is saved in real-time. Close the tab and come back exactly where you left off.

---

## Documentation

Detailed guides are available in [`docs/guides/`](./docs/guides/):

- [Guides Index](./docs/guides/INDEX.md) — complete list of all guides
- Sound Engine, Audio, MIDI, and Live Performance guides
- Product overview and advantages

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_WEBSITE_URL` | URL for the external website link in the top bar |
| `VITE_DEV_PORT` | Dev server port (used by `dev:refactor` script) |
| `VITE_DB_NAME` | IndexedDB database name override |

---

## License

MIT
