# SY.CORE Modular Panel System — Refactoring Plan

## Context

`docs/plans/Refactoring-Plan.md` (Phases 1–6) is complete: `src/types/` exists, `MidiService` is split into focused sub-modules, all stores are TypeScript, `src/lib/idb.ts` is now a thin re-export over `src/lib/db/`, `isAdmin` is enforced, and `tests/` + `vitest.config.ts` exist. That plan explicitly excluded one item as future scope:

> **`SynthApp.vue` decomposition** — reducing the ~50 component imports by extracting a `ModalManager` component and a toolbar registry composable

This plan picks that up and generalizes it into the "modular modules" concept referenced in `docs/plans/apps-modules.md` ("Each module is a modal that works independently"): every feature (Sampler, Drum Machine, MIDI Devices, ...) should be a self-describing **module** the app assembles from a single registry, instead of a feature the app hand-wires in four separate places.

## Problem

Today, adding or changing one panel touches all of the following, and they must stay in sync by hand:

| File | What it duplicates for every panel |
|---|---|
| [`src/stores/useUiStore.ts`](../../src/stores/useUiStore.ts) | A `isXOpen` ref (~65 of them), an entry in `MODAL_CYCLE_REGISTRY` (L188), an entry in `MODAL_REFS` (L239), a manual reset line in `closeAll()` (L300) |
| [`src/views/SynthApp.vue`](../../src/views/SynthApp.vue) | A static component import, an entry in `toolbarButtonMap` (L119) with its own icon/label, a `<Teleport>` block wiring `v-if`/`@close`/`focusStyle()` |
| [`src/views/MainPageOptimized.vue`](../../src/views/MainPageOptimized.vue) | A card entry in `sections` (L48) with its own icon/label/background/`onClick` |
| [`src/App.vue`](../../src/App.vue) | A handful of panels (`TracksPlayer`, `GuidesPanel`, `FreesoundBrowser`, `AudioMixerPanel`, `SoundFolderBrowser`) are *also* mounted here independently of `SynthApp.vue`, using the same `uiStore` flags — a second, inconsistent mount point for the same panels |
| [`src/components/AppFooter.vue`](../../src/components/AppFooter.vue) (`MENU_ACTION_MAP`, L31–77), [`src/components/ui/SideBar.vue`](../../src/components/ui/SideBar.vue) and [`src/components/ui/MainMenuDial.vue`](../../src/components/ui/MainMenuDial.vue) (both `ACTION_MAP`, L13–54) | **Three near-identical hand-written `id → toggle a uiStore flag` maps** (~40 entries each, with drift between them — e.g. `SideBar.vue` is missing `looper`/`guides`/`tracks-player`/`chord-prog` that the other two have). Each is filtered against `configStore.toolbarConfig`, an admin-editable, DB-persisted list of `{id, icon, label, fab}` buttons — so the *button metadata* is already data-driven, but the *action* (which flag to flip) is copy-pasted three times |

**Important nuance discovered while implementing:** `configStore.toolbarConfig` (`src/stores/useConfigStore.ts` L60+) is persisted, admin-editable data — it must stay the source of truth for toolbar button icon/label/visibility. The module registry below does **not** replace it; it supplies the `id → ref` toggle mechanism and the richer metadata (component, category, launcher background) that `toolbarConfig` doesn't carry. The two are joined by a shared `id`.

Consequences:
- 4+ files / 6+ edit sites for one new panel.
- Icon/label/badge metadata for the same feature is defined 2–3 times and can drift (already true in places — e.g. `looper` vs `audio-looper` both map to `isLooperOpen` in `toolbarButtonMap`, L140/154).
- All ~50 panel components are statically imported into `SynthApp.vue` — no code-splitting, despite the README claiming "Lazy-Loaded Panels" (`README.md` L170).
- `components/` is flat (67 files, some 2000–4000+ lines: `AudioCapture.vue` 4208, `LiveTimeline.vue` 2899, `DrumMachine.vue` 2788) with no feature grouping, so there's no natural place to add a "module" of related files.

## Goal

Introduce a `ModuleManifest` type and a central registry that `MainPageOptimized.vue`, `SynthApp.vue`, and `useUiStore.ts` all *read from* instead of each re-declaring. A new module becomes **one manifest entry**, not edits across four files. No behavior or visual change — this is structural.

## Design

```ts
// src/core/modules/types.ts
export interface ModuleManifest {
  id: string                            // 'drum-machine' — replaces the isXOpen key
  label: string                         // 'Drum Machine'
  icon: Component                       // lucide icon component
  category: 'midi-config' | 'sound-design' | 'midi-tools' | 'audio-tools' | 'performance'
  badge?: string                        // 'Beta'
  bg?: string                           // launcher card background image
  component: () => Promise<Component>   // dynamic import — real lazy loading
  panelMode: 'modal' | 'drawer' | 'singleton'  // how SynthApp mounts it (Transition variant / always-mounted)
  featureFlag?: string                  // optional key into authStore.profile.features
}
```

```ts
// src/core/modules/registry.ts
export const moduleRegistry: ModuleManifest[] = [
  {
    id: 'drum-machine',
    label: 'Drum Machine',
    icon: Drum,
    category: 'performance',
    bg: '/drum-machine.png',
    component: () => import('@/modules/drum-machine/DrumMachine.vue'),
    panelMode: 'singleton',
  },
  // ...one entry per existing panel, ported 1:1 from the three duplicated lists
]
```

`useUiStore` collapses the 65 named refs into one map, generated from the registry, with the old names kept as computed aliases during migration so existing template bindings (`uiStore.isDrumMachineOpen`) keep compiling:

```ts
const openModules = reactive<Record<string, boolean>>(
  Object.fromEntries(moduleRegistry.map(m => [m.id, false]))
)
function isOpen(id: string) { return openModules[id] }
function toggle(id: string) { openModules[id] = !openModules[id] }
function closeAll() { for (const k in openModules) openModules[k] = false }
```

`MODAL_CYCLE_REGISTRY`/`MODAL_REFS` (currently hand-maintained maps in `useUiStore.ts` L188–281) become `Object.fromEntries(moduleRegistry.map(m => [m.id, () => openModules[m.id]]))` — one line instead of ~90.

`MainPageOptimized.vue`'s `sections` becomes a `groupBy(category)` over `moduleRegistry`. `SynthApp.vue`'s `toolbarButtonMap` and the `<Teleport>` block become one `v-for` over `moduleRegistry`, rendering `component` via `defineAsyncComponent` and picking the Transition/wrapper based on `panelMode`.

## Phases

Each phase leaves the app fully working. Phases are ordered by risk (lowest first) and are individually revertible.

**Implementation status (updated as work lands):**

