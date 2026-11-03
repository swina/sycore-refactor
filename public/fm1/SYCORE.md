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
- `start()` (the Start button's handler) also runs on `{type:"sycore-start"}` from the parent
  (sent once SY.CORE has had a click/key: auto start without the Start click)
- embedded with a parent (`?embed=1` in an iframe): the page's own MIDI input and channel
  selector are off and hidden (not stored) — MIDI comes only through the bridge

- `main.js` `perf.second()`: the load is judged after the first 10 s, not 3 (the JIT's warm-up
  ran FMOS and Felucca over 100% for several seconds: a false "can't run in real time" warning)

To update: re-download the files, then re-apply the patch.

SY.CORE FMOS (our own firmware, a Felucca fork developed in `../sycore-fmos`, GPL-3.0):
- `fw/sycore-fmos-<version>.fwsc`: its package, copied from `sycore-fmos/felucca/build/felucca.fwsc`
- `firmwares.json`: the entry `sycore` (first, `"sycore": true`, `package` relative to this folder) and
  `"default": "sycore"`. The file is generated upstream: re-add the entry after an update.
- `main.js` `packageOf()`: a `sycore` entry's kept copy is used only while its URL is the catalog's
  `package`, so a new version (a new file name) is fetched instead of the old cached copy
- its Program Change catalog: `public/data/program_change/fmos/presets.json`, written by
  `sycore-fmos/tools/gen_sycore_catalog.sh` from the firmware's tables
