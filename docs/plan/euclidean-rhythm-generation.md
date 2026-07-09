# Euclidean Rhythm Generation — Implementation

**Project:** sycore  
**Date:** 2026-07-09  
**Status:** Implemented

---

## 1. Objective

Add a Euclidean (Bjorklund) rhythm generator to the Drum Machine, accessible via a dialog with a Generate button in `DrumMachine.vue`.

---

## 2. What Was Built

### 2.1 Bjorklund Algorithm (`useDrumMachineStore.ts`)

**File:** `src/stores/useDrumMachineStore.ts`

Three functions added to the store:

- **`getEuclidPattern(steps, pulses)`** — Classic Bjorklund algorithm. Returns `number[]` (0s and 1s). Caches results by `"steps_pulses"` key. Clamps inputs to valid ranges (1–64 steps, 0–steps pulses).

- **`rotatePattern(pattern, offset)`** — Rotates a pattern array by `offset` positions (wraps around, handles negative offsets).

- **`generateEuclideanPattern(steps, pulses, rotation, trackIndices, velocity, accent)`** — Generates a Euclidean pattern and applies it to the selected track indices in the active sequence. Each active step gets `velocity ± 5` jitter, optional accent flag.

### 2.2 Euclidean Dialog (`DrumMachine.vue`)

**File:** `src/components/DrumMachine.vue`

A Teleport-to-body modal dialog with:

| Control | Type | Range | Description |
|---|---|---|---|
| Steps | Slider | 1–64 | Total number of steps in the pattern |
| Pulses | Slider | 0–steps | Number of active pulses |
| Rotation | Slider | 0–(steps-1) | Rotate the pattern by N positions |
| Velocity | Slider | 1–127 | Velocity for active steps |
| Accent | Toggle | ON/OFF | Apply accent to active steps |
| Track selection | Grid of buttons | 11 tracks | Which tracks to apply the pattern to |

### 2.3 Generate Button

**File:** `src/components/DrumMachine.vue`

A "Euclidean" button in the header bar (next to Import) opens the dialog. The dialog's "Generate" button calls `generateEuclideanPattern()` with the current parameters and closes the dialog.

---

## 3. Files Modified

| File | Change |
|---|---|
| `src/stores/useDrumMachineStore.ts` | Added `getEuclidPattern`, `rotatePattern`, `generateEuclideanPattern`; exported `generateEuclideanPattern` |
| `src/components/DrumMachine.vue` | Added `showEuclidean`, `euclideanSteps`, `euclideanPulses`, `euclideanRotation`, `euclideanVelocity`, `euclideanAccent`, `euclideanTrackSelection`, `toggleEuclideanTrack`, `generateEuclidean`; added Euclidean button in header; added Euclidean dialog Teleport |

---

## 4. Algorithm

The Bjorklund algorithm distributes `pulses` ones evenly across `steps` positions:

```
getEuclidPattern(8, 3) → [1, 0, 0, 1, 0, 0, 1, 0]
getEuclidPattern(16, 5) → [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0]
```

The algorithm works by iteratively distributing remainders between two arrays (pulses and rests) until one array has length ≤ 1, then flattening the result.

---

## 5. Edge Cases Handled

| Edge Case | Handling |
|---|---|
| pulses = 0 | All steps are 0 (rest) |
| pulses = steps | All steps are 1 (full) |
| No tracks selected | Generate button does nothing |
| Rotation > steps | Wrapped via modulo |
| Track index out of range | Guarded by `if (!track) return` |