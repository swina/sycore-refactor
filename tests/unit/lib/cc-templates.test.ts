import { describe, it, expect } from 'vitest'
import { CC_TEMPLATES, ccTemplateFor, mergeCcTemplate } from '@/constants/cc-templates'

describe('cc-templates', () => {
  it('each model table has unique CCs in 0..127 and names', () => {
    for (const [id, t] of Object.entries(CC_TEMPLATES)) {
      const ccs = t!.map(r => r.cc)
      expect(new Set(ccs).size, id).toBe(ccs.length)
      for (const r of t!) {
        expect(r.cc).toBeGreaterThanOrEqual(0)
        expect(r.cc).toBeLessThanOrEqual(127)
        expect(r.name.trim()).not.toBe('')
      }
    }
  })
  it('knows the published charts', () => {
    expect(ccTemplateFor('mfprojz')!.find(r => r.cc === 23)!.name).toBe('Cutoff')
    expect(ccTemplateFor('roland-s1')!.find(r => r.cc === 74)!.name).toBe('Filter Frequency')
    expect(ccTemplateFor('access-virus')!.find(r => r.cc === 40)!.name).toBe('Filter1 Cutoff')
    expect(ccTemplateFor('seqtrak')!.find(r => r.cc === 74)!.name).toBe('Filter cutoff')
  })
  it('no table for models without a fixed chart', () => {
    expect(ccTemplateFor('kawai-k1')).toBeNull()
    expect(ccTemplateFor(undefined)).toBeNull()
  })
  it('returns a copy', () => {
    ccTemplateFor('mfprojz')![0].name = 'x'
    expect(ccTemplateFor('mfprojz')![0].name).toBe('Glide')
  })
  it('merge keeps existing rows and adds the missing CCs', () => {
    const out = mergeCcTemplate([{ cc: 23, name: 'My Cutoff' }], [{ cc: 23, name: 'Cutoff' }, { cc: 83, name: 'Resonance' }])
    expect(out).toEqual([{ cc: 23, name: 'My Cutoff' }, { cc: 83, name: 'Resonance' }])
  })
})
