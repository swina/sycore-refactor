# SY.CORE: The Future of Live Electronic Performance

## Executive Summary
SY.CORE is a professional-grade, local-first ecosystem designed to bridge the gap between algorithmic sound design and live hardware performance. Developed by **SY.CORE Lab**, the platform serves as a high-performance hub for musicians who demand reliability, creative spontaneity, and cutting-edge sound synthesis in a unified, zero-latency environment.

---
# 2 Workflows

**SY.CORE** has 2 main workflows designed to meet 2 typical musician scenario:

- sound design: when you need to explore your hardware capabilities and try to create unique sounds over the hardware limits
- performance: when you need an easy way to create, manage and control your performance setup


# Sound Design

## 💎 The Heart of the Innovation: Adaptive Sound Engine (for Roland S-1)
At the core of SY.CORE lies the **Adaptive Sound Engine**, a proprietary synthesis and orchestration algorithm designed by SY.CORE Lab.

- **Neural Sound Morphing**: Beyond simple presets, the engine uses adaptive logic to generate complex parameter maps for hardware synthesizers (current release is set for the Roland S-1).
- **Infinite Creativity**: Generate "Pads", "Leads", "Basses", and "Experimental" with "flavour" variations instantly. Each sound is unique, mathematically balanced, and ready for the stage. Auto A/B sound variations for every generated sound.
- **Sound Parameters Visualizer**: understand how your sound is created with graphical sound group parameters visualizers (flow,LFO,Oscillator,Filter,EFX,etc.)
- **Data export/import**: export/import data bank to easy manage your custom sounds library

## Extend the controls
- **Hardware Synergy**: The engine doesn't just play sounds; it *talks* to your gear, automating most of CC (Control Change) messages to sculpt raw electricity into musical art.
- **Bi-directional Feedback**: SY.CORE maintains a high-speed, 1:1 reflection of your hardware state. Every tweak on the Roland S-1 is instantly visualized in the app, and every UI adjustment is sent to the synth with zero perceptible latency, creating a seamless "hybrid instrument" experience.
- **Extra 2 LFOs**: add 2 customizable LFOs and assign to any parameter of your hardware
- **Velocity Mapping**: add velocity mapping and assign to any parameter of your hardware
- **Arpeggiator**: custom arpeggiator
- **Integrated MIDI LEARN**: easy mapping of parameters (contextual right click integration) with MIDI LEARN implementation
---

# Performance

Professional performance orchestration.

## MIDI: granular, stable, intuitive setup

**SY.CORE** offers an advanced MIDI setup designed to facilitate and manage from simple to complex configurations:

- MIDI Devices auto-discovery
- MIDI Routing
- MIDI Performance
- MIDI Mapping
- MIDI Actions
- MIDI Sync / Automation
- MIDI Monitor
- MIDI General Settings with setup configuration export/import

### MIDI Capture
Capture input notes with an integrated advanced Piano Roll, with notes editing, quantization, export as MIDI File, export to Step Sequencer

### MIDI Step Sequencer
Create advanced sequences using the integrated generator based on key, octave, notes ranges and scale. Associate up to 2 parameters to any step, randomize parameters. Up to 2 sequences per sound, associate sequences to sound.

### Device Program Change manager

**SY.CORE** supports the management of presets by Program Change (for instruments registered in MIDI Settings)
The current release supports automatic bank presets lists of the following devices:
- Arturia MicroFreak firmware 5.0
- Yamaha SEQTRACK (Multitimbral)

### Soundsets
Create automatic presets soundsets to load with a click presets for different devices.

## Live Performance

16 switch pads to select your soundsets with a touch
16 switch pads to select tracks from a playlist

Volume mixer (via MIDI CC#) for the registered devices (if supported)

## AUDIO: tools to extend you creativity

### Backing Tracks Player

- Backing Tracks library: create your library of backing tracks (mp3,ogg,wav)
- Playlists (autoplay, loop, crossfade, tempo sync, clock sync,etc.)

## Audio Capture

- Capture audio from any supported audio interface
- Normalize levels with Gain/Gate
- Crop captured audio with start/end markers
- Play/Loop captured audio (sync with clock available)
- Send cropped audio to the Audio Looper track
- Import/Export mp3, wav formats

### Looper (Experimental)

- 8 tracks looper with autosync, autolimiting


## 🚀 Key Platform Pillars

### 1. The Power of the Web: Why SY.CORE?
SY.CORE leverages the latest evolution of web technologies (Web MIDI & Web Audio APIs) to offer a lightweight, flexible, and potent alternative to traditional desktop software.
- **Zero Installation**: Launch immediately via a URL with no tedious setup or heavy installers.
- **Always Up-to-Date**: Updates occur server-side, ensuring you always run the latest version.
- **Driverless Plug & Play**: Communicates directly with native OS frameworks (Windows MIDI Services, CoreMIDI), eliminating driver conflicts.
- **Universal Portability (PWA)**: Runs identically across Windows, macOS, Linux, and Android with full-screen mode and system integration.

### 2. Local-First Reliability & Offline Power
Performance environments are unpredictable. SY.CORE utilizes a **Local-First Architecture** (IndexedDB) combined with **Service Workers (PWA)**, ensuring that all your presets, backing tracks, and configurations are stored directly in the browser.
- **Zero Internet Dependency**: Once saved to your device, the PWA launches and functions entirely offline.
- **Instant Boot**: No cloud loading screens; your music is ready as fast as your hardware.
- **Data Persistence**: All customizations and session data remain safe on your device.

---

## 🛠 Technological Foundation

| Technology | Main Role | Key Advantage |
| :--- | :--- | :--- |
| **Web MIDI API** | Manages musical device data | Direct hardware routing with near-zero latency. |
| **Web Audio API** | Handles synthesis and processing | Modular, high-performance node-based engine. |
| **Service Workers (PWA)**| Resource & Asset management | Persistent offline functionality and instant loading. |
| **IndexedDB** | Local Data Storage | Professional-grade state management and persistence. |

---

## 🛠 Features at a Glance

| Feature | Capability |
| :--- | :--- |
| **MIDI Hub & Performance Matrix** | Centralized live routing (Grid/Flow views) for USB-MIDI, Virtual Ports, and Hardware Sync. |
| **Smart Latch** | Generative, per-output note holding with FIFO policy and Replace Mode, preventing any oscillator freeze. |
| **BPM Master Clock** | Rock-solid synchronization for all time-based effects and sequencers. |
| **MIDI Learn & Mapping** | Effortlessly map any hardware controller to app functions with advanced "Pass Thru" and "Consume" logic. |

---

## 🎯 Target Audience
- **Live Electronic Artists**: Musicians looking for a stable, integrated alternative to complex DAW setups.
- **Sound Designers**: Professionals seeking new methods of algorithmic sound generation.
- **Hardware Enthusiasts**: Anyone looking to unlock the full potential of their MIDI synthesizers through modern UI and the power of the **Local Adaptive Sound Engine**.

---

## About SY.CORE Labs
SY.CORE Labs is a research and development collective focused on the intersection of **Music Technology, Adaptive Algorithms, and Human Interaction**. Our mission is to build tools that feel like instruments, not just software.

**SY.CORE: Made with Precision & Neural Magic.**
