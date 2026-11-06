import { describe, it, expect } from 'vitest'
import { MidiService } from '@/core/midi/midi-service'

// Two objects for the same port (e.g. one from the startup scan, one from a
// statechange): the ingress listener must end up on only one of them, or every
// message is handled twice (an incoming clock read at double tempo).
function fakeInput(id: string, name: string) {
  const listeners = new Set<any>()
  return {
    id, name,
    open() { return Promise.resolve(this) },
    close() { return Promise.resolve(this) },
    addEventListener: (_: string, fn: any) => listeners.add(fn),
    removeEventListener: (_: string, fn: any) => listeners.delete(fn),
    get count() { return listeners.size },
  }
}

describe('ingress listener — one per port id', () => {
  it('re-attaching through a second object for the same port leaves a single listener', async () => {
    const svc = new MidiService() as any
    const first = fakeInput('input-17', 'SYC CTRL B')
    svc.midiAccess = { inputs: new Map([[first.id, first]]), outputs: new Map() }
    svc.setRoutingConfig({ registrations: {} })
    await svc.reScanInputs()
    expect(first.count).toBe(1)

    // The browser hands out another object for the same port.
    const second = fakeInput('input-17', 'SYC CTRL B')
    svc.midiAccess.inputs = new Map([[second.id, second]])
    await svc.reconnectInput('SYC CTRL B')
    expect(first.count + second.count).toBe(1)
    expect(second.count).toBe(1)
  })

  it('attaching twice to the same object keeps one listener', async () => {
    const svc = new MidiService() as any
    const inp = fakeInput('input-1', 'Keys')
    svc.midiAccess = { inputs: new Map([[inp.id, inp]]), outputs: new Map() }
    svc.setRoutingConfig({ registrations: {} })
    await svc.reScanInputs()
    await svc.reScanInputs()
    await svc.reconnectInput('Keys')
    expect(inp.count).toBe(1)
  })
})
