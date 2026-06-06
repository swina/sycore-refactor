# Plan: Freesound.org Integration

## Context
Add a "Freesound" tab to `BackingTrackPlayer.vue` that lets users browse freesound.org, preview sounds, and add them directly to the playlist. Uses the `freesound.js` client library (`npm: freesound`) and the Freesound REST API's MP3 preview URLs — no OAuth required for search + preview.

---

## Prerequisites (user action required)
1. Obtain a free API key at https://freesound.org/apiv2/apply/
2. Add to `.env` (and `.env.local`):
   ```
   VITE_FREESOUND_API_KEY=your_key_here
   ```

---

## Files to Create

### 1. `src/composables/useFreesound.js`
Thin wrapper around the freesound.js library. Promisifies callbacks, initialises the client once with `import.meta.env.VITE_FREESOUND_API_KEY`.

Key exported functions:
```js
// Returns { results: Sound[], count, nextPage(), previousPage() }
searchSounds(query, { page, pageSize, minDuration, maxDuration })

// Returns the raw Sound object with .previews, .name, .username, .duration, .tags
getSound(id)
```

Sound objects are mapped to the app's track shape before returning:
```js
{
  id: `freesound_${sound.id}`,
  url: sound.previews['preview-hq-mp3'],
  label: sound.name,
  genre: 'Freesound',
  author: sound.username,
  duration: sound.duration,
  tags: sound.tags,        // kept for display only
  license: sound.license,  // kept for display only
}
```

If the npm package has ESM compatibility issues, fall back to direct `fetch` calls to `https://freesound.org/apiv2/search/text/` with the API key as a query param — the composable is the only change required.

---

### 2. `src/components/FreesoundBrowser.vue`
Self-contained panel content (not a modal — rendered inside the existing tab body of `BackingTrackPlayer`).

**Layout:**
```
[ Search input + Search button ]    [ Duration: min–max ]
─────────────────────────────────────────────────────────
  Loading spinner  |  Empty state
─────────────────────────────────────────────────────────
  Result rows (scrollable):
    [▶ preview] Name · username · duration · tag tag tag  [+ Add]
─────────────────────────────────────────────────────────
  [ ← Prev ]  Page N  [ Next → ]
```

**State refs:**
- `query`, `minDur`, `maxDur`, `page`, `pageSize = 15`
- `results`, `totalCount`, `isLoading`, `error`
- `previewAudio` (one `Audio` element for inline preview, pauses on new click)
- `previewingId` (tracks which row is currently previewing)
- `hasNext`, `hasPrev` (from collection object)
- `collectionRef` (holds the freesound collection for pagination)

**Key interactions:**
- Search on Enter or button click → `page = 1`, call `searchSounds()`
- `▶` button: play/pause `sound.previews['preview-hq-mp3']` in a local `<audio>` element
- `+ Add` button: calls `emit('add', mappedTrack)`
- Prev/Next: call `collectionRef.previousPage()` / `collectionRef.nextPage()`, re-map results

**Styling:** Match existing app conventions — `bg-neutral-900`, `border-neutral-800`, `text-synth-neon` accents, `custom-scrollbar`, `text-[9px]` labels.

---

## Files to Modify

### 3. `src/components/BackingTrackPlayer.vue`

**a) Add import:**
```js
import FreesoundBrowser from '@/components/FreesoundBrowser.vue'
```

**b) Add `'freesound'` to the tabs array** (around line 879):
```js
v-for="tab in ['list', 'playlist', 'freesound']"
```

**c) Add tab content block** inside the tab content area (after the playlist block):
```vue
<FreesoundBrowser
  v-if="inputType === 'freesound'"
  @add="track => { addToPlaylist(track); inputType = 'playlist' }"
/>
```
After adding a track the view auto-switches to the Playlist tab so the user immediately sees it.

---

## Verification

1. `npm install freesound` — dev server starts without errors.
2. Open Backing Track panel → "Freesound" tab visible.
3. Type a query, click Search → results list appears.
4. Click ▶ on a result → preview audio plays.
5. Click `+` → track appears in Playlist tab with correct name, author, duration.
6. Play playlist — freesound preview MP3 loads through the existing audio engine.
7. Pagination (Next/Prev) works.
