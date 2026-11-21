#!/usr/bin/env node
// MicroFreak bank list from a bank scan (MIDI Manager › MicroFreak › Scan bank › Export scan).
//
//   node scripts/microfreak-bank-from-scan.mjs docs/notes/microfreak-bank-scan.json
//
// Writes src/data/program_change/microfreak/synth_bank.json and its public/ copy:
// one entry per preset as read from the synth — name, category, oscillator, and
// `program` = the preset number as on the synth (1..512; the catalog's
// program_base is -1: bank = (program − 1) / 128, PC = (program − 1) % 128).
// The empty slots at the end (named "Init") are left out.
import { readFileSync, writeFileSync } from 'node:fs'

const CATEGORIES = ['Bass', 'Brass', 'Keys', 'Lead', 'Organ', 'Pad', 'Percussion', 'Sequence', 'SFX', 'Strings', 'Template', 'Vocoder']
const OSC_TYPES = {
  1: 'Basic Waves', 2: 'SuperWave', 3: 'Wavetable', 4: 'Harmo', 5: 'KarplusStr', 6: 'V. Analog',
  7: 'Waveshaper', 8: 'Two Op. FM', 9: 'Formant', 10: 'Chords', 11: 'Speech', 12: 'Modal',
  13: 'Noise', 14: 'Vocoder', 15: 'Bass', 16: 'SawX', 17: 'Harm', 18: 'WaveUser',
  19: 'Sample', 20: 'Scan Grains', 21: 'Cloud Grains', 22: 'Hit Grains',
}

const src = process.argv[2]
if (!src) { console.error('usage: microfreak-bank-from-scan.mjs <scan.json>'); process.exit(1) }
const scan = JSON.parse(readFileSync(src, 'utf8'))
if (!Array.isArray(scan) || scan.length === 0 || scan.length > 512) { console.error(`expected 1..512 presets, got ${scan?.length}`); process.exit(1) }

let last = scan.length
while (last > 0 && /^init$/i.test((scan[last - 1].name ?? '').trim())) last--
if (last < scan.length) console.log(`left out ${scan.length - last} trailing Init slots (${last + 1}..${scan.length})`)

const out = scan.slice(0, last).map((r, i) => {
  if (r.preset !== i + 1) throw new Error(`preset ${i + 1} out of order (${r.preset})`)
  if (!r.name) throw new Error(`preset ${r.preset} has no name`)
  const program = i + 1
  const bank = Math.floor(i / 128)
  return {
    category: CATEGORIES[r.category] ?? `#${r.category}`,
    no: r.preset,
    name: r.name,
    osc: r.osc === null ? null : OSC_TYPES[r.osc] ?? `#${r.osc}`,
    msb: bank,
    lsb: 0,
    bank,
    program,
  }
})

const json = JSON.stringify(out, null, 2) + '\n'
for (const f of ['src/data/program_change/microfreak/synth_bank.json', 'public/data/program_change/microfreak/synth_bank.json']) {
  writeFileSync(f, json)
  console.log(`wrote ${f} (${out.length} presets)`)
}
