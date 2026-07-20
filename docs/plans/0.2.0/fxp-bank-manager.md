# FXP Bank Manager

Some standalone synth apps assign MIDI Bank and Program numbers based on the alphabetical order of files inside a specific directory.

From the Multi Sound [`MidiDeviceProgramChangePanel.vue`](/src/components/MidiDeviceProgramChangePanel.vue) the Virtual devices registered should have this option (right pane):

1. Open Presets Banks Folder
2. Read the subfolders (if exist)
3. Inside each folder (category) there are the `.fxp` files. `.fxp` filename is the preset name
4. Build the catalog based on the folders structure

To set the PC (Program Change), this is the logic:

BANKS =>

```
Bank 0 = root folder
Bank 1 = first alphabetical subfolder
Bank 2 = second alphabetical subfolder
Bank 3 = etc.
```

PRESETS
```
Preset 1 = fxp filename alphabetical order in the current subfolder
Preset 2 = etc.
```

To create the Preset Catalog and send the correct Program Change:

`MIDI CC 0 = Bank n` + `MIDI PC = Preset n`

---

## Phase 0 — Documentation Discovery (findings)

Before writing any code, three areas of the existing codebase were read in full to establish the "Allowed APIs" — the feature should **copy** these patterns, not invent new ones.

### Allowed APIs / patterns to copy

