# SY.CORE Refactoring Migration Summary

Executed across 3 commits: `85147b3` (major refactoring 5 phases), `32fa5cb` (checkpoint), `8db9e93` (completed).

---

## Phase 1 — Shared Types & Schemas (COMPLETE)

Created `src/types/` with 7 typed modules:
| File | Contents |
|---|---|
| `src/types/index.ts` | Barrel export |
| `src/types/preset.ts` | `Preset`, `PresetVariant`, `PresetCategory`, `PresetMetadata` |
| `src/types/midi.ts` | `MidiMessage`, `MidiSource`, `DeviceRegistration`, `RoutingConfig`, `SplitConfig`, `MidiMonitorEntry` |
| `src/types/user.ts` | `LocalUser`, `UserRole`, `RoleConfig` |
| `src/types/drum-machine.ts` | `DrumTrack`, `DrumStep`, `DrumSequence`, `DrumStyle` |
| `src/types/audio.ts` | `LooperState`, `SamplerState`, `AudioMixerChannel` |
| `src/types/events.ts` | Typed `SyCoreEventMap` with `dispatch()`/`on()` helpers |

---

## Phase 2 — MIDI Layer Modularization (COMPLETE)

Split `MidiService.ts` (1225-line god object) into 6 focused sub-modules:
- `midi-transport.ts` — Clock gen, BPM detection, transport
- `midi-routing.ts` — RoutingMatrix, broadcast, per-device routing
- `midi-monitor.ts` — 500-entry monitor buffer
- `midi-smart-latch.ts` — Smart Latch state machine
- `midi-broadcast.ts` — Message encoding, device dispatch
- `midi-service.ts` — Thin facade (~724 lines, down from 1225)

Old `MidiService.ts` **deleted**. All component imports updated.

---

## Phase 3 — TypeScript Store Migration (COMPLETE — expanded scope)

**All 16 Pinia stores** converted from `.js` to `.ts` (plan targeted only 2–3):

| Store | Notes |
|---|---|
| `useUiStore` | Converted |
| `useMappingStore` | Converted |
| `useConfigStore` | Converted |
| `useArpStore` | Converted |
| `useAudioMixerStore` | Converted |
| `useAuthStore` | Converted |
| `useCaptureStore` | Converted |
| `useChordProgStore` | Converted |
| `useDrumMachineStore` | Rewritten (879 → 572 lines) |
| `useLfoStore` | Converted |
| `useLivePadStore` | Rewritten (199 → 211 lines) |
| `useLooperStore` | Converted |
| `useMidiStore` | Converted |
| `usePresetStore` | Converted |
| `useSamplerStore` | Converted |
| `useSyncStore` | Converted |
| `useUserBanksStore` | Converted |

Zero `.js` stores remain.

---

## Phase 4 — Dead Code Cleanup (COMPLETE)

| Action | Status |
|---|---|
| Remove `src/lib/firebase.ts` | Deleted |
| Remove `@google/genai` dep | Removed from `package.json` |
| Rename `src/not-used/` → `src/_archive/` | Done (with README) |
| Clean `src/data/` artifacts | Removed stray `.mp3`, `.webm`, `pinia-state*.json`, `VelocityMappingDialog.tsx`, etc. |
| Convert `useConfigStore.js` → `.ts` | Done |

---

## Phase 5 — Persistence Layer Extraction (COMPLETE)

Split `src/lib/idb.ts` (553-line monolith) into `src/lib/db/` with 9 files:

| File | Purpose |
|---|---|
| `connection.ts` | DB open, STORES map, migrations |
| `firestore-api.ts` | Firestore-compatible API over IndexedDB |
| `repositories/preset-repo.ts` | `PresetRepository` |
| `repositories/user-repo.ts` | `UserRepository` |
| `repositories/settings-repo.ts` | `SettingsRepository` |
| `cache/freesound-cache.ts` | Freesound blob cache |
| `cache/handle-storage.ts` | FileSystemDirectoryHandle storage |
| `cache/timeline-audio-cache.ts` | Timeline audio data URL cache |
| `index.ts` | Barrel re-export |

`src/lib/idb.ts` is now a re-export shim.

---

## Phase 5B — User & Sound Data Management (PARTIAL)

**Done:**
- `isAdmin` fixed — now checks `user.value?.email === 'swina.allen@gmail.com'` instead of `true`
- `useAuthStore` converted to `.ts`

**Not done:**
- `SoundLibraryEntry` type — not created
- `sound-library-repo.ts` — not created
- `useSoundLibrary.ts` composable — not created
- `user_sound_library` IDB store — not added
- Consumer components (AudioCapture, SamplerPanel, etc.) — not updated

---

## Phase 6 — Test Infrastructure (PARTIAL)

**Done:**
- `vitest.config.ts` created
- `test` + `test:watch` scripts in `package.json`
- Dev deps installed: vitest, @vue/test-utils, happy-dom, fake-indexeddb
- 3 test files written:
  - `tests/unit/types/midi.test.ts`
  - `tests/unit/db/connection.test.ts`
  - `tests/unit/midi/broadcast.test.ts`

**Not done (planned but missing):**
- `tests/unit/types/preset.test.ts`
- `tests/unit/midi/midi-transport.test.ts`
- `tests/unit/stores/ui-store.test.ts`

---

## Files Deleted During Migration

```
src/core/midi/MidiService.ts          # God object (1225 lines)
src/lib/firebase.ts                   # Dead shim
src/data/*.mp3, *.webm                # Stray audio artifacts
src/data/pinia-state*.json            # Debug state dumps
src/data/VelocityMappingDialog.tsx    # Dead component
src/data/notes.txt, controller.md     # Stray docs
src/data/bank_preset_ref.md, presetDataStructure.json
src/data/sequence_intervals.json, sequence_patterns.json
src/data/sycore-session-*.json        # Old session exports
src/stores/*.js (all 16)              # Replaced by .ts equivalents
```

## Files Created During Migration

```
src/types/                          # 7 type files
src/core/midi/*.ts                  # 6 MIDI sub-modules
src/lib/db/                         # 9 persistence files
src/stores/*.ts (16)                # TS store replacements
src/_archive/                       # Quarantined old code
tests/                              # Vitest config + 3 test files
vitest.config.ts                    # Test runner config
```