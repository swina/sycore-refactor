// Bank select + program of a catalog sound (program_change.json banks).
//
// `program + program_base` is the 0-based absolute program; bank MSB and the
// PC byte both come from it — the bank from the catalog's own msb when the bank
// says so (cfg.msb), else program / 128. (The old inline formula took
// program % 128 before applying the base: on a 1-based catalog, 128 sent PC 0 —
// clamped from −1 — with MSB 1, i.e. preset 129.)

export interface PcBankConfig {
  msb?: boolean
  lsb?: boolean
  program_field?: string
  program_base?: number
}

export interface PcAddress { msb: number; lsb: number; progNum: number }

export function catalogPcAddress(sound: Record<string, any>, cfg: PcBankConfig | null | undefined): PcAddress {
  const prog = Number(sound[cfg?.program_field ?? 'program'] ?? 0)
  const idx = Math.max(0, prog + (cfg?.program_base ?? 0))
  return {
    msb: cfg?.msb ? (sound.msb ?? 0) : Math.floor(idx / 128),
    lsb: cfg?.lsb ? (sound.lsb ?? 0) : 0,
    progNum: idx % 128,
  }
}
