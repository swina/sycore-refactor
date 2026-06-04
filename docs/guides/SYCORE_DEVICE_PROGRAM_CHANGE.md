# Multi Sound 

**Module:** SY.CORE — Program Change Browser  
**Version context:** release/0.0.6

---

## Overview

`Multi Sound` is a full-featured, per-device MIDI Program Change (PC) browser and dispatcher. It surfaces as a modal overlay and provides three distinct interaction modes:

| Mode | Trigger condition | Description |
|---|---|---|
| **Catalog mode** | Device name matches a key in `program_change.json` | Browse built-in sound banks with search/filter; one-click send. |
| **User-bank mode** | A user-imported `.mfprojz` bank is active | Same UX as catalog, but populated from local user data. |
| **UI Device mode** | Device is routed from `MidiSource.UI` | Shows the app's internal Sound Library (preset history) instead of external catalogs. |
| **Manual fallback** | No catalog match, no user banks | Raw MSB/LSB/PC number inputs with a Send button. |

---

## Architecture & Data Flow

<img src="/help/guides/multi-program-change.png" width="640"/>


## Component Structure

### Left Column — PC Device List

- Reads `midiStore.routingConfig.registrations` and filters to entries where **both** `outEnabled` and `pcEnabled` are true.
- Devices are sorted: online first, then alphabetically.
- Each row shows:
  - Online/offline indicator (green dot / grey dot)
  - Device name
  - Context badge: `UI` (sky), `Multi` (purple), or channel + last PC number
- Auto-selects the first online PC-enabled device on `onMounted`.

### Left Column — Performance Sets


Each set snapshot contains, per device:

```ts
{
  deviceName:     string
  pcChannel:      number      // 0-based
  pcBank:         string
  pcProgram:      number
  pcChannels:     Record<string, { program, bank, soundName }>
  isUiDevice:     boolean
  lastPresetId:   string | null
  lastPresetName: string | null
}
```

Operations: **Save** (new set), **Recall** (restore all devices + re-send MIDI), **Update** (overwrite existing), **Delete**.

On recall, for hardware devices, if `pcChannels` contains multi-channel state, all channels are replayed; otherwise the single-channel `pcProgram` is sent.

---

## Catalog System


Top-level keys are device name fragments matched case-insensitively with partial substring matching (`includes`).

Sound data files are lazy-loaded at runtime via `fetch()` when a bank is selected.

### Currently indexed devices

| Device key | Banks |
|---|---|
| `Arturia MicroFreak` | Factory Bank 6, New Presets 4 |
| `SEQTRAK-1` | AWM2, DX, Drums, Sampler |

User-imported banks are device-scoped and stored client-side; they are visually distinguished with a teal color scheme and a `FolderOpen` icon.

---

## MIDI Message Dispatch

### Catalog / user-bank send (`sendCatalogSound`)

```
CC 0  (Bank Select MSB): value from sound.msb  OR derived from program number (prog / 128)
CC 32 (Bank Select LSB): value from sound.lsb  OR 0
PC    (0xC0 | ch):       sound[program_field] clamped to 0–127 after applying program_base
```

### Manual fallback send

- MSB / LSB are optional (checkbox-gated).
- Program is entered as 1–128 (converted internally to 0-based MIDI value).

### State persistence (`recordChannelState`)

After every send, the component calls `midiStore.updateRegistration()` to write:
- `pcChannels[ch]` → `{ program, bank, soundName }`
- `pcProgram` → last sent program number
- `pcBank` → last selected bank name

This state survives panel close/reopen and is the source of truth for the "Current Program Change" display.

---

## MIDI CC Scroll / MIDI Learn

Allows a physical knob/encoder to scroll the preset list without touching the UI.

---

## Import (Arturia MIDI Control Center)


### Parse pipeline

1. Open `.mfprojz` as a ZIP (via JSZip).
2. Iterate entries matching `*.mbp` (excludes `test_empty`, directories).
3. Extract slot number from filename using three pattern strategies.
4. Parse the MBP binary header with a fixed-width regex to extract preset name and category ID.
5. Map category ID to string via `CATEGORY_MAP` (12 categories: Bass → Vocoder).
6. Sort by slot, then map to the standard preset schema: `{ category, no, name, msb, lsb, bank, program }`.

### In-component flow

2. On parse success → inline rename dialog pre-filled with filename (extension stripped).
3. On confirm → `userBanksStore.addBank(deviceName, bankName, presets)`.
4. Bank immediately selected and available for sending.


---

## Opportunities

### For live performers

**Performance Sets** allow complete multi-device snapshots to be saved, named, and recalled with a single click. One recall restores the correct sound on every connected device simultaneously, replaying the exact MIDI Bank Select + Program Change sequence that was previously dialed in. This eliminates per-device recall during set transitions.

### For producers and studio users

The **catalog browser** maps device name to a pre-indexed sound library. The user never needs to remember bank MSB/LSB combinations or consult the hardware manual. Category filtering and text search reduce time-to-sound significantly, especially on instruments with 500+ factory programs.

### For Arturia hardware owners

The **.mfprojz import** directly ingests project exports from Arturia MIDI Control Center without any intermediate steps. A full preset bank is available in the browser within seconds of export, named as a user bank and instantly accessible for live use.

### For complex rigs

The **MIDI CC Scroll** feature allows preset navigation from a physical encoder, keeping hands on hardware. The MIDI Learn workflow requires a single knob movement to configure and persists across sessions.

The **multi-timbral display** renders the current program state per channel, giving a clear at-a-glance picture of a multi-timbral setup without needing to inspect each MIDI channel individually.

### Differentiators vs. standalone patch librarians

| Capability | SY.CORE Panel | Standalone librarians |
|---|---|---|
| Integrated routing context | Yes — aware of online/offline state, UI device routing | No |
| Performance Sets (multi-device recall) | Yes | Rarely |
| MIDI CC scroll with learn | Yes | No |
| Arturia .mfprojz import | Yes | Vendor-specific tools only |
| Sound Library integration (UI device) | Yes | No |
| Manual PC fallback | Yes | Sometimes |
| Zero install / browser-native | Yes | No |

---

## Limitations & Known Constraints

- Catalog sound files are loaded via `fetch('/src/data/program_change/...')` — requires a Vite dev server or correct static asset serving in production.
- Device catalog matching uses a substring strategy; ambiguous device names (e.g. two devices whose names partially overlap) may resolve to the wrong catalog entry.
- Performance Sets store `pcChannels` as a snapshot at save time; if the routing matrix changes after saving (device added/removed), the set may reference devices that no longer exist — stale entries are silently skipped on recall.
- `.mfprojz` parsing depends on the binary MBP header format produced by Arturia MIDI Control Center; format changes in future Arturia software versions may break the parser regex.
- MIDI CC scroll uses relative delta (value change per message), which works correctly with endless encoders but may behave unexpectedly with absolute pot controllers.

---
