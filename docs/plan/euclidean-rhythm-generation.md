# Plan: Euclidean Rhythm Generation for `music-pattern-generator`

**Repo:** https://github.com/swina/music-pattern-generator  
**Date:** 2026-07-09  
**Status:** Draft

---

## 1. Objective

Add a `method` abstraction to the existing Euclidean Pattern Generator (EPG) processor so that the Euclidean (Bjorklund) algorithm is exposed as a selectable generation strategy, paving the way for future algorithms (random, Markov, sequencer, etc.).

---

## 2. What Already Exists

| Component | File | Status |
|---|---|---|
| Bjorklund algorithm | `src/js/processors/epg/utils.js` | Done — `getEuclidPattern(steps, pulses)`, `rotateEuclidPattern(pattern, rotation)`, `createBjorklund()` |
| EPG processor | `src/js/processors/epg/processor.js` | Done — generates MIDI events from Euclidean pattern |
| EPG settings UI | `src/js/processors/epg/settings.html` + `settingsController.js` | Done — Steps/Pulses/Rotation params |
| EPG config | `src/js/processors/epg/config.json` | Done — 20 parameters defined |
| Processor plugin system | `src/json/processors.json`, `processor-loader.js`, `processorbase.js` | Done |

---

## 3. Design

### 3.1 Architecture

Add a `methods` registry inside the EPG processor. Each method implements `generate(params) => boolean[]`. The processor's `updatePattern()` dispatches to the selected method instead of calling `getEuclidPattern` directly.

```
updatePattern()
  │
  ├─ method = this.params.method.value  // "euclidean"
  │
  └─ methods[method].generate({
       steps, pulses, rotation, ...
     })
       │
       └─ getEuclidPattern(steps, pulses)  // existing utils.js
       └─ rotateEuclidPattern(pattern, rotation)
```

### 3.2 Parameter: `method`

Add an `itemized` parameter to `config.json`:

```json
{
  "key": "method",
  "label": "Method",
  "type": "itemized",
  "default": "euclidean",
  "model": [
    { "label": "Euclidean", "value": "euclidean" }
  ],
  "isMidiControllable": false
}
```

Future methods add entries to the `model` array.

### 3.3 Method Registry

In `processor.js`, a plain object maps method names to generators:

```javascript
const methods = {
  euclidean: {
    label: 'Euclidean',
    params: ['steps', 'pulses', 'rotation'],
    generate({ steps, pulses, rotation }) {
      let pattern = getEuclidPattern(steps, pulses);
      return rotateEuclidPattern(pattern, rotation);
    }
  }
};
```

The `params` array declares which processor parameters the method uses — used by the settings controller for conditional visibility.

### 3.4 Conditional Parameter Visibility

In `settingsController.js`, when `method` changes, show/hide the parameter UI rows that belong to the selected method. Parameters not listed in `methods[method].params` get `display: none`.

---

## 4. Files to Modify

| File | Change |
|---|---|
| `src/js/processors/epg/config.json` | Add `method` parameter (itemized, values: `["euclidean"]`) |
| `src/js/processors/epg/processor.js` | Add `methods` registry; dispatch `updatePattern()` through `methods[method].generate()` |
| `src/js/processors/epg/settingsController.js` | Add conditional show/hide logic for `steps`, `pulses`, `rotation` based on `method` |

---

## 5. Detailed Implementation

### 5.1 config.json — Add `method` parameter

Insert before the existing `steps` parameter (order in `allIds` determines UI order):

```json
{
  "allIds": ["method", "steps", "pulses", "rotation", "rate", "is_triplets", "note_length", "mode", "channel_out", "pitch_out", "velocity_out", "cc_out", "cc_value_out", "is_mute", "name"],
  "byId": {
    "method": {
      "key": "method",
      "label": "Method",
      "type": "itemized",
      "default": "euclidean",
      "model": [{ "label": "Euclidean", "value": "euclidean" }],
      "isMidiControllable": false
    },
    ...
  }
}
```

### 5.2 processor.js — Method registry + dispatch

**Step A.** After the `import` statements, define the registry:

```javascript
const METHODS = {
  euclidean: {
    label: 'Euclidean',
    params: ['steps', 'pulses', 'rotation'],
    generate({ steps, pulses, rotation }) {
      let pattern = getEuclidPattern(steps, pulses);
      return rotateEuclidPattern(pattern, rotation);
    }
  }
};
```

**Step B.** In the processor factory `createProcessor(data)`, add a `getMethods()` accessor:

```javascript
getMethods() {
  return METHODS;
}
```

**Step C.** Modify `updatePattern()` (lines ~153-186):

Replace the direct `getEuclidPattern` → `rotateEuclidPattern` call with:

```javascript
updatePattern() {
  const methodKey = this.params.method.value;
  const method = METHODS[methodKey];
  if (!method) return;

  const pattern = method.generate({
    steps: this.params.steps.value,
    pulses: this.params.pulses.value,
    rotation: this.params.rotation.value
  });

  const stepDuration = this.params.rate.value * PPQN;
  const duration = this.params.steps.value * stepDuration;

  this.pulsesOnly = [];
  for (let stepIndex = 0; stepIndex < pattern.length; stepIndex++) {
    if (pattern[stepIndex]) {
      this.pulsesOnly.push({
        startTime: stepIndex * stepDuration,
        stepIndex
      });
    }
  }
  this.totalDuration = duration;
}
```

**Step D.** Watch for `method` param changes to re-trigger `updatePattern()`:

Ensure the existing `isEuclidChange` detection also considers method changes:

```javascript
// In the param watcher (around line 153):
const isEuclidChange = changedParams.includes('steps')
  || changedParams.includes('pulses')
  || changedParams.includes('rotation')
  || changedParams.includes('rate')
  || changedParams.includes('method');
```

### 5.3 settingsController.js — Conditional visibility

In the parameter binding loop, add a handler for `method`:

```javascript
// After binding each parameter value
if (paramKey === 'method') {
  const container = element.closest('.settings-container');
  const toggleVisibility = (method) => {
    const methodObj = processor.getMethods()[method];
    const visibleParams = methodObj ? methodObj.params : [];
    container.querySelectorAll('[data-param]').forEach(el => {
      const key = el.dataset.param;
      el.style.display = visibleParams.includes(key) ? '' : 'none';
    });
  };
  // Apply on change
  element.addEventListener('change', () => toggleVisibility(element.value));
  // Apply initial state
  toggleVisibility(element.value);
}
```

Requires the settings HTML elements to have `data-param="steps"` attributes (check if they already do or add them).

---

## 6. Backward Compatibility

- Projects saved without `method` in params will have `method` default to `"euclidean"` (config default).
- The existing Euclidean behavior is preserved identically.
- No migration needed.

---

## 7. Edge Cases

| Edge Case | Handling |
|---|---|
| Unknown method value in saved project | Fall back to `"euclidean"` |
| `steps` = 0 or negative | Already clamped by `config.json` min/max (1–64) |
| `pulses` > `steps` | Already clamped by `getEuclidPattern()` |
| Method changes during playback | `updatePattern()` regenerates immediately, next scan cycle uses new pattern |

---

## 8. Future Extension

To add a new algorithm (e.g., `random`):

1. Add entry to `config.json` `method.model`: `{ "label": "Random", "value": "random" }`
2. Register in `METHODS`:
   ```javascript
   random: {
     label: 'Random',
     params: ['steps', 'density'],
     generate({ steps, density }) { ... }
   }
   ```
3. Add `density` parameter to `config.json`
4. No changes to processor or settings controller — the method abstraction handles dispatch, and conditional visibility works automatically via `params` array.

---

## 9. Non-Goals

- No new processor type (extends EPG only)
- No new UI panels (settings editor is reused)
- No test infrastructure (project has none — noted for future)
- No MIDI-control for `method` parameter