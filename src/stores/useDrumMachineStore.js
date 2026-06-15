import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

const LS_KEY         = 'SYCORE_DRUM_MACHINE_V1'
const LS_PRESETS_KEY = 'SYCORE_DM_PRESETS'

const TRACK_LABELS = ['Kick', 'Snare', 'Closed HH', 'Open HH', 'Clap', 'Tom 1', 'Tom 2', 'Cymbal']

const DEFAULT_DRUM_STEP = () => ({
  active: false,
  velocity: 100,
  accent: false,
  ratchet: 1,
})

function makeTrack(label = '') {
  return {
    label,
    soundId:    '',
    soundLabel: '',
    soundUrl:   '',
    muted:      false,
    solo:       false,
    volume:     0.85,
    length:     16,
    pan:        0,
    pitch:      0,
    filterFreq: 20000,
    reverbSend: 0,
    delaySend:  0,
    steps: Array(16).fill(null).map(() => DEFAULT_DRUM_STEP()),
  }
}

// Serialize a track for localStorage/presets — strips ephemeral soundUrl
function serializeTrack(t) {
  return {
    label:      t.label,
    soundId:    t.soundId,
    soundLabel: t.soundLabel,
    muted:      t.muted,
    solo:       t.solo,
    volume:     t.volume,
    length:     t.length     ?? 16,
    pan:        t.pan        ?? 0,
    pitch:      t.pitch      ?? 0,
    filterFreq: t.filterFreq ?? 20000,
    reverbSend: t.reverbSend ?? 0,
    delaySend:  t.delaySend  ?? 0,
    steps:      t.steps.map(s => ({ ...s })),
  }
}

function makeDefaultSequences() {
  return ['A', 'B', 'C', 'D', 'E', 'F'].reduce((acc, key) => {
    acc[key] = TRACK_LABELS.map(label => makeTrack(label))
    return acc
  }, {})
}

// ── Style generation data ─────────────────────────────────────────────────────
// Track order: Kick, Snare, ClosedHH, OpenHH, Clap, Tom1, Tom2, Cymbal
//
// Step encoding per cell:
//   0          — never fires
//   1          — always fires
//   'A'        — always fires, accented
//   0.0–0.99   — fires with that probability
//   [p, 'A']   — fires with probability p, accented if fired
//   [p, 2|3|4] — fires with probability p, ratchet N if fired
//
// Each style has `variants`: 3+ pattern grids. One is chosen randomly on
// each Generate press so every generation produces a unique result.

