# SY.CORE — Guides Index

> Performance Tools & Sound Design Ecosystem for Electronic Musicians

---

## Overview & Presentation

| Guide | Description |
|-------|-------------|
| [Manifesto](../MANIFESTO.md) | Why SY.CORE exists — the personal story, principles, and the role of AI as a tool |
| [SY.CORE Commercial Presentation](./SYCORE_COMMERCIAL_PRESENTATION.md) | Full product overview — the problem, the solution, and the ecosystem |
| [SY.CORE Advantages](./SYCORE_ADVANTEGES.md) | Why a browser-based app beats traditional desktop software |
| [Note for Entrepreneurs](./SYCORE_FOR_ENTERPRENEURS.md) | Licensing notice regarding preset distribution |

---

## Sound Engine

| Guide | Description |
|-------|-------------|
| [Sound Engine — Roland S-1 Adaptive Generator](./SYCORE_SOUND_ENGINE_S1.md) | Preset identity, real-time parameter control, modulation, and performance integration |

---

## Audio

| Guide | Description |
|-------|-------------|
| [Audio Capture](./SYCORE_AUDIO_CAPTURE.md) | Record audio directly within SY.CORE via the mic toolbar panel |
| [Audio Looper](./SYCORE_LOOPER.md) | Sample-accurate looper for live instrumental and digital performance *(Beta)* |
| [Samples Machine](./SYCORE_LOOP_MACHINE.md) | 24-pad simultaneous loop player with sync-quantized starts, mixer, Performance Sets, and Capture integration |
| [Sampler](./SYCORE_SAMPLER.md) | 7-pad multi-bank sampler with MIDI velocity, chromatic pitch-shifting, ADSR envelopes, lo-fi modes, and granular synthesis |
| [Backing Track Player](./SYCORE_BACKING_TRACK_PLAYER.md) | Dual-slot playback engine with crossfade, playlist, and MIDI sync |
| [Freesound Browser](./SYCORE_FREESOUND_BROWSER.md) | Search, preview, and inject sounds from freesound.org into playlists, loop pads, or Audio Capture |

---

## MIDI

| Guide | Description |
|-------|-------------|
| [Connecting Your MIDI Devices](./SYCORE_MIDI_SETUP.md) | Step-by-step setup procedure — connect hardware, register devices, configure routing, map controls |
| [Devices](./SYCORE_MIDI_DEVICES.md) | Auto-discover and register your devices; rename virtual instruments |
| [MIDI Flow](./SYCORE_MIDI_FLOW.md) | Visual drag-and-drop MIDI routing canvas with per-connection note-range filters (keyboard splits), MIDI channel filters, app→device cable filters, per-instrument note latch, reconnect input button, multi-channel conflict guard, and collapsible canvas nodes |
| [Controller Designer](./SYCORE_MIDI_CONTROLLER_DESIGNER.md) | Visual canvas for designing custom MIDI controller layouts — auto-generate surface layouts from built-in templates (Akai MIDI Mix, Launchpad Mini MK1, Launchkey 49 MK4), SysEx init strings, virtual instrument CC table, DECK navigation actions |
| [General Settings](./SYCORE_MIDI_GENERAL_SETTINGS.md) | Global channel defaults, clock/transport, Block Incoming Clock Thru (prevents MIDI echo), Smart Latch, config presets |
| [MIDI Capture](./SYCORE_MIDI_CAPTURE.md) | Record, view, and export MIDI events in real time — IN/OUT range cursors editable as text, playback routed as a MIDI Flow app source |
| [Multi Sound — Program Change Browser](./SYCORE_DEVICE_PROGRAM_CHANGE.md) | Browse and send Program Change messages — PC template assignment per device, import Access Virus .syx, Arturia Analog Lab db.db3, Kawai K1 .syx, Standard JSON, and .mfprojz banks. Virtual instruments show all 16 channels. Copy Map. |
<!-- | [MIDI Manager](./SYCORE_MIDI%20MANAGER.md) | Unified MIDI control center — routing, mapping, and device management |
| [Routing](./SYCORE_MIDI_ROUTING.md) | Configure MIDI routing flow |
| [Performance](./SYCORE_MIDI_PERFORMANCE.md) | Source-to-output routing matrix — controls |
| [Mapping](./SYCORE_MIDI_MAPPING.md) | MIDI CC → application parameter |
| [Actions](./SYCORE_MIDI_ACTIONS.md) | Per-device app action binding — maps MIDI CC/Note inputs to high-level SY.CORE actions (e.g. start sequencer, toggle looper, change preset). |
| [Sync](./SYCORE_MIDI_SYNC.md) | Cross-subsystem transport synchronization matrix | -->

---

## Live Performance

| Guide | Description |
|-------|-------------|
| [DECK](./SYCORE_INSTRUMENT_COCKPIT.md) | Performance console — controllers, apps, and instruments with live patches, channels, hover-to-highlight routing, custom background image, save/recall Performance Set, independent Play/Stop for Drum Machine and Chord Prog |
| [Live Timeline](./SYCORE_LIVE_TIMELINE.md) | Visual arrangement timeline in bars:beats format with bar-number rulers — segments, MIDI markers (including chord-prog markers), tempo markers, and transport control |
| [Drum Machine](./SYCORE_DRUM_MACHINE.md) | 11-track 16-step pattern sequencer with A–H sequence banks, Fill, Repeater, style generation, REC SYNC, Patterns DB, Euclidean Pattern Generator, Bassline generator (uses 3 tracks) |
| [Chord Progression Sequencer](./SYCORE_CHORD_PROG_SEQUENCER.md) | Step-based harmonic sequencer — 8 slots (A–H) chainable, chord library, chord suggestion modal with favorites, custom chord assignment via MIDI capture, per-step arp rate override, step copy/paste, save/load all 8 slots, chord-prog timeline markers, import standard MIDI files |
| [Sequencer](./SYCORE_SEQUENCER.md) | Chromatic piano-roll-style step sequencer — 12-note vertical bars per step (C–B), per-step octave/accent/probability, independent MIDI Flow app with own IN/OUT and pattern storage |
| [Step Sequencer](./SYCORE_STEP_SEQUENCER.md) | Algorithmic composition engine with style-based generation — 8 pattern slots (A–H) |
| [Arpeggiator](./SYCORE_ARPEGGIATOR.md) | Generates note patterns from held chords — now a routable MIDI Flow app with its own IN port and per-cable note-range filters |
| [Note Latch](./SYCORE_NOTE_LATCH.md) | Independent MIDI IN/OUT app that holds incoming notes after key release — configurable Max Notes, FIFO/BLOCK mode, cable-able on the MIDI Flow canvas |
| [Live Performance Pad](./SYCORE_LIVE_PERFORMANCE_PAD.md) | Pad-based performance panel for triggering sounds and sequences on stage |
| [Audio Mixer](./SYCORE_AUDIO_MIXER.md) | Per-channel volume/mute/solo with EXT mode (disables CC#7 for hardware that doesn't support it), MIDI mappable via Controller Designer |

---

## Platform

| Guide | Description |
|-------|-------------|
| [Module Manager & AI Settings](./SYCORE_MODULE_MANAGER.md) | Configure which modules are enabled in the UI and set up AI providers for generative features |
| [User Session — Backup & Restore](./SYCORE_SESSION_MANAGER.md) | Export your full user data set (presets, Chord Progressions, MIDI Flow routing, Controller Designer & Mixer configs, mappings, settings) to a single JSON file and restore it later |

---

*Last updated: 2026-08-31*
