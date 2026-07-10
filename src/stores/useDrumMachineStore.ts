import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useAuthStore } from './useAuthStore'
import { userKey } from '@/lib/userKey'
import type { DrumStep, DrumTrack, SerializedDrumTrack, DrumPreset, DrumKit, DrumStyleName } from '@/types/drum-machine'
import { IMPORTED_PATTERNS, patternToDrumSteps } from '@/data/imported-patterns'

// ── Constants ──────────────────────────────────────────────────────────────

const LS_KEY = 'SYCORE_DRUM_MACHINE_V1'
const LS_PRESETS_KEY = 'SYCORE_DM_PRESETS'
const LS_KITS_KEY = 'SYCORE_DM_KITS'
const LS_CURRENT_KIT_KEY = 'SYCORE_DM_CURRENT_KIT'
const TRACK_LABELS = ['Kick', 'Snare', 'Closed HH', 'Open HH', 'Clap', 'Tom 1', 'Tom 2', 'Cymbal', 'Rim Shot', 'Cowbell', 'Tambourine'] as const

function DEFAULT_DRUM_STEP(): DrumStep {
  return { active: false, velocity: 100, accent: false, ratchet: 1, tie: 0 }
}

function makeTrack(label = ''): DrumTrack {
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
    steps: Array.from({ length: 16 }, () => DEFAULT_DRUM_STEP()),
  }
}

