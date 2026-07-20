import { describe, it, expect } from 'vitest'
import { scanFxpBanksFolder } from '@/composables/useFxpBankScanner'

function fakeFile(name) {
  return {
    kind: 'file',
    getFile: async () => ({ name }),
  }
}

function fakeDir(entries) {
  return {
    kind: 'directory',
    entries: async function* () {
      for (const e of entries) yield e
    },
  }
}

describe('scanFxpBanksFolder', () => {
  it('builds Bank 0 from root .fxp files and Bank 1+ from alphabetical subfolders', async () => {
    const bassDir = fakeDir([
      ['b.fxp', fakeFile('b.fxp')],
      ['a.fxp', fakeFile('a.fxp')],
    ])
    const leadDir = fakeDir([
      ['x.fxp', fakeFile('x.fxp')],
    ])
    const root = fakeDir([
      ['a.fxp', fakeFile('a.fxp')],
      ['Lead', leadDir],
      ['Bass', bassDir],
    ])

    const banks = await scanFxpBanksFolder(root)

    expect(banks).toHaveLength(3)

    expect(banks[0]).toMatchObject({ bankIndex: 0, bankName: 'Root' })
    expect(banks[0].presets.map(p => p.name)).toEqual(['a'])
    expect(banks[0].presets[0]).toMatchObject({ program: 0, msb: 0, category: 'Root' })

    expect(banks[1]).toMatchObject({ bankIndex: 1, bankName: 'Bass' })
    expect(banks[1].presets.map(p => p.name)).toEqual(['a', 'b'])
    expect(banks[1].presets[0]).toMatchObject({ program: 0, msb: 1, category: 'Bass' })
    expect(banks[1].presets[1]).toMatchObject({ program: 1, msb: 1, category: 'Bass' })

    expect(banks[2]).toMatchObject({ bankIndex: 2, bankName: 'Lead' })
    expect(banks[2].presets.map(p => p.name)).toEqual(['x'])
    expect(banks[2].presets[0]).toMatchObject({ program: 0, msb: 2, category: 'Lead' })
  })

  it('skips Bank 0 when the root has no .fxp files', async () => {
    const bassDir = fakeDir([['a.fxp', fakeFile('a.fxp')]])
    const root = fakeDir([['Bass', bassDir]])

    const banks = await scanFxpBanksFolder(root)

    expect(banks).toHaveLength(1)
    expect(banks[0]).toMatchObject({ bankIndex: 1, bankName: 'Bass' })
  })

  it('skips subfolders with no .fxp files without leaving a gap in bank numbering', async () => {
    const emptyDir = fakeDir([['readme.txt', fakeFile('readme.txt')]])
    const leadDir  = fakeDir([['x.fxp', fakeFile('x.fxp')]])
    const root = fakeDir([
      ['a.fxp', fakeFile('a.fxp')],
      ['Empty', emptyDir],
      ['Lead', leadDir],
    ])

    const banks = await scanFxpBanksFolder(root)

    expect(banks.map(b => b.bankName)).toEqual(['Root', 'Lead'])
    expect(banks[1].bankIndex).toBe(1)
  })

  it('caps a bank at the first 128 patches (alphabetical), per the device MIDI spec', async () => {
    const files = Array.from({ length: 140 }, (_, i) =>
      [`p${String(i).padStart(3, '0')}.fxp`, fakeFile(`p${String(i).padStart(3, '0')}.fxp`)]
    )
    const root = fakeDir(files)

    const banks = await scanFxpBanksFolder(root)

    expect(banks[0].presets).toHaveLength(128)
    expect(banks[0].presets[0].name).toBe('p000')
    expect(banks[0].presets[127].name).toBe('p127')
  })

  it('caps banks at Bank Select 127, ignoring subfolders beyond that', async () => {
    const subdirs = Array.from({ length: 130 }, (_, i) => {
      const name = `Bank${String(i).padStart(3, '0')}`
      return [name, fakeDir([[`a.fxp`, fakeFile('a.fxp')]])]
    })
    const root = fakeDir(subdirs)

    const banks = await scanFxpBanksFolder(root)

    expect(banks).toHaveLength(127)
    expect(banks[0].bankIndex).toBe(1)
    expect(banks[banks.length - 1].bankIndex).toBe(127)
  })
})