const DRUM_STYLES = {
  House: {
    variants: [
      // V1 — classic 4-on-floor
      [
        [1,   0,   0.2, 0,   1,   0,   0.2, 0,   1,   0,   0.2, 0,   1,   0,   0.3, 0  ],
        [0,   0,   0,   0,  'A',  0,   0,   0,   0,   0,   0,   0,  'A',  0,   0,   0  ],
        [1,   0,   1,   0,   1,   0,   1,   0,   1,   0,   1,   0,   1,   0,   1,   0.5],
        [0,   0,   0,  0.5,  0,   0,   0,  0.5,  0,   0,   0,  0.5,  0,   0,   0,  0.5],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [0,   0,   0,   0,   0,  0.4,  0,   0,   0,   0,   0,   0,   0,  0.4,  0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,  0.2,  0,   0,   0,   0,   0,   0,   0,  0.2],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
      ],
      // V2 — syncopated kick on beat 3 with ghost
      [
        [1,   0,   0,  0.3,  1,   0,  0.5,  0,  'A',  0,   0,   0,   1,   0,  0.4,  0  ],
        [0,   0,   0,   0,  'A',  0,   0,   0,   0,   0,   0,   0,  'A',  0,   0,   0  ],
        [1,  0.3,  1,   0,   1,   0,   1,   0,   1,  0.3,  1,   0,   1,   0,   1,   1  ],
        [0,   0,   0,   0,   0,   0,   0,  0.7,  0,   0,   0,  0.4,  0,   0,   0,  0.7],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [0,   0,   0,   0,   0,  0.6,  0,   0,   0,  0.3,  0,   0,   0,  0.5,  0,   0  ],
        [0,   0,   0,   0,   0,   0,  0.3,  0,   0,   0,   0,   0,   0,   0,  0.3,  0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
      ],
      // V3 — rolling kick with 16th hi-hat variation
      [
        [1,   0,  0.4,  0,   1,   0,   0,   0,   1,  0.5,  0,   0,   1,   0,  0.5,  0  ],
        [0,   0,   0,   0,  'A',  0,   0,  0.3,  0,   0,   0,   0,  'A',  0,   0,   0  ],
        [1,   1,  0.5,  1,   1,   1,  0.5,  1,   1,   1,  0.5,  1,   1,   1,  0.5,  1  ],
        [0,   0,   0,  0.4,  0,   0,   0,   0,   0,   0,   0,  0.6,  0,   0,   0,  0.4],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [0,   0,   0,   0,   0,  0.3,  0,  0.3,  0,   0,   0,   0,   0,  0.5,  0,  0.3],
        [0,   0,   0,  0.3,  0,   0,   0,   0,   0,   0,   0,  0.3,  0,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
      ],
    ],
    velMin: 78, velMax: 110, ghostVelMax: 50,
  },

  Techno: {
    variants: [
      // V1 — hard 4-on-floor, 16th HH
      [
        [1,   0,   0,   0,  'A',  0,  0.3,  0,   1,   0,   0,   0,  'A',  0,  0.4,  0  ],
        [0,   0,   0,   0,   1,   0,   0,   0,   0,   0,   0,   0,   1,   0,   0,   0  ],
        [1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1  ],
        [0,   0,   0,   0,   0,   0,   0,  0.5,  0,   0,   0,   0,   0,   0,   0,  0.7],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [0,   0,  0.5,  0,   0,   0,  0.5,  0,   0,   0,  0.5,  0,   0,   0,  0.6,  0  ],
        [0,   0,   0,   0,   0,  0.3,  0,   0,   0,   0,   0,   0,   0,  0.4,  0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
      ],
      // V2 — industrial kick pattern, sparse OHH
      [
        [1,   0,   0,  0.4, 'A',  0,   0,   0,   1,   0,  0.5,  0,  'A',  0,   0,   0  ],
        [0,   0,   0,   0,   1,   0,   0,  0.3,  0,   0,   0,   0,   1,   0,   0,  0.4],
        [1,   1,  0.7,  1,   1,  0.7,  1,   1,   1,   1,  0.7,  1,   1,  0.7,  1,   1  ],
        [0,   0,   0,   0,   0,   0,   0,  0.4,  0,   0,   0,  0.3,  0,   0,   0,  0.6],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [0,  0.4,  0,   0,   0,  0.4,  0,   0,   0,  0.5,  0,   0,   0,  0.4,  0,   0  ],
        [0,   0,   0,  0.3,  0,   0,   0,   0,   0,   0,   0,  0.4,  0,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
      ],
      // V3 — pumping with extra syncopation
      [
        [1,   0,  0.6,  0,  'A',  0,   0,  0.5,  1,   0,   0,  0.4, 'A',  0,  0.5,  0  ],
        [0,   0,   0,  0.3,  1,   0,   0,   0,   0,   0,   0,  0.4,  1,   0,   0,   0  ],
        [1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1  ],
        [0,   0,   0,   0,   0,   0,   0,  0.6,  0,   0,   0,   0,   0,   0,   0,  0.5],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [0,   0,  0.7,  0,   0,  0.4,  0,   0,   0,  0.5,  0,   0,   0,   0,  0.6,  0  ],
        [0,   0,   0,   0,   0,   0,  0.4,  0,   0,   0,   0,   0,   0,  0.5,  0,  0.3],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
      ],
    ],
    velMin: 92, velMax: 127, ghostVelMax: 55,
  },

  HipHop: {
    variants: [
      // V1 — laid-back kick, hard 2&4
      [
        [1,   0,   0,  0.4,  0,   0,  0.7,  0,   0,  0.5,  0,   0,   0,   0,  0.4,  0  ],
        [0,   0,   0,   0,  'A',  0,   0,  0.3,  0,   0,   0,   0,  'A',  0,   0,  0.4],
        [1,   0,   1,   0,   1,   0,   1,   0,   1,   0,   1,   0,   1,   0,   1,   1  ],
        [0,   0,   0,   0,   0,   0,   0,  0.6,  0,   0,   0,   0,   0,   0,   0,  0.4],
        [0,   0,   0,   0,   1,   0,   0,   0,   0,   0,   0,   0,   1,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,  0.5,  0,   0,   0,   0,  0.4,  0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
      ],
      // V2 — Boom-bap, heavy snare fill
      [
        [1,   0,   0,   0,   0,  0.5,  0,   0,  0.7,  0,  0.4,  0,   0,   0,   0,  0.5],
        [0,   0,   0,  0.4, 'A',  0,  0.3,  0,   0,   0,   0,   0,  'A',  0,  0.4,  0  ],
        [1,   0,   1,   0,   1,   0,   1,   1,   1,   0,   1,   0,   1,   0,   1,   0  ],
        [0,   0,   0,   0,   0,   0,   0,  0.5,  0,   0,   0,   0,   0,   0,   0,   0  ],
        [0,   0,   0,   0,   1,   0,   0,   0,   0,   0,   0,   0,   1,   0,   0,  0.5],
        [0,   0,   0,   0,   0,   0,   0,  0.4,  0,   0,  0.5,  0,   0,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,  0.4],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
      ],
      // V3 — Lo-fi, sparse and swung feel
      [
        [1,   0,   0,   0,   0,   0,  0.6,  0,   0,  0.4,  0,   0,   0,   0,  0.5, 0.3],
        [0,   0,   0,   0,  'A',  0,   0,   0,  0.4,  0,   0,   0,  'A',  0,   0,   0  ],
        [1,   0,  0.6,  0,   1,   0,  0.7,  0,   1,   0,  0.5,  0,   1,   0,  0.7,  1  ],
        [0,   0,   0,   0,   0,   0,   0,  0.7,  0,   0,   0,  0.5,  0,   0,   0,   0  ],
        [0,   0,   0,   0,   1,   0,   0,   0,   0,  0.4,  0,   0,   1,   0,   0,   0  ],
        [0,   0,   0,  0.4,  0,   0,   0,   0,   0,  0.6,  0,   0,   0,   0,   0,  0.5],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
      ],
    ],
    velMin: 62, velMax: 102, ghostVelMax: 40,
  },

  Trap: {
    variants: [
      // V1 — classic sparse kick, triplet HH
      [
        [1,   0,   0,   0,   0,   0,   0,   0,  'A',  0,   0,   0,   0,  0.4,  0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,  'A',  0,   0,  0.4],
        [[1,3],0,[0.7,3],0,[0.9,3],0,[0.7,3],0,[1,3],0,[0.6,3],0,[0.9,3],0,[0.7,3],0],
        [0,   0,   0,   0,   0,   0,   0,  0.5,  0,   0,   0,   0,   0,   0,   0,  0.4],
        [0,   0,   0,   0,   1,   0,   0,   0,   0,   0,   0,   0,   1,   0,   0,  0.4],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
      ],
      // V2 — double kick variation, sparser HH
      [
        [1,   0,   0,  0.6,  0,   0,  0.4,  0,  'A',  0,   0,   0,   0,   0,  0.5,  0  ],
        [0,   0,   0,   0,   0,   0,   0,  0.3,  0,   0,   0,   0,  'A',  0,  0.3,  0  ],
        [[0.9,3],0,0,[0.5,3],0,[0.7,3],0,0,[1,3],0,[0.4,3],0,[0.8,3],0,0,[0.6,3]],
        [0,   0,   0,   0,   0,   0,   0,  0.6,  0,   0,   0,  0.4,  0,   0,   0,  0.5],
        [0,   0,   0,   0,   1,   0,   0,   0,   0,   0,  0.5,  0,   1,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,  0.4,  0,   0,   0,   0,  0.4,  0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
      ],
      // V3 — busy trap, rolling HH with open hits
      [
        ['A',  0,   0,   0,   0,  0.5,  0,   0,   1,   0,  0.6,  0,   0,   0,  0.4,  0  ],
        [0,   0,   0,   0,  0.4,  0,  0.3,  0,   0,   0,   0,   0,  'A',  0,   0,  0.5],
        [[1,3],0,[1,3],0,[0.8,3],0,[0.9,3],0,[1,3],0,[0.7,3],0,[1,3],[0.5,3],[0.8,3],0],
        [0,   0,   0,  0.4,  0,   0,   0,   0,   0,   0,   0,  0.6,  0,   0,   0,   1  ],
        [0,   0,   0,   0,   1,   0,   0,  0.3,  0,   0,   0,   0,   1,   0,   0,  0.4],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,  0.5,  0,   0,   0,   0,  0.5,  0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,  0.4],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
      ],
    ],
    velMin: 72, velMax: 127, ghostVelMax: 45,
  },

  Funk: {
    variants: [
      // V1 — 16th-note syncopated kick, ghost snare
      [
        [1,   0,  0.5,  1,   0,  0.4,  0,   0,   1,   0,  0.6,  0,   0,  0.4,  1,   0  ],
        [0,  0.3,  0,   0,  'A', 0.3,  0,  0.4,  0,  0.3,  0,   0,  'A', 0.3,  0,  0.4],
        [1,   1,  0.5,  1,   1,   0,   1,   1,   1,   1,  0.5,  1,   1,   0,   1,   1  ],
        [0,   0,   1,   0,   0,   1,   0,   0,   0,   0,   1,   0,   0,   1,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,  0.5,  0,   0,  0.4,  0,   0,   0,   0,   0  ],
        [0,  0.5,  0,   0,   0,   0,   0,  0.5,  0,  0.6,  0,   0,   0,   0,   0,  0.4],
        [0,   0,   0,  0.3,  0,   0,   0,   0,   0,   0,   0,  0.4,  0,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
      ],
      // V2 — heavier kick, sparse CHH
      [
        [1,   0,   0,   1,   0,  0.6,  1,   0,   1,   0,   0,  0.5,  0,   0,   1,  0.4],
        [0,  0.4,  0,  0.3, 'A', 0.3,  0,   0,   0,  0.4,  0,   0,  'A', 0.4,  0,  0.3],
        [1,  0.5,  0,   1,   1,   0,   1,   0,   1,  0.5,  0,   1,   1,   0,   1,   1  ],
        [0,   0,   1,   0,   0,  0.6,  0,  0.4,  0,   0,   1,   0,   0,  0.5,  0,  0.4],
        [0,   0,   0,   0,  0.6,  0,   0,   0,   0,   0,  0.5,  0,   0,   0,   0,  0.4],
        [0,  0.4,  0,   0,   0,   0,  0.5,  0,   0,  0.5,  0,   0,  0.4,  0,   0,  0.5],
        [0,   0,  0.3,  0,   0,   0,   0,   0,   0,   0,  0.4,  0,   0,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
      ],
      // V3 — jazz-funk with swing ghost notes
      [
        [1,   0,  0.3,  0,  0.5,  0,  0.7,  0,   1,   0,  0.4,  1,   0,  0.5,  0,  0.4],
        [0,  0.5,  0,  0.4, 'A', 0.4,  0,  0.3,  0,  0.5,  0,  0.4, 'A', 0.4,  0,  0.4],
        [1,   1,   0,   1,   1,  0.5,  1,   0,   1,   1,   0,   1,   1,  0.5,  1,   0  ],
        [0,   0,  0.7,  0,   0,  0.7,  0,  0.5,  0,   0,  0.6,  0,   0,  0.7,  0,  0.5],
        [0,   0,   0,   0,   0,   0,   0,  0.4,  0,   0,   0,  0.4,  0,   0,   0,  0.3],
        [0,  0.6,  0,  0.3,  0,  0.4,  0,   0,  0.4,  0,   0,  0.5,  0,   0,  0.4,  0  ],
        [0,   0,  0.4,  0,   0,   0,  0.3,  0,   0,  0.4,  0,   0,   0,  0.5,  0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
      ],
    ],
    velMin: 72, velMax: 118, ghostVelMax: 42,
  },

  'Jungle/DnB': {
    variants: [
      // V1 — Amen-inspired 2-step
      [
        [1,   0,   0,   0,   0,   0,   1,   0,   0,   0,   0,   1,   0,   0,  0.6,  0  ],
        [0,   0,   1,   0,   1,   0,   0,   0,   0,   0,   1,   0,   1,   0,   0,   0  ],
        [1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1  ],
        [0,   0,   0,   0,   0,   0,   0,   1,   0,   0,   0,   0,   0,   0,   0,   1  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [0,   0,   0,   0,   0,  0.5,  0,   0,   0,   0,   0,   0,   0,  0.5,  0,   0  ],
        [0,   0,   0,  0.4,  0,   0,   0,  0.4,  0,   0,   0,   0,   0,   0,  0.5,  0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
      ],
      // V2 — rolling kick, snare roll fill
      [
        [1,   0,  0.5,  0,   0,   0,  0.7,  0,  0.4,  0,   0,  0.6,  0,   0,   1,   0  ],
        [0,   0,  0.5,  0,  'A',  0,   0,  0.4,  0,   0,  0.6,  0,   1,   0,   0,  0.5],
        [1,   1,   1,  0.7,  1,   1,   1,   1,   1,   1,   1,  0.8,  1,   1,   1,   1  ],
        [0,   0,   0,   0,   0,   0,   0,   1,   0,   0,   0,   0,   0,   0,   0,   1  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [0,  0.4,  0,   0,   0,  0.6,  0,   0,   0,  0.4,  0,   0,   0,  0.6,  0,   0  ],
        [0,   0,  0.4,  0,   0,   0,  0.5,  0,   0,   0,   0,  0.4,  0,   0,  0.5,  0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
      ],
      // V3 — dark techstep
      [
        [1,   0,   0,  0.5,  0,  0.6,  0,   0,   1,  0.4,  0,   0,  0.7,  0,  0.5,  0  ],
        [0,   0,  0.6,  0,  'A',  0,  0.4,  0,   0,   0,  0.5,  0,   1,  0.3,  0,   0  ],
        [1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1  ],
        [0,   0,   0,   0,   0,   0,   0,  0.7,  0,   0,  0.4,  0,   0,   0,   0,  0.8],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [0,   0,  0.6,  0,   0,  0.4,  0,   0,   0,  0.5,  0,   0,   0,   0,  0.7,  0  ],
        [0,  0.3,  0,   0,   0,   0,  0.5,  0,  0.4,  0,   0,  0.3,  0,  0.5,  0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
      ],
    ],
    velMin: 82, velMax: 127, ghostVelMax: 52,
  },

  Latin: {
    variants: [
      // V1 — son clave-based
      [
        [1,   0,   0,   1,   0,   0,   1,   0,   1,   0,   0,   1,   0,   0,   1,   0  ],
        [0,   0,   0,   0,   1,   0,   0,  0.4,  0,   0,   0,   0,   1,   0,   0,  0.4],
        [1,   0,   1,   1,   0,   1,   1,   0,   1,   0,   1,   1,   0,   1,   1,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   1,   0,   0,   0,   0,   0,   0,   0,   1  ],
        [0,   1,   0,   0,   1,   0,   0,   1,   0,   1,   0,   0,   1,   0,   0,  0.5],
        [1,   0,   0,   1,   0,   1,   0,   0,   1,   0,   0,   1,   0,   1,   0,   0  ],
        [0,   1,   0,   0,   0,   1,   0,   0,   0,   1,   0,   0,   0,   1,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
      ],
      // V2 — rumba clave with more perc activity
      [
        [1,   0,   0,  0.6,  0,   0,   1,   0,   0,   1,   0,   0,   1,   0,  0.5,  0  ],
        [0,   0,   0,  0.3,  1,   0,   0,   0,   0,   0,  0.4,  0,   1,   0,   0,  0.5],
        [1,  0.5,  1,   0,   1,   1,   0,   1,   1,  0.5,  1,   0,   1,   1,   0,   1  ],
        [0,   0,   0,   0,   0,   0,   0,  0.7,  0,   0,   0,  0.5,  0,   0,   0,  0.7],
        [0,   1,   0,   0,   1,   0,   0,   0,   0,   1,   0,  0.5,  1,   0,   0,  0.4],
        [1,   0,   0,   1,   0,   1,   0,  0.5,  1,   0,  0.5,  0,   0,   1,  0.4,  0  ],
        [0,  0.5,  0,  0.4,  0,  0.5,  0,   0,   0,  0.5,  0,  0.4,  0,   0,  0.5,  0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
      ],
      // V3 — afro-Cuban, busy and polyrhythmic
      [
        [1,   0,   0,   1,   0,  0.5,  0,   0,   1,   0,  0.5,  0,   1,  0.4,  0,   0  ],
        [0,   0,  0.4,  0,   1,   0,   0,  0.5,  0,  0.4,  0,   0,   1,   0,  0.4,  0  ],
        [1,   1,   0,   1,   1,   0,   1,   1,   1,   1,   0,   1,   1,   0,   1,   1  ],
        [0,   0,   1,   0,   0,  0.6,  0,   0,   0,   0,   1,   0,   0,  0.5,  0,  0.6],
        [0,   1,   0,  0.5,  0,   1,   0,  0.4,  0,   1,  0.4,  0,   0,   1,   0,  0.4],
        [1,  0.5,  0,   1,  0.4,  0,   1,   0,   1,   0,  0.5,  1,   0,  0.5,  0,   1  ],
        [0,   1,   0,   0,   1,   0,   0,   1,   0,   1,   0,   0,   1,   0,   0,   1  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
      ],
    ],
    velMin: 72, velMax: 112, ghostVelMax: 48,
  },

  Rock: {
    variants: [
      // V1 — straight rock, crash on 1
      [
        [1,   0,   0,   0,  'A',  0,  0.4,  0,   1,   0,   0,   0,  'A',  0,  0.5,  0  ],
        [0,   0,   0,   0,  'A',  0,   0,  0.3,  0,   0,   0,   0,  'A',  0,   0,  0.4],
        [1,   0,   1,   0,   1,   0,   1,   0,   1,   0,   1,   0,   1,   0,   1,   0  ],
        [0,   0,   0,   1,   0,   0,   0,  0.5,  0,   0,   0,   1,   0,   0,   0,  0.5],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,  0.4],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   1  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [1,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
      ],
      // V2 — half-time feel
      [
        [1,   0,   0,  0.5,  0,   0,  0.6,  0,   0,  0.4,  0,   0,   0,   0,  0.5,  0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,  'A',  0,  0.4,  0,   0,  0.4,  0,  0.5],
        [1,   0,   1,   0,   1,   0,   1,   0,   1,   0,   1,   0,   1,   0,   1,   1  ],
        [0,   0,   0,  0.6,  0,   0,   0,   0,   0,   0,   0,  0.7,  0,   0,   0,  0.4],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,  0.5],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   1  ],
        [0,   0,   0,   0,   0,   0,   0,  0.4,  0,   0,   0,   0,   0,  0.5,  0,   0  ],
        [1,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,  0.4],
      ],
      // V3 — driving with tom fills
      [
        ['A',  0,  0.3,  0,  'A',  0,   0,  0.5,  1,   0,  0.4,  0,  'A',  0,  0.6,  0  ],
        [0,   0,   0,  0.3, 'A',  0,  0.4,  0,   0,   0,  0.3,  0,  'A',  0,   0,  0.5],
        [1,   0,   1,   0,   1,   0,   1,   0,   1,   1,   1,   0,   1,   0,   1,   0  ],
        [0,   0,   0,   1,   0,   0,   0,   0,   0,   0,   0,   1,   0,   0,   0,  0.6],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,  0.5],
        [0,   0,   0,   0,   0,   0,   0,  0.5,  0,  0.6,  0,   0,   0,  0.7,  0,   1  ],
        [0,   0,   0,  0.4,  0,   0,   0,   0,   0,   0,  0.5,  0,   0,   0,  0.7,  0  ],
        [1,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,  0.5],
      ],
    ],
    velMin: 88, velMax: 127, ghostVelMax: 58,
  },
}

export const DRUM_STYLE_NAMES = Object.keys(DRUM_STYLES)

function rand() { return Math.random() }
function randInt(min, max) { return min + Math.floor(rand() * (max - min + 1)) }

function resolveStep(v, velMin, velMax, ghostVelMax) {
  // Off
  if (!v && v !== 0) return DEFAULT_DRUM_STEP()
  if (v === 0) return DEFAULT_DRUM_STEP()

  // Always-on core beat
  if (v === 1) {
    return { active: true, velocity: randInt(velMin, velMax), accent: false, ratchet: 1 }
  }
  if (v === 'A') {
    return { active: true, velocity: randInt(velMin, velMax), accent: true, ratchet: 1 }
  }

  // [probability, flag] — flag is 'A' (accent) or 2/3/4 (ratchet)
  if (Array.isArray(v)) {
    const [p, flag] = v
    if (rand() > p) return DEFAULT_DRUM_STEP()
    const isAccent = flag === 'A'
    const ratchet  = typeof flag === 'number' && flag > 1 ? flag : 1
    // Ghost hits (low-probability non-accent steps) get quieter velocity
    const isGhost = p < 0.5 && !isAccent && ratchet === 1
    const vel = isGhost
      ? randInt(20, ghostVelMax)
      : randInt(velMin, velMax)
    return { active: true, velocity: vel, accent: isAccent, ratchet }
  }

  // Plain probability (no flag)
  if (typeof v === 'number' && v < 1) {
    if (rand() > v) return DEFAULT_DRUM_STEP()
    const isGhost = v < 0.5
    const vel = isGhost ? randInt(20, ghostVelMax) : randInt(velMin, velMax)
    return { active: true, velocity: vel, accent: false, ratchet: 1 }
  }

  return DEFAULT_DRUM_STEP()
}

function loadFromLS() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function hydrateTrack(t, label) {
  return {
    label:      t.label      ?? label,
    soundId:    t.soundId    ?? '',
    soundLabel: t.soundLabel ?? '',
    soundUrl:   '',   // always starts empty; component resolves from IDB
    muted:      t.muted      ?? false,
    solo:       t.solo       ?? false,
    volume:     t.volume     ?? 0.85,
    length:     t.length     ?? 16,
    pan:        t.pan        ?? 0,
    pitch:      t.pitch      ?? 0,
    filterFreq: t.filterFreq ?? 20000,
    reverbSend: t.reverbSend ?? 0,
    delaySend:  t.delaySend  ?? 0,
    steps: Array(16).fill(null).map((_, s) => {
      const step = t.steps?.[s]
      if (!step) return DEFAULT_DRUM_STEP()
      return {
        active:   step.active   ?? false,
        velocity: step.velocity ?? 100,
        accent:   step.accent   ?? false,
        ratchet:  step.ratchet  ?? 1,
      }
    }),
  }
}

function mergeLoadedSequences(loaded) {
  const defaults = makeDefaultSequences()
  if (!loaded?.sequences) return defaults
  const merged = {}
  for (const key of ['A', 'B', 'C', 'D', 'E', 'F']) {
    const loadedSeq = loaded.sequences[key]
    if (!Array.isArray(loadedSeq)) { merged[key] = defaults[key]; continue }
    merged[key] = TRACK_LABELS.map((label, i) => {
      const t = loadedSeq[i]
      return t ? hydrateTrack(t, label) : makeTrack(label)
    })
  }
  return merged
}

export const useDrumMachineStore = defineStore('drumMachine', () => {
  const loaded = loadFromLS()
  const sequences = ref(mergeLoadedSequences(loaded))
  const activeSequence = ref(loaded?.activeSequence ?? 'A')

  const currentPattern = computed(() => sequences.value[activeSequence.value])

  const bpm = ref(120)
  const swing = ref(0)
  const isPlaying = ref(false)
  const currentStep = ref(-1)

  const repeaterActive = ref(false)
  const repeaterDivision = ref(2)

  function _serializeSequences() {
    const out = {}
    for (const [seqKey, tracks] of Object.entries(sequences.value)) {
      out[seqKey] = tracks.map(serializeTrack)
    }
    return out
  }

  function _save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        sequences: _serializeSequences(),
        activeSequence: activeSequence.value,
      }))
    } catch {}
  }

  watch(sequences, _save, { deep: true })
  watch(activeSequence, _save)

  function setStep(trackIdx, stepIdx, patch) {
    const step = sequences.value[activeSequence.value][trackIdx].steps[stepIdx]
    Object.assign(step, patch)
  }

  function toggleStep(trackIdx, stepIdx) {
    const step = sequences.value[activeSequence.value][trackIdx].steps[stepIdx]
    step.active = !step.active
  }

  function clearPattern(seqKey) {
    const key = seqKey ?? activeSequence.value
    sequences.value[key] = TRACK_LABELS.map(label => makeTrack(label))
  }

  function initDrumMachine() {
    sequences.value    = makeDefaultSequences()
    activeSequence.value = 'A'
    _save()
  }

  function copyPattern(fromKey, toKey) {
    const src = sequences.value[fromKey]
    sequences.value[toKey] = src.map(track => ({
      ...track,
      steps: track.steps.map(s => ({ ...s })),
    }))
  }

  function swapSequence(key) {
    activeSequence.value = key
  }

  function setTrackSound(trackIdx, { soundId, soundLabel, soundUrl }) {
    const t = sequences.value[activeSequence.value][trackIdx]
    if (soundId    !== undefined) t.soundId    = soundId
    if (soundLabel !== undefined) t.soundLabel = soundLabel
    if (soundUrl   !== undefined) t.soundUrl   = soundUrl
  }

  // Walk back through sequences to find the nearest sound for a slot.
  // B falls back to A, C to B (then A), etc.
  function resolveTrackSound(trackIdx) {
    const order = ['A', 'B', 'C', 'D', 'E', 'F']
    let idx = order.indexOf(activeSequence.value)
    while (idx >= 0) {
      const t = sequences.value[order[idx]][trackIdx]
      if (t.soundId) return { soundId: t.soundId, soundLabel: t.soundLabel, soundUrl: t.soundUrl, own: order[idx] === activeSequence.value }
      idx--
    }
    return { soundId: '', soundLabel: '', soundUrl: '', own: false }
  }

  function setTrackVolume(trackIdx, vol) {
    sequences.value[activeSequence.value][trackIdx].volume = vol
  }

  function setTrackLength(trackIdx, len) {
    sequences.value[activeSequence.value][trackIdx].length = Math.max(1, Math.min(16, len))
  }

  function setTrackFx(trackIdx, field, value) {
    const track = sequences.value[activeSequence.value][trackIdx]
    if (!track) return
    track[field] = value
    _save()
  }

  function toggleTrackMute(trackIdx) {
    const t = sequences.value[activeSequence.value][trackIdx]
    t.muted = !t.muted
  }

  function toggleTrackSolo(trackIdx) {
    const t = sequences.value[activeSequence.value][trackIdx]
    t.solo = !t.solo
  }

  // ── Preset save / load ────────────────────────────────────────────────────
  function _loadPresets() {
    try { return JSON.parse(localStorage.getItem(LS_PRESETS_KEY) || '[]') } catch { return [] }
  }
  function _savePresets(list) {
    try { localStorage.setItem(LS_PRESETS_KEY, JSON.stringify(list)) } catch {}
  }

  const presets = ref(_loadPresets())

  function savePreset(name) {
    const preset = {
      id:             `dm_preset_${Date.now()}`,
      name:           name?.trim() || `Preset ${presets.value.length + 1}`,
      savedAt:        new Date().toISOString(),
      activeSequence: activeSequence.value,
      sequences:      _serializeSequences(),
    }
    presets.value.push(preset)
    _savePresets(presets.value)
    return preset
  }

  function overwritePreset(id) {
    const idx = presets.value.findIndex(p => p.id === id)
    if (idx === -1) return
    presets.value[idx] = {
      ...presets.value[idx],
      savedAt:        new Date().toISOString(),
      activeSequence: activeSequence.value,
      sequences:      _serializeSequences(),
    }
    _savePresets(presets.value)
  }

  function loadPreset(preset) {
    sequences.value    = mergeLoadedSequences(preset)
    activeSequence.value = preset.activeSequence ?? 'A'
    _save()
  }

  function deletePreset(id) {
    presets.value = presets.value.filter(p => p.id !== id)
    _savePresets(presets.value)
  }

  function generateDrumPattern(style) {
    const cfg = DRUM_STYLES[style]
    if (!cfg) return
    const variant = cfg.variants[Math.floor(rand() * cfg.variants.length)]
    const pattern = sequences.value[activeSequence.value]
    variant.forEach((rolePattern, trackIdx) => {
      if (trackIdx >= pattern.length) return
      pattern[trackIdx].steps = rolePattern.map(v =>
        resolveStep(v, cfg.velMin, cfg.velMax, cfg.ghostVelMax)
      )
    })
  }

  function generateDrumPatternRaw(style) {
    const cfg = DRUM_STYLES[style]
    if (!cfg) return null
    const variant = cfg.variants[Math.floor(rand() * cfg.variants.length)]
    return variant.map(rolePattern =>
      rolePattern.map(v => resolveStep(v, cfg.velMin, cfg.velMax, cfg.ghostVelMax))
    )
  }

  function randomizeVelocity(trackIdx, velMin = 70, velMax = 127) {
    const track = sequences.value[activeSequence.value][trackIdx]
    if (!track) return
    track.steps.forEach(step => {
      if (step.active) step.velocity = randInt(velMin, velMax)
    })
  }

  return {
    sequences,
    activeSequence,
    currentPattern,
    bpm,
    swing,
    isPlaying,
    currentStep,
    repeaterActive,
    repeaterDivision,
    DRUM_STYLE_NAMES,
    setStep,
    toggleStep,
    clearPattern,
    initDrumMachine,
    copyPattern,
    swapSequence,
    setTrackSound,
    resolveTrackSound,
    setTrackVolume,
    setTrackLength,
    setTrackFx,
    toggleTrackMute,
    toggleTrackSolo,
    generateDrumPattern,
    generateDrumPatternRaw,
    randomizeVelocity,
    presets,
    savePreset,
    overwritePreset,
    loadPreset,
    deletePreset,
  }
})
