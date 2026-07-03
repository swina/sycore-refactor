/**
 * Convert FL Studio FPC drum MIDI loops into DrumMachine ImportedPattern format.
 *
 * Usage:
 *   cd sycore && node scripts/convert-midi-loops.mjs
 *
 * The script reads MIDI files from:
 *   /mnt/n/FLStudio Data/FL Studio/Presets/Scores/FPC drumloops/<Category>/
 *
 * And outputs the TypeScript code block ready to paste into
 *   src/data/imported-patterns.ts
 */

import { parseMidi } from 'midi-file'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, basename } from 'path'

// ── GM drum note → track-name mapping ─────────────────────────────
// Key = MIDI note number, value = track name string used in ImportedPattern
const PITCH_TO_TRACK_NAME = {
  35: 'BassDrum', 36: 'BassDrum',
  37: 'RimShot',
  38: 'SnareDrum', 40: 'SnareDrum',
  39: 'Clap',
  41: 'LowTom',
  42: 'ClosedHiHat', 44: 'ClosedHiHat', 60: 'ClosedHiHat', 61: 'ClosedHiHat',
  62: 'ClosedHiHat', 63: 'ClosedHiHat', 64: 'ClosedHiHat', 65: 'ClosedHiHat',
  66: 'ClosedHiHat', 67: 'ClosedHiHat',
  43: 'HighTom', 48: 'HighTom', 50: 'HighTom',
  45: 'MediumTom', 47: 'MediumTom',
  46: 'OpenHiHat',
  49: 'Cymbal', 52: 'Cymbal', 55: 'Cymbal', 57: 'Cymbal',
  51: 'Cymbal',
  53: 'Cymbal',
  54: 'Tambourine', 58: 'Tambourine', 82: 'Tambourine',
  56: 'Cowbell',
  69: 'Cabasa', 70: 'Marcas',
  71: 'Whistle', 72: 'Whistle',
  73: 'Guiro', 74: 'Guiro',
  75: 'Claves', 76: 'HighWoodBlock', 77: 'LowWoodBlock',
  78: 'MuteCuica', 79: 'OpenCuica',
  80: 'MuteTriangle', 81: 'OpenTriangle',
}

// Track names used by imported patterns (in order of SOUND_TO_TRACK_INDEX)
// Anything not in this list is skipped
const VALID_TRACKS = new Set([
  'BassDrum', 'SnareDrum', 'ClosedHiHat', 'OpenHiHat', 'Clap',
  'HighTom', 'MediumTom', 'LowTom', 'Cymbal', 'RimShot', 'Cowbell', 'Tambourine',
])

// ── Helpers ───────────────────────────────────────────────────────

