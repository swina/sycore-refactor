import { describe, it, expect } from 'vitest'
import { FM1_THEMES, FM1_DEFAULT_THEME, fm1Theme } from '@/lib/fm1-themes'

describe('fm1-themes', () => {
  it('has the real FM-1 colors with unique ids', () => {
    const ids = FM1_THEMES.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(expect.arrayContaining(['grey', 'black', 'white', 'purple', 'orange', 'navy', 'green', 'brown']))
  })
  it('every theme fills the same CSS variables', () => {
    const keys = Object.keys(FM1_THEMES[0].vars).sort()
    for (const t of FM1_THEMES) expect(Object.keys(t.vars).sort()).toEqual(keys)
  })
  it('falls back to the default theme', () => {
    expect(fm1Theme('nope').id).toBe(FM1_DEFAULT_THEME)
    expect(fm1Theme(null).id).toBe(FM1_DEFAULT_THEME)
    expect(fm1Theme('navy').id).toBe('navy')
  })
})
