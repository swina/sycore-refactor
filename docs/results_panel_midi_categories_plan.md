# Implementation Plan: MIDI Actions for ResultsPanel Categories

This plan outlines the changes required to implement MIDI actions for selecting controller categories (tabs) in `ResultsPanel.vue` (Grid, Flow, LFO, Oscillator, Envelope, Filter, EFX).

---

## 1. Objectives
- Introduce MIDI control for the 7 visualizer/parameter tabs in the control panel.
- Support both **discrete selectors** (one MIDI button per tab) and a **continuous selector** (one MIDI knob/slider/fader to scroll categories via CC value).
- Automatically expand the panel if collapsed when a MIDI category action is received.
- Provide proper MIDI feedback (LEDs) for discrete category actions.

---

## 2. Proposed Changes

### A. Define Actions in `src/lib/app-midi-actions.ts`
- **Actions to define:**
  - `panel_category_cc` (Continuous selection via CC)
  - `panel_tab_grid` (Selects Grid / null)
  - `panel_tab_flow` (Selects Flow / 'FLOW')
  - `panel_tab_lfo` (Selects LFO / 'LFO')
  - `panel_tab_osc` (Selects Oscillator / 'OSCILLATOR')
  - `panel_tab_env` (Selects Env / 'ENV')
  - `panel_tab_filter` (Selects Filter / 'FILTER')
  - `panel_tab_efx` (Selects EFX / 'EFX')
- Add these actions to the `AppAction` union type.
- Add labels to `APP_ACTION_LABELS`.
- Add to the `'UI & Panels'` group in `MIDI_ACTION_GROUPS`.
- Add `panel_category_cc` to `CONTINUOUS_ACTIONS` so that its full value range is preserved.

### B. Handle Actions in `src/composables/useAppActions.js`
- Implement the switch cases for the new actions:
  - For discrete tabs (triggered on CC value > 63): set `uiStore.activeVisualizerCategory` and expand the panel by setting `uiStore.isPanelCollapsed = false`.
  - For `panel_category_cc`: partition the 0–127 range into 7 equal bands to set the category dynamically and set `uiStore.isPanelCollapsed = false`.
   - GRID (null): 0 - 12
   - FLOW: 13 - 25
   - LFO: 26 - 38 (il valore 36 rientra in questo range)
   - OSCILLATOR: 39 - 50
   - ENV: 51 - 63
   - FILTER: 64 - 76
   - EFX: 77 - 88
   - POLY: 89 - 101
   - ADVANCED: 102 - 114
   - DYNAMIC: 115 - 127

### C. Refactor Panel Collapsed State in `src/components/ResultsPanel.vue`
- Change the local ref `const isPanelCollapsed = ref(false)` to a writable computed property bound to `uiStore.isPanelCollapsed`.
- This ensures that:
  - Changes from MIDI actions (like `toggle_panel` or category actions) update `ResultsPanel.vue` immediately.
  - Clicking on the hide/show buttons or switching tabs in the UI correctly updates the global store and maintains synchronization across any external MIDI controllers.

### D. Update MIDI Feedback and Controller Manager
- **`src/composables/useMidiFeedback.js`**:
  - Add mappings to `actionStateMap` for the discrete selector actions (evaluating to `true` when active category matches and panel is not collapsed).
  - Add `() => uiStore.activeVisualizerCategory` to the watch array to update LEDs instantly when the category switches.
- **`src/composables/useControllerManager.js`**:
  - Add case mappings to `getActionStatus(action)`.
  - Add `() => uiStore.activeVisualizerCategory` to the watch array.

---

## 3. Verification Plan
- Verify that `npm run build` succeeds without TypeScript/Lint errors.
- Confirm category selection responds correctly to custom MIDI CC mapping triggers.
