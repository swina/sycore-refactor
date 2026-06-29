# SY.CORE Modular Refactoring Plan

## Context

SY.CORE is a Vue 3 + Vite PWA for live electronic music performance (Roland S-1 synth). It's a **working, mature app** that has grown organically into a monolith. The goal is an **incremental refactoring** into a modular architecture — splitting monolith files, migrating JS stores to TS with shared schemas, extracting clean module boundaries, and establishing a test foundation — while keeping every feature functional at each step.

**Key problems to solve:**

| Problem | Location | Severity |
|---|---|---|
| God-object service | `src/core/midi/MidiService.ts` (1225 lines) | High |
| Bloated stores with mixed concerns | `usePresetStore.js` (811), `useDrumMachineStore.js` (853), `useMidiStore.js` (596) | High |
| Untyped data layer | All 17 stores are `.js`; IDB layer uses `Record<string, any>` | High |
| Coupled IDB shim | `src/lib/idb.ts` (553 lines) — Firestore emulation monolith | Medium |
| Dead compatibility shim | `src/lib/firebase.ts` — legacy re-export | Low |
| No test infrastructure | Zero test files, no vitest/jest | Medium |
| Dead/dormant code | `@google/genai` dep, `src/not-used/`, `src/data/` artifacts | Low |
| Massive orchestrator view | `SynthApp.vue` imports ~50 components | Low |
| Store-to-store coupling | Stores call `useAuthStore()`/`useMidiStore()` inside each other | Medium |
| Sound data scattered across modules | Each component manages its own blob URLs/data:URIs; no centralized user sound library | Medium |
| Auth hardcoded to admin | `useAuthStore.isAdmin` returns `true` for all users; no enforcement of `swina.allen@gmail.com` restriction | Medium |

## Phases

Each phase produces a working app. Phases 1–4 can be done independently; 5–6 depend on prior phases.

---

### Phase 1: Foundation — Extract Shared Types & Schemas

**Goal**: Create a `src/types/` directory with shared TypeScript interfaces for all persisted data shapes, module boundaries, and event types. No behavior changes.

**Actions:**

1. **Create `src/types/` directory** with typed modules:
   - `src/types/index.ts` — barrel export
   - `src/types/preset.ts` — `Preset`, `PresetVariant`, `PresetCategory`, `PresetMetadata` interfaces
   - `src/types/midi.ts` — `MidiMessage`, `MidiSource` (moved from `MidiService.ts`), `DeviceRegistration`, `RoutingConfig`, `SplitConfig`, `MidiMonitorEntry`
   - `src/types/user.ts` — `LocalUser`, `UserRole`, `RoleConfig` (from `lib/roles.ts` and `lib/auth.ts`)
   - `src/types/drum-machine.ts` — `DrumTrack`, `DrumStep`, `DrumSequence`, `DrumStyle`
   - `src/types/audio.ts` — `LooperState`, `SamplerState`, `AudioMixerChannel`
   - `src/types/events.ts` — typed event dispatch helpers for `CustomEvent` communication

2. **Move `MidiSource` enum** from `MidiService.ts` to `src/types/midi.ts`, re-export from original location to avoid breaking imports.

3. **Create typed event helpers** in `src/types/events.ts`:
   ```ts
   interface SyCoreEventMap {
     'app-system-log': { detail: string };
     'toggle-sequencer': { detail: { play: boolean } };
     'app-midi-actions': { detail: MidiActionPayload };
     // ... plus all ~40 event names
   }
   export function dispatch<K extends keyof SyCoreEventMap>(name: K, detail: SyCoreEventMap[K]['detail']): void;
   export function on<K extends keyof SyCoreEventMap>(name: K, handler: (detail: SyCoreEventMap[K]['detail']) => void): () => void;
   ```

**Files to create:**
- `src/types/index.ts`, `src/types/preset.ts`, `src/types/midi.ts`, `src/types/user.ts`, `src/types/drum-machine.ts`, `src/types/audio.ts`, `src/types/events.ts`

**Files to modify:**
- `src/core/midi/MidiService.ts` — change `MidiSource` to re-export from `@/types/midi`

