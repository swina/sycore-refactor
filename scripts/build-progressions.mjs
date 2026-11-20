#!/usr/bin/env node
/**
 * build-progressions.mjs — the Chord Prog's progression libraries from the free-midi-chords
 * release (MIT, © Ludovic Drolez — https://github.com/ldrolez/free-midi-chords).
 *
 *   gh release download -R ldrolez/free-midi-chords -p 'free-midi-progressions-*.zip'
 *   unzip free-midi-progressions-*.zip -d fmc
 *   node scripts/build-progressions.mjs fmc
 *
 * Reads the base-style MIDI files (fmc/Major, fmc/Minor, fmc/Modal; the "… style" folders are the
 * same chords in other rhythms) and writes src/data/progressions/:
 *   - 01…12-<Major>-<minor>.json: the key's major progressions ("C Hopeful Romantic · I V vi IV")
 *     and its relative minor's ("Am Dark Nostalgic · i VI III VII");
 *   - ModalChords.json: the modal ones on every root ("A Mysterious Dark · bIIM ivm biii im").
 * Each entry: name → [[numeral, [notes…]], …] (useProgressionLoader's format A: the chord's name
 * comes from its notes). The mood words lead the name: Generate's styles pick by them.
 */
import fs from 'node:fs'
import path from 'node:path'

const src = process.argv[2]
if (!src) { console.error('usage: node scripts/build-progressions.mjs <unzipped free-midi-progressions dir>'); process.exit(1) }
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src/data/progressions')

// ── a minimal SMF reader: the note-ons of every track, grouped by start tick ──
function readVarLen(b, o) { let v = 0, c; do { c = b[o.i++]; v = (v << 7) | (c & 0x7f) } while (c & 0x80); return v }
function chordsOf(file) {
  const b = fs.readFileSync(file)
  if (b.toString('latin1', 0, 4) !== 'MThd') throw new Error(`not a MIDI file: ${file}`)
  const ntrk = b.readUInt16BE(10)
  let p = 8 + b.readUInt32BE(4)
  const byTick = new Map()
  for (let t = 0; t < ntrk; t++) {
    if (b.toString('latin1', p, p + 4) !== 'MTrk') break
    const end = p + 8 + b.readUInt32BE(p + 4)
    const o = { i: p + 8 }
    let tick = 0, status = 0
    while (o.i < end) {
      tick += readVarLen(b, o)
      let s = b[o.i]
      if (s & 0x80) { status = s; o.i++ } else s = status
      const hi = s & 0xf0
      if (s === 0xff) { o.i++; const len = readVarLen(b, o); o.i += len; continue }
      if (s === 0xf0 || s === 0xf7) { const len = readVarLen(b, o); o.i += len; continue }
      const d1 = b[o.i++]
      const d2 = hi === 0xc0 || hi === 0xd0 ? 0 : b[o.i++]
      if (hi === 0x90 && d2 > 0) {
        if (!byTick.has(tick)) byTick.set(tick, [])
        byTick.get(tick).push(d1)
      }
    }
    p = end
  }
  return [...byTick.entries()].sort((a, b2) => a[0] - b2[0]).map(([, ns]) => [...new Set(ns)].sort((x, y) => x - y))
}

// "C - I V vi IV - Hopeful Romantic.mid" → { root, numerals, moods }
function parseName(f) {
  const m = /^(\S+) - (.+?)(?: - (.+))?\.mid$/.exec(f)
  if (!m) return null
  return { root: m[1], numerals: m[2].replace(/_/g, '/').replace(/\s+/g, ' ').trim(), moods: (m[3] ?? '').trim() }
}

function library(dir, rootLabel) {
  const out = {}
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.mid')).sort()
  for (const f of files) {
    const n = parseName(f)
    if (!n) { console.warn('skipped', f); continue }
    const chords = chordsOf(path.join(dir, f))
    const nums = n.numerals.split(' ')
    if (!chords.length) { console.warn('no notes', f); continue }
    const name = `${rootLabel(n.root)}${n.moods ? ' ' + n.moods : ''} · ${n.numerals}`
    out[n.root] ??= {}
    out[n.root][name] = chords.map((ns, i) => [nums[i] ?? '?', ns])
  }
  return out
}

const major = library(path.join(src, 'Major'), r => r)
const minor = library(path.join(src, 'Minor'), r => `${r}m`)
const modal = library(path.join(src, 'Modal'), r => r)

// the key files: <major> + its relative minor (as useProgressionLoader's KEY_FILE_MAP)
const KEYS = [['C', 'A'], ['Db', 'Bb'], ['D', 'B'], ['Eb', 'C'], ['E', 'C#'], ['F', 'D'], ['Gb', 'Eb'], ['G', 'E'], ['Ab', 'F'], ['A', 'F#'], ['Bb', 'G'], ['B', 'G#']]
let total = 0
KEYS.forEach(([M, mi], i) => {
  const data = { ...(major[M] ?? {}), ...(minor[mi] ?? {}) }
  const n = Object.keys(data).length
  if (!n) throw new Error(`nothing for ${M} / ${mi}m`)
  const file = `${String(i + 1).padStart(2, '0')}-${M}Major-${mi}minor.json`
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(data))
  console.log(file, Object.keys(major[M] ?? {}).length, 'major +', Object.keys(minor[mi] ?? {}).length, 'minor')
  total += n
})
const modalAll = Object.assign({}, ...Object.keys(modal).sort().map(r => modal[r]))
fs.writeFileSync(path.join(OUT, 'ModalChords.json'), JSON.stringify(modalAll))
console.log('ModalChords.json', Object.keys(modalAll).length)
console.log('key files:', total)
