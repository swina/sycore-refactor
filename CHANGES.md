# Changes

A running log of new features added to SY.CORE, newest first. Bug fixes and internal refactors aren't tracked here — see `git log` for the full history.

## 2026-08-02

- MIDI Devices: **rename a virtual instrument** — click its name in the MIDI Devices panel to edit it in place. The new name is migrated everywhere it's referenced: routing config, the routing matrix, device→app input routing, device→device Thru filters, the keyboard split config, the virtual MIDI output binding, mixer faders/mutes/solo/channel-slots, and its uploaded device image.
- Program Change panel: **Import Standard JSON** — import a bank from a simple JSON file (an array of `{ pc, name }` entries, see `src/data/program_change/json/standard.json`) alongside the existing `.mfprojz` and Emulator X3 import options.

## 2026-07-28

- DECK: **custom background image** — click the new image icon in the DECK title bar to upload any image as the panel's background (stored locally, per browser); an X icon appears next to it to reset back to the default background.
- Instrument Cockpit renamed to **DECK** throughout the app (launcher tile, floating panel header/minimize label, Guides entry) and given a new icon (sparkles, replacing the piano icon); the guide is updated to match.
- MIDI Controller Designer: **DECK Navigation** added as a mappable app-param group (Next/Prev Zone, Zone Encoder, Next/Prev Item, Item Encoder, Select) — assign any control on a preset to drive DECK's hardware navigation directly, the same paramNames its on-screen right-click MIDI Learn menus already write to.
- MIDI Controller Designer: the ACTIONS and APPS lists in the mapping drawer are now sorted alphabetically by group/section name for easier scanning.

## 2026-07-26

- MIDI Settings: **Block Incoming Clock Thru** — new toggle (on by default) that stops MIDI Clock/Start/Continue/Stop received from an input device from being re-sent to other outputs via Global Thru. Incoming clock still drives the Incoming Clock BPM display, but can no longer fight the app's own generated clock on shared devices — fixes a MIDI-echo symptom (notes/CC repeating and fading out, often isolated to one channel) caused by a device broadcasting its own clock into the app.
- MIDI Flow: new **Settings** shortcut icon in the header opens the MIDI Manager window directly on its Settings tab.
- MIDI Controller Designer: **Virtual Instrument CC Table** — each virtual instrument can now have a named CC table (CC number + label, edited from a new button on its card in MIDI Devices). Named entries show up as an assignable action group in the Controller Designer's action picker, with a per-assignment Target Channel selector — useful since one CC table is shared across every channel of a multitimbral instrument, but a physical controller can usually only transmit on one fixed channel.
- Chord Prog Sequencer: **step copy/paste** — right-click any step in the grid for a small menu to copy its full parameter set (chord, notes, velocity, duration, gate, transpose, mode overrides) and paste it onto another step.
- MIDI Device Program Change panel: virtual instruments now always show all 16 MIDI channels in the channel selector and the "Current Program Change" list, not just whichever channels happen to be routed in MIDI Flow — so each of the 16 channels can be picked and assigned its own patch independently.
- MIDI Device Program Change panel: **Copy Map** — a new button next to a virtual instrument's name copies its entire 16-channel patch mapping onto another virtual instrument in one click, for setups where two virtual instrument entries route to the same standalone synth/app and should share identical per-channel patches.
- Performance: fixed audible Drum Machine / Chord Prog Sequencer stutter when a fader or knob is moved during playback — moving a control mapped to a mixer/virtual-instrument volume or a Sound Engine parameter was doing a synchronous `localStorage` write, a full controller LED resync, and a full re-render of every Sound Engine knob on every single incoming MIDI tick, which was enough main-thread work to stall Tone.js's Transport scheduling. All three are now debounced or deferred, so continuous CC input no longer disrupts playback timing.

## 2026-07-25

- MIDI Flow: **Per-instrument note latch** — each hardware or virtual instrument node now has a LATCH row in its canvas card. Toggle ON to hold notes after key release. Set **Max** (1–16 notes) and **FIFO / BLOCK** mode: FIFO ejects the oldest held note when the limit is reached; BLOCK rejects new notes when full. All three controls support right-click MIDI Learn. Settings are persisted per device and survive page reloads. The per-device latch is independent of the global SmartLatch and applies to both keyboard Thru and all app-generated notes (sequencer, chord progressions, etc.).
- MIDI Flow: **Reconnect MIDI input button** — each hardware device node with an input now shows a ↺ icon in the header. Clicking it force-closes and reopens the Web MIDI port and re-attaches the ingress listener, fixing the stale-connection issue where a device shows online after a page reload but stops delivering MIDI events. If the device has a controller preset with a SysEx init, that is also sent automatically.
- MIDI Flow: **Multi-channel conflict guard** — when two canvas nodes point to the same virtual instrument, the second node's Multi-CH panel is locked with an explanation, and the routing engine preserves the first node's channel assignments instead of overwriting them with an empty array. Stale saved configs where both nodes had channels are auto-corrected on load.

- Audio Mixer: **EXT mode per instrument channel** — each external MIDI device strip now shows a **CC7** badge at the bottom. Clicking it switches to **EXT** mode: the mixer stops sending CC#7 entirely for that device (fader and mute go inactive), and the user controls volume physically on the hardware or via a hardware mixer. The flag is persisted per device. Useful for synths that don't implement MIDI CC#7 volume.
- Chord Prog Sequencer: **Per-step Arp Rate** — each step can now have its own arp rate override (shown next to the Pattern selector in the Step Detail row when the step's effective mode is Arp). The slot rate is used as the default; selecting "Slot" from the step's rate dropdown removes the override.
- Chord Prog Sequencer: **Arp Rate always visible** — the Rate selector in the transport bar is now always shown (was previously hidden when the slot was in Chord mode), since individual steps can override to Arp mode regardless of the slot's global play mode. Rate also added to the Fill row for quick access.

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
