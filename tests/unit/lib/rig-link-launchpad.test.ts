import { describe, it, expect } from 'vitest'
import { rigLinkLaunchpad, parseRigLinkPress } from '@/lib/rig-link-launchpad'

describe('rigLinkLaunchpad', () => {
  it('always 8 top, 64 pads, 8 side; labels trimmed, unknown colours off', () => {
    const v = rigLinkLaunchpad({
      top: [{ label: 'Beat', color: 'green' }],
      pads: [{ label: 'Drum A', color: 'amber' }, { label: 'a very long label', color: 'purple' }],
      side: 'nope',
    })
    expect(v.top).toHaveLength(8)
    expect(v.pads).toHaveLength(64)
    expect(v.side).toHaveLength(8)
    expect(v.top[0]).toEqual({ label: 'Beat', color: 'green' })
    expect(v.pads[0]).toEqual({ label: 'Drum A', color: 'amber' })
    expect(v.pads[1]).toEqual({ label: 'a very lon', color: 'off' })
    expect(v.side[3]).toEqual({ label: '', color: 'off' })
  })
})

describe('parseRigLinkPress', () => {
  it('pads by index, row by row', () => {
    expect(parseRigLinkPress('lp_pad_0_down')).toEqual({ kind: 'pad', row: 0, col: 0, down: true })
    expect(parseRigLinkPress('lp_pad_27_up')).toEqual({ kind: 'pad', row: 3, col: 3, down: false })
    expect(parseRigLinkPress('lp_pad_63_down')).toEqual({ kind: 'pad', row: 7, col: 7, down: true })
  })
  it('side and top buttons', () => {
    expect(parseRigLinkPress('lp_side_6_down')).toEqual({ kind: 'side', index: 6, down: true })
    expect(parseRigLinkPress('lp_top_7_up')).toEqual({ kind: 'top', index: 7, down: false })
  })
  it('anything else is not a press', () => {
    for (const n of ['lp_pad_64_down', 'lp_side_8_down', 'lp_top_1_hold', 'rig_fill', '', null]) expect(parseRigLinkPress(n)).toBeNull()
  })
})
