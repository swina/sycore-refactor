import { describe, it, expect } from 'vitest'
import { catalogPcAddress } from '@/lib/pc-address'

describe('catalogPcAddress', () => {
  const oneBased = { msb: false, lsb: false, program_base: -1 }
  const zeroBased = { msb: false, lsb: false, program_base: 0 }

  it('1-based catalog: 128 is the last of bank 0, 129 the first of bank 1', () => {
    expect(catalogPcAddress({ program: 1 }, oneBased)).toEqual({ msb: 0, lsb: 0, progNum: 0 })
    expect(catalogPcAddress({ program: 128 }, oneBased)).toEqual({ msb: 0, lsb: 0, progNum: 127 })
    expect(catalogPcAddress({ program: 129 }, oneBased)).toEqual({ msb: 1, lsb: 0, progNum: 0 })
    expect(catalogPcAddress({ program: 256 }, oneBased)).toEqual({ msb: 1, lsb: 0, progNum: 127 })
  })

  it('0-based catalog', () => {
    expect(catalogPcAddress({ program: 127 }, zeroBased)).toEqual({ msb: 0, lsb: 0, progNum: 127 })
    expect(catalogPcAddress({ program: 128 }, zeroBased)).toEqual({ msb: 1, lsb: 0, progNum: 0 })
  })

  it('bank from the catalog when cfg.msb / cfg.lsb', () => {
    const cfg = { msb: true, lsb: true, program_base: -1 }
    expect(catalogPcAddress({ program: 128, msb: 63, lsb: 8 }, cfg)).toEqual({ msb: 63, lsb: 8, progNum: 127 })
    expect(catalogPcAddress({ program: 1 }, cfg)).toEqual({ msb: 0, lsb: 0, progNum: 0 })
  })

  it('custom program field, never negative', () => {
    expect(catalogPcAddress({ pc: 5 }, { program_field: 'pc', program_base: 0 }).progNum).toBe(5)
    expect(catalogPcAddress({ program: 0 }, oneBased).progNum).toBe(0)
  })
})
