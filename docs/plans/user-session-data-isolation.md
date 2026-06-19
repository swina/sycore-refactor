# Plan: User Session Data Isolation

## Context

Currently, two categories of data bleed across users sharing the same browser:

1. **IDB `appMidiMappings`** — stored at `doc(db, 'system', 'appMidiMappings')` (global) in `useMappingStore.js`. Each user should have their own CC→action bindings.

2. **localStorage keys (~40+)** — all stores write user preferences (MIDI channel, mixer levels, sync routing, key split, smartlatch, last session preset, user banks, etc.) to bare string keys like `midiChannel`, `S1_MIX_MASTER`, `S1_SYNC_TRACK`. When user A logs out and user B logs in, user B inherits user A's settings.

**Admin-only system docs that stay global (2-segment path, no change):**
`app_settings`, `categories_config`, `midi_config`, `roles_config`, `seed_info`, `sound_type_bg`, `sound_types_config`, `push_subscription`

---

## What's Already Done

These are already per-user scoped — no changes needed:
- IDB: `user_presets`, `user_playlists`, `user_sequences`, `user_chord_progressions`, `user_backing_tracks`, `user_timeline_sets`
- IDB `user_system`: `midiConfigPresets`, `midiMappingPresets`
- `freesound_cache`: uid-prefixed keys via `useFreesoundCache.js`

---

## Implementation Plan

### Step 1 — Create `userKey` utility

**`src/lib/userKey.ts`** (new):
```ts
import { auth } from '@/lib/auth'
export const userKey = (key: string) => `${auth.currentUser?.uid ?? 'anon'}_${key}`
```

`anon` prefix ensures pre-login state never collides with real user data and resets naturally on first login.

---

### Step 2 — Scope `appMidiMappings` in IDB

**`src/stores/useMappingStore.js`**

Same `userDoc()` pattern used by `midi-mapping-presets.ts` and `midi-config-presets.ts`:

```js
import { auth } from '@/lib/auth'

function userAppMidiDoc() {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Not authenticated')
  return doc(db, 'users', uid, 'system', 'appMidiMappings')
}
```

Replace both usages:
- `loadAppMidiMappings()`: `getDoc(doc(db, IDB_COLLECTION, IDB_DOC_NAME))` → `getDoc(userAppMidiDoc())`
- `saveAppMidiMappings()`: `setDoc(doc(db, IDB_COLLECTION, IDB_DOC_NAME), ...)` → `setDoc(userAppMidiDoc(), ...)`

Remove `IDB_COLLECTION` and `IDB_DOC_NAME` constants (now unused).
No IDB schema change needed — `user_system` store already exists at DB_VERSION 14.

---

### Step 3 — Scope localStorage keys per user

**Pattern for every affected store:**
1. Import `userKey` from `@/lib/userKey`
2. Replace every `localStorage.getItem('KEY')` → `localStorage.getItem(userKey('KEY'))`
3. Replace every `localStorage.setItem('KEY', v)` → `localStorage.setItem(userKey('KEY'), v)`
4. Add `useAuthStore` + `watch(uid, reinit)` so state reloads when a different user logs in

**Reinit pattern:**
```js
const authStore = useAuthStore()
const uid = computed(() => authStore.user?.uid)

function reinit() {
  midiChannel.value = parseInt(localStorage.getItem(userKey(LS_CHANNEL)) || '1')
  // ... reload all refs from uid-prefixed keys
}

watch(uid, (newUid) => {
  if (!newUid) resetToDefaults()   // logout → reset to hardcoded defaults
  else reinit()                     // user switch / login → load their saved state
})
```

**Files to update:**

| Store | Keys to scope | Notes |
|---|---|---|
| `src/stores/useMidiStore.js` | `midiChannel`, `midiInputChannel`, `midiSendClock`, `midiSyncTransport`, `midiSyncSequencerTransport`, `midiSyncChordProgTransport`, `SYCORE_SMARTLATCH_*` (4 keys), `SYCORE_KEYBOARD_SPLIT`, `SYCORE_ADVANCED_MIDI_ROUTING`, `S1_MIDI_ROUTING` | 13 keys; also re-apply splitConfig watch |
| `src/stores/useSyncStore.js` | `S1_SYNC_TRACK`, `S1_SYNC_REC_CAPTURE`, `S1_SYNC_TRACK_LOOPER`, `S1_SYNC_SEQ_LOOPER`, `S1_SYNC_LOOPER_*` (4), `S1_SYNC_TIMELINE_*` (4), `S1_SYNC_CAPTURE_*` (4), `S1_SYNC_CHORDPROG_*` (3), `S1_SYNC_LOOPPADS_*` (5) | ~20 bool refs; all initialized inline at top of store |
| `src/stores/useAudioMixerStore.js` | `S1_MIX_CHANNELS`, `S1_MIX_BACKING`, `S1_MIX_TRACKS`, `S1_MIX_LOOPER`, `S1_MIX_LM`, `S1_MIX_DRUMS`, `S1_MIX_DRUMS_LEVEL`, `S1_MIX_MASTER`, `S1_MIX_INST_VOLS`, `SYCORE_ADVANCED_MIDI_ROUTING` | vol refs + enabledChannels + instrumentVols |
| `src/stores/useMappingStore.js` | `midiMappings` (LS_MIDI_MAPPINGS), `midiMappingActivePresetId` (LS_ACTIVE_PRESET_ID) | Also handles Step 2 (IDB) |
| `src/stores/usePresetStore.js` | `sycore_last_session`, `sycore_history_filter`, `sycore_bank_seeded` | `sycore_bank_seeded` is already written per new-user in AuthModal — uid-prefix is correct here |
| `src/stores/useUserBanksStore.js` | `SYCORE_USER_PRESET_BANKS` | Single key |
| `src/stores/useUiStore.js` | `S1_LAST_PLAYLIST`, `SYCORE_SEQ_AUTOSTART` | `S1_LAST_PLAYLIST` already caused cross-user playlist bleed (patched differently before — unify with this approach) |

---

### Step 4 — Reset on logout

In each store's `watch(uid)` branch when `newUid` is `null/undefined`: reset all refs to their hardcoded defaults (same values as the initial `ref(...)` declarations). Do not `removeItem` — uid-prefixed keys are invisible to other users and act as persistent per-user storage.

---

## Data Migration Note

Old global keys (e.g. bare `midiChannel`) will be orphaned after this change. Existing users will see their settings reset once on the first login after deployment. This is acceptable — no migration script needed.

---

## Verification

1. Log in as user A → set MIDI channel, mixer level, sync routing
2. Log out → confirm UI resets to defaults
3. Log in as user B → confirm fresh defaults (no A's settings)
4. Log back in as user A → confirm A's settings restored
5. Bind a CC `appMidiMappings` action as user A → log out → log in as user B → binding absent → log back as A → binding restored
6. DevTools → Local Storage → confirm `{uid}_midiChannel` key pattern
7. DevTools → IndexedDB → `user_system` → confirm `{uid}__appMidiMappings` entry per user
