import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useLiveMapStore } from '@/stores/useLiveMapStore'
import { linkClient } from '@/stores/useLinkStore'
import { userKey } from '@/lib/userKey'
import SeqMapModal from '@/components/SeqMapModal.vue'

const slots = (names: (string | null)[]) => [...names.map(n => n ? { name: n, param: n, value: 0 } as any : null), ...Array(16 - names.length).fill(null)]
function setup(trackIndex: number, name = `T${trackIndex}`) {
  const map = useLiveMapStore()
  map.info = { track: { index: trackIndex, name } as any, device: { name: 'Synth', cls: 'X' } as any, mode: 'table', slots: slots(['Cutoff', null]), variations: null }
  const here = vi.spyOn(linkClient, 'sendMap').mockReturnValue(true)
  const there = vi.spyOn(linkClient, 'sendMapTrack').mockReturnValue(true)
  return { map, here, there }
}

// Sequencer P1 / P2 → Map slots: a route per track in Live.
describe('Live Map: Sequencer P1 / P2 routes', () => {
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); setActivePinia(createPinia()) })

  it('older bridge: only the route of the track the Map drives; the same value once', () => {
    const { map, here } = setup(2)
    expect(map.seqParamsBlock).toBe('off')
    map.seqRoutes.push({ track: 3, p1: 0, p2: null })
    expect(map.seqParamsBlock).toBe('elsewhere')
    map.seqParam(1, 127)
    expect(here).not.toHaveBeenCalled()
    map.seqRoutes[0].track = 2
    expect(map.seqParamsBlock).toBe('')
    map.seqParam(1, 127); map.seqParam(1, 127)
    expect(here).toHaveBeenCalledTimes(1)
    expect(here).toHaveBeenCalledWith(0, 1)
    map.seqParam(2, 64)   // P2 off
    expect(here).toHaveBeenCalledTimes(1)
  })

  it('an empty slot: blocked, nothing sent', () => {
    const { map, here } = setup(0)
    map.seqRoutes.push({ track: 0, p1: 1, p2: null })
    expect(map.seqParamsBlock).toBe('slot')
    map.seqParam(1, 10)
    expect(here).not.toHaveBeenCalled()
  })

  it('bridge 1.8: each track its own slots, the one in focus through the Map', () => {
    const { map, here, there } = setup(2, 'Lead')
    map.mapTrack = true
    map.seqRoutes.push({ track: 2, p1: 0, p2: null }, { track: 5, p1: 7, p2: 3 })
    expect(map.seqParamsBlock).toBe('')
    map.seqParam(1, 127); map.seqParam(1, 127)
    expect(here).toHaveBeenCalledTimes(1)
    expect(there).toHaveBeenCalledTimes(1)
    expect(there).toHaveBeenCalledWith(5, 7, 1)
    map.seqParam(2, 0)
    expect(there).toHaveBeenLastCalledWith(5, 3, 0)
    map.seqRoutes.splice(0, 1)            // the Map elsewhere: still sent, no warning
    expect(map.seqParamsBlock).toBe('')
  })

  it('the hint names the track the Map drives', () => {
    const { map } = setup(1, 'Pads')
    map.seqRoutes.push({ track: 4, p1: 0, p2: null })
    expect(map.seqParamsHint).toContain('Pads')
  })

  it('earlier versions read as one route per track', () => {
    localStorage.setItem(userKey('SYCORE_LIVE_MAP_SEQ_PARAMS'), JSON.stringify({ p1: 3, p2: null, track: 7 }))
    expect(useLiveMapStore().seqRoutes).toEqual([{ track: 7, p1: 3, p2: null }])
    setActivePinia(createPinia())
    localStorage.setItem(userKey('SYCORE_LIVE_MAP_SEQ_PARAMS'), JSON.stringify({ p1: 1, p2: 2, tracks: [0, 4] }))
    expect(useLiveMapStore().seqRoutes).toEqual([{ track: 0, p1: 1, p2: 2 }, { track: 4, p1: 1, p2: 2 }])
  })

  it('addSeqRoute: the Map\'s track first, then a free instrument track', () => {
    const { map } = setup(1)
    map.tracks = [{ index: 0, name: 'A', instrument: 'X' }, { index: 1, name: 'B', instrument: 'Y' }, { index: 2, name: 'C' }]
    expect(map.addSeqRoute()).toBe(true)
    expect(map.addSeqRoute()).toBe(true)
    expect(map.addSeqRoute()).toBe(false)
    expect(map.seqRoutes.map(r => r.track)).toEqual([1, 0])
  })
})

describe('Live Map: slot names of any track (bridge 1.8)', () => {
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); setActivePinia(createPinia()) })
  it('a route added asks Live for its names; the answer is kept per track', () => {
    const { map } = setup(0)
    map.mapTrack = true
    map.tracks = [{ index: 0, name: 'A', instrument: 'X' }, { index: 4, name: 'B', instrument: 'Y' }]
    const ask = vi.spyOn(linkClient, 'requestMapTrackSlots').mockReturnValue(true)
    map.addSeqRoute(); map.addSeqRoute()
    expect(ask).toHaveBeenCalledWith(0)
    expect(ask).toHaveBeenCalledWith(4)
    ;(linkClient as any).onMessage(JSON.stringify({ type: 'map-track-slots', track: 4, device: 'Drift', slots: ['Cutoff', null, 'Reso'] }))
    expect(map.slotNames[4]).toEqual(['Cutoff', null, 'Reso'])
  })
  it('an older bridge: not asked', () => {
    const { map } = setup(0)
    map.tracks = [{ index: 0, name: 'A', instrument: 'X' }]
    const ask = vi.spyOn(linkClient, 'requestMapTrackSlots').mockReturnValue(true)
    map.addSeqRoute()
    expect(ask).not.toHaveBeenCalled()
  })
})

describe('SeqMapModal', () => {
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); setActivePinia(createPinia()) })
  it('a row per track: track, P1 slot, P2 slot (names from the Map); + Track and ✕', async () => {
    const { map } = setup(0, 'Lead')
    map.tracks = [{ index: 0, name: 'Lead', instrument: 'Drift' }, { index: 3, name: 'Bass', instrument: 'Analog' }]
    map.slotNames[0] = ['Cutoff', null]
    const w = mount(SeqMapModal, { global: { stubs: { teleport: true } } })
    expect(w.text()).toContain('No routes')
    await w.findAll('button').find(b => b.text() === '+ Track')!.trigger('click')
    const sel = w.findAll('tbody select')
    expect(sel).toHaveLength(3)
    expect(sel[1].text()).toContain('1 · Cutoff')
    await sel[1].setValue('0')
    await sel[2].setValue('5')
    expect(map.seqRoutes).toEqual([{ track: 0, p1: 0, p2: 5 }])
    await w.findAll('button').find(b => b.text() === '✕')!.trigger('click')
    expect(map.seqRoutes).toEqual([])
  })
})
