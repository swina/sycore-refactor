import JSZip from 'jszip'

const CATEGORY_MAP = {
  0: 'Bass', 1: 'Brass', 2: 'Keys', 3: 'Lead', 4: 'Organ',
  5: 'Pad', 6: 'Percussion', 7: 'Sequence', 8: 'SFX',
  9: 'Strings', 10: 'Template', 11: 'Vocoder',
}

function extractSlot(filename) {
  // Normal: "001-SourceDate-A1.mbp" → 1
  let m = filename.match(/^(\d+)-/)
  if (m) return parseInt(m[1])
  // Fused: "40900122021 17h55-A13.mbp" → 409 (dash between slot and date missing in some exports)
  m = filename.match(/^(\d+)(00\d{6}|09\d{6})/)
  if (m) return parseInt(m[1])
  m = filename.match(/^(\d{1,3})/)
  return m ? parseInt(m[1]) : null
}

function parseMbp(text) {
  const m = text.slice(0, 300).match(
    /archive \d+ \d+ \d+ \d+ \d+ (\d+) (.+?) (\d+) \d+ \d+ 18/
  )
  if (!m) return null
  const nameLen  = parseInt(m[1])
  const name     = m[2].slice(0, nameLen)
  const catId    = parseInt(m[3])
  return { name, category: CATEGORY_MAP[catId] ?? `Unknown-${catId}` }
}

/**
 * Parse an Arturia .mfprojz file (File or ArrayBuffer) into a preset array
 * compatible with the sy.core program-change JSON schema.
 *
 * Returns: [{ category, no, name, msb, lsb, bank, program }]
 * Throws on invalid file.
 */
export async function parseMfprojz(file) {
  const zip = await JSZip.loadAsync(file)

  const entries = []

  for (const [path, entry] of Object.entries(zip.files)) {
    if (!path.endsWith('.mbp') || path.includes('test_empty') || entry.dir) continue

    const filename = path.split('/').pop()
    const slot     = extractSlot(filename)
    if (slot == null) continue

    const text   = await entry.async('string')
    const parsed = parseMbp(text)
    if (!parsed) continue

    entries.push({ slot, ...parsed })
  }

  if (entries.length === 0) throw new Error('No presets found in this file.')

  entries.sort((a, b) => a.slot - b.slot)

  return entries.map((p, i) => ({
    category: p.category,
    no:       i + 1,
    name:     p.name,
    msb:      0,
    lsb:      0,
    bank:     0,
    program:  p.slot,
  }))
}
