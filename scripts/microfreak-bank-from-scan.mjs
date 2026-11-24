#!/usr/bin/env node
// MicroFreak bank list from a bank scan (MIDI Manager › MicroFreak › Scan bank › Export scan).
//
//   node scripts/microfreak-bank-from-scan.mjs docs/notes/microfreak-bank-scan.json
//
// Writes src/data/program_change/microfreak/synth_bank.json and its public/ copy
// with lib/microfreak/sysex.ts bankFromScan (presets numbered as on the synth,
// trailing Init slots left out). Needs Node ≥ 23.6 (it imports the .ts).
import { readFileSync, writeFileSync } from 'node:fs'
import { bankFromScan } from '../src/lib/microfreak/sysex.ts'

const src = process.argv[2]
if (!src) { console.error('usage: microfreak-bank-from-scan.mjs <scan.json>'); process.exit(1) }
const scan = JSON.parse(readFileSync(src, 'utf8'))
if (!Array.isArray(scan) || scan.length === 0 || scan.length > 512) { console.error(`expected 1..512 presets, got ${scan?.length}`); process.exit(1) }

const out = bankFromScan(scan)
if (out.length < scan.length) console.log(`left out ${scan.length - out.length} trailing Init slots (${out.length + 1}..${scan.length})`)
const json = JSON.stringify(out, null, 2) + '\n'
for (const f of ['src/data/program_change/microfreak/synth_bank.json', 'public/data/program_change/microfreak/synth_bank.json']) {
  writeFileSync(f, json)
  console.log(`wrote ${f} (${out.length} presets)`)
}
