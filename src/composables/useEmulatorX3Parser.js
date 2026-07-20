/**
 * Parse an Emulator X3 "Preset and Sample Listing" .txt export into a preset
 * array compatible with the sy.core program-change bank schema.
 *
 * Only the Presets section is read (Samples section is ignored). The bank
 * name is taken from the export's first line, which names the source .exb.
 *
 * Returns: { bankName, presets: [{ no, name, category, bank, program }] }
 * Throws on invalid file.
 */
export async function parseEmulatorX3(file) {
  const text = typeof file === 'string' ? file : await file.text()
  const lines = text.split(/\r?\n/)

  const firstLine = (lines[0] ?? '').trim()
  const nameMatch = firstLine.match(/^Preset and Sample Listing for (.+)\.exb$/i)
  if (!nameMatch) throw new Error('Not a valid Emulator X3 listing file.')
  const bankName = nameMatch[1].trim()

  const presetsIdx = lines.findIndex(l => l.trim() === 'Presets')
  if (presetsIdx === -1) throw new Error('No Presets section found in this file.')

  // number \t bank:program \t name \t category
  const rowRe = /^\s*\d+\s*\t\s*(\d+)\s*:\s*(\d+)\s*\t(.+?)\t(.*)$/
  const presets = []

  for (let i = presetsIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line?.trim() ?? ''
    if (trimmed === 'Samples') break   // reached the next section
    if (trimmed === '') continue       // blank separator line (or the header row's absence of tabs)
    const m = line.match(rowRe)
    if (!m) continue                   // column header row or malformed line
    const [, bankStr, progStr, name, category] = m
    presets.push({
      no: presets.length + 1,
      name: name.trim(),
      category: category.trim(),
      bank: parseInt(bankStr, 10),
      program: parseInt(progStr, 10),
    })
  }

  if (presets.length === 0) throw new Error('No presets found in this file.')

  return { bankName, presets }
}
