# Implementation Plan - MIDI Actions & Step Sequencer Enhancements

This plan describes how we will implement:
1. **Step Sequencer Dual Sequence Slots:** Support associating 2 independent sequencer sequences to a single sound preset/variant.
2. **Step Sequencer Pattern Library in IndexedDB:** Support saving individual sequencer patterns to a library in IndexedDB under a user-defined name via custom UI modals, and loading them back.

---

## User Review Required

> [!IMPORTANT]
> The database version in IndexedDB will be upgraded from version `4` to `5` to auto-provision the new `user_sequences` object store. This upgrade is fully backward-compatible and preserves all existing presets, user accounts, and playlists.

---

## Proposed Changes

### 1. IndexedDB Architecture

#### [MODIFY] [idb.ts](file:///f:/Projects/sy.core/sy.core-app/src/lib/idb.ts)
- Increment `DB_VERSION` to `5`.
- Add `user_sequences: 'id'` to the `STORES` mapping.
- Add `'sequences': 'user_sequences'` to the `storeMap` mapping inside the path segments parser.
- This automatically creates the `user_sequences` table and allows querying it natively via emulated Firestore APIs (e.g., `collection(db, 'users', uid, 'sequences')`), which automatically handles per-user isolation.

---


### 3. Pinia State & Metadata Synchronization

#### [MODIFY] [useUiStore.js](file:///f:/Projects/sy.core/sy.core-app/src/stores/useUiStore.js)
- Add two new reactive states:
  - `seqCurrentConfig2 = ref(null)` (stores the secondary sequence configuration).
  - `seqActiveSlot = ref(1)` (stores the currently active slot: 1 or 2).

#### [MODIFY] [usePresetStore.js](file:///f:/Projects/sy.core/sy.core-app/src/stores/usePresetStore.js)
- Update `_captureCurrentMetadata` to include:
  - `seqConfig2: useUiStore().seqCurrentConfig2 || null`
  - `seqActiveSlot: useUiStore().seqActiveSlot || 1`
- Update `_applyMetadataToStores` to load:
  - `uiStore.seqCurrentConfig2` from `variant.seqConfig2 || null`
  - `uiStore.seqActiveSlot` from `variant.seqActiveSlot || 1`

---

### 4. Component Orchestration & Layout

#### [MODIFY] [SynthApp.vue](file:///f:/Projects/sy.core/sy.core-app/src/views/SynthApp.vue)
- Bind the dynamic sequencer configuration and active slot to `StepSequencer`:
  - `:initialConfig="uiStore.seqActiveSlot === 2 ? uiStore.seqCurrentConfig2 : uiStore.seqCurrentConfig"`
  - `:activeSlot="uiStore.seqActiveSlot || 1"`
  - `@activeSlotChange="slot => uiStore.seqActiveSlot = slot"`
- Update `@configChange` handler:
  ```javascript
  config => {
    if (uiStore.seqActiveSlot === 2) {
      uiStore.seqCurrentConfig2 = config
    } else {
      uiStore.seqCurrentConfig = config
    }
  }
  ```
- Update `@savePattern` (`handleStepSequencerSave`) to save the active slot's configuration and commit it to the preset store.

#### [MODIFY] [StepSequencer.vue](file:///f:/Projects/sy.core/sy.core-app/src/components/StepSequencer.vue)
- Add `activeSlot` prop.
- Import `FolderOpen` and `FolderPlus` from `lucide-vue-next`.
- Add a premium dual-slot selector widget (`Seq 1` / `Seq 2`) next to the sound name in the header.
- Add "Load from Library" and "Save to Library" action buttons in the header menu bar.
- Add two beautiful modals styled with glowing emerald/synth neon borders and glassmorphism backdrop:
  1. **Save Pattern Modal**: Prompts the user to enter a name (pre-populated with current preset name and sequence slot index) and commits it to IndexedDB.
  2. **Load Pattern Modal**: Fetches all saved patterns from the `sequences` collection in IndexedDB, listing them with names, number of steps, key, scale, style, and timestamp. Allows one-click loading and deleting.
- Update `props.initialConfig` watcher: when `initialConfig` changes to `null`/`undefined`, reset steps to a clean state (`Array(16).fill(null).map(() => ({ ...DEFAULT_STEP }))`) so that switching to an empty sequence slot works instantly without showing stale step data.

---

## Verification Plan

### Manual Verification
1. **Dual-Sequence Slot switching:**
   - Select "Seq 1", program a sequence, and save it.
   - Select "Seq 2", program a different sequence, and save it.
   - Switch back and forth between "Seq 1" and "Seq 2" while playing; verify that the active playback sequence updates seamlessly in real time.
   - Save the Preset. Switch presets, and verify that both sequences are properly recalled.
2. **Sequence Library Storage:**
   - Click "Save to Library". Enter a name and save.
   - Clear the sequencer.
   - Click "Load from Library", select the saved sequence, and load it. Verify it populates the active slot perfectly.
   - Delete a sequence from the library, confirming it is removed from the list.