**Verification:**
- `npm run build` succeeds
- App loads, panels open/close, MIDI functions work (no behavioral change)

---

### Phase 2: Modularize the MIDI Layer

**Goal**: Split `MidiService.ts` (1225 lines) into focused sub-modules. The `MidiService` class becomes a thin facade that delegates to specialized services.

**Actions:**

1. **Create `src/core/midi/` sub-modules:**

   | File | Responsibility | ~Lines |
   |---|---|---|
   | `midi-transport.ts` | Clock generation, BPM detection, start/stop transport | 150 |
   | `midi-routing.ts` | RoutingMatrix, broadcast logic, per-device routing | 200 |
   | `midi-monitor.ts` | Monitor buffer (500-entry), entry formatting, listeners | 80 |
   | `midi-smart-latch.ts` | Smart Latch state machine (note latching/flush/fadeout) | 100 |
   | `midi-broadcast.ts` | Message encoding and output device dispatch | 180 |
   | `midi-service.ts` | Thin facade: `init()`, `onCC()`, `onNote()`, `send*()`, delegates to above | ~300 (was 1225) |

2. **Update all imports** across the codebase that reference `@/core/midi/MidiService` to use the new sub-module paths.

**Key constraint:** The public API of `midiService` (the singleton instance) must remain unchanged — every `midiService.sendCC()`, `midiService.onCC()`, etc. must still work identically.

**Files to create:**
- `src/core/midi/midi-transport.ts`
- `src/core/midi/midi-routing.ts`
- `src/core/midi/midi-monitor.ts`
- `src/core/midi/midi-smart-latch.ts`
- `src/core/midi/midi-broadcast.ts`

**Files to modify:**
- `src/core/midi/MidiService.ts` → `src/core/midi/midi-service.ts` (gutted to thin facade)
- All files importing `@/core/midi/MidiService` — update import paths (~30 files)

**Verification:**
- All MIDI functions work: device connect/disconnect, note on/off, CC messages, clock sync, smart latch
- MIDI monitor shows entries with proper formatting
- No regression in sequencer, arp, keyboard, drum machine

---

### Phase 3: TypeScript Migration of Key Stores

**Goal**: Convert 2–3 critical Pinia stores from `.js` to `.ts` with proper types. Pragmatic: full conversion for the simple ones, JSDoc annotations for the heavy ones.

**Actions:**

1. **Convert `useUiStore.js` → `useUiStore.ts`** (329 lines):
   - Define `PanelVisibility` interface for the ~40 boolean panel flags
   - Type `MODAL_CYCLE_REGISTRY` and `MODAL_REFS` maps
   - This is the safest first conversion (no persistence, no IDB, low complexity)

2. **Convert `useMappingStore.js` → `useMappingStore.ts`** (457 lines):
   - Define `MappingEntry`, `VelocityConfig`, `LfoConfig` types
   - Type IDB interactions using schemas from Phase 1

3. **Add JSDoc type annotations** to the heaviest `.js` stores:
   - `usePresetStore.js` — add `@param`/`@returns` JSDoc for key methods like `recallPreset()`, `savePreset()`, `generate()`
   - `useDrumMachineStore.js` — add JSDoc typedefs for `DrumTrack`, `DrumStep`, `DrumStyle`

**Files to modify:**
- `src/stores/useUiStore.js` → `src/stores/useUiStore.ts`
- `src/stores/useMappingStore.js` → `src/stores/useMappingStore.ts`
- Add JSDoc to `src/stores/usePresetStore.js`
- Add JSDoc to `src/stores/useDrumMachineStore.js`

**Verification:**
- `npm run build` passes without type errors
- All UI panels toggle correctly
- MIDI mapping load/save works
- Preset generation and recall work

---

### Phase 4: Clean Up Dead Code & Legacy Shim

**Goal**: Remove or quarantine dead code, simplify the `firebase.ts` shim, clean up `src/data/`.

**Actions:**

1. **Remove `src/lib/firebase.ts` shim:**
   - Find all `@/lib/firebase` imports with `grep -r`
   - Rewrite to `@/lib/idb` or `@/lib/auth`
   - Delete the file

2. **Remove `@google/genai`** from `package.json` — zero imports anywhere