function serializeTrack(t: DrumTrack): SerializedDrumTrack {
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

type DrumSequences = Record<string, DrumTrack[]>

function makeDefaultSequences(): DrumSequences {
  return (['A', 'B', 'C', 'D', 'E', 'F'] as const).reduce((acc, key) => {
    acc[key] = TRACK_LABELS.map(label => makeTrack(label))
    return acc
  }, {} as DrumSequences)
}

// ── Style generation data ──────────────────────────────────────────────────
// Rich style definitions sourced from docs/drum_styles.js.
// Each style has 3 variants; each variant is an 8-track × 16-step matrix.
// Step values: 0 = off, 1 = full hit, <1 = probability-based ghost,
// 'A' = accent, [prob, 'A'] = accent with probability, [prob, ratchetN] = ratchet.

const DRUM_STYLES: Record<string, any> = {
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

  EDM: {
    variants: [
      // V1 — big room 4-on-floor, 16th hats, clap on 2&4
      [
        [1,   0,   0,   0,   1,   0,   0,   0,   1,   0,   0,   0,   1,   0,   0,   0  ],
        [0,   0,   0,   0,  'A',  0,   0,   0,   0,   0,   0,   0,  'A',  0,   0,   0  ],
        [1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1  ],
        [0,   0,   0,   0,   0,   0,   0,  0.7,  0,   0,   0,   0,   0,   0,   0,  0.9],
        [0,   0,   0,   0,   1,   0,   0,   0,   0,   0,   0,   0,   1,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
      ],
      // V2 — syncopated kick, pumping open hats
      [
        [1,   0,   0,  0.5,  1,   0,  0.6,  0,   1,   0,   0,   0,   1,   0,  0.5,  0  ],
        [0,   0,   0,   0,  'A',  0,   0,  0.3,  0,   0,   0,   0,  'A',  0,   0,  0.3],
        [1,  0.7,  1,  0.7,  1,  0.7,  1,  0.7,  1,  0.7,  1,  0.7,  1,  0.7,  1,  0.7],
        [0,   0,   0,   0,   0,   0,   0,   1,   0,   0,   0,   0,   0,   0,   0,   1  ],
        [0,   0,   0,   0,   1,   0,   0,   0,   0,   0,   0,   0,   1,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,  0.4,  0,   0,   0,  0.4,  0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
      ],
      // V3 — festival drop, dense kick and hats
      [
        ['A', 0,  0.6,  0,   1,   0,  0.7,  0,   1,   0,  0.4,  0,   1,   0,  0.6,  0  ],
        [0,   0,   0,   0,  'A',  0,   0,   0,   0,   0,   0,   0,  'A',  0,   0,   0  ],
        [1,   1,  0.6,  1,   1,  0.6,  1,   1,   1,   1,  0.6,  1,   1,  0.6,  1,   1  ],
        [0,   0,   0,   0,   0,   0,   0,   1,   0,   0,   0,   0,   0,   0,   0,   1  ],
        [0,   0,   0,   0,   1,   0,  0.5,  0,   0,   0,   0,   0,   1,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,  0.5,  0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,  0.5,  0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
      ],
    ],
    velMin: 88, velMax: 127, ghostVelMax: 55,
  },

  Pop: {
    variants: [
      // V1 — classic pop backbeat, 8th hats, clap doubling snare
      [
        [1,   0,   0,   0,   0,   0,  0.5,  0,   1,   0,   0,   0,   0,   0,  0.5,  0  ],
        [0,   0,   0,   0,  'A',  0,   0,   0,   0,   0,   0,   0,  'A',  0,   0,   0  ],
        [1,   0,   1,   0,   1,   0,   1,   0,   1,   0,   1,   0,   1,   0,   1,   0  ],
        [0,   0,   0,   0,   0,   0,   0,  0.5,  0,   0,   0,   0,   0,   0,   0,  0.5],
        [0,   0,   0,   0,   1,   0,   0,   0,   0,   0,   0,   0,   1,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
      ],
      // V2 — modern pop, syncopated kick, ghost snare
      [
        [1,   0,   0,  0.5,  0,   0,   1,   0,   1,   0,   0,   0,   0,  0.5,  0,  0.4],
        [0,   0,   0,  0.3, 'A',  0,   0,  0.3,  0,   0,   0,  0.3, 'A',  0,   0,  0.3],
        [1,   0,   1,   0,   1,   0,   1,   0,   1,   0,   1,   0,   1,   0,   1,   0  ],
        [0,   0,   0,   0,   0,   0,   0,  0.6,  0,   0,   0,   0,   0,   0,   0,  0.7],
        [0,   0,   0,   0,   1,   0,   0,   0,   0,   0,   0,   0,   1,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,  0.4,  0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,  0.4,  0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
      ],
      // V3 — anthemic pop, open hats on offbeats, crash on 1
      [
        ['A', 0,   0,   0,   0,  0.4,  0,   0,   1,   0,  0.4,  0,   0,   0,   1,   0  ],
        [0,   0,   0,   0,  'A',  0,   0,   0,   0,   0,   0,   0,  'A',  0,   0,  0.4],
        [1,   0,   1,   0,   1,   0,   1,  0.4,  1,   0,   1,   0,   1,   0,   1,   0  ],
        [0,   0,   0,  0.5,  0,   0,   0,   1,   0,   0,   0,  0.5,  0,   0,   0,  0.8],
        [0,   0,   0,   0,   1,   0,   0,   0,   0,   0,   0,   0,   1,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,  0.5,  0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,  0.5,  0  ],
        [1,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
      ],
    ],
    velMin: 75, velMax: 110, ghostVelMax: 45,
  },

  Jazz: {
    variants: [
      // V1 — straight-ahead swing, ride on 8ths, HH foot on 2&4, sparse comping
      [
        [0.4, 0,   0,   0,   0,   0,  0.3,  0,  0.5,  0,   0,   0,   0,   0,  0.3,  0  ],
        [0,  0.3,  0,   0,   0,  0.4,  0,  0.3,  0,  0.4,  0,   0,  0.5,  0,  0.3,  0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [0,   0,   0,   0,   1,   0,   0,   0,   0,   0,   0,   0,   1,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [1,   0,  0.7,  0,   1,   0,  0.7,  0,   1,   0,  0.7,  0,   1,   0,  0.7,  0  ],
      ],
      // V2 — bebop comping, busier snare, ride with extra skip notes
      [
        [0.5, 0,   0,   0,   0,   0,   0,  0.4,  0.3,  0,   0,   0,  0.5,  0,   0,   0  ],
        [0,  0.4,  0,  0.3,  0,  0.5,  0,   0,  0.4,  0,  0.3,  0,   0,  0.5,  0,  0.4],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [0,   0,   0,   0,   1,   0,   0,   0,   0,   0,   0,   0,   1,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,  0.4,  0,   0,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [1,   0,  0.6,  0,   1,  0.4, 0.7,  0,   1,   0,  0.6,  0,   1,  0.4, 0.7, 0.5],
      ],
      // V3 — jazz fusion, modal feel, active comping with toms
      [
        [0.6, 0,   0,   0,   0,  0.4,  0,   0,   0,   0,  0.5,  0,  0.4,  0,   0,  0.4],
        [0,  0.3,  0,  0.4, 0.5,  0,  0.4,  0,   0,  0.4,  0,  0.3, 0.6,  0,  0.3, 0.4],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [0,   0,   0,   0,   1,   0,   0,   0,   0,   0,   0,   0,   1,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0  ],
        [0,   0,   0,   0,   0,   0,  0.4,  0,   0,   0,   0,   0,   0,  0.5,  0,   0  ],
        [0,   0,   0,   0,   0,   0,   0,   0,  0.4,  0,   0,   0,   0,   0,  0.5,  0  ],
        [1,   0,  0.7, 0.4,  1,   0,  0.6,  0,   1,  0.5, 0.7,  0,   1,   0,  0.5, 0.4],
      ],
    ],
    velMin: 55, velMax: 100, ghostVelMax: 38,
  },
}

export const DRUM_STYLE_NAMES = Object.keys(DRUM_STYLES)

// ── Per-style variation config ─────────────────────────────────────────────
// Controls how much extra randomness is applied AFTER the variant is resolved.
interface StyleVariation {
  ghostSeedChance: number   // inject a ghost note into an empty step
  accentShiftChance: number // convert a normal hit to an accent
  ratchetChance: number     // add ratchet subdivision to a hit
  maxRatchet: number        // max ratchet division (2-4)
  velJitter: number         // ± velocity jitter range
}

const DRUM_STYLE_VARIATION: Record<string, StyleVariation> = {
  House:        { ghostSeedChance: 0.10, accentShiftChance: 0.06, ratchetChance: 0.04, maxRatchet: 2, velJitter: 8  },
  Techno:       { ghostSeedChance: 0.05, accentShiftChance: 0.10, ratchetChance: 0.04, maxRatchet: 2, velJitter: 6  },
  HipHop:       { ghostSeedChance: 0.15, accentShiftChance: 0.08, ratchetChance: 0.06, maxRatchet: 3, velJitter: 12 },
  Trap:         { ghostSeedChance: 0.10, accentShiftChance: 0.12, ratchetChance: 0.15, maxRatchet: 4, velJitter: 10 },
  Funk:         { ghostSeedChance: 0.18, accentShiftChance: 0.10, ratchetChance: 0.08, maxRatchet: 3, velJitter: 14 },
  'Jungle/DnB': { ghostSeedChance: 0.12, accentShiftChance: 0.08, ratchetChance: 0.10, maxRatchet: 3, velJitter: 10 },
  Latin:        { ghostSeedChance: 0.12, accentShiftChance: 0.05, ratchetChance: 0.04, maxRatchet: 2, velJitter: 8  },
  Rock:         { ghostSeedChance: 0.06, accentShiftChance: 0.10, ratchetChance: 0.04, maxRatchet: 2, velJitter: 6  },
  EDM:          { ghostSeedChance: 0.04, accentShiftChance: 0.08, ratchetChance: 0.03, maxRatchet: 2, velJitter: 4  },
  Pop:          { ghostSeedChance: 0.06, accentShiftChance: 0.06, ratchetChance: 0.03, maxRatchet: 2, velJitter: 6  },
  Jazz:         { ghostSeedChance: 0.22, accentShiftChance: 0.05, ratchetChance: 0.04, maxRatchet: 3, velJitter: 15 },
}

// ── Helpers ────────────────────────────────────────────────────────────────

function rand() { return Math.random() }
function randInt(min: number, max: number) { return min + Math.floor(rand() * (max - min + 1)) }

function resolveStep(v: any, velMin: number, velMax: number, ghostVelMax: number): DrumStep {
  if (v === 0) return DEFAULT_DRUM_STEP()
  let active = true, accented = false, ratchetN = 1, probability = 1

  if (Array.isArray(v)) {
    probability = typeof v[0] === 'number' ? v[0] : 1
    if (v[1] === 'A') accented = true
    else if (typeof v[1] === 'number' && v[1] >= 2 && v[1] <= 4) ratchetN = v[1]
  } else if (v === 'A') {
    accented = true
  } else if (typeof v === 'number' && v < 1) {
    probability = v
  }

  if (probability < 1 && rand() > probability) return DEFAULT_DRUM_STEP()

  if (accented) {
    return { active: true, velocity: randInt(velMin, velMax), accent: true, ratchet: 1, tie: 0 }
  }

  if (ratchetN > 1) {
    return { active: true, velocity: randInt(velMin, velMax), accent: false, ratchet: ratchetN, tie: 0 }
  }

  const isGhost = probability < 0.5
  const vel = isGhost ? randInt(20, ghostVelMax) : randInt(velMin, velMax)
  return { active: true, velocity: vel, accent: false, ratchet: 1, tie: 0 }
}

/**
 * Apply style-aware random variation to a resolved 8×16 DrumStep grid.
 * Called after variant resolution to add musical unpredictability:
 *  - Ghost seeds: random ghost notes injected into empty steps
 *  - Accent shifts: normal hits promoted to accents (or accents demoted)
 *  - Ratcheting: subdivision added to some hits
 *  - Velocity jitter: ± perturbation on all velocities
 */
function applyStyleVariation(pattern: DrumStep[][], styleName: string): void {
  const config = DRUM_STYLE_VARIATION[styleName]
  if (!config) return

  pattern.forEach((track, trackIdx) => {
    // Track-type-based multipliers for musical plausibility
    const isKickOrCymbal = trackIdx === 0 || trackIdx === 7
    const isHH           = trackIdx === 2 || trackIdx === 3
    const isSnareOrClap  = trackIdx === 1 || trackIdx === 4

    track.forEach((step) => {
      // ── Inject ghost notes into empty steps ──
      if (!step.active) {
        if (!isKickOrCymbal && rand() < config.ghostSeedChance) {
          step.active   = true
          step.velocity = randInt(15, 40)
          step.accent   = false
          step.ratchet  = 1
        }
        return
      }

      // ── Velocity jitter ──
      if (config.velJitter > 0) {
        const jitter = randInt(-config.velJitter, config.velJitter)
        step.velocity = Math.max(1, Math.min(127, step.velocity + jitter))
      }

      // ── Normal hit → accent (skip HH, they rarely accent) ──
      if (!step.accent && !isHH && rand() < config.accentShiftChance) {
        step.accent  = true
        step.velocity = Math.max(step.velocity, 100)
      }

      // ── Accent → normal hit (demote some accents) ──
      if (step.accent && rand() < 0.15) {
        step.accent = false
      }

      // ── Add ratchet (not on kick/cymbal) ──
      if (step.ratchet <= 1 && !isKickOrCymbal && rand() < config.ratchetChance) {
        step.ratchet = randInt(2, config.maxRatchet)
      }
    })
  })
}

// ── Serialization ──────────────────────────────────────────────────────────

function loadFromLS(): any {
  try {
    const raw = localStorage.getItem(userKey(LS_KEY))
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

function hydrateTrack(t: any, label: string): DrumTrack {
  return {
    label:      t.label      ?? label,
    soundId:    t.soundId    ?? '',
    soundLabel: t.soundLabel ?? '',
    soundUrl:   '',
    muted:      t.muted      ?? false,
    solo:       t.solo       ?? false,
    volume:     t.volume     ?? 0.85,
    length:     t.length     ?? 16,
    pan:        t.pan        ?? 0,
    pitch:      t.pitch      ?? 0,
    filterFreq: t.filterFreq ?? 20000,
    reverbSend: t.reverbSend ?? 0,
    delaySend:  t.delaySend  ?? 0,
    steps: Array.from({ length: 16 }, (_, s) => {
      const step = t.steps?.[s]
      if (!step) return DEFAULT_DRUM_STEP()
      return {
        active:   step.active   ?? false,
        velocity: step.velocity ?? 100,
        accent:   step.accent   ?? false,
        ratchet:  step.ratchet  ?? 1,
        tie:      step.tie      ?? 0,
        note:     step.note     ?? undefined,
      }
    }),
  }
}

function mergeLoadedSequences(loaded: any): DrumSequences {
  const defaults = makeDefaultSequences()
  if (!loaded?.sequences) return defaults
  const merged: DrumSequences = {}
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

// ── Store ──────────────────────────────────────────────────────────────────

export const useDrumMachineStore = defineStore('drumMachine', () => {
  const authStore = useAuthStore()
  const uid = computed(() => authStore.user?.uid)

  const bpm = ref(120)
  const swing = ref(0)
  const isPlaying = ref(false)
  const currentStep = ref(-1)
  const repeaterActive = ref(false)
  const repeaterDivision = ref(2)

  const loaded = loadFromLS()
  const sequences = ref<DrumSequences>(
    loaded ? mergeLoadedSequences(loaded) : makeDefaultSequences()
  )
  const activeSequence = ref<string>(loaded?.activeSequence ?? 'A')

  const currentPattern = computed(() => sequences.value[activeSequence.value] ?? [])

  // ── Bassline state ─────────────────────────────────────────────────────
  const BASSLINE_SLOT_LABELS = ['Cymbal', 'Cowbell', 'Tambourine']
  const NUM_BASSLINE_VOICES = 3

  function makeBasslineTrack(idx = 0): DrumTrack {
    return {
      label: BASSLINE_SLOT_LABELS[idx] ?? `Bass ${idx + 1}`,
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
      steps: Array.from({ length: 16 }, () => ({ ...DEFAULT_DRUM_STEP(), note: undefined })),
    }
  }

  function makeDefaultBasslineSequences(): Record<string, DrumTrack[]> {
    return (['A', 'B', 'C', 'D', 'E', 'F'] as const).reduce((acc, key) => {
      acc[key] = Array.from({ length: NUM_BASSLINE_VOICES }, (_, i) => makeBasslineTrack(i))
      return acc
    }, {} as Record<string, DrumTrack[]>)
  }

  function mergeLoadedBassline(loaded: any): Record<string, DrumTrack[]> {
    const defaults = makeDefaultBasslineSequences()
    if (!loaded?.basslineSequences) return defaults
    const merged: Record<string, DrumTrack[]> = {}
    for (const key of ['A', 'B', 'C', 'D', 'E', 'F']) {
      const loadedSeq = loaded.basslineSequences[key]
      if (!Array.isArray(loadedSeq)) { merged[key] = defaults[key]; continue }
      merged[key] = Array.from({ length: NUM_BASSLINE_VOICES }, (_, i) => {
        const t = loadedSeq[i]
        return t ? hydrateTrack(t, BASSLINE_SLOT_LABELS[i]) : makeBasslineTrack(i)
      })
    }
    return merged
  }

  const basslineEnabled = ref(loaded?.basslineEnabled ?? false)
  const basslineSourceSlots = ref<number[]>(loaded?.basslineSourceSlots ?? [8, 9, 10])
  const basslineActive = ref(loaded?.basslineActive ?? true)
  const basslineSequences = ref<Record<string, DrumTrack[]>>(
    loaded ? mergeLoadedBassline(loaded) : makeDefaultBasslineSequences()
  )
  const currentBasslinePattern = computed(() => basslineSequences.value[activeSequence.value] ?? [])

  function toggleBasslineVoiceMute(voiceIdx: number) {
    const t = basslineSequences.value[activeSequence.value]?.[voiceIdx]
    if (t) t.muted = !t.muted
    const drumIdx = basslineSourceSlots.value[voiceIdx]
    if (drumIdx != null) {
      const dt = sequences.value[activeSequence.value]?.[drumIdx]
      if (dt) dt.muted = t?.muted ?? false
    }
  }

  function toggleBasslineVoiceSolo(voiceIdx: number) {
    const t = basslineSequences.value[activeSequence.value]?.[voiceIdx]
    if (t) t.solo = !t.solo
    const drumIdx = basslineSourceSlots.value[voiceIdx]
    if (drumIdx != null) {
      const dt = sequences.value[activeSequence.value]?.[drumIdx]
      if (dt) dt.solo = t?.solo ?? false
    }
  }

  function setBasslineStep(voiceIdx: number, stepIdx: number, patch: Partial<DrumStep>) {
    const step = basslineSequences.value[activeSequence.value]?.[voiceIdx]?.steps[stepIdx]
    if (step) Object.assign(step, patch)
  }

  function toggleBasslineStep(voiceIdx: number, stepIdx: number) {
    const step = basslineSequences.value[activeSequence.value]?.[voiceIdx]?.steps[stepIdx]
    if (!step) return
    step.active = !step.active
    if (step.active) {
      if (!step.note) step.note = 36
      if (step.velocity <= 0) step.velocity = 80
    }
  }

  function setBasslineNote(voiceIdx: number, stepIdx: number, note: number) {
    const step = basslineSequences.value[activeSequence.value]?.[voiceIdx]?.steps[stepIdx]
    if (step) { step.note = Math.max(24, Math.min(60, note)); step.active = true }
  }

  function setBasslineVoicePitch(voiceIdx: number, pitch: number) {
    const t = basslineSequences.value[activeSequence.value]?.[voiceIdx]
    if (t) t.pitch = Math.max(0, Math.min(24, pitch))
  }

  function setBasslineVoiceFilter(voiceIdx: number, freq: number) {
    const t = basslineSequences.value[activeSequence.value]?.[voiceIdx]
    if (t) t.filterFreq = Math.max(20, Math.min(20000, freq))
  }

  function setBasslineVoiceVolume(voiceIdx: number, vol: number) {
    const t = basslineSequences.value[activeSequence.value]?.[voiceIdx]
    if (t) t.volume = Math.max(0, Math.min(1, vol))
  }

  function setBasslineVoiceLength(voiceIdx: number, len: number) {
    const t = basslineSequences.value[activeSequence.value]?.[voiceIdx]
    if (t) t.length = Math.max(1, Math.min(16, len))
  }

  // ── Bassline generation ────────────────────────────────────────────────
  function generateBassline(rootNote = 24) {
    const pattern = basslineSequences.value[activeSequence.value]
    if (!pattern) return
    const r = Math.random
    const rnd = (lo, hi) => Math.floor(r() * (hi - lo + 1)) + lo
    const pick = (...args) => args[Math.floor(r() * args.length)]
    const root = Math.max(12, Math.min(60, rootNote))
    const fifth = root + 7
    const octave = root + 12

    pattern.forEach((voice, vi) => {
      voice.steps = Array.from({ length: 16 }, (_, s) => {
        const vel = rnd(72, 110)
        const accent = r() > 0.85
        if (vi === 0) {
          // Voice 1: root on 1, fifth variation, octave walks
          if (s % 4 === 0) return { active: true, velocity: rnd(90, 115), accent: true, ratchet: 1, tie: 0, note: root }
          if (s === 6 || s === 14) return { active: true, velocity: vel, accent, ratchet: 1, tie: 0, note: fifth }
          if (s === 10) return { active: true, velocity: vel, accent, ratchet: 1, tie: 0, note: octave }
          if (r() > 0.6 && (s === 3 || s === 7 || s === 11 || s === 15))
            return { active: true, velocity: rnd(60, 85), accent: false, ratchet: 1, tie: 0, note: pick(root, fifth) }
          return { active: false, velocity: 100, accent: false, ratchet: 1, tie: 0 }
        } else if (vi === 1) {
          // Voice 2: offbeat root, syncopated
          if (s % 4 === 2) return { active: true, velocity: vel, accent, ratchet: 1, tie: 0, note: root }
          if (s === 5 || s === 13) return { active: true, velocity: rnd(65, 90), accent: false, ratchet: 1, tie: 0, note: fifth }
          if (r() > 0.7 && s > 8)
            return { active: true, velocity: rnd(55, 80), accent: false, ratchet: 1, tie: 0, note: pick(root, octave) }
          return { active: false, velocity: 100, accent: false, ratchet: 1, tie: 0 }
        } else {
          // Voice 3: ghost notes, rhythmic variation
          if (s % 8 === 3 || s % 8 === 7) return { active: true, velocity: rnd(50, 75), accent: false, ratchet: 1, tie: 0, note: pick(root, fifth) }
          if (r() > 0.75) return { active: true, velocity: rnd(40, 65), accent: false, ratchet: 1, tie: 0, note: pick(root, octave) }
          return { active: false, velocity: 100, accent: false, ratchet: 1, tie: 0 }
        }
      })
    })
  }

  function _serializeSequences(): Record<string, SerializedDrumTrack[]> {
    const out: Record<string, SerializedDrumTrack[]> = {}
    for (const [seqKey, tracks] of Object.entries(sequences.value)) {
      out[seqKey] = tracks.map(serializeTrack)
    }
    return out
  }

  function _serializeBassline(): Record<string, SerializedDrumTrack[]> {
    const out: Record<string, SerializedDrumTrack[]> = {}
    for (const [seqKey, tracks] of Object.entries(basslineSequences.value)) {
      out[seqKey] = tracks.map(serializeTrack)
    }
    return out
  }

  function _save() {
    try {
      localStorage.setItem(userKey(LS_KEY), JSON.stringify({
        sequences: _serializeSequences(),
        activeSequence: activeSequence.value,
        basslineEnabled: basslineEnabled.value,
        basslineSourceSlots: basslineSourceSlots.value,
        basslineActive: basslineActive.value,
        basslineSequences: _serializeBassline(),
      }))
    } catch {}
  }

  watch(sequences, _save, { deep: true })
  watch(activeSequence, _save)
  watch(basslineSequences, _save, { deep: true })
  watch([basslineEnabled, basslineSourceSlots, basslineActive], _save, { deep: true })

  function setStep(trackIdx: number, stepIdx: number, patch: Partial<DrumStep>) {
    const step = sequences.value[activeSequence.value]?.[trackIdx]?.steps[stepIdx]
    if (step) Object.assign(step, patch)
  }

  function toggleStep(trackIdx: number, stepIdx: number) {
    const step = sequences.value[activeSequence.value]?.[trackIdx]?.steps[stepIdx]
    if (!step) return
    step.active = !step.active
    if (step.active && step.velocity <= 0) step.velocity = 60
  }

  function clearPattern(seqKey?: string) {
    const key = seqKey ?? activeSequence.value
    sequences.value[key] = TRACK_LABELS.map(label => makeTrack(label)) as any
  }

  function initDrumMachine() {
    sequences.value = makeDefaultSequences()
    activeSequence.value = 'A'
    _save()
  }

  function copyPattern(fromKey: string, toKey: string) {
    const src = sequences.value[fromKey]
    if (!src) return
    sequences.value[toKey] = src.map(track => ({
      ...track,
      steps: track.steps.map(s => ({ ...s })),
    })) as any
  }

  function copySounds(fromKey: string, toKey: string) {
    const src = sequences.value[fromKey]
    const dst = sequences.value[toKey]
    if (!src || !dst) return
    for (let i = 0; i < Math.min(src.length, dst.length); i++) {
      dst[i].soundId    = src[i].soundId
      dst[i].soundLabel = src[i].soundLabel
      dst[i].soundUrl   = src[i].soundUrl
    }
  }

  function swapSequence(key: string) {
    activeSequence.value = key
  }

  function setTrackSound(trackIdx: number, sound: { soundId?: string; soundLabel?: string; soundUrl?: string }) {
    const t = sequences.value[activeSequence.value]?.[trackIdx]
    if (!t) return
    if (sound.soundId !== undefined) t.soundId = sound.soundId
    if (sound.soundLabel !== undefined) t.soundLabel = sound.soundLabel
    if (sound.soundUrl !== undefined) t.soundUrl = sound.soundUrl
  }

  function resolveTrackSound(trackIdx: number) {
    const order = ['A', 'B', 'C', 'D', 'E', 'F']
    let idx = order.indexOf(activeSequence.value)
    while (idx >= 0) {
      const t = sequences.value[order[idx]]?.[trackIdx]
      if (t?.soundId) return {
        soundId: t.soundId,
        soundLabel: t.soundLabel,
        soundUrl: t.soundUrl ?? '',
        own: order[idx] === activeSequence.value,
      }
      idx--
    }
    return undefined
  }

  function setTrackVolume(trackIdx: number, vol: number) {
    const t = sequences.value[activeSequence.value]?.[trackIdx]
    if (t) t.volume = vol
  }

  function setTrackLength(trackIdx: number, len: number) {
    const t = sequences.value[activeSequence.value]?.[trackIdx]
    if (t) t.length = Math.max(1, Math.min(16, len))
  }

  function setTrackFx(trackIdx: number, field: string, value: any) {
    const track = sequences.value[activeSequence.value]?.[trackIdx]
    if (!track) return
    ;(track as any)[field] = value
    _save()
  }

  function pasteTrackFx(trackIdx: number, targetSequence: string, fx: Partial<DrumTrack>) {
    const track = sequences.value[targetSequence]?.[trackIdx]
    if (!track) return
    track.pan        = fx.pan        ?? 0
    track.pitch      = fx.pitch      ?? 0
    track.filterFreq = fx.filterFreq ?? 20000
    track.reverbSend = fx.reverbSend ?? 0
    track.delaySend  = fx.delaySend  ?? 0
    _save()
  }

  function toggleTrackMute(trackIdx: number) {
    const t = sequences.value[activeSequence.value]?.[trackIdx]
    if (t) t.muted = !t.muted
  }

  function toggleTrackSolo(trackIdx: number) {
    const t = sequences.value[activeSequence.value]?.[trackIdx]
    if (t) t.solo = !t.solo
  }

  // ── Presets ──────────────────────────────────────────────────────────────

  function _loadPresets(): DrumPreset[] {
    try { return JSON.parse(localStorage.getItem(userKey(LS_PRESETS_KEY)) || '[]') } catch { return [] }
  }

  function _savePresets(list: DrumPreset[]) {
    try { localStorage.setItem(userKey(LS_PRESETS_KEY), JSON.stringify(list)) } catch {}
  }

  const presets = ref<DrumPreset[]>(_loadPresets())

  function savePreset(name: string, extra: Record<string, any> = {}): DrumPreset {
    const preset: DrumPreset = {
      id:             `dm_preset_${Date.now()}`,
      name:           name?.trim() || `Preset ${presets.value.length + 1}`,
      savedAt:        new Date().toISOString(),
      activeSequence: activeSequence.value,
      sequences:      _serializeSequences(),
      ...extra,
    }
    presets.value.push(preset)
    _savePresets(presets.value)
    return preset
  }

  function overwritePreset(id: string, extra: Record<string, any> = {}) {
    const idx = presets.value.findIndex(p => p.id === id)
    if (idx === -1) return
    presets.value[idx] = {
      ...presets.value[idx],
      savedAt:        new Date().toISOString(),
      activeSequence: activeSequence.value,
      sequences:      _serializeSequences(),
      ...extra,
    } as DrumPreset
    _savePresets(presets.value)
  }

  const currentPresetName = ref('')

  function loadPreset(preset: DrumPreset) {
    sequences.value      = mergeLoadedSequences(preset)
    activeSequence.value = preset.activeSequence ?? 'A'
    currentPresetName.value = preset.name ?? ''
    // Restore bassline if present in preset
    if ((preset as any).basslineSequences) {
      basslineSequences.value = mergeLoadedBassline(preset)
    }
    if ((preset as any).basslineEnabled != null) {
      basslineEnabled.value = (preset as any).basslineEnabled
    }
    if ((preset as any).basslineSourceSlots) {
      basslineSourceSlots.value = (preset as any).basslineSourceSlots
    }
    _save()
  }

  function deletePreset(id: string) {
    presets.value = presets.value.filter(p => p.id !== id)
    _savePresets(presets.value)
  }

  // ── Drum Kits ────────────────────────────────────────────────────────────

  const drumKits = ref<DrumKit[]>(_loadDrumKits())
  const currentKitName = ref(_loadCurrentKitName())

  function _loadCurrentKitName(): string {
    try { return localStorage.getItem(userKey(LS_CURRENT_KIT_KEY)) || '' } catch { return '' }
  }

  function _saveCurrentKitName(name: string) {
    try { localStorage.setItem(userKey(LS_CURRENT_KIT_KEY), name) } catch {}
  }

  function _loadDrumKits(): DrumKit[] {
    try { return JSON.parse(localStorage.getItem(userKey(LS_KITS_KEY)) || '[]') } catch { return [] }
  }

  function _saveDrumKits() {
    try { localStorage.setItem(userKey(LS_KITS_KEY), JSON.stringify(drumKits.value)) } catch {}
  }

  function saveDrumKit(name: string) {
    const sounds = TRACK_LABELS.map((_, i) => {
      const resolved = resolveTrackSound(i)
      return {
        soundId: resolved?.soundId ?? '',
        soundLabel: resolved?.soundLabel ?? '',
      }
    })
    const kit: DrumKit = {
      id:   `dm_kit_${Date.now()}`,
      name: name?.trim() || `Kit ${drumKits.value.length + 1}`,
      savedAt: new Date().toISOString(),
      sounds,
    }
    drumKits.value.push(kit)
    _saveDrumKits()
    currentKitName.value = kit.name
    _saveCurrentKitName(kit.name)
    return kit
  }

  function deleteDrumKit(id: string) {
    drumKits.value = drumKits.value.filter(k => k.id !== id)
    _saveDrumKits()
  }

  function overwriteDrumKit(id: string) {
    const idx = drumKits.value.findIndex(k => k.id === id)
    if (idx === -1) return
    const sounds = TRACK_LABELS.map((_, i) => {
      const resolved = resolveTrackSound(i)
      return {
        soundId: resolved?.soundId ?? '',
        soundLabel: resolved?.soundLabel ?? '',
      }
    })
    drumKits.value[idx] = {
      ...drumKits.value[idx],
      savedAt: new Date().toISOString(),
      sounds,
    }
    _saveDrumKits()
    currentKitName.value = drumKits.value[idx].name
    _saveCurrentKitName(drumKits.value[idx].name)
  }

  function applyDrumKit(id: string) {
    const kit = drumKits.value.find(k => k.id === id)
    if (!kit) return
    const seq = sequences.value[activeSequence.value]
    if (!seq) return
    kit.sounds.forEach((s, i) => {
      if (seq[i]) {
        seq[i].soundId    = s.soundId
        seq[i].soundLabel = s.soundLabel
        seq[i].soundUrl   = '' // will be resolved by resolveTrackSound / restoreSample
      }
    })
    _save()
    currentKitName.value = kit.name
    _saveCurrentKitName(kit.name)
  }

  function generateDrumPattern(style: DrumStyleName) {
    const cfg = DRUM_STYLES[style]
    if (!cfg) return
    const variant = cfg.variants[Math.floor(rand() * cfg.variants.length)]
    const pattern = sequences.value[activeSequence.value]
    if (!pattern) return
    variant.forEach((rolePattern: any[], trackIdx: number) => {
      if (trackIdx >= pattern.length) return
      pattern[trackIdx].steps = rolePattern.map((v: any) =>
        resolveStep(v, cfg.velMin, cfg.velMax, cfg.ghostVelMax)
      )
    })
    // Add style-aware variation on top of the resolved variant
    applyStyleVariation(pattern.map(t => t.steps), style)
  }

  /** Returns a raw 8×16 DrumStep array for a style (no sequence mutation). Used for fill patterns. */
  function generateDrumPatternRaw(style: DrumStyleName): DrumStep[][] | null {
    const cfg = DRUM_STYLES[style]
    if (!cfg) return null
    const variant = cfg.variants[Math.floor(rand() * cfg.variants.length)]
    const result = variant.map((rolePattern: any[]) =>
      rolePattern.map((v: any) =>
        resolveStep(v, cfg.velMin, cfg.velMax, cfg.ghostVelMax)
      )
    )
    // Add style-aware variation before returning
    applyStyleVariation(result, style)
    return result
  }

  // ── Euclidean algorithm ────────────────────────────────────────────────
  function getEuclidPattern(steps: number, pulses: number): number[] {
    const s = Math.max(1, Math.min(64, steps))
    const p = Math.max(0, Math.min(s, pulses))
    const cacheKey = `${s}_${p}`
    const cache: Record<string, number[]> = {}
    if (cache[cacheKey]) return cache[cacheKey].slice()

    // Bjorklund algorithm
    let first: number[][] = Array.from({ length: p }, () => [1])
    let second: number[][] = Array.from({ length: s - p }, () => [0])

    while (second.length > 1) {
      const merged: number[][] = []
      const minLen = Math.min(first.length, second.length)
      for (let i = 0; i < minLen; i++) {
        merged.push([...first[i], ...second[i]])
      }
      if (first.length > minLen) {
        second = first.slice(minLen)
        first = merged
      } else if (second.length > minLen) {
        second = second.slice(minLen)
        first = merged
      } else {
        first = merged
        second = []
      }
    }

    const result = [...first.flat(), ...second.flat()]
    cache[cacheKey] = result
    return result
  }

  function rotatePattern(pattern: number[], offset: number): number[] {
    const len = pattern.length
    if (len === 0) return pattern
    const rot = ((offset % len) + len) % len
    return [...pattern.slice(rot), ...pattern.slice(0, rot)]
  }

  /** Generate a Euclidean rhythm pattern and apply it to selected tracks. */
  function generateEuclideanPattern(
    steps: number,
    pulses: number,
    rotation: number,
    trackIndices: number[],
    velocity: number,
    accent: boolean,
  ) {
    const seq = sequences.value[activeSequence.value]
    if (!seq) return

    trackIndices.forEach((trackIdx) => {
      const track = seq[trackIdx]
      if (!track) return
      // Each track gets its own pulse count + rotation so patterns differ per instrument
      const offset = (rotation + trackIdx * 7 + 3) % steps
      const density = Math.max(0.15, Math.min(1, pulses / steps))
      const jitter = 0.3 + rand() * 0.5
      const trackPulses = Math.max(1, Math.min(steps, Math.round(steps * density * jitter)))
      const trackRotation = Math.floor(rand() * steps)
      const pattern = rotatePattern(getEuclidPattern(steps, trackPulses), trackRotation)
      track.steps = pattern.map((active) => ({
        active: !!active,
        velocity: active ? Math.min(127, velocity + randInt(-5, 5)) : 100,
        accent: active ? accent : false,
        ratchet: 1,
        tie: 0,
      }))
    })
  }

  /** Load an imported pattern from the DrumMachinePatterns collections into the active sequence. */
  function loadImportedPattern(categoryName: string, patternIndex: number) {
    const cat = IMPORTED_PATTERNS[categoryName]
    if (!cat) return
    const pattern = cat[patternIndex]
    if (!pattern) return
    const steps = patternToDrumSteps(pattern)
    const seq = sequences.value[activeSequence.value]
    if (!seq) return
    for (let t = 0; t < Math.min(steps.length, seq.length); t++) {
      const track = seq[t]
      const patternSteps = steps[t]
      if (!track || !patternSteps) continue
      track.steps = patternSteps.map(s => ({ ...s }))
    }
  }

  // ── Auth watcher ─────────────────────────────────────────────────────────
  watch(uid, (newUid) => {
    if (!newUid) {
      sequences.value = makeDefaultSequences()
      activeSequence.value = 'A'
    } else {
      const l = loadFromLS()
      sequences.value = l ? mergeLoadedSequences(l) : makeDefaultSequences()
      activeSequence.value = l?.activeSequence ?? 'A'
    }
  })

  return {
    bpm, swing, isPlaying, currentStep, repeaterActive, repeaterDivision,
    sequences, activeSequence, currentPattern,
    TRACK_LABELS, DRUM_STYLES, DRUM_STYLE_NAMES,
    setStep, toggleStep, clearPattern, initDrumMachine,
    copyPattern, copySounds, swapSequence,
    setTrackSound, resolveTrackSound, setTrackVolume, setTrackLength, setTrackFx,
    pasteTrackFx, toggleTrackMute, toggleTrackSolo,
    presets, currentPresetName,
    savePreset, overwritePreset, loadPreset, deletePreset,
    drumKits, saveDrumKit, overwriteDrumKit, deleteDrumKit, applyDrumKit,
    currentKitName,
    generateDrumPattern,
    generateDrumPatternRaw,
    generateEuclideanPattern,
    IMPORTED_PATTERNS,
    loadImportedPattern,
    // Bassline
    basslineEnabled, basslineSourceSlots, basslineActive,
    basslineSequences, currentBasslinePattern,
    BASSLINE_SLOT_LABELS, NUM_BASSLINE_VOICES,
    toggleBasslineVoiceMute,
    toggleBasslineVoiceSolo,
    setBasslineStep, toggleBasslineStep, setBasslineNote,
    setBasslineVoiceFilter, setBasslineVoicePitch, setBasslineVoiceVolume, setBasslineVoiceLength,
    generateBassline,
  }
})