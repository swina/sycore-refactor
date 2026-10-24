import { describe, it, expect } from 'vitest'
import { MidiService } from '@/core/midi/midi-service'

function fakeInput(name: string) {
  const listeners = new Set<any>()
  return {
    id: `in-${name}`, name, opened: 0, closed: 0,
    open() { this.opened++; return Promise.resolve(this) },
    close() { this.closed++; return Promise.resolve(this) },
    addEventListener: (_: string, fn: any) => listeners.add(fn),
    removeEventListener: (_: string, fn: any) => listeners.delete(fn),
    get listening() { return listeners.size > 0 },
  }
}

function setup(registrations: Record<string, any>) {
  const svc = new MidiService() as any
  const worlde = fakeInput('WORLDE easy key')
  const loopbe = fakeInput('LoopBe Internal MIDI')
  svc.midiAccess = {
    inputs: new Map([[worlde.id, worlde], [loopbe.id, loopbe]]),
    outputs: new Map(),
  }
  svc.setRoutingConfig({ registrations })
  svc.registerVirtualOutput('Synth via Worlde', () => {}, 'WORLDE easy key')
  svc.registerVirtualOutput('Synth via LoopBe', () => {}, 'LoopBe Internal MIDI')
  return { svc, worlde, loopbe }
}

describe('loopback input blocking', () => {
  it('opens a same-named hardware input that is wired as an input in MIDI Flow', async () => {
    const { svc, worlde, loopbe } = setup({
      'WORLDE easy key': { name: 'WORLDE easy key', inEnabled: true },
    })
    await svc.reScanInputs()
    expect(worlde.listening).toBe(true)
    expect(worlde.closed).toBe(0)
    expect(loopbe.listening).toBe(false)
  })

  it('still blocks a loopback port that is not wired as an input', async () => {
    const { svc, loopbe } = setup({})
    await svc.reScanInputs()
    await svc.reconnectInput('LoopBe Internal MIDI')
    expect(loopbe.listening).toBe(false)
    expect(loopbe.opened).toBe(0)
  })

  it('Refresh reconnects the wired input without a close()', async () => {
    const { svc, worlde } = setup({
      'WORLDE easy key': { name: 'WORLDE easy key', inEnabled: true },
    })
    await svc.reconnectInput('WORLDE easy key')
    expect(worlde.listening).toBe(true)
    expect(worlde.closed).toBe(0)
  })
})
