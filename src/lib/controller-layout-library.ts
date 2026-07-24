/**
 * Built-in controller surface templates.
 * Each layout defines pre-positioned ControlItem-compatible objects
 * with correct CC/note numbers for the device.
 */

import type { ControlType } from './midi-controller-presets'

interface ControlTemplate {
  id: string
  type: ControlType
  x: number
  y: number
  w: number
  h: number
  label: string
  color: string
  ccNumber?: number
  noteNumber?: number
  channel?: number
  value: number
}

export interface ControllerLayout {
  label: string
  controls: ControlTemplate[]
}

function uid(): string {
  return Math.random().toString(36).slice(2, 11)
}

// ── Akai MIDI Mix ─────────────────────────────────────────────────────────────
// 8 channels × (3 knobs + 3 buttons + 1 fader) + master fader + bank L/R
// All messages on MIDI channel 1 (0-indexed: 0)
// Knob CCs: ch1-4 base 16,20,24,28 (+0/+1/+2); ch5-8 base 46,50,54,58
// Fader CCs: 19,23,27,31,49,53,57,61; Master: 62
// Button notes: Mute=1,4,7,10…; Solo=2,5,8,11…; Rec=3,6,9,12…; Bank=25,26
function buildMidiMix(): ControlTemplate[] {
  const KNOB_BASE = [16, 20, 24, 28, 46, 50, 54, 58]
  const FADER_CC  = [19, 23, 27, 31, 49, 53, 57, 61]
  const MUTE_NOTE = [1, 4, 7, 10, 13, 16, 19, 22]
  const SOLO_NOTE = [2, 5, 8, 11, 14, 17, 20, 23]
  const REC_NOTE  = [3, 6, 9, 12, 15, 18, 21, 24]

  const COL = 92   // column width per channel
  const X0  = 10   // left padding

  const out: ControlTemplate[] = []

  for (let i = 0; i < 8; i++) {
    const cx   = X0 + i * COL
    const kBase = KNOB_BASE[i]

    // 3 knobs stacked
    out.push(
      { id: uid(), type: 'encoder',      x: cx + 20, y: 10,  w: 50, h: 50, label: `K${i+1}A`, color: '#0891b2', ccNumber: kBase,   channel: 0, value: 0 },
      { id: uid(), type: 'encoder',      x: cx + 20, y: 70,  w: 50, h: 50, label: `K${i+1}B`, color: '#0891b2', ccNumber: kBase+1, channel: 0, value: 0 },
      { id: uid(), type: 'encoder',      x: cx + 20, y: 130, w: 50, h: 50, label: `K${i+1}C`, color: '#0891b2', ccNumber: kBase+2, channel: 0, value: 0 },
    )

    // Mute / Solo / Rec buttons
    out.push(
      { id: uid(), type: 'pad-switch', x: cx + 4,  y: 198, w: 26, h: 22, label: 'M', color: '#7c3aed', noteNumber: MUTE_NOTE[i], channel: 0, value: 0 },
      { id: uid(), type: 'pad-switch', x: cx + 32, y: 198, w: 26, h: 22, label: 'S', color: '#d97706', noteNumber: SOLO_NOTE[i], channel: 0, value: 0 },
      { id: uid(), type: 'pad-switch', x: cx + 60, y: 198, w: 26, h: 22, label: 'R', color: '#dc2626', noteNumber: REC_NOTE[i],  channel: 0, value: 0 },
    )

    // Channel fader
    out.push(
      { id: uid(), type: 'slider', x: cx + 27, y: 232, w: 36, h: 140, label: `Ch${i+1}`, color: '#059669', ccNumber: FADER_CC[i], channel: 0, value: 0 },
    )
  }

  // Master column (9th)
  const mx = X0 + 8 * COL
  out.push(
    { id: uid(), type: 'pad-momentary', x: mx + 10, y: 198, w: 33, h: 22, label: '◀', color: '#1d4ed8', noteNumber: 25, channel: 0, value: 0 },
    { id: uid(), type: 'pad-momentary', x: mx + 47, y: 198, w: 33, h: 22, label: '▶', color: '#1d4ed8', noteNumber: 26, channel: 0, value: 0 },
    { id: uid(), type: 'slider',        x: mx + 27, y: 232, w: 36, h: 140, label: 'Master', color: '#059669', ccNumber: 62, channel: 0, value: 0 },
  )

  return out
}

// ── Novation Launchpad Mini MK1 ───────────────────────────────────────────────
// Top row: CC 104-111 (automap buttons)
// Main 8×8 grid: note = col + row*16 (row 0 = bottom, display top = row 7)
// Scene column (right): note = 8 + row*16 per row
function buildLaunchpadMiniMk1(): ControlTemplate[] {
  const PAD  = 52
  const STEP = 56  // PAD + 4 gap
  const X0   = 10
  const Y0   = 10

  const out: ControlTemplate[] = []

  // Top automap buttons (CC 104-111)
  for (let c = 0; c < 8; c++) {
    out.push({
      id: uid(), type: 'pad-momentary',
      x: X0 + c * STEP, y: Y0,
      w: PAD, h: PAD,
      label: `T${c+1}`, color: '#1d4ed8',
      ccNumber: 104 + c, channel: 0, value: 0,
    })
  }

  // Main 8×8 grid + scene column
  // Display row 0 (top) = note row 0 (notes 0-7), display row 7 (bottom) = note row 7 (112-119)
  for (let dr = 0; dr < 8; dr++) {
    const noteRow = dr
    const cy = Y0 + STEP + dr * STEP

    for (let c = 0; c < 8; c++) {
      out.push({
        id: uid(), type: 'pad-switch',
        x: X0 + c * STEP, y: cy,
        w: PAD, h: PAD,
        label: `${c + noteRow * 16}`,
        color: '#7c3aed',
        noteNumber: c + noteRow * 16, channel: 0, value: 0,
      })
    }

    // Scene button
    out.push({
      id: uid(), type: 'pad-momentary',
      x: X0 + 8 * STEP, y: cy,
      w: PAD, h: PAD,
      label: `S${noteRow + 1}`, color: '#059669',
      noteNumber: 8 + noteRow * 16, channel: 0, value: 0,
    })
  }

  return out
}

