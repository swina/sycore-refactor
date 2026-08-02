/**
 * Parse a "Standard" program-change JSON file — the same shape as
 * src/data/program_change/json/standard.json — into the preset array shape
 * used by user-imported banks (see useMfprojzParser.js / useUserBanksStore).
 *
 * Expected input: [{ "pc": 1-128, "name": "..." }, ...]
 * Returns: [{ no, name, program, msb: 0, lsb: 0, bank: 0 }]
 * Throws on invalid file.
 */
export async function parseStandardJson(file) {
  const text = await file.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Invalid JSON file.')
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Expected a JSON array of { "pc": 1-128, "name": "..." } entries.')
  }

  const entries = data.filter(d =>
    d && typeof d.name === 'string' && d.name.trim() &&
    typeof d.pc === 'number' && d.pc >= 1 && d.pc <= 128
  )
  if (entries.length === 0) {
    throw new Error('No valid entries found — each item must be { "pc": 1-128, "name": "..." }.')
  }

  return entries
    .slice()
    .sort((a, b) => a.pc - b.pc)
    .map((p, i) => ({
      no:      i + 1,
      name:    p.name,
      program: p.pc,
      msb:     0,
      lsb:     0,
      bank:    0,
    }))
}
