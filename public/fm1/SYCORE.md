# FM-1 emulator (vendored)

Build of [joakimeriksson/fm1-emu](https://github.com/joakimeriksson/fm1-emu) (MIT, see LICENSE),
downloaded from https://joakimeriksson.github.io/fm1-emu/ at upstream commit 93cb7ee (2026-10-28).
Served from SY.CORE's own origin so the FM-1 panel can talk to it.

Local patch in `main.js` (search "SY.CORE bridge" / "fm1-stats"):
- `message` listener: `{type:"sycore-midi", bytes}` from the parent → `midiMessage()`;
  `{type:"sycore-ctl", kind:"enc"|"pot"|"key", ...}` → `turn()` / `setPot()` / `setKey()` (MIDI learn)
- once a second posts `{type:"fm1-stats", load, speed, drift, ...}` to the parent
- `{type:"sycore-lcd", on}` from the parent: while on, posts each LCD change (240×240 RGB565,
  at most one per 50 ms) as `{type:"fm1-lcd", lcd}` — the DECK's FM-1 view mirrors it
- posts `{type:"fm1-ready"}` once that listener is up
- embedded with a parent (`?embed=1` in an iframe): the page's own MIDI input and channel
  selector are off and hidden (not stored) — MIDI comes only through the bridge

To update: re-download the files, then re-apply the patch.