// ── Novation Launchkey 49 MK4 ─────────────────────────────────────────────────
// Transport + nav + octave: top-left (MIDI ch 16 = 0-indexed 15)
// 4×4 pad grid: notes 36-51, MIDI ch 10 (0-indexed 9)
// 8 encoders: CC 21-28, ch 1 (0-indexed 0)
// 9 faders: CC 41-49, ch 1 (0-indexed 0) — verify master CC against your device
function buildLaunchkeyMk4(): ControlTemplate[] {
  const CH_DAW = 15  // MIDI channel 16 (0-indexed) — transport/nav
  const CH_PAD = 9   // MIDI channel 10 (0-indexed) — pads

  const out: ControlTemplate[] = []

  // Transport row (top-left)
  const TRANSPORT = [
    { label: '▶ Play', note: 115 },
    { label: '■ Stop', note: 116 },
    { label: '● Rec',  note: 117 },
    { label: '⟳ Loop', note: 118 },
  ]
  TRANSPORT.forEach((t, i) => {
    out.push({
      id: uid(), type: 'pad-momentary',
      x: 10 + (i % 2) * 58, y: 10 + Math.floor(i / 2) * 46,
      w: 52, h: 40,
      label: t.label, color: '#1d4ed8',
      noteNumber: t.note, channel: CH_DAW, value: 0,
    })
  })

  // Nav buttons (directional cross)
  const NY = 112
  out.push(
    { id: uid(), type: 'pad-momentary', x: 38,  y: NY,      w: 40, h: 34, label: '▲',  color: '#4b5563', noteNumber: 106, channel: CH_DAW, value: 0 },
    { id: uid(), type: 'pad-momentary', x: 38,  y: NY + 40, w: 40, h: 34, label: '▼',  color: '#4b5563', noteNumber: 107, channel: CH_DAW, value: 0 },
    { id: uid(), type: 'pad-momentary', x: 10,  y: NY + 20, w: 26, h: 34, label: '◀',  color: '#4b5563', noteNumber: 104, channel: CH_DAW, value: 0 },
    { id: uid(), type: 'pad-momentary', x: 80,  y: NY + 20, w: 26, h: 34, label: '▶',  color: '#4b5563', noteNumber: 105, channel: CH_DAW, value: 0 },
  )

  // Octave buttons
  out.push(
    { id: uid(), type: 'pad-momentary', x: 10, y: 200, w: 52, h: 34, label: 'Oct−', color: '#374151', noteNumber: 109, channel: CH_DAW, value: 0 },
    { id: uid(), type: 'pad-momentary', x: 68, y: 200, w: 52, h: 34, label: 'Oct+', color: '#374151', noteNumber: 110, channel: CH_DAW, value: 0 },
  )

  // 4×4 pad grid (right of controls)
  const PX   = 158
  const PSIZ = 58
  const PGAP = 4
  const PSTP = PSIZ + PGAP  // 62
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const idx = row * 4 + col
      out.push({
        id: uid(), type: 'pad-momentary',
        x: PX + col * PSTP, y: 10 + row * PSTP,
        w: PSIZ, h: PSIZ,
        label: `P${idx + 1}`, color: '#7c3aed',
        noteNumber: 36 + idx, channel: CH_PAD, value: 0,
      })
    }
  }

  // 8 encoders
  for (let i = 0; i < 8; i++) {
    out.push({
      id: uid(), type: 'encoder',
      x: 10 + i * 62, y: 268,
      w: 52, h: 52,
      label: `Enc${i + 1}`, color: '#0891b2',
      ccNumber: 21 + i, channel: 0, value: 0,
    })
  }

  // 9 faders (Ch 1-8: CC 41-48; Master: CC 49)
  const FAD_CCS    = [41, 42, 43, 44, 45, 46, 47, 48, 49]
  const FAD_LABELS = ['Ch1','Ch2','Ch3','Ch4','Ch5','Ch6','Ch7','Ch8','Mst']
  for (let i = 0; i < 9; i++) {
    out.push({
      id: uid(), type: 'slider',
      x: 10 + i * 58, y: 338,
      w: 38, h: 150,
      label: FAD_LABELS[i], color: '#059669',
      ccNumber: FAD_CCS[i], channel: 0, value: 0,
    })
  }

  return out
}

// ── Registry & matcher ────────────────────────────────────────────────────────

const LAYOUTS: { pattern: RegExp; label: string; build: () => ControlTemplate[] }[] = [
  { pattern: /midi\s*mix/i,            label: 'Akai MIDI Mix',           build: buildMidiMix },
  { pattern: /launchpad\s*mini/i, label: 'Novation Launchpad Mini MK1', build: buildLaunchpadMiniMk1 },
  { pattern: /launchkey.*(49.*mk4|mk4.*49)/i, label: 'Novation Launchkey 49 MK4', build: buildLaunchkeyMk4 },
]

export function findLayoutForDevice(deviceName: string): ControllerLayout | null {
  const entry = LAYOUTS.find(l => l.pattern.test(deviceName))
  if (!entry) return null
  return { label: entry.label, controls: entry.build() }
}

export function listKnownDevicePatterns(): string[] {
  return LAYOUTS.map(l => l.label)
}
