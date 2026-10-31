import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useMidiStore } from '@/stores/useMidiStore'
import { useVirtualDeviceStore } from '@/stores/useVirtualDeviceStore'
import { midiService } from '@/core/midi/midi-service'
import { useMappingStore } from '@/stores/useMappingStore'
import { pcBrowse } from '@/lib/pc-browse'
import { on } from '@/types/events'

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
    // Cutoff (CC 74) is learned to an external controller; Reso (CC 71) isn't
    useMappingStore().midiMappings['Ctrl:CH1:CC21'] = { paramName: 'vdp_cc:X3:74' } as any
  })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); pcBrowse.value = { device: '', channel: 0, bank: '', index: -1, total: 0, categories: [] } })

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
    expect(vd.getCc('X3', 74, 4)).toBe(0)    // untouched channel: default
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
    expect(s.cc).toEqual({ 74: 90 })         // only the mapped control

    sent = []
    vd.setChannel('X3', 7)
    vd.recallSound('X3', s.id)
    expect(sent).toEqual([[0xb7, 64, 0], [0xb7, 32, 2], [0xc7, 29]])
    vi.advanceTimersByTime(200)
    expect(sent.slice(3)).toEqual([[0xb7, 74, 90]])
    expect(midi.routingConfig.registrations['X3'].pcChannels?.[7]?.soundName).toBe('syn:Loner')
    expect(vd.getCc('X3', 74, 7)).toBe(90)
  })

  it('a preset or category change never sends the controls, and cancels a pad recall still pending', () => {
    vi.useFakeTimers()
    const midi = useMidiStore()
    const vd = useVirtualDeviceStore()
    vd.setChannel('X3', 3)
    midi.updateRegistration('X3', 'pcChannels', { 3: { program: 29, bank: 'F', soundName: 'syn:Loner', category: 'Synth', msb: 0, lsb: 2,
      msgs: [[0xb3, 64, 0], [0xb3, 32, 2], [0xc3, 29]] } })
    vd.setCc('X3', 74, 90)
    const s = vd.saveSound('X3', 'Lead')!
    pcBrowse.value = { device: 'X3', channel: 3, bank: 'F', index: 0, total: 2, categories: ['Synth', 'Pad'] }

    sent = []
    vd.stepPreset('X3', 1)
    vd.stepCategory('X3', 1)
    vd.setCategoryFromCc('X3', 127)
    vi.advanceTimersByTime(2000)
    expect(sent).toEqual([])                  // only events to the Program Change panel

    vd.recallSound('X3', s.id)
    vd.stepPreset('X3', 1)                    // before the pad's CCs went out
    vi.advanceTimersByTime(200)
    expect(sent).toEqual([[0xb3, 64, 0], [0xb3, 32, 2], [0xc3, 29]])   // the pad's preset, no CC 74
  })

  it('never saves or sends unmapped controls; recall resets them to 0', () => {
    vi.useFakeTimers()
    const vd = useVirtualDeviceStore()
    vd.setChannel('X3', 2)
    vd.setCc('X3', 74, 90)
    vd.setCc('X3', 71, 50)
    const s = vd.saveSound('X3', 'Pad')!
    expect(s.cc).toEqual({ 74: 90 })
    // a sound saved before: unmapped CC 71 in it is still not sent
    vd.soundsOf('X3', 2)[0].cc[71] = 99
    vd.setCc('X3', 71, 40)
    sent = []
    vd.recallSound('X3', s.id)
    vi.advanceTimersByTime(200)
    expect(sent).toEqual([[0xb2, 74, 90]])
    expect(vd.getCc('X3', 71, 2)).toBe(0)
  })

  it("keeps a channel's pads per bank: the one the Program Change panel has open", async () => {
    const midi = useMidiStore()
    const vd = useVirtualDeviceStore()
    vd.setChannel('X3', 2)
    midi.updateRegistration('X3', 'pcChannels', { 2: { program: 5, bank: 'Factory A', soundName: 'A5', category: '', msb: 0, lsb: 0 } })
    expect(vd.bankOf('X3', 2)).toBe('Factory A')          // the preset's bank
    const a = vd.saveSound('X3', 'OnA', 0)!
    expect(a.bank).toBe('Factory A')
    // the Program Change panel opens another bank on this channel: its own (empty) pads
    pcBrowse.value = { device: 'X3', channel: 2, bank: 'Factory B', index: -1, total: 0 }
    expect(vd.bankOf('X3', 2)).toBe('Factory B')
    expect(vd.soundsOf('X3', 2)).toEqual([])
    sent = []
    await vd.selectSlot('X3', 0)                           // pad 1 of Factory B: empty
    expect(sent).toEqual([])
    const b = vd.saveSound('X3', 'OnB', 0)!                // doesn't overwrite Factory A's pad 1
    expect(vd.soundsOf('X3', 2).map(s => s.name)).toEqual(['OnB'])
    pcBrowse.value = { device: 'X3', channel: 2, bank: 'Factory A', index: -1, total: 0 }
    expect(vd.soundsOf('X3', 2).map(s => s.id)).toEqual([a.id])
    expect(vd.selectedSlotOf('X3')).toBeNull()             // the selected pad was Factory B's
    expect(vd.soundsOf('X3').map(s => s.id).sort()).toEqual([a.id, b.id].sort())
  })

  it("uses the device's open bank on all its channels", () => {
    const midi = useMidiStore()
    const vd = useVirtualDeviceStore()
    midi.updateRegistration('X3', 'pcChannels', { 2: { program: 5, bank: 'Factory A', soundName: 'A5', category: '', msb: 0, lsb: 0 } })
    midi.updateRegistration('X3', 'pcBank', 'Factory C')
    expect(vd.bankOf('X3', 2)).toBe('Factory C')           // the device's bank wins over the preset's
    expect(vd.bankOf('X3', 7)).toBe('Factory C')
    pcBrowse.value = { device: 'X3', channel: 2, bank: 'Factory B', index: -1, total: 0 }
    expect(vd.bankOf('X3', 3)).toBe('Factory B')           // opened on CH 3: every channel follows
    expect(vd.bankOf('X3', 7)).toBe('Factory B')
  })

  it("moves sounds saved without a bank to their preset's bank", () => {
    localStorage.setItem('anon_SYCORE_VD_SOUNDS', JSON.stringify({ X3: [
      { id: 'a', name: 'A', channel: 2, slot: 0, preset: { program: 1, bank: 'Factory A' }, cc: {}, savedAt: 1 },
      { id: 'b', name: 'B', channel: 2, slot: 0, preset: { program: 2, bank: 'Factory B' }, cc: {}, savedAt: 2 }] }))
    setActivePinia(createPinia())
    const vd = useVirtualDeviceStore()
    expect(vd.soundsOf('X3', 2, 'Factory A').map(s => s.id)).toEqual(['a'])
    expect(vd.soundsOf('X3', 2, 'Factory B').map(s => s.id)).toEqual(['b'])
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

  it('TYPE toggles All / Category', () => {
    const vd = useVirtualDeviceStore()
    vd.browseScope = 'all'
    vd.toggleBrowseScope()
    expect(vd.browseScope).toBe('category')
    vd.toggleBrowseScope()
    expect(vd.browseScope).toBe('all')
  })

  it('the CATEGORY knob picks a category of the open bank from the CC value, once per category', () => {
    const vd = useVirtualDeviceStore()
    const midi = useMidiStore()
    pcBrowse.value = { device: 'X3', channel: 2, bank: 'F', index: 0, total: 9, categories: ['Bass', 'Lead', 'Pad'] }
    midi.updateRegistration('X3', 'pcChannels', { 2: { program: 0, bank: 'F', soundName: 'B1', category: 'Bass', msb: 0, lsb: 0 } })
    const picked: string[] = []
    const off = on('device-pc-category-select', e => picked.push(`${e.channel}:${e.category}`))
    try {
      expect(vd.categoryIndex('X3')).toBe(0)
      vd.setCategoryFromCc('X3', 10)     // still Bass: nothing
      vd.setCategoryFromCc('X3', 50)     // Lead
      vd.setCategoryFromCc('X3', 60)     // Lead again, its preset not there yet: not repeated
      vd.setCategoryFromCc('X3', 127)    // Pad
      expect(picked).toEqual(['2:Lead', '2:Pad'])
      expect(vd.categories('Other')).toEqual([])
    } finally { off() }
  })

  it('a CATEGORY button steps to the next category and wraps, also on fast presses', () => {
    const vd = useVirtualDeviceStore()
    const midi = useMidiStore()
    pcBrowse.value = { device: 'X3', channel: 2, bank: 'F', index: 0, total: 9, categories: ['Bass', 'Lead', 'Pad'] }
    midi.updateRegistration('X3', 'pcChannels', { 2: { program: 0, bank: 'F', soundName: 'B1', category: 'Bass', msb: 0, lsb: 0 } })
    const picked: string[] = []
    const off = on('device-pc-category-select', e => picked.push(e.category))
    try {
      vd.stepCategory('X3', 1)
      vd.stepCategory('X3', 1)   // the Lead preset hasn't arrived yet: goes on from Lead
      vd.stepCategory('X3', 1)   // wraps
      expect(picked).toEqual(['Lead', 'Pad', 'Bass'])
    } finally { off() }
  })
})
