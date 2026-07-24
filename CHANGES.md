# Changes

A running log of new features added to SY.CORE, newest first. Bug fixes and internal refactors aren't tracked here — see `git log` for the full history.

## 2026-07-24

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
