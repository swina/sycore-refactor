import { describe, it, expect } from 'vitest'
import { parseEmulatorX3 } from '@/composables/useEmulatorX3Parser'

function fixture() {
  return [
    'Preset and Sample Listing for MODULA KONTROL 7-Performance.exb',
    'Sun Jul 19 11:15:56 2026',
    '',
    'Presets',
    '',
    'Number  \tBank:Prog   \tName                              \tCategory',
    '000     \t000:000     \tsyn:Vintage                       \tSynthesizer',
    '001     \t000:001     \tsyn:Metasynth2                    \tSynthesizer',
    '882     \t006:114     \tkb2:WurlyD\'Layer                  \tElectric Piano',
    '2827    \t022:011     \tvox:SnowBound                      \tVocal',
    '',
    'Samples',
    '',
    'Number  \tSample Rate   \tSize          \tName                              \tCategory',
    '001     \t32010 Hz      \t46,058 bytes  \tEP4MKIIL A0                       \t',
  ].join('\r\n')
}

describe('parseEmulatorX3', () => {
  it('extracts the bank name from the first line, stripping .exb', async () => {
    const { bankName } = await parseEmulatorX3(fixture())
    expect(bankName).toBe('MODULA KONTROL 7-Performance')
  })

  it('parses Presets rows into { no, name, category, bank, program }, ignoring Samples', async () => {
    const { presets } = await parseEmulatorX3(fixture())
    expect(presets).toHaveLength(4)

    expect(presets[0]).toEqual({ no: 1, name: 'syn:Vintage', category: 'Synthesizer', bank: 0, program: 0 })
    expect(presets[1]).toEqual({ no: 2, name: 'syn:Metasynth2', category: 'Synthesizer', bank: 0, program: 1 })
    expect(presets[2]).toEqual({ no: 3, name: "kb2:WurlyD'Layer", category: 'Electric Piano', bank: 6, program: 114 })
    expect(presets[3]).toEqual({ no: 4, name: 'vox:SnowBound', category: 'Vocal', bank: 22, program: 11 })
  })

  it('rejects a file with no recognizable header line', async () => {
    await expect(parseEmulatorX3('not a real export\r\nPresets\r\n')).rejects.toThrow('Not a valid Emulator X3 listing file.')
  })

  it('rejects a file with no Presets section', async () => {
    const text = 'Preset and Sample Listing for Foo.exb\r\nSun Jul 19 2026\r\n'
    await expect(parseEmulatorX3(text)).rejects.toThrow('No Presets section found in this file.')
  })

  it('rejects a Presets section with zero data rows', async () => {
    const text = [
      'Preset and Sample Listing for Foo.exb',
      'Sun Jul 19 2026',
      '',
      'Presets',
      '',
      'Number  \tBank:Prog   \tName                              \tCategory',
      '',
      'Samples',
    ].join('\r\n')
    await expect(parseEmulatorX3(text)).rejects.toThrow('No presets found in this file.')
  })
})