3. **Quarantine `src/not-used/`** → rename to `src/_archive/` with README explaining its status

4. **Clean `src/data/`** — remove stray `.mp3`, `.webm`, `pinia-state (2).json`, `VelocityMappingDialog.tsx` after confirming nothing imports them

5. **Convert `useConfigStore.js` → `useConfigStore.ts`** (297 lines, simple config with typed defaults)

**Files to delete:**
- `src/lib/firebase.ts`
- Stray artifacts in `src/data/`

**Files to modify:**
- `package.json` — remove `@google/genai`
- All files importing `@/lib/firebase` — rewrite imports
- `src/stores/useConfigStore.js` → `src/stores/useConfigStore.ts`
- `src/not-used/` → `src/_archive/`

**Verification:**
- `npm run build` passes
- App boots and all features work
- `grep -r "firebase" src/` returns nothing

---

### Phase 5: Extract Persistence Layer from IDB Monolith

**Goal**: Split `src/lib/idb.ts` (553 lines) into a clean persistence layer with domain-specific repositories. Keep backward compatibility.

**Actions:**

1. **Create `src/lib/db/` directory:**

   | File | Responsibility | Extracted from idb.ts lines |
   |---|---|---|
   | `connection.ts` | DB open, STORES map, migrations, `runStartupMigrations()` | 42–107, 530–553 |
   | `firestore-api.ts` | `DocumentReference`, `CollectionReference`, `Query`, `doc()`, `collection()`, `query()`, `getDoc()`, `getDocs()`, `setDoc()`, `updateDoc()`, `deleteDoc()`, `addDoc()`, `onSnapshot()` | 194–409 |
   | `repositories/preset-repo.ts` | `PresetRepository` class — `findByUser()`, `save()`, `delete()`, `toggleFavorite()` | New |
   | `repositories/user-repo.ts` | `UserRepository` class | New |
   | `repositories/settings-repo.ts` | `SettingsRepository` class | New |
   | `cache/freesound-cache.ts` | Freesound blob cache | 416–465 |
   | `cache/handle-storage.ts` | FileSystemDirectoryHandle storage | 471–490 |
   | `cache/timeline-audio-cache.ts` | Timeline audio data URL cache | 495–524 |
   | `index.ts` | Barrel re-export of the public Firestore-compatible API | — |

2. **Keep `src/lib/idb.ts` as re-export compat shim:**
   ```ts
   export * from './db/index'
   ```

**Files to create:**
- `src/lib/db/connection.ts`
- `src/lib/db/firestore-api.ts`
- `src/lib/db/repositories/preset-repo.ts`
- `src/lib/db/repositories/user-repo.ts`
- `src/lib/db/repositories/settings-repo.ts`
- `src/lib/db/cache/freesound-cache.ts`
- `src/lib/db/cache/handle-storage.ts`
- `src/lib/db/cache/timeline-audio-cache.ts`
- `src/lib/db/index.ts`

**Files to modify:**
- `src/lib/idb.ts` — replace content with `export * from './db/index'`

**Verification:**
- App boots, all data loads (presets, playlists, sequences)
- Create/save/delete presets works
- Freesound browser caches and retrieves
- Sound folder browser persists handles

---

### Phase 5B: User & Sound Data Management

**Goal**: Establish a proper user role system (admin vs user) with enforced access control, and create a centralized user sound library in IndexedDB for all audio samples regardless of source.

**Current problems:**
- `useAuthStore.isAdmin` is hardcoded to `true` for all users — admin restriction to `swina.allen@gmail.com` is not enforced
- Sound data is scattered across components: each manages its own `blobUrl`/`data:URI` lifecycle (`SamplerPanel`, `TracksPlayer`, `AudioLooper`, `LiveTimeline`, `AudioCapture`, etc.)
- Freesound cache is already per-user but uses a generic `freesound_cache` store; other sound sources are ad-hoc
- Multiple IDB stores handle audio blobs but there's no unified search/discovery API

#### Part A: User Role Enforcement

1. **Fix `useAuthStore.isAdmin`** — change from `computed(() => true)` to actual email check:
   ```ts
   // src/stores/useAuthStore.ts (after conversion)
   const ADMIN_EMAIL = 'swina.allen@gmail.com'
   const isAdmin = computed(() => user.value?.email === ADMIN_EMAIL)
   ```

