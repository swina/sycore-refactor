import { describe, it, expect } from 'vitest'
import { parseRigAction, isContinuousRigAction, rigSlotParam, rigActionCatalog } from '@/lib/rig-actions'

describe('rig-actions', () => {
  it('parses every rig parameter name', () => {
    expect(parseRigAction('rig_slot_chord_c')).toEqual({ kind: 'slot', app: 'chord', slot: 2 })
    expect(parseRigAction('rig_gen_seq')).toEqual({ kind: 'gen', app: 'seq' })
    expect(parseRigAction('rig_mute_drum')).toEqual({ kind: 'mute', app: 'drum' })
    expect(parseRigAction('rig_sync_chord')).toEqual({ kind: 'sync', app: 'chord' })
    expect(parseRigAction('rig_intensity_drum')).toEqual({ kind: 'intensity', app: 'drum' })
    expect(parseRigAction('rig_section_8')).toEqual({ kind: 'section', index: 7 })
    expect(parseRigAction('rig_fill')).toEqual({ kind: 'fill' })
    expect(parseRigAction('rig_chain_chord')).toEqual({ kind: 'chain', app: 'chord' })
    expect(parseRigAction('rig_chain_arp')).toBeNull()
    expect(parseRigAction('rig_play')).toEqual({ kind: 'play' })
    expect(parseRigAction('rig_key_mode')).toEqual({ kind: 'key_mode' })
    expect(parseRigAction('rig_global')).toEqual({ kind: 'global' })
    expect(parseRigAction('rig_density_seq')).toEqual({ kind: 'density', app: 'seq' })
  })

  it('rejects other names and unknown apps or slots', () => {
    for (const n of ['dm_fill', 'rig_slot_pad_a', 'rig_slot_chord_i', 'rig_section_9', 'rig_gen', 'rig_density_chord', 'rig_density_bass']) {
      expect(parseRigAction(n)).toBeNull()
    }
  })

  it('tells knobs from buttons; the catalog round-trips', () => {
    expect(isContinuousRigAction({ kind: 'global' })).toBe(true)
    expect(isContinuousRigAction({ kind: 'slot', app: 'drum', slot: 0 })).toBe(false)
    expect(rigSlotParam('drum', 7)).toBe('rig_slot_drum_h')
    const cat = rigActionCatalog()
    expect(cat.length).toBe(5 * 13 + 3 + 1 + 1 + 3 + 8 + 3 + 6) // + 3 chains, play, tap, tempo − / +, round, tempo knob
    for (const { paramName } of cat) expect(parseRigAction(paramName)).not.toBeNull()
  })
})

describe('rig-actions LED feedback', () => {
  const apps = [
    { id: 'drum', playing: 1, queued: 3, muted: true, solo: false, filled: [true, true, false, true, false, false, false, false] },
    { id: 'chord', playing: null, queued: null, muted: false, solo: true },
  ]
  it('slot: filled, playing, blinking while queued; Mute / Solo; momentary and knobs', async () => {
    const { rigLedState } = await import('@/lib/rig-actions')
    expect(rigLedState('rig_slot_drum_b', apps, false)).toBe('playing')
    expect(rigLedState('rig_slot_drum_d', apps, true)).toBe('queued')
    expect(rigLedState('rig_slot_drum_d', apps, false)).toBe('filled')
    expect(rigLedState('rig_slot_drum_a', apps, true)).toBe('filled')
    expect(rigLedState('rig_slot_drum_c', apps, true)).toBe('off')
    expect(rigLedState('rig_mute_drum', apps, false)).toBe('muted')
    expect(rigLedState('rig_solo_chord', apps, false)).toBe('solo')
    expect(rigLedState('rig_gen_drum', apps, true)).toBe('off')
    expect(rigLedState('rig_global', apps, true)).toBeNull()
    expect(rigLedState('dm_fill', apps, true)).toBeNull()
  })

  it('palettes: Launchpad MK1 colours by port name, otherwise lit / dark', async () => {
    const { ledPaletteFor, LAUNCHPAD_MK1_PALETTE, GENERIC_PALETTE } = await import('@/lib/rig-actions')
    expect(ledPaletteFor('Launchpad Mini')).toBe(LAUNCHPAD_MK1_PALETTE)
    expect(ledPaletteFor('Launchpad Mini MK3 LPMiniMK3 MIDI')).toBe(GENERIC_PALETTE)
    expect(ledPaletteFor('Launchkey MK3 49')).toBe(GENERIC_PALETTE)
    expect(LAUNCHPAD_MK1_PALETTE.playing).not.toBe(LAUNCHPAD_MK1_PALETTE.filled)
  })
})

describe('rig tempo actions', () => {
  it('TAP and tempo − / + are buttons, the tempo knob is continuous; all in the catalog', () => {
    expect(parseRigAction('rig_tap')).toEqual({ kind: 'tap' })
    expect(parseRigAction('rig_tempo_down')).toEqual({ kind: 'tempo_down' })
    expect(parseRigAction('rig_tempo_up')).toEqual({ kind: 'tempo_up' })
    expect(isContinuousRigAction(parseRigAction('rig_tempo')!)).toBe(true)
    expect(isContinuousRigAction(parseRigAction('rig_tap')!)).toBe(false)
    const names = rigActionCatalog().map(a => a.paramName)
    for (const n of ['rig_tap', 'rig_tempo_down', 'rig_tempo_up', 'rig_tempo_round', 'rig_tempo']) expect(names).toContain(n)
  })
})