| Concern | Source of truth | Citation |
|---|---|---|
| Folder picker + feature detection | `SoundFolderBrowser.vue` | `isApiSupported = typeof window !== 'undefined' && !!window.showDirectoryPicker` — [SoundFolderBrowser.vue:13](/src/components/SoundFolderBrowser.vue#L13) |
| Pick + persist handle | `pickFolder()` | [SoundFolderBrowser.vue:69-81](/src/components/SoundFolderBrowser.vue#L69-L81) — `showDirectoryPicker()` wrapped in try/catch, `e?.name !== 'AbortError'` to suppress cancel logging, `idbHandlePut(HANDLE_KEY, handle)` |
| Restore handle + permission re-grant | `onMounted` / `reconnectFolder()` | [SoundFolderBrowser.vue:83-112](/src/components/SoundFolderBrowser.vue#L83-L112) — `queryPermission({mode:'read'})` / `requestPermission({mode:'read'})` |
| Enumerate a directory | `walk()` async generator | [SoundFolderBrowser.vue:38-49](/src/components/SoundFolderBrowser.vue#L38-L49) — `for await (const [name, handle] of dir.entries())`, branch on `handle.kind === 'file' \| 'directory'` |
| Handle persistence (idb) | `idbHandlePut` / `idbHandleGet` | exported from `@/lib/idb` → [src/lib/db/cache/handle-storage.ts:10-28](/src/lib/db/cache/handle-storage.ts#L10-L28), generic IndexedDB store `sound_folder_handles`, keyed by an arbitrary string id — reusable as-is with a new key |
| Unsupported-browser gate copy | template | [SoundFolderBrowser.vue:352-363](/src/components/SoundFolderBrowser.vue#L352-L363) — *"Folder browsing requires the File System Access API — available in Chrome, Edge, or Opera."* |
| Virtual device model | `VirtualRegistration` | [src/types/midi.ts:107-114](/src/types/midi.ts#L107-L114) |
| Per-device PC config | `DeviceRegistration` + ad-hoc `pcMsb/pcLsb/pcChannel/pcBank/pcChannels` fields | [src/types/midi.ts:9-27](/src/types/midi.ts#L9-L27); bolted-on fields set via `midiStore.updateRegistration(name, field, value)` — [src/stores/useMidiStore.ts:284-292](/src/stores/useMidiStore.ts#L284-L292) |
| "Virtual" badge check (for gating the new button) | template | [MidiDeviceProgramChangePanel.vue:818-822](/src/components/MidiDeviceProgramChangePanel.vue#L818-L822) — `midiStore.virtualInstruments.some(v => v.name === dev.name)` |
| Bank section header row (where the new button goes) | template | [MidiDeviceProgramChangePanel.vue:1184-1198](/src/components/MidiDeviceProgramChangePanel.vue#L1184-L1198) — sits next to the existing "Import .mfprojz" button |
| Bank buttons + preset list (reused verbatim) | template | [MidiDeviceProgramChangePanel.vue:1228-1421](/src/components/MidiDeviceProgramChangePanel.vue#L1228-L1421) |
| `bankConfig` computed (extend, don't replace) | script | [MidiDeviceProgramChangePanel.vue:198-205](/src/components/MidiDeviceProgramChangePanel.vue#L198-L205) |
| Import → add-bank precedent | `confirmImport()` | [MidiDeviceProgramChangePanel.vue:168-174](/src/components/MidiDeviceProgramChangePanel.vue#L168-L174) — `userBanksStore.addBank(deviceName, name, presets)` |
| Preset array shape precedent | `parseMfprojz()` | [src/composables/useMfprojzParser.js:38-70](/src/composables/useMfprojzParser.js#L38-L70) — returns `[{ category, no, name, msb, lsb, bank, program }]` |
| User bank store (extend) | `useUserBanksStore` | [src/stores/useUserBanksStore.ts](/src/stores/useUserBanksStore.ts) — `PresetBankEntry { name, createdAt, presets }`, `addBank/removeBank/getBanksForDevice/getPresets/hasBank`, persisted to `localStorage` |
| **The actual MIDI send — reuse unmodified, do not touch** | `sendCatalogSound()` + `sendToDeviceMessage()` | [MidiDeviceProgramChangePanel.vue:323-373](/src/components/MidiDeviceProgramChangePanel.vue#L323-L373) — already sends `[0xB0\|ch,0,msb]`, `[0xB0\|ch,32,lsb]`, `[0xC0\|ch,progNum]` to real **and** virtual devices |

### Anti-patterns to avoid (confirmed by grep, not assumption)

- **Do not write an `.fxp` binary parser.** `grep -rniE '\.fxp\b|FXP' src/` returns zero hits anywhere in the repo. Per the design doc, only the *filename* is needed (`.fxp` filename → preset name) — no chunk/header parsing of the actual VST preset binary format.
- **Do not add a `webkitdirectory` `<input>` fallback.** No such pattern exists anywhere in `src/` today (`grep -rn webkitdirectory src/` — zero hits). `SoundFolderBrowser.vue` handles the unsupported case with a full UI gate instead (see table above) — copy that, don't invent a new fallback mechanism.
- **Do not add a new shared `sendBankSelectAndProgramChange` to `midi-service.ts`.** `sendCatalogSound()` already does the CC0/CC32/PC three-message send through `sendToDeviceMessage()`, which already dispatches correctly to real WebMIDI outputs *and* virtual instruments ([MidiDeviceProgramChangePanel.vue:323-334](/src/components/MidiDeviceProgramChangePanel.vue#L323-L334)). Adding a second send path would create a 9th duplicate of logic that's already duplicated 8 times elsewhere in the app (`ProgramChangeBrowser.vue`, `MasterPresetsList.vue`, etc.) — reuse the existing one instead of adding a 9th.
- **Do not derive the Bank number from `Math.floor(progIdx / 128)`.** That generic math (used today for the built-in catalog and for `.mfprojz` imports) only works when all presets for a device live in one flat, globally-numbered list. FXP banks are added as **separate named `PresetBankEntry` rows** (one per folder, so they show as separate clickable Bank buttons, matching the design doc's expectation of Bank 0/1/2/3 as distinct folders) — with separate entries, every folder's presets would independently start their own 0-127 range, so the generic formula would silently compute Bank MSB = 0 for every folder. Use `bankConfig.msb = true` instead, so `sendCatalogSound()` reads the *literal* `sound.msb` field already set explicitly per preset by the scanner (Phase 1) — this is an existing, already-supported branch of `sendCatalogSound()` ([MidiDeviceProgramChangePanel.vue:355](/src/components/MidiDeviceProgramChangePanel.vue#L355): `msb = cfg.msb ? (sound.msb ?? 0) : ...`), not new logic.

---

## Phase 1 — FXP folder scanner (pure logic, no UI)

**What to implement**: a new composable, `src/composables/useFxpBankScanner.js`, copying `SoundFolderBrowser.vue`'s picker/walk/persistence conventions (cited above) rather than transforming them.

Exports:

```js
async function pickFxpBanksFolder(deviceName)
// showDirectoryPicker() → idbHandlePut(`fxpBanks:${deviceName}`, handle) → scanFxpBanksFolder(handle)

async function restoreFxpBanksFolder(deviceName)
// idbHandleGet(`fxpBanks:${deviceName}`) → queryPermission({mode:'read'}) → scanFxpBanksFolder(handle) or flag needsPermission

async function scanFxpBanksFolder(dirHandle)
// Returns: [{ bankIndex: number, bankName: string, presets: [{ name, program, msb, category }] }]
```

Scan algorithm (per the design doc's Bank/Preset numbering):

1. `for await (const [name, handle] of dirHandle.entries())` on the **root** — same one-level pattern as `walk()` ([SoundFolderBrowser.vue:38-49](/src/components/SoundFolderBrowser.vue#L38-L49)), but **not recursive**: split entries into `.fxp` files directly in root vs. subdirectories.
2. Sort subdirectory names alphabetically (`localeCompare`) — note neither reference file has an existing alphabetical-sort convention to copy (`SoundFolderBrowser.vue`'s only `.sort()` is a random shuffle at [line 208](/src/components/SoundFolderBrowser.vue#L208)), so this sort is new but trivial.
3. Root `.fxp` files (sorted alphabetically) → **Bank 0** presets, if any exist.
4. Each subfolder, in alphabetical order → **Bank 1, 2, 3, ...**. For each, do one non-recursive `entries()` pass, filter `/\.fxp$/i`, sort alphabetically.
5. Preset `name` = filename with `.fxp` stripped; `program` = 0-based index within that bank; `msb` = the bank's index (0 for root, 1 for first subfolder, ...); `category` = folder name (or `'Root'` for bank 0).
6. Reading file contents (`handle.getFile()`) is only needed to confirm a `FileSystemFileHandle` is a real file — no `.arrayBuffer()`/`.text()` read is required since only the filename matters (confirmed no FXP parser exists — see anti-patterns).

**Verification checklist**:
- [ ] `scanFxpBanksFolder` is a pure function of a directory-handle-like object — write a Vitest unit test with a hand-rolled fake implementing `entries()` as an async iterator (`{ kind, getFile }`), matching the project's existing `npm run test` (Vitest) setup.
- [ ] Confirm output for a fixture tree (`root/a.fxp`, `root/Bass/b.fxp`, `root/Bass/a.fxp`, `root/Lead/x.fxp`) yields `Bank 0` = `[a]`, `Bank 1 (Bass)` = `[a, b]` (alphabetical, not insertion order), `Bank 2 (Lead)` = `[x]`.
- [ ] Confirm `pickFxpBanksFolder`/`restoreFxpBanksFolder` suppress `AbortError` on cancel exactly like [SoundFolderBrowser.vue:78-80](/src/components/SoundFolderBrowser.vue#L78-L80).

**Anti-pattern guards**: no `.arrayBuffer()`/binary parsing; no recursive walk past two levels (design doc is strictly Bank→Preset, not arbitrary nesting); no new IndexedDB object store — reuse `sound_folder_handles` via `idbHandlePut`/`idbHandleGet`.

---

## Phase 2 — Data model extension

**What to implement**: two small, additive extensions — both backward-compatible with existing `.mfprojz`/manual banks.

1. In [`src/stores/useUserBanksStore.ts`](/src/stores/useUserBanksStore.ts), extend `PresetBankEntry` (currently [lines 8-16](/src/stores/useUserBanksStore.ts#L8-L16)) with an optional tag:
   ```ts
   export interface PresetBankEntry {
     name: string
     createdAt: string
     presets: any[]
     source?: 'fxp'   // undefined = existing mfprojz/manual banks, unaffected
   }
   ```
   Extend `addBank(deviceName, bankName, presets, source?)` ([line 44](/src/stores/useUserBanksStore.ts#L44)) with a 4th optional param, stored on the entry. Existing callers (`confirmImport()` at [MidiDeviceProgramChangePanel.vue:170](/src/components/MidiDeviceProgramChangePanel.vue#L170)) keep calling it with 3 args — unaffected.
   Add `removeBanksBySource(deviceName, source)` modeled directly on the existing `removeBank()` ([line 52](/src/stores/useUserBanksStore.ts#L52)), used by Phase 3's "rescan" to clear stale FXP banks before re-adding freshly scanned ones.

2. In `MidiDeviceProgramChangePanel.vue`, extend the `bankConfig` computed ([lines 198-205](/src/components/MidiDeviceProgramChangePanel.vue#L198-L205)) with one new branch, inserted before the existing `isUserBank` branch:
   ```js
   const bankConfig = computed(() => {
     if (!catalogDevice.value || !selectedBank.value) return null
     const userEntry = userBanksStore.getBanksForDevice(selectedDeviceName.value)
       .find(b => b.name === selectedBank.value)
     if (userEntry?.source === 'fxp') return {
       msb: true, lsb: false, category_field: 'category',
       program_field: 'program', program_base: 0,
     }
     if (isUserBank(selectedBank.value)) return {
       msb: false, lsb: false, category_field: 'category',
       program_field: 'program', program_base: -1,
     }
     return catalogIndex[catalogDevice.value][selectedBank.value]
   })
   ```
   `msb: true` makes `sendCatalogSound()` read the literal `sound.msb` set by the Phase 1 scanner (bank index) instead of deriving it via `Math.floor(progIdx/128)` — see the anti-pattern note above for why this branch is necessary.

**Verification checklist**:
- [ ] Existing `.mfprojz`-imported banks still load and send correctly (their `PresetBankEntry.source` is `undefined`, so they fall through to the unchanged `isUserBank` branch).
- [ ] `npm run test` (Vitest) passes.

**Anti-pattern guards**: do not touch `catalogIndex`-branch logic (built-in device catalogs); do not remove or rename existing `PresetBankEntry` fields; `source` must default to `undefined`, never a required field.

---

## Phase 3 — UI: "Open Presets Banks Folder"

**What to implement**: one new button in the existing Bank section header row, gated to virtual devices per the design doc ("the Virtual devices registered should have this option").

In the header row at [MidiDeviceProgramChangePanel.vue:1184-1198](/src/components/MidiDeviceProgramChangePanel.vue#L1184-L1198), next to the existing "Import .mfprojz" button, add a second button reusing the already-imported `FolderOpen` icon ([already imported line 3](/src/components/MidiDeviceProgramChangePanel.vue#L3), currently used at [line 1242](/src/components/MidiDeviceProgramChangePanel.vue#L1242) for the user-bank folder icon):

```vue
<button
  v-if="midiStore.virtualInstruments.some(v => v.name === selectedDeviceName)"
  @click="openFxpBanksFolder"
  :disabled="isFxpScanning"
  class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/40 transition-all text-[8px] font-black uppercase tracking-wider disabled:opacity-40"
  title="Open a folder of .fxp preset banks"
>
  <Loader2 v-if="isFxpScanning" class="w-2.5 h-2.5 animate-spin" />
  <FolderOpen v-else class="w-2.5 h-2.5" />
  Open Presets Banks Folder
</button>
```

(The `v-if` condition copies the exact "Virtual" badge check already used at [line 818](/src/components/MidiDeviceProgramChangePanel.vue#L818).)

Script additions:
```js
import { pickFxpBanksFolder, restoreFxpBanksFolder } from '@/composables/useFxpBankScanner'

const isFxpScanning = ref(false)

async function openFxpBanksFolder() {
  isFxpScanning.value = true
  try {
    const dn = selectedDeviceName.value
    const banks = await pickFxpBanksFolder(dn)
    if (!banks) return   // user cancelled
    userBanksStore.removeBanksBySource(dn, 'fxp')
    for (const b of banks) {
      userBanksStore.addBank(dn, b.bankName, b.presets, 'fxp')
    }
  } finally {
    isFxpScanning.value = false
  }
}
```
This mirrors `confirmImport()`'s call shape ([MidiDeviceProgramChangePanel.vue:168-174](/src/components/MidiDeviceProgramChangePanel.vue#L168-L174)) exactly, just looping over multiple banks instead of one.

Optionally, on device selection, call `restoreFxpBanksFolder(selectedDeviceName.value)` (mirroring [SoundFolderBrowser.vue:96-112](/src/components/SoundFolderBrowser.vue#L96-L112)'s `onMounted` restore) so a previously-picked folder auto-rescans without the user re-picking it every session.

**No other template changes are needed** — the existing bank-buttons row ([lines 1228-1254](/src/components/MidiDeviceProgramChangePanel.vue#L1228-L1254)) and preset list ([lines 1284-1421](/src/components/MidiDeviceProgramChangePanel.vue#L1284-L1421)) already iterate `availableBanks` / call `getPresets()`, which will include the new FXP-sourced banks automatically once they're in `userBanksStore`.

**Verification checklist**:
- [ ] Button only appears for devices in `midiStore.virtualInstruments`, not real WebMIDI devices.
- [ ] Picking a folder produces N+1 (or N) new Bank buttons (root + subfolders), correctly ordered/named.
- [ ] Re-clicking "Open Presets Banks Folder" and picking the same or a changed folder replaces (not duplicates) the FXP banks for that device.
- [ ] Unsupported-browser case (non-Chromium) shows a message consistent with [SoundFolderBrowser.vue:352-363](/src/components/SoundFolderBrowser.vue#L352-L363) rather than silently failing — reuse the same copy.

**Anti-pattern guards**: don't gate the button on `isMulti`/other unrelated flags; don't skip the `removeBanksBySource` clear step (would leave orphaned stale banks after rescans with fewer folders than before).

---

## Phase 4 — Send-path verification (no new send code)

`sendCatalogSound()` and `sendToDeviceMessage()` are reused **unmodified**. With Phase 2's `bankConfig` branch in place, clicking a preset in an FXP-sourced bank will:
- read `sound.msb` literally (the folder/bank index set by the Phase 1 scanner) → `[0xB0|ch, 0, msb]`
- read `sound.program` (0-based index within the folder) → `[0xC0|ch, progNum]`

**Verification checklist**:
- [ ] Open the existing `midi-monitor` module/panel (already in [src/core/modules/registry.ts](/src/core/modules/registry.ts)) while sending an FXP preset and confirm the three outgoing bytes match: `B0 00 <bankIndex>`, `B0 20 00`, `C0 <presetIndex>`.
- [ ] Confirm this works identically for a real WebMIDI output and a `virtualInstruments` entry (both paths already flow through `sendToDeviceMessage()`).

---

## Phase 5 — Final Verification

1. `npm run test` (Vitest) — Phase 1's scanner unit test plus no regressions elsewhere.
2. `grep -rniE '\.fxp\b|FXP' src/` — confirm the only new hits are the scanner composable and its call sites; confirm no binary-parsing code was introduced.
3. Manually test end-to-end in a Chromium-based dev build (`npm run dev`, File System Access API requirement):
   - Register a virtual instrument ([existing flow](/src/components/MidiDeviceProgramChangePanel.vue#L574-L579), "Add Virtual Instrument").
   - Create a test folder tree (e.g. via `mkdir`/`touch` — file contents are irrelevant, only names/extension matter): `TestBanks/{a.fxp, Bass/{Kick.fxp, Sub.fxp}, Lead/{Saw.fxp}}`.
   - Click "Open Presets Banks Folder", verify Bank 0/1/2 buttons appear with correct names and alphabetical preset ordering.
   - Send a preset from each bank, confirm via MIDI Monitor.
   - Reload the page, confirm existing `.mfprojz` banks (if any) still work unaffected.
4. Confirm no changes were made to `src/core/midi/midi-service.ts` (per the anti-pattern guard in Phase 0 — the send layer needed zero changes).