2. **Ensure AdminPanel is gated** by `isAdmin` — read `AdminPanel.vue` line 19 already has `isSuperAdmin` check based on email, but verify the panel entry point (`SynthApp.vue` / toolbar config) also respects this.

3. **Extend `src/types/user.ts`** from Phase 1 with additional types:
   - `SoundLibraryEntry` — `{ id, uid, name, source: 'freesound'|'recording'|'local-file'|'timeline', blob: Blob, dataUri?: string, duration, bpm?, tags[], createdAt, referencedBy: string[] }`

#### Part B: Centralized Sound Library Repository

4. **Add new IDB store** `user_sound_library` to `STORES` map in `connection.ts` (from Phase 5):
   - Key: `uid__soundId`
   - Schema: `{ id, uid, name, source, blob (stored via structured clone), dataUri?, duration, bpm, tags, createdAt, size, referencedBy[] }`

5. **Create `src/lib/db/repositories/sound-library-repo.ts`** with:
   ```ts
   class SoundLibraryRepository {
     async findByUser(uid: string): Promise<SoundLibraryEntry[]>
     async findBySource(uid: string, source: string): Promise<SoundLibraryEntry[]>
     async save(entry: SoundLibraryEntry): Promise<void>
     async delete(id: string): Promise<void>
     async findByReferencedBy(moduleId: string): Promise<SoundLibraryEntry[]>
     async getBlobUrl(uid: string, soundId: string): Promise<string | null>
   }
   ```

#### Part C: Migrate Sound Sources to Centralized Library

6. **Update `useFreesoundCache.js`** — when a Freesound sound is downloaded, also register it in `sound_library_repo` (in addition to existing `freesound_cache` blob). This creates a unified index even if blobs remain in separate cache stores for performance.

7. **Update `AudioCapture.vue`** — after recording, save the blob via `soundLibraryRepo.save()` with `source: 'recording'`. The current `recordedBlob` ref is ephemeral — persist it.

8. **Add `useSoundLibrary` composable** (`src/composables/useSoundLibrary.ts`):
   - Wraps `SoundLibraryRepository`
   - Provides reactive `library` ref that auto-updates
   - `importFile(file: File)` → imports local files as `source: 'local-file'`
   - `importRecording(blob: Blob, name: string)` → saves recording
   - `importFromFreesound(soundId: string)` → links freesound_cached entry
   - `getUrl(soundId: string)` → resolves blob URL from any source
   - `deleteSound(soundId: string)` → removes from library and all module references

9. **Update consumer components** to use `useSoundLibrary` instead of storing blobs locally:
   - `SamplerPanel.vue` — replace `_blobUrlCache` with `soundLibrary.getUrl()`
   - `TracksPlayer.vue` — replace inline `URL.createObjectURL` + data:URI with library import
   - `AudioLooper.vue` — save loop captures to library
   - `LiveTimeline.vue` — use library for timeline audio cache
   - `SoundFolderBrowser.vue` — import local files through library

**Files to create:**
- `src/lib/db/repositories/sound-library-repo.ts`
- `src/composables/useSoundLibrary.ts`
- `src/types/sound-library.ts` (if not in `src/types/audio.ts`)

**Files to modify:**
- `src/lib/db/connection.ts` — add `user_sound_library` store
- `src/lib/db/index.ts` — export `soundLibraryRepo`
- `src/stores/useAuthStore.js` → `src/stores/useAuthStore.ts` — fix `isAdmin`
- `src/composables/useFreesoundCache.js` — register in library on download
- `src/components/AudioCapture.vue` — save recordings to library
- `src/components/SamplerPanel.vue` — use library instead of `_blobUrlCache`
- `src/components/TracksPlayer.vue` — import files through library
- `src/components/AudioLooper.vue` — save to library
- `src/components/LiveTimeline.vue` — use library for audio cache

**Verification:**
- `isAdmin` only returns `true` for `swina.allen@gmail.com`, `false` for other users
- AdminPanel is only accessible to the admin user
- Recorded audio persists in the sound library after app reload
- Imported local files are available in the library
- Freesound downloads appear in the library index
- Sampler, TracksPlayer, AudioLooper all use library-stored sounds
- All existing sound features work (no regression)

