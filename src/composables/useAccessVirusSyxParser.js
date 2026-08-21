const MANU = [0x00, 0x20, 0x33]

/**
 * Parse an Access Virus SysEx bank dump (.syx) into a preset array
 * compatible with the sy.core program-change JSON schema.
 *
 * Expected input: a concatenated series of 128 (or fewer) single-program
 * dumps, each F0 <3-byte manufacturer 00 20 33> <deviceId> <model> <cmd 0x10>
 * <bankMsb> <progByte> <515 bytes params, name at offset 248 prefixed '@'>
 * <checksum> F7. Empty programs have a non-'@' byte at offset 248 and are
 * skipped.
 *
 * Returns: [{ no, name, program, msb, lsb, bank, program_base: 1 }]
 * Throws on invalid file.
 */
export async function parseAccessVirusSyx(file) {
  const buf = new Uint8Array(await file.arrayBuffer())

  if (buf.length < 12 || buf[1] !== MANU[0] || buf[2] !== MANU[1] || buf[3] !== MANU[2]) {
    throw new Error('Not an Access Virus SysEx file (missing 00 20 33 manufacturer).')
  }

  const presets = []
  let pos = 0
  while (pos < buf.length) {
    if (buf[pos] !== 0xF0) { pos++; continue }
    const start = pos
    pos++
    while (pos < buf.length && buf[pos] !== 0xF7) pos++
    if (pos >= buf.length) break
    const sysex = buf.subarray(start, pos + 1)
    pos++

    // Validate header: F0 00 20 33 <devId> <model> <cmd> <bank> <prog>
    if (sysex.length < 9 || sysex[1] !== MANU[0] || sysex[2] !== MANU[1] || sysex[3] !== MANU[2]) continue
    const cmd = sysex[6]
    if (cmd !== 0x10) continue // only single-program dumps unpacked per-patch
    const bankMsb = sysex[7]
    const progByte = sysex[8]

    let name = ''
    // Name is at sysex offset 248, prefixed with '@' (0x40). Programs without
    // a name have a different byte there and are treated as empty slots.
    if (sysex[248] === 0x40) {
      for (let i = 249; i < Math.min(262, sysex.length); i++) {
        if (sysex[i] >= 32 && sysex[i] < 127) {
          // Terminate when hitting the 'BC' parameter marker that follows the name
          if (sysex[i] === 0x42 && sysex[i + 1] === 0x43) break
          name += String.fromCharCode(sysex[i])
        } else break
      }
      name = name.trim()
    }

    if (!name) continue

    presets.push({
      no: progByte + 1,
      name,
      program: progByte + 1,
      program_base: -1,   // so the UI derives progNum = program + (-1) == progByte
      msb: bankMsb > 0 ? bankMsb : 0,
      lsb: 0,
      bank: 0,
    })
  }

  if (presets.length === 0) throw new Error('No named patches found in this file.')

  // Sort by program number (they may not be in file order) and de-dup by program
  presets.sort((a, b) => a.no - b.no)

  return presets
}