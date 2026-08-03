const HEADER_SIZE = 8   // F0 40 <channel> 21 00 03 00 00
const RECORD_SIZE = 88  // 10-byte ASCII name + 78 bytes of synth parameters
const NAME_SIZE = 10

/**
 * Parse a Kawai K1 SysEx bank dump (.syx) into a preset array compatible
 * with the sy.core program-change JSON schema.
 *
 * Expected input: F0 40 <channel> 21 00 03 00 00 <32 x 88-byte patch
 * records> F7 — each record is a 10-byte space-padded ASCII name followed
 * by 78 bytes of parameters we don't need.
 *
 * Returns: [{ no, name, program, msb: 0, lsb: 0, bank: 0 }]
 * Throws on invalid file.
 */
export async function parseKawaiK1(file) {
  const buf = new Uint8Array(await file.arrayBuffer())

  if (buf.length < HEADER_SIZE + RECORD_SIZE + 1 || buf[0] !== 0xF0 || buf[1] !== 0x40) {
    throw new Error('Not a Kawai K1 SysEx file (missing F0 40 header).')
  }
  if (buf[buf.length - 1] !== 0xF7) {
    throw new Error('Not a valid SysEx file (missing F7 terminator).')
  }

  const body = buf.subarray(HEADER_SIZE, buf.length - 1)
  if (body.length % RECORD_SIZE !== 0) {
    throw new Error(`Unexpected data length (${body.length} bytes) — expected a multiple of ${RECORD_SIZE}.`)
  }

  const count = body.length / RECORD_SIZE
  const presets = []
  for (let i = 0; i < count; i++) {
    const record = body.subarray(i * RECORD_SIZE, i * RECORD_SIZE + NAME_SIZE)
    const name = new TextDecoder('ascii').decode(record).trim() || `Patch ${i + 1}`
    presets.push({
      no:      i + 1,
      name,
      program: i + 1,
      msb:     0,
      lsb:     0,
      bank:    0,
    })
  }

  if (presets.length === 0) throw new Error('No patches found in this file.')

  return presets
}