---

### Phase 6: Add Test Infrastructure & Smoke Tests

**Goal**: Set up vitest with a few key unit tests for the extracted services.

**Actions:**

1. **Install dev dependencies:**
   ```bash
   npm install -D vitest @vue/test-utils happy-dom fake-indexeddb
   ```

2. **Create `vitest.config.ts`:**

3. **Add `test` script** to `package.json`: `"test": "vitest run"`

4. **Write smoke tests:**

   | Test file | Coverage |
   |---|---|
   | `tests/unit/types/midi.test.ts` | `MidiSource` enum values, type shapes |
   | `tests/unit/types/preset.test.ts` | Preset factory creates valid shapes |
   | `tests/unit/midi/midi-transport.test.ts` | Clock math, BPM detection from pulse timestamps |
   | `tests/unit/db/connection.test.ts` | DB opens with correct schema (uses fake-indexeddb) |
   | `tests/unit/stores/ui-store.test.ts` | UiStore boots with default panel flags |

**Files to create:**
- `vitest.config.ts`
- `tests/unit/types/midi.test.ts`
- `tests/unit/midi/midi-transport.test.ts`
- (minimal set — expand as time allows)

**Files to modify:**
- `package.json` — add `test` script + devDependencies

**Verification:**
- `npm run test` passes all tests
- `npm run build` still works

---

## Dependency Order

```
Phase 1 (Types) ─→ Phase 2 (MIDI split) ─→ Phase 3 (TS stores)
      │                                              │
      └──→ Phase 4 (Cleanup) ────────────────────────┘
                              │
                              └──→ Phase 5A (Persistence split)
                                         │
                                         └──→ Phase 5B (User & Sound Data)
                                                    │
                                                    └──→ Phase 6 (Tests)
```

- Phase 1 is a prerequisite for Phases 2, 3, 5A (types inform everything)
- Phase 4 (cleanup) is independent — can be done in any order or in parallel
- Phase 2 (MIDI) and Phase 3 (stores) are independent of each other — parallelizable
- Phase 5A (persistence split) depends on Phase 1 types
- Phase 5B (user & sound data) depends on Phase 5A (clean repositories to build upon)
- Phase 6 (tests) depends on prior phases producing testable modules

## Excluded from this plan (future scope)

These would be tackled in later refactoring rounds after the foundation is laid:

- **`SynthApp.vue` decomposition** — reducing the ~50 component imports by extracting a `ModalManager` component and a toolbar registry composable
- **Store business logic extraction** — moving `useDrumMachineStore`'s style data (430 lines of grid patterns) to a data/constants file
- **`usePresetStore` generation logic extraction** — `_generateData()`, `_generatePatchNotes()` into pure service functions
- **Event bus migration** — replacing all ~40 raw `window.dispatchEvent` calls with the typed wrappers from Phase 1
- **Full TypeScript migration** of all remaining `.js` stores and composables
- **Service worker upgrade** — evaluating Workbox-managed vs custom SW patterns
- **Sound library UI** — a dedicated "Sound Library" browser panel that shows all user sounds from all sources; not needed for the backend/library plumbing
- **Role upgrade/self-service** — allowing users to request role upgrades within the app; Phase 5B focuses on *enforcing* the existing role system, not expanding it

## Master Verification Checklist

- [ ] `npm run build` — zero errors
- [ ] `npm run dev` — app starts at localhost:3094
- [ ] Main page loads → navigate to workspace
- [ ] All panels/dialogs toggle correctly from toolbar
- [ ] Presets load from IndexedDB, generate, save, recall
- [ ] MIDI routing, monitor, CC work (if WebMIDI available)
- [ ] Drum machine, arp, sequencer function
- [ ] Freesound browser works (with internet)
- [ ] Admin panel only accessible to `swina.allen@gmail.com` (Phase 5B)
- [ ] Recorded audio persists across page reload (Phase 5B)
- [ ] Imported files appear in sound library (Phase 5B)
- [ ] `npm run test` passes (Phase 6)