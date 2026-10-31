import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useMappingStore } from '@/stores/useMappingStore'
import {
  askLearnConflict, findLearnConflicts, pendingLearnConflict, registerLearnOwnerProvider, describeParam,
} from '@/lib/midi-learn-conflicts'

const flush = () => new Promise(r => setTimeout(r, 0))

describe('MIDI Learn conflicts', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    pendingLearnConflict.value = null
  })

  function learnCC(store: ReturnType<typeof useMappingStore>, param: string, cc: number, device = 'Keys', ch = 0) {
    store.learnForParam(param)
    store.incomingCC(cc, device, ch)
  }

  it('stores at once when the control is free', () => {
    const store = useMappingStore()
    learnCC(store, 'vdp_cc:X3:74', 21)
    expect((store.midiMappings['Keys:CH1:CC21'] as any).paramName).toBe('vdp_cc:X3:74')
    expect(pendingLearnConflict.value).toBeNull()
  })

  it('re-learning the same param on the same control is not a conflict', () => {
    const store = useMappingStore()
    learnCC(store, 'vdp_cc:X3:74', 21)
    learnCC(store, 'vdp_cc:X3:74', 21)
    expect(pendingLearnConflict.value).toBeNull()
  })

  it('asks before taking a control mapped to another param; Keep leaves the old mapping', async () => {
    const store = useMappingStore()
    learnCC(store, 'vdp_cc:X3:74', 21)
    learnCC(store, 'mix_master_vol', 21)
    expect(pendingLearnConflict.value?.owners.map(o => o.label)).toEqual([describeParam('vdp_cc:X3:74')])
    pendingLearnConflict.value!.resolve(false)
    await flush()
    expect((store.midiMappings['Keys:CH1:CC21'] as any).paramName).toBe('vdp_cc:X3:74')
    expect(store.isMidiLearning).toBe(false)
  })

  it('Replace drops the old binding (also a device-less legacy key) and stores the new one', async () => {
    const store = useMappingStore()
    learnCC(store, 'vdp_cc:X3:74', 21)
    store.midiMappings['21'] = 'cutoff'
    learnCC(store, 'mix_master_vol', 21)
    expect(pendingLearnConflict.value?.owners).toHaveLength(2)
    pendingLearnConflict.value!.resolve(true)
    await flush()
    expect((store.midiMappings['Keys:CH1:CC21'] as any).paramName).toBe('mix_master_vol')
    expect(store.midiMappings['21']).toBeUndefined()
  })

  it('a different channel or device is a different control', () => {
    const store = useMappingStore()
    learnCC(store, 'vdp_cc:X3:74', 21)
    learnCC(store, 'mix_master_vol', 21, 'Keys', 1)
    learnCC(store, 'mix_drums_vol', 21, 'Pads', 0)
    expect(pendingLearnConflict.value).toBeNull()
  })

  it('sees bindings of other learn systems and releases them on Replace', async () => {
    let bound = true
    const unreg = registerLearnOwnerProvider(c => (bound && c.kind === 'cc' && c.number === 30)
      ? [{ id: 'pc:x', label: 'Program Change · next mapped channel', release: () => { bound = false } }] : [], 'test')
    try {
      expect(findLearnConflicts({ kind: 'cc', number: 30, channel: 0, device: 'Keys' }, ['pc:x'])).toEqual([])
      const p = askLearnConflict({ kind: 'cc', number: 30, channel: 0, device: 'Keys' }, 'vd')
      pendingLearnConflict.value!.resolve(true)
      expect(await p).toBe(true)
      expect(bound).toBe(false)
    } finally { unreg() }
  })

  it('MIDI Actions on the control are conflicts too', () => {
    const store = useMappingStore()
    store.appMidiMappings = [{ id: 'a1', device: 'Keys', cc: 21, channel: -1, action: 'channel_up' }]
    learnCC(store, 'vdp_cc:X3:74', 21)
    expect(pendingLearnConflict.value?.owners.map(o => o.id)).toEqual(['action:a1'])
  })
})
