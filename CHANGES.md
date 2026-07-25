# Changes

A running log of new features added to SY.CORE, newest first. Bug fixes and internal refactors aren't tracked here — see `git log` for the full history.

## 2026-07-25

- Chord Prog Sequencer: **Custom Chord Assignment** — select any step, click "Custom" to open a chord-capture modal with two input modes: **MIDI IN** (click "Start Listening", play and hold a chord on any connected MIDI keyboard) and **Virtual Keyboard** (click on-screen piano keys). The system auto-detects the chord name in real-time (C Major, Dm7, Gmaj7, etc.). The name is editable before assigning. Works for 18 chord qualities: triads, seventh chords, sus, add9, 6th, 9th, and more.

## 2026-07-24

- MIDI Controller Designer: **Auto-generate surface layout** — assigns a device to a preset and a "Generate Layout" button appears; one click populates the canvas with correctly positioned and pre-wired controls. Built-in templates: Akai MIDI Mix, Novation Launchpad Mini MK1, Novation Launchkey 49 MK4.
- MIDI Controller Designer: **SysEx Init** — attach a SysEx dump string to any controller preset; fires automatically on preset activate, with a manual "Send Now" button. Supports hex (`F0 … F7`), 0x-prefixed, and decimal formats. Preset Settings drawer shown in right panel when no control is selected.
- MIDI Controller Designer: **Audio Mixer** section added to mappable actions, including Toggle Audio Mixer and Master Volume via CC (continuous CC → `useAudioMixerStore.setMasterVol`)
- Push Notifications panel redesigned as a resizable/draggable window with three tabs: **Compose** (title, body, image attachment with file upload or URL, click-through URL, notification preview, send-to-all and send-to-me), **Subscribers** (list with browser badge and "pushable" indicator, remove, export CSV), and **Sent** (registry of all dispatched notifications with recipient counts and image thumbnail)
- Push Notifications management (subscribe/unsubscribe, send test push, subscriber list) extracted from Admin Panel into its own dedicated modal, admin-only
- Fixed `vercel dev` locally serving raw `index.html` content for asset/JS requests (e.g. `/src/main.js` 500ing) — the SPA-fallback rewrite in `vercel.json` matched every path unconditionally; scoped it to exclude `api/`, `assets/`, `src/`, and any path with a file extension
- User Profile: Subscribe/Unsubscribe controls for push notifications, so any user can manage this themselves without going through Admin Panel
- Push notification permission prompt now shown to every logged-in user (previously only the superadmin account), so the subscriber list the admin broadcasts to actually grows
- Drum Machine: admin-published Default Kit — an admin assigns bundled sound files to each of the 11 track slots once, and any user can recall it from the Kits panel ("Load Default Kit"), with automatic seeding into a brand-new user's first empty sequence
- Audio Mixer added to mappable MIDI Actions apps: Toggle Mixer plus per-channel Volume/Mute/Solo (up to 16 channels), with numbered channel-slot assignments and a save/update/load configuration system
- Session export/import extended to cover MIDI Flow routing (device registrations, routing matrix, input routing, output filters, keyboard split, virtual instruments, saved canvases), the Chord Progression library, MIDI Controller Designer presets, and Audio Mixer configs — not just S-1 presets and basic settings
- MIDI Flow: shortcut icon to open the MIDI Devices panel directly from the sidebar
- MIDI Flow: per-device canvas nodes can be collapsed to header-only to save space
- MidiControllerDesigner: resizable/draggable background reference image, positioned under the controls
- Drum Machine: random sound assignment now tries to match each slot's filename to its label (e.g. the Kick slot prefers a file with "kick" in its name) before falling back to a random pick
- Dark theme set as the default for first-time visitors (previously followed OS/browser color-scheme preference)
- Added a "Support on Patreon" and "GitHub" (open-source repo) link to the app header and the marketing website footer
- Unified app launcher: pinned apps + category tabs replacing the separate main-page grid and workspace burger-menu strip, plus an always-visible dock of every open app and tablet auto-fullscreen-on-open

## 2026-06-13

- Marketing website published at GitHub Pages, deployed automatically via GitHub Actions
