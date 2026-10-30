import { describe, it, expect } from 'vitest'
import { MidiService } from '@/core/midi/midi-service'
import { mappedParamFor, mappingKeysFor } from '@/composables/useMidiCCListener'

// A controller wired to a device in MIDI Flow whose knob is also learned on a Virtual Device dial:
// the dial sends the CC to the selected channel, so Thru must not also forward it on every
// channel of the controller's cable.
function setup(exclude: (dev: string, ch: number, kind: 'cc' | 'note', n: number) => boolean) {
  const svc = new MidiService() as any
  const input = { id: 'in-keys', name: 'Keys' }
  svc.midiAccess = { inputs: new Map([[input.id, input]]), outputs: new Map() }
  svc.setRoutingConfig({
    globalThruEnabled: true,
    registrations: {
      Keys: { name: 'Keys', inEnabled: true, inChannel: -1 },
      X3: { name: 'X3', outEnabled: true, notes: true, cc: true, outChannel: -1 },
    },
  })
  const thru: number[][] = []
  svc.registerVirtualOutput('X3', (data: number[]) => thru.push(data))
  svc.router.matrix.set('Keys', new Set(['X3']))
  const ccs: number[] = []
  svc.addCCListener((cc: number) => ccs.push(cc))
  svc.setThruExclude(exclude)
  const receive = (bytes: number[]) => svc.handleIngress({ data: new Uint8Array(bytes), target: input, timeStamp: performance.now() })
  return { thru, ccs, receive }
}

describe('Thru exclusion of consumed controls', () => {
  it('keeps an excluded CC out of Thru but still delivers it to the CC listeners', () => {
    const { thru, ccs, receive } = setup((_d, _c, kind, n) => kind === 'cc' && n === 74)
    receive([0xb0, 74, 100])
    receive([0xb0, 71, 50])
    expect(thru).toEqual([[0xb0, 71, 50]])
    expect(ccs).toEqual([74, 71])
  })
})

describe('mappedParamFor', () => {
  const mappings = {
    'Keys:CH1:CC74': { paramName: 'vdp_cc:X3:74' },
    'Keys:20': 'seq_time',
    '21': 'arp_rate',
    'Keys:CH2:NOTE36': { paramName: 'vdp_preset_next:X3' },
  }
  it('resolves the most specific key first, CCs and notes', () => {
    expect(mappedParamFor(mappings, 'Keys', 0, 'cc', 74)).toBe('vdp_cc:X3:74')
    expect(mappedParamFor(mappings, 'Keys', 5, 'cc', 74)).toBeNull()
    expect(mappedParamFor(mappings, 'Keys', 3, 'cc', 20)).toBe('seq_time')
    expect(mappedParamFor(mappings, 'Other', 0, 'cc', 21)).toBe('arp_rate')
    expect(mappedParamFor(mappings, 'Keys', 1, 'note', 36)).toBe('vdp_preset_next:X3')
  })
})

describe('mappingKeysFor', () => {
  it('lists the keys a control can be stored under; device-specific only without the legacy key', () => {
    expect(mappingKeysFor('Keys', 0, 'cc', 48)).toEqual(['Keys:CH1:CC48', 'Keys:48', '48'])
    expect(mappingKeysFor('Keys', 0, 'cc', 48, { withPlain: false })).toEqual(['Keys:CH1:CC48', 'Keys:48'])
    expect(mappingKeysFor('Keys', 9, 'note', 36, { withPlain: false })).toEqual(['Keys:CH10:NOTE36', 'Keys:NOTE36'])
  })
})
