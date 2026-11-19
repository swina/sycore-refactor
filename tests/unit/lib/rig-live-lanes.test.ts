import { describe, it, expect, beforeEach } from 'vitest'
import {
  rigLaneRows, rowLane, rowPadEvents, padEvents, stopEvents, stopRows, isSlotRow, activeSlotRows, liveAppSource,
  rigMutes, rigVelocityScales, rigCc7, armPlaying, rigArmed, bassInUse, padWhen, arpeggiatorRow,
} from '@/lib/rig-live'

// The Rig's Bass and Arp rows on the Sequencer's Bass / Arp lanes (the default).
describe('Rig rows on the Sequencer lanes', () => {
  beforeEach(() => { rigLaneRows.bass = true; rigLaneRows.arp = true; Object.assign(rigArmed, { chord: null, drum: null, seq: null, bass: null, arp: null }) })

  it('Seq → Main, Bass / Arp → their lanes; off: no lane', () => {
    expect(rowLane('seq')).toBe('main')
    expect(rowLane('bass')).toBe('bass')
    expect(rowLane('arp')).toBe('arp')
    expect(rowLane('drum')).toBeNull()
    rigLaneRows.bass = false
    rigLaneRows.arp = false
    expect(rowLane('bass')).toBeNull()
    expect(isSlotRow('arp')).toBe(false)
    expect(arpeggiatorRow('arp')).toBe(true)
    expect(activeSlotRows()).toEqual(['chord', 'drum', 'seq', 'bass'])
  })

  it('pads: a lane\'s bank at the end of its pattern, its own toggle; the Seq row unchanged', () => {
    expect(rowPadEvents('bass', 2, null, 16)).toEqual([
      { name: 'seq-bass-bank-cue', detail: { idx: 2 } },
      { name: 'toggle-seq-bass', detail: { play: true, sync: 16 } },
    ])
    expect(rowPadEvents('arp', 1, 0, 4)).toEqual([{ name: 'seq-arp-bank-cue', detail: { idx: 1 } }])
    expect(rowPadEvents('arp', 1, 1, 4)).toEqual([{ name: 'toggle-seq-arp', detail: { play: false, sync: 4, user: true } }])
    expect(padEvents('seq', 3, null, 0)).toEqual([
      { name: 'seq-bank-cue', detail: { idx: 3 } },
      { name: 'toggle-sequencer2', detail: { play: true, sync: 0 } },
    ])
    expect(padWhen('bass', 0, 1, 16)).toBe('at the end of its pattern')
    expect(activeSlotRows()).toContain('arp')
  })

  it("Live's Stop stops the lanes; their playing slots are armed", () => {
    expect(stopRows()).toEqual(['chord', 'drum', 'seq', 'bass', 'arp'])
    expect(stopEvents('bass')).toEqual([{ name: 'toggle-seq-bass', detail: { play: false, sync: 0 } }])
    armPlaying({ bass: 3, arp: 1 })
    expect(rigArmed.bass).toBe(3)
    expect(rigArmed.arp).toBe(1)
    rigLaneRows.arp = false
    expect(stopRows()).toEqual(['chord', 'drum', 'seq', 'bass'])
    expect(stopEvents('arp')).toEqual([])
  })

  it('Mute / Solo, Intensity and CC 7 on the lanes\' sources (with scopes); Arp has a volume Intensity', () => {
    expect(liveAppSource('bass')).toBe('SEQ_BASS')
    expect(liveAppSource('arp')).toBe('SEQ_ARP')
    const apps = [
      { id: 'drum', muted: false, solo: false, intensity: 127 },
      { id: 'bass', muted: true, solo: false, intensity: 64 },
      { id: 'arp', muted: false, solo: false, intensity: 32 },
    ]
    const m = rigMutes(apps)
    expect(m.sources).toEqual(['SEQ_BASS'])
    expect(m.parts.bass).toBe(false) // not inside the Drum Machine
    expect(rigMutes(apps, { bass: ['Emulator X3'] }).cables).toEqual([['SEQ_BASS', 'Emulator X3']])
    const v = rigVelocityScales(apps, 127, {}, { bass: 'velocity', arp: 'velocity' })
    expect(Object.keys(v.sources).sort()).toEqual(['SEQ_ARP', 'SEQ_BASS'])
    expect(v.parts.bass).toBe(1)
    const cc = rigCc7(apps, 127, { bass: 'cc7', arp: 'cc7' })
    expect(cc.map(c => [c.id, c.source])).toEqual([['drum', 'DRUM_MACHINE'], ['bass', 'SEQ_BASS'], ['arp', 'SEQ_ARP']])
  })

  it('the Drum Machine\'s bassline is not "in use" from a Bass slot armed for the lane', () => {
    const dm = { basslineEnabled: true, isPlaying: false, bassOn: true }
    expect(bassInUse(dm, 2)).toBe(false)
    rigLaneRows.bass = false
    expect(bassInUse(dm, 2)).toBe(true)
  })
})
