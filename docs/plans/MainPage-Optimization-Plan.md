# MainPage.vue Optimization Plan

## Current State

`MainPage.vue` (300 lines) is the landing page with a grid of clickable feature cards that navigate to `/workspace`. It imports 4 stores, a composable, 3 modal components, and 28 Lucide icons.

---

## Optimization Opportunities

### 1. CSS Background Images — Lazy Loading

**Problem:** 13 background images (PNG/JPG) are declared in `src/assets/main.css` via `background-image: url(...)` which is imported eagerly in `main.js`. Every image is loaded on app startup even if MainPage is never shown.

**All images loaded eagerly:**

| CSS Class | Image |
|---|---|
| `.bg-sound-design` | `/bg-sound-design-2.png` |
| `.bg-home-performance` | `/home-performance-synths.png` |
| `.bg-live-performance` | `/live-performance-2.png` |
| `.bg-audio-capture` | `/audio-capture-mixer.jpg` (defined twice, second overrides) |
| `.bg-midi-capture` | `/midi-capture.png` |
| `.bg-chord-prog-seq` | `/chord-progression-sequencer.png` |
| `.bg-step-sequencer` | `/step-sequencer-square.png` |
| `.bg-midi-core` | `/midi-core-engine.png` |
| `.bg-drum-machine` | `/drum-machine.png` |
| `.bg-loop-machine` | `/loop-machine.png` |
| `.bg-backing-tracks` | `/backing-tracks.jpg` |
| `.bg-midi-knob` | `/midi-knob.png` |
| `.bg-settings` | `/bg-settings.png` |

**Plan:**
- Remove all background-image CSS classes from `main.css`
- Replace with inline `background-image` style binding in the template
- Use `onMounted` + `IntersectionObserver` (or simple `v-lazy` directive) to set the image URL only when the card enters the viewport
- For cards that are always visible, set the image on mount with a small `setTimeout` to defer loading
- Fix the duplicate `.bg-audio-capture` definition (appears twice with different images)

**Implementation:**
```vue
<!-- Before -->
<div class="bg-sound-design" ...>

<!-- After -->
<div :style="lazyBg('/bg-sound-design-2.png')" ...>
```

Create a composable `useLazyBg` or inline helper that returns `backgroundImage` style only after a flag is set.

**Estimated savings:** 13 HTTP requests deferred from initial load (~1-3 MB of images).

---

### 2. Unused Icon Imports

**Problem:** 10 of 28 imported Lucide icons are never used in the template.

**Unused imports to remove:**
- `LayoutGrid`
- `Music2`
- `Workflow`
- `Gamepad2`
- `Network`
- `Disc3`
- `RotateCw`
- `Play`
- `X`
- `Presentation`

**Plan:** Remove these 10 unused imports. Vite tree-shakes them, but removing them reduces bundle parse time and import overhead.

**Estimated savings:** ~3-4 KB gzipped from bundle, reduced parse time.

---

### 3. Heavy `useMidiInit` Composable on Main Page

**Problem:** `useMidiInit()` is called eagerly on MainPage mount (line 30). It:
- Imports `useArpStore` and `useMappingStore` (heavy stores)
- Sets a 1000ms timeout for MIDI auto-detection
- Sets a 3000ms safety timeout
- Watches `authStore` for login state
- Watches `arpStore.arpBpm` for clock sync
- Adds document-level click listeners

Most of this work is unnecessary on the landing page — MIDI init should happen in the workspace.

**Plan:**
- Inline a minimal MIDI status check into `MainPage.vue` that only reads `midiStore.midiReady`
- Move all MIDI initialization logic (device detection, auto-select, port opening) to `SynthApp.vue` or a workspace-level composable
- Keep `useMidiInit` but make it accept options: `useMidiInit({ skipAutoConnect: true })` so MainPage can call it in a lightweight mode

**Alternative (simpler):** Add a guard inside `useMidiInit` to skip heavy work when on the main page:
```js
if (router.currentRoute.value.path !== '/') {
  // heavy init
}
```

**Estimated savings:** Avoid loading `useArpStore` (596 lines) and `useMappingStore` (457 lines) on the landing page.

---

### 4. Route Navigation — Full Remount on Every Click

**Problem:** Every card click calls `goWorkspace()` which does `router.push('/workspace')`, causing:
- MainPage to unmount
- SynthApp to mount (heavy component with ~50 imports)
- All workspace stores to initialize
- Full Vue reactivity teardown/setup

**Plan:**
- **Option A:** Keep as-is (current behavior is intentional — workspace is a separate app view)
- **Option B:** Convert MainPage to an overlay/hero within the workspace view, so navigation is just opening a panel instead of a route change
- **Option C:** Use route query params (`/workspace?panel=soundEngine`) to let the workspace open the correct panel without needing the store flag set before navigation

**Recommendation:** Option A is fine for now. The route separation is a deliberate architectural choice. No change needed unless user experience data shows slow transitions.

---

### 5. Modal Lazy Loading

**Problem:** MainPage imports 3 modal components eagerly:
- `SlideshowModal.vue` (260 lines) — imports `slides.json` and `help_first_start.json` at module level
- `AboutModal.vue` (138 lines) — imports `usePresetStore`
- `AdminPanel.vue` (1129 lines) — loads 6 Firestore documents on mount, imports entire `lucideIcons` dictionary

**Plan:**
- Convert all 3 modal imports to dynamic imports using `defineAsyncComponent`:
```vue
import { defineAsyncComponent } from 'vue'
const SlideshowModal = defineAsyncComponent(() => import('@/components/SlideshowModal.vue'))
const AboutModal = defineAsyncComponent(() => import('@/components/AboutModal.vue'))
const AdminPanel = defineAsyncComponent(() => import('@/components/AdminPanel.vue'))
```
- This prevents the JSON data files and heavy icon imports from loading until the modal is first opened
- `AdminPanel.vue` (1129 lines) is the biggest win — it loads the entire `lucideIcons` library dictionary

**Estimated savings:** ~10-15 KB gzipped + 2 JSON files deferred from initial load.

---

### 6. Template Structure — Repeated Card Pattern

**Problem:** Each feature card in the template follows an identical pattern (rounded border, background, flex layout, icon + label), but is written out manually ~15 times. This creates a lot of repetitive markup.

**Plan:**
- Extract a `FeatureCard` component with props: `icon`, `label`, `bgClass`, `storeFlag`, `isSmall` (for the 4-grid group)
- The card template becomes:
```vue
<FeatureCard icon="Zap" label="Sound Engine" bgClass="bg-sound-design" @click="openPanel('soundEngine')" />
```
- Reduces MainPage from ~300 lines to ~150 lines
- Centralizes styling (hover effects, border, padding, etc.)

**Implementation scope:** Low priority — cosmetic improvement. Only do if the component is reused elsewhere.

---

### 7. Dead Code Removal

**Problem:** Multiple commented-out blocks bloat the file:
- Lines 82-89: Commented-out workspace button
- Lines 115: Commented-out `<h1>`
- Lines 123: Commented-out performance div
- Lines 181-189: Commented-out MIDI Manager button
- Lines 193-207: Commented-out Multi Sounds box
- Lines 241-246: Commented-out SY.CORE logo box
- Lines 291-292: Empty lines

**Plan:** Remove all commented-out code blocks.

---

### 8. Duplicate CSS Background Class

**Problem:** `.bg-audio-capture` is defined twice in `main.css`:
1. First with `/audio-capture.png` (lighter overlay)
2. Second with `/audio-capture-mixer.jpg` (darker overlay)

The second definition overrides the first. Determine which is correct and remove the duplicate.

**Plan:** Ask the designer/team which version is intended, then clean up.

---

## Implementation Order

| Priority | Task | Effort | Impact |
|---|---|---|---|
| P0 | Remove unused icon imports | 5 min | Low |
| P0 | Remove dead code (commented blocks) | 5 min | Low |
| P1 | Lazy-load background images via inline style | 2 hours | High (13 images deferred) |
| P1 | Dynamic imports for modals | 30 min | Medium |
| P2 | Lightweight `useMidiInit` on main page | 1 hour | Medium |
| P3 | Fix duplicate `.bg-audio-capture` | 5 min | Low |
| P4 | Extract `FeatureCard` component | 2 hours | Low (cosmetic) |
| — | Route navigation change | Not recommended | — |

## Verification

- [ ] `npm run build` succeeds
- [ ] Main page loads with all 15 feature cards visible
- [ ] All cards navigate to correct workspace panel
- [ ] MIDI status indicator shows correct state
- [ ] Login/Admin buttons work
- [ ] Modals open and close correctly
- [ ] Background images load on the main page (even if deferred)
- [ ] No visual regressions in card appearance