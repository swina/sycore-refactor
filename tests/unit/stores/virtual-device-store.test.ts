import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useMidiStore } from '@/stores/useMidiStore'
import { useVirtualDeviceStore } from '@/stores/useVirtualDeviceStore'
import { midiService } from '@/core/midi/midi-service'

describe('useVirtualDeviceStore', () => {
  let sent: number[][]
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    sent = []
    vi.spyOn(midiService, 'sendRawToDeviceByName').mockImplementation((_name: string, data: number[]) => { sent.push(data) })
    const midi = useMidiStore()
    midi.addVirtualInstrument('X3')
    midi.setVirtualInstrumentCcTable('X3', [{ cc: 74, name: 'Cutoff' }, { cc: 71, name: 'Reso' }])
    midi.addRegistration('X3')
    midi.setOutputRouteFilters({ 'Keys→X3': { outChannels: [2, 3, 4, 7] } })
  })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('lists the mapped channels and keeps the selected one among them', () => {
    const vd = useVirtualDeviceStore()
    expect(vd.channels('X3')).toEqual([2, 3, 4, 7])
    expect(vd.channel('X3')).toBe(2)          // pcChannel 0 isn't mapped: the first part
    vd.stepChannel('X3', -1)
    expect(vd.channel('X3')).toBe(7)          // wraps
  })

  it('sends a control on the selected channel and remembers it per channel', () => {
    const vd = useVirtualDeviceStore()
    vd.setChannel('X3', 3)
    vd.setCc('X3', 74, 100)
    expect(sent).toEqual([[0xb3, 74, 100]])
    expect(vd.getCc('X3', 74, 3)).toBe(100)
    expect(vd.getCc('X3', 74, 4)).toBe(64)   // untouched channel: default
  })

  it("saves one channel's sound and recalls it on another: preset first, then the controls", () => {
    vi.useFakeTimers()
    const midi = useMidiStore()
    const vd = useVirtualDeviceStore()
    vd.setChannel('X3', 3)
    midi.updateRegistration('X3', 'pcChannels', { 3: { program: 29, bank: 'F', soundName: 'syn:Loner', category: 'Synth', msb: 0, lsb: 2,
      msgs: [[0xb3, 64, 0], [0xb3, 32, 2], [0xc3, 29]] } })
    vd.setCc('X3', 74, 90)
    const s = vd.saveSound('X3', 'Lead')!
    expect(s.cc).toEqual({ 74: 90, 71: 64 })

    sent = []
    vd.setChannel('X3', 7)
    vd.recallSound('X3', s.id)
    expect(sent).toEqual([[0xb7, 64, 0], [0xb7, 32, 2], [0xc7, 29]])
    vi.advanceTimersByTime(200)
    expect(sent.slice(3)).toEqual([[0xb7, 74, 90], [0xb7, 71, 64]])
    expect(midi.routingConfig.registrations['X3'].pcChannels?.[7]?.soundName).toBe('syn:Loner')
    expect(vd.getCc('X3', 74, 7)).toBe(90)
  })

  it('replaces a sound saved under the same name', () => {
    const vd = useVirtualDeviceStore()
    vd.saveSound('X3', 'Lead')
    vd.saveSound('X3', 'Lead')
    expect(vd.soundsOf('X3')).toHaveLength(1)
  })

  it('keeps sounds per channel, up to 8 each', () => {
    const vd = useVirtualDeviceStore()
    vd.setChannel('X3', 2)
    for (let i = 0; i < 8; i++) expect(vd.saveSound('X3', `S${i}`)).not.toBeNull()
    expect(vd.saveSound('X3', 'S8')).toBeNull()            // channel full
    expect(vd.saveSound('X3', 'S3')).not.toBeNull()        // same name: replaced
    vd.setChannel('X3', 3)
    expect(vd.soundsOf('X3', 3)).toHaveLength(0)
    expect(vd.saveSound('X3', 'S0')).not.toBeNull()        // another channel: its own slots
    expect(vd.soundsOf('X3', 2)).toHaveLength(8)
    expect(vd.soundsOf('X3', 3).map(s => s.name)).toEqual(['S0'])
  })

  it('moves sounds saved without a channel to channel 1, shown only there', () => {
    localStorage.setItem('anon_SYCORE_VD_SOUNDS', JSON.stringify({ X3: [{ id: 'a', name: 'Old', preset: null, cc: {}, savedAt: 1 }, { id: 'b', name: 'Old2', preset: null, cc: {}, savedAt: 2 }] }))
    setActivePinia(createPinia())
    const vd = useVirtualDeviceStore()
    expect(vd.soundsOf('X3', 0).map(s => [s.name, s.slot])).toEqual([['Old', 0], ['Old2', 1]])
    expect(vd.soundsOf('X3', 3)).toEqual([])
  })

  it("recalls a slot of the selected channel's sounds, nothing for an empty one", async () => {
    const vd = useVirtualDeviceStore()
    vd.setChannel('X3', 4)
    vd.setCc('X3', 74, 33)
    const a = vd.saveSound('X3', 'A')!
    sent = []
    await vd.recallSlot('X3', 0)
    expect(sent).toContainEqual([0xb4, 74, 33])
    expect(vd.lastRecalledId).toBe(a.id)
    sent = []
    await vd.recallSlot('X3', 5)
    expect(sent).toEqual([])
  })

  it('saves onto a given pad, overwriting it, and keeps the other pads in place', () => {
    const vd = useVirtualDeviceStore()
    vd.setChannel('X3', 2)
    vd.saveSound('X3', 'A')                 // pad 0
    vd.saveSound('X3', 'B', 5)              // pad 5
    vd.saveSound('X3', 'C', 0)              // overwrites A
    expect(vd.soundsOf('X3', 2).map(s => [s.name, s.slot])).toEqual([['C', 0], ['B', 5]])
    expect(vd.saveSound('X3', 'D')?.slot).toBe(1)   // first free pad
    expect(vd.soundAt('X3', 2, 5)?.name).toBe('B')
  })

  it('selecting a pad recalls its sound and is where Save writes; per channel', async () => {
    const vd = useVirtualDeviceStore()
    vd.setChannel('X3', 2)
    await vd.selectSlot('X3', 3)                      // empty: selected, nothing sent
    expect(vd.selectedSlotOf('X3')).toBe(3)
    vd.setCc('X3', 74, 20)
    vd.saveSound('X3', 'Pad4', vd.selectedSlotOf('X3')!)
    expect(vd.soundAt('X3', 2, 3)?.name).toBe('Pad4')
    sent = []
    await vd.selectSlot('X3', 3)
    expect(sent).toContainEqual([0xb2, 74, 20])
    vd.setChannel('X3', 4)
    expect(vd.selectedSlotOf('X3')).toBeNull()        // another channel: no pad selected
  })
})