| Step | Status |
|---|---|
| Generic `isPanelOpen(id)`/`togglePanel(id)`/`openPanel(id)`/`closePanel(id)` API on `useUiStore.ts`, backed by a `PANEL_ID_REF_LOOKUP` (~44 entries) | ✅ Done — simpler than the originally-sketched `openModules` reactive map; aliases the existing named refs directly instead of introducing a second reactive source of truth |
| Collapse `AppFooter.vue`/`SideBar.vue`/`MainMenuDial.vue`'s three duplicated `ACTION_MAP`s to `uiStore.togglePanel(id)` | ✅ Done |
| Remove dead `toolbarButtonMap`/`handleToolbarButtonClick` from `SynthApp.vue` (discovered unused during implementation — never called) | ✅ Done |
| `src/core/modules/types.ts` + `registry.ts` | ✅ Done — **scoped to the 18 modules currently exposed on the `MainPageOptimized.vue` launcher only**, not all ~50 panels. The ~30 panels reachable only from the in-workspace toolbar/footer/sidebar aren't in `moduleRegistry` yet; they're still covered by `PANEL_ID_REF_LOOKUP` in `useUiStore.ts` |
| `MainPageOptimized.vue`'s `sections` derived from `moduleRegistry` via `modulesByCategory()` | ✅ Done |
| `useUiStore.ts`'s `MODAL_CYCLE_REGISTRY`/`MODAL_REFS`/`closeAll()` collapsed to derive from the registry | ⏳ Not started — still hand-maintained (~90 lines). Left alone deliberately: collapsing it requires the registry to cover *all* panels (not just the 18 launcher ones), and `closeAll()`/modal-cycling behavior for panels outside the registry would need to keep working during the transition |
| `SynthApp.vue`'s `<Teleport>` blocks rendered from a loop — **partial** | 🟡 16 of ~40 panels done, in two local (SynthApp-only, not `moduleRegistry`) arrays: `alwaysMountedPanels` (8 panels, zero props: UnifiedMidiManager, LoopMachine, DrumMachine, SamplerPanel, MidiControllerDesigner, AudioVisualizer, SessionManager, MidiLoggerPanel) and `simpleTogglePanels` (8 panels, single `v-if`/`@close`: PresetHistoryPanel, MidiMatrix, MidiMappingPanel, AudioLooper, MidiPerformancePanel, AppMidiMapper, UserProfileModal, AboutModal). **Deliberately excluded**: `AuthModal` (login is too sensitive to touch speculatively, and `'auth'` wasn't yet in `PANEL_ID_REF_LOOKUP`), `MidiDeviceProgramChangePanel` (`v-show` not `v-if`), `VelocityMappingDialog`/`LfoMappingDialog` (extra static `lfoId` prop), `AdminPanel` (`sy-drawer` transition + redundant `isOpen` prop), and everything with real cross-store props (`StepSequencer`, `ChordProgSequencer`, `ArpeggiatorPanel`, `VirtualKeyboard`, `MidiCapture`, `LiveSet`, `LivePerformancePad`, `LiveTimeline`, `SoundEngine`, `ProgramChangeBrowser`'s hand-built drawer, `AudioCapture`). **Bug caught mid-edit by the id-mapping design itself**: `'about'` was missing from `PANEL_ID_REF_LOOKUP` (never in any of the three old `ACTION_MAP`s, only in the legacy `MODAL_REFS`) — would have silently made the About modal's close button a no-op. Fixed, and added to both lookup tables and `ui-store-panels.test.ts`. Note: `simpleTogglePanels`/`alwaysMountedPanels` use `focusKey` (old camelCase, for `focusStyle()`/Ctrl+Tab cycling) separately from `openId` (new kebab-case, for `isPanelOpen`/`closePanel`) — these are still two different id namespaces until `MODAL_CYCLE_REGISTRY` itself is migrated (next row) |
| `App.vue`'s independently-mounted panels consolidated into `SynthApp.vue` | ⏳ Not started |
| Physical reorg into `src/modules/<feature>/` | ⏳ Not started (Phase 3) |
| Automated regression tests for the registry/toggle plumbing | ✅ Done — `tests/unit/stores/ui-store-panels.test.ts` (table-driven, every id in `PANEL_ID_REF_LOOKUP` against its named ref) and `tests/unit/core/module-registry.test.ts` (registry structural checks + every registry id proven to toggle a real `useUiStore` flag). Also fixed a pre-existing test-env issue: Node 22+'s experimental global `localStorage` shadowed happy-dom's and threw on any store that reads `localStorage` at setup time — added `tests/setup.ts` (in-memory polyfill, wired via `vitest.config.ts`'s `setupFiles`) so any future store test benefits, not just these two |

---

### Phase 1 — Registry scaffolding (no behavior change)

**Goal**: Introduce `ModuleManifest` + `moduleRegistry` populated with all ~50 existing panels' current metadata (pulled verbatim from `toolbarButtonMap`, `sections`, and `MODAL_CYCLE_REGISTRY`). Wire `useUiStore`'s `openModules` map underneath the existing named refs as computed aliases — nothing outside `useUiStore.ts` changes.

**Files to create:**
- `src/core/modules/types.ts`
- `src/core/modules/registry.ts`

**Files to modify:**
- `src/stores/useUiStore.ts` — add `openModules` reactive map; keep every existing `isXOpen` ref but back it with a computed getter/setter over `openModules[id]` where a registry entry exists (panels not yet in the registry, e.g. non-panel UI flags like `isPanelCollapsed`, stay as plain refs)

**Verification:**
- `npm run build` — zero errors
- App boots, every panel still opens/closes/cycles (Ctrl+Tab) exactly as before

---

### Phase 2 — Collapse the three duplicated lists

**Goal**: Point `MainPageOptimized.vue`, `SynthApp.vue`, and `useUiStore.ts`'s `MODAL_CYCLE_REGISTRY`/`MODAL_REFS`/`closeAll()` at `moduleRegistry` instead of their own hardcoded lists. This is where the maintenance win actually lands.

**Actions:**
1. `useUiStore.ts`: replace `MODAL_CYCLE_REGISTRY` and `MODAL_REFS` (L188–281) with derivations from `moduleRegistry`; replace the manual `closeAll()` body (L300–357) with a loop over `openModules`.
2. `SynthApp.vue`: replace `toolbarButtonMap` (L119–158) with a lookup into `moduleRegistry`; replace the ~40 hand-written `<Teleport>` blocks with one `v-for="m in moduleRegistry"` that renders `<component :is="asyncComponentFor(m)" v-if/v-show="isOpen(m.id)" @close="close(m.id)" />`, still wrapped per `panelMode` for the modal/drawer Transition variants already in use.
3. `MainPageOptimized.vue`: replace `sections` (L48–97) with `groupBy(moduleRegistry, 'category')`.
4. `App.vue`: remove the independently-mounted panels (`TracksPlayer`, `GuidesPanel`, `FreesoundBrowser`, `AudioMixerPanel`, `SoundFolderBrowser`) now that `SynthApp.vue`'s registry-driven loop mounts every panel consistently in one place — resolves the dual-mount inconsistency.

**Verification:**
- `npm run build` — zero errors
- Every launcher card still opens the right panel; every toolbar button still works; Ctrl+Tab cycling still works; Escape still closes all
- Panels previously mounted from `App.vue` (Tracks Player, Guides, Freesound Browser, Audio Mixer, Sound Folder Browser) still open correctly now that they're mounted only from `SynthApp.vue`

---

### Phase 3 — Physical reorg into `src/modules/<feature>/`

**Goal**: Move each component's `.vue` file, its dedicated store, and any feature-only composables into `src/modules/<feature>/`. Start with self-contained features; defer ones that share the MIDI/audio engine core.

**Suggested order** (least to most entangled):
1. `sampler` — `SamplerPanel.vue` + `useSamplerStore.ts`
2. `drum-machine` — `DrumMachine.vue` + `useDrumMachineStore.ts` (+ `src/lib/drum-engine.js`)
3. `chord-progression` — `ChordProgSequencer.vue` + `useChordProgStore.ts`
4. `midi-controller-designer` — `MidiControllerDesigner.vue`
5. `step-sequencer`, `audio-capture`, `live-timeline` — last, since these cross-cut shared engine code in `src/core/`

Shared engine code (`src/core/midi/`, `src/core/state/`, `src/lib/db/`) stays put — modules consume it, they don't own it. Update the `component:` import path in `registry.ts` as each module moves; imports elsewhere in the app go through `@/modules/<feature>/...`.

**Verification per module moved:**
- `npm run build` — zero errors
- The moved panel's full functionality still works (manual smoke test, since no test coverage exists for panel UI yet)

---

### Phase 4 — Real lazy loading

**Goal**: Confirm every `component:` entry in `registry.ts` is a dynamic `import()` (already true from Phase 1's design) and verify Vite actually code-splits per module.

**Actions:**
- `npm run build` and inspect `dist/assets/` — each module should produce its own chunk, fetched only when its panel opens
- Add `manualChunks` in `vite.config.ts` only if default splitting isn't granular enough

**Verification:**
- Network tab: opening a panel for the first time triggers a JS chunk fetch; initial bundle size (check `dist/assets/*.js` total) drops relative to pre-refactor baseline

---

### Phase 5 (stretch) — Feature-flagged modules

**Goal**: Wire `ModuleManifest.featureFlag` to `authStore.profile.features`, replacing the ad hoc per-prop flags already scattered in `SynthApp.vue` (`canUseSeqGen`, `canUseSeqGlobalTranspose`, `canUseSeqSyncTrack` — L531–534) with a consistent per-module gate. Filter `moduleRegistry` by flag before rendering launcher cards/toolbar buttons.

**Verification:**
- A module with `featureFlag: 'someFlag'` set to `false` on a test profile doesn't appear on the launcher or toolbar, and its route/toggle is a no-op

---

## Non-goals

- No change to audio/MIDI engine internals (`src/core/midi/`, engines in `src/lib/*-engine.js`)
- No visual/UX changes to any panel
- No store business-logic changes inside individual features (that's `Refactoring-Plan.md`'s already-excluded "Store business logic extraction" item, e.g. `useDrumMachineStore`'s style data, `usePresetStore`'s generation logic)
- Splitting the oversized SFCs themselves (`AudioCapture.vue` 4208 lines, etc.) into subcomponents is a natural follow-up once they have a module home in Phase 3, but is not required by this plan — call out as **Phase 6 (future)** if wanted

## Dependency order

```
Phase 1 (registry scaffolding)
   └─→ Phase 2 (collapse the 3 duplicated lists)
          └─→ Phase 3 (physical reorg, one module at a time)
                 └─→ Phase 4 (verify code-splitting)
                        └─→ Phase 5 (feature flags, stretch)
```

Phase 3 can proceed module-by-module in parallel with other work — each module move is independent and revertible on its own.

## Master verification checklist

- [ ] `npm run build` — zero errors after every phase
- [ ] `npm run dev` — app starts, main page loads, navigate to `/workspace`
- [ ] Every launcher card on `MainPageOptimized.vue` opens the correct panel
- [ ] Every `SynthApp.vue` toolbar button opens/closes the correct panel
- [ ] Ctrl+Tab / Ctrl+Shift+Tab still cycles focus through open panels
- [ ] Escape still closes all panels
- [ ] Panels formerly mounted from `App.vue` (Tracks Player, Guides, Freesound Browser, Audio Mixer, Sound Folder Browser) still work after being consolidated into `SynthApp.vue`
- [ ] `npm run test` still passes
- [ ] Production bundle shows per-module code-splitting (Phase 4)