function sanitizeTitle(name) {
  return name
    .replace(/\.mid$/i, '')
    .replace(/^fpc_/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
}

/** Quantize a tick to the nearest step index (16th note). */
function tickToStep(tick, ticksPerBeat) {
  const stepTicks = ticksPerBeat / 4  // 16th note = quarter/4
  return Math.round(tick / stepTicks)
}

// ── Main ──────────────────────────────────────────────────────────

const BASE = '/mnt/n/FLStudio Data/FL Studio/Presets/Scores/FPC drumloops'
const CATEGORIES = readdirSync(BASE).filter(f => {
  const st = statSync(join(BASE, f))
  return st.isDirectory()
})

// We'll accumulate output patterns per category
const output = {}
let skipped = 0

for (const cat of CATEGORIES) {
  const dir = join(BASE, cat)
  const files = readdirSync(dir).filter(f => f.toLowerCase().endsWith('.mid'))
  if (files.length === 0) continue

  output[cat] = []

  for (const file of files.sort()) {
    const fpath = join(dir, file)
    let raw
    try {
      raw = readFileSync(fpath)
    } catch {
      continue
    }

    let midi
    try {
      midi = parseMidi(raw)
    } catch (e) {
      console.warn(`  [SKIP] ${file}: parse error - ${e.message}`)
      skipped++
      continue
    }

    const tpb = midi.header.ticksPerBeat || 96
    const stepTicks = tpb / 4

    // Collect tempo
    let bpm = 120
    // Collect note ons with absolute tick, across all tracks
    const noteOns = []  // { pitch, tick, vel }

    for (const track of midi.tracks) {
      let tick = 0
      for (const e of track) {
        tick += e.deltaTime
        if (e.type === 'setTempo') {
          bpm = 60000000 / e.microsecondsPerBeat
        } else if (e.type === 'noteOn' && e.velocity > 0) {
          const name = PITCH_TO_TRACK_NAME[e.noteNumber]
          if (name && VALID_TRACKS.has(name)) {
            noteOns.push({ pitch: e.noteNumber, tick, vel: e.velocity, name })
          }
        }
      }
    }

    if (noteOns.length === 0) {
      skipped++
      continue
    }

    // Build per-track step maps: step index → max velocity
    const trackSteps = {}
    for (const n of noteOns) {
      const step = tickToStep(n.tick, tpb)
      if (!trackSteps[n.name]) trackSteps[n.name] = {}
      trackSteps[n.name][step] = Math.max(trackSteps[n.name][step] || 0, n.vel)
    }

    // Determine pattern length (trim trailing empty measures)
    let maxStep = 0
    for (const steps of Object.values(trackSteps)) {
      for (const s of Object.keys(steps)) {
        maxStep = Math.max(maxStep, parseInt(s))
      }
    }

    // Round up to the nearest full measure (multiple of 16),
    // but trim the last measure if it's completely empty
    const stepsInBars = Math.ceil((maxStep + 1) / 16) * 16

    // Find the last non-empty step within those bars
    let lastActive = -1
    for (const steps of Object.values(trackSteps)) {
      for (const s of Object.keys(steps)) {
        const si = parseInt(s)
        if (si > lastActive) lastActive = si
      }
    }

    // Trim trailing completely empty quarter (4 steps = 1 beat at the end)
    let trimmedLength = Math.max(16, lastActive + 1)
    // Round up to next 16th boundary for the signature display
    const displayLength = Math.ceil(trimmedLength / 16) * 16

    // Sanitize title
    const title = sanitizeTitle(file)

    // Build tracks array (16 steps per displayed bar)
    const patternTracks = {}
    const stepCount = displayLength

    for (const trackName of [...VALID_TRACKS]) {
      const steps = trackSteps[trackName] || {}
      const arr = []
      for (let s = 0; s < stepCount; s++) {
        const vel = steps[s]
        if (vel && vel > 0) {
          arr.push('Note')
        } else {
          arr.push('Rest')
        }
      }
      // Only include tracks that have at least one hit
      if (arr.some(v => v === 'Note')) {
        patternTracks[trackName] = arr
      }
    }

    const signature = `4/4`
    let bars = stepCount / 16

    const pattern = {
      title,
      signature,
      length: stepCount,
      tracks: patternTracks,
    }

    output[cat].push(pattern)
  }
}

// ── Output TypeScript code ────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n)

console.log('// ── Auto-converted from FL Studio FPC drum loops ──────────────────')
console.log('// Generated by scripts/convert-midi-loops.mjs')
console.log('')
console.log('export const IMPORTED_PATTERNS: Record<string, ImportedPattern[]> = {')

for (const [cat, patterns] of Object.entries(output)) {
  if (patterns.length === 0) continue
  console.log(`  "${cat}": [`)

  for (let i = 0; i < patterns.length; i++) {
    const p = patterns[i]
    const hasComma = i < patterns.length - 1
    console.log(`    {`)
    console.log(`      title:     ${JSON.stringify(p.title)},`)
    console.log(`      signature: ${JSON.stringify(p.signature)},`)
    console.log(`      length:    ${p.length},`)
    console.log(`      tracks: {`)

    const trackNames = Object.keys(p.tracks)
    for (let t = 0; t < trackNames.length; t++) {
      const tn = trackNames[t]
      const steps = p.tracks[tn]
      const stepsStr = steps.map(s => JSON.stringify(s)).join(', ')
      const comma = t < trackNames.length - 1 ? ',' : ''
      console.log(`        ${tn}: [${stepsStr}]${comma}`)
    }

    console.log(`      }`)
    console.log(`    }${hasComma ? ',' : ''}`)
  }

  console.log(`  ],`)
}

console.log('}')
console.log('')
console.log(`// Total patterns: ${Object.values(output).reduce((a, b) => a + b.length, 0)}`)
console.log(`// Skipped: ${skipped}`)