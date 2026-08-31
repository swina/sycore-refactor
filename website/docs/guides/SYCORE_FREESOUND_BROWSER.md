# Freesound Browser

**Freesound Browser** connects SY.CORE to the [freesound.org](https://freesound.org) library — over 600,000 freely licensed sounds available to search, preview, and inject directly into any part of your performance rig. Sounds land in the Backing Track Playlist, a Live Performance Loop Pad, or the Audio Capture editor without leaving the app.

---

## Setup — API Key

The Freesound Browser requires a personal API key from freesound.org. The key is stored in your user profile and is never shared.


### Getting a key

1. Register a free account at **freesound.org**
2. Go to **freesound.org/apiv2/apply** and create a new application
3. Copy the **API Key (Token)** shown in your application page

### Saving the key in SY.CORE

<img src="../../help/guides/sycore-freesound.org-browser-apikey.png"/>


1. Open the **User Profile** panel — click the user icon in the footer or press the profile button
2. Scroll to the **Freesound API Key** section
3. Paste your key into the input field (toggle the eye icon to reveal/hide it)
4. Click **Save** — a green "API key configured" confirmation appears

Once saved the key is written to your Firestore profile and restored automatically on every login. If no key is configured, the Freesound Browser opens to an amber warning screen with a direct link back to profile settings.

---

## Opening the Browser


| Method | Action |
|--------|--------|
| **Toolbar button** | Add "Freesound Browser" via Toolbar Settings → click the Radio icon |
| **Live Performance Pad** | Click the **Freesound** button above the Loop Pads grid |
| **Footer menu** | Open the main menu → Freesound Browser |

The browser opens centered on screen. Press **Esc** or click the backdrop to close it.

---

## Interface Layout

The browser is a floating, draggable, resizable panel.

<img src="../../help/guides/sycore-freesound.org-browser.png"/>


- **Drag** — click and drag the header bar to reposition
- **Resize** — drag the bottom-right corner grip
- **Minimum size** — 420 × 320 px

---

## Search

Type any keyword into the search field and press **Enter** or click **Search**.

Results show 15 sounds per page with name, author, duration, BPM (when available from Freesound's acoustic analysis), tags, and license.

### Filters

| Filter | Description |
|--------|-------------|
| **Duration min/max** | Restricts results to sounds within a duration range (seconds) |
| **CC0 Only** | Limits results to Creative Commons Zero (public domain) sounds — safe for commercial use |
| **Local (N)** | Switches to the local cache view — shows only sounds you have already downloaded |

Filter state persists across browser open/close cycles within the same session (module-level state).

---

## Previewing Sounds

Click the **play button** (▶) on any result row to stream a preview directly in the browser. A second click pauses. The preview uses the high-quality MP3 stream from Freesound, or the locally cached blob if the sound has been downloaded.

The preview player is a single shared `Audio` element — opening a new preview automatically stops the previous one.

---

## Actions per Sound

<img src="../../help/guides/sycore-freesound.org-browser-actions.png"/>

Each result row exposes three action buttons on hover:

### Add — Send to Backing Track Playlist

Dispatches a `freesound-add-to-playlist` custom event with the track metadata. The **Backing Track Player** or **Tracks Player** picks this up and appends the sound to the active playlist. Playback starts at the next natural cue or immediately if nothing is playing.

### Pad — Assign to Loop Pad

1. Click **Pad** on the sound you want to assign
2. A pad-picker panel expands inline showing the current 16 Loop Pad slots (occupied slots show their label)
3. Click the target slot number
4. Optionally type a BPM override — if left blank, the BPM is taken from Freesound's acoustic analysis or not set
5. Click **Assign** to confirm

The assignment dispatches a `loop-pad-assign` custom event. The **Live Performance Pad** writes it to localStorage immediately so it survives page reload. The sound resolves from the local cache on playback if it has been downloaded; otherwise it streams from the Freesound preview URL.

> Clicking **Pad** again on the same sound before assigning cancels the picker.

#### MIDI Learn for pad slots

Right-click any slot button in the pad picker to open the MIDI learn context menu for that slot. Param name: `lpp_loop_N` (0-based). Once mapped, the hardware controller LED turns **green** when that pad is playing and **amber** when stopped. The same right-click is available directly on the Loop Pad buttons inside the Live Performance Pad panel.

### Capture — Send to Audio Capture

1. Click **Capture** on the sound you want to work with
2. A BPM picker appears inline — pre-filled with the sound's analysed BPM or the current global BPM
3. Adjust BPM if needed, then click **Send**

The browser fetches the full preview blob (or uses the local cache), then dispatches a `freesound-send-to-capture` event with the blob, metadata, and BPM. The **Audio Capture** panel loads it as a new recording and runs automatic loop-point discovery.

When a BPM is confirmed, the global BPM is updated everywhere: `arpStore.arpBpm` (footer display and arpeggiator), `midiStore.currentBpm`, and the MIDI clock output.

> The **Capture** button shows a spinner (`…`) and is disabled while the fetch is in progress.

---

## Local Cache

Sounds can be downloaded and stored locally in the browser's IndexedDB — they load instantly on next use and play back even without internet access.

### Downloading a sound

Click the **Save** (↓) button on any result row. The button shows a spinner while downloading, then switches to a filled **HardDrive** icon once cached. A small HardDrive badge also appears permanently on the row.

### Viewing cached sounds

Click the **⚡ Local (N)** toggle in the filter bar. The results area switches to the local cache view:

- **Filter field** — search by name or author within your cache
- **Sort** — Latest downloaded / Name (A–Z) / Duration (shortest first)
- Each row shows name, author, duration, and file size
- Actions available: **Add** (to playlist), **Pad** (assign to loop pad), **Delete** (remove from cache)

Deleting a sound revokes its blob URL and removes the IDB entry. The count badge in the filter bar updates reactively.

### Removing a cached sound

Click the **Trash** icon in the Local view action buttons. The entry is deleted from IndexedDB immediately.

---

## Integration Map

| Event dispatched | Consumer | Effect |
|-----------------|----------|--------|
| `freesound-add-to-playlist` | `TracksPlayer.vue` | Appends sound to active playlist |
| `loop-pad-assign` | `LivePerformancePad.vue` | Writes track to localStorage slot |
| `freesound-send-to-capture` | `AudioCapture.vue` | Loads blob as new recording, sets BPM |

The `loop-pad-assign` event carries `{ padIdx, track }` where `track` is `{ id, label, url, author, duration, bpm? }`. The Live Performance Pad resolves playback via `useFreesoundCache.resolveUrl(id, url)` — returning the cached blob URL if available, otherwise the streaming URL.

---

## Local Cache — Technical Notes

Cached sounds are stored in IndexedDB under the `freesound_cache` object store. Each entry contains:

| Field | Content |
|-------|---------|
| `id` | Track ID e.g. `freesound_123456` |
| `blob` | Full audio blob (MP3) |
| `name` | Sound title |
| `author` | Freesound username |
| `duration` | Seconds |
| `size` | Bytes |
| `downloadedAt` | ISO timestamp |

The `useFreesoundCache` composable maintains a reactive `cachedIds` Set at module level — it survives component unmount/remount cycles so the cache state is always in sync across the app without re-querying IDB on every open.

---

## Keyboard Shortcut

| Key | Action |
|-----|--------|
| **Esc** | Close the Freesound Browser |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Amber "API Key Required" screen | No Freesound API key saved in profile | Open Profile → paste and save your key |
| Search returns no results | Query too specific or API key invalid | Try a simpler query; verify the key at freesound.org |
| Preview doesn't play | Browser autoplay policy blocked | Click anywhere on the page first, then retry |
| Capture button stays spinning | Network fetch failed (e.g. CORS on preview URL) | Download the sound first (Save), then use Capture — cached version bypasses the network |
| Loop Pad assignment lost after reload | Sound URL was a streaming URL that expired | Download the sound before assigning it to a pad |

---

*Last updated: 2026-06-08*
