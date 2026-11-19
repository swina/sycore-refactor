import { describe, it, expect } from 'vitest'
import { paramTargets, hasDeviceRoutes, deviceCcTable, PARAM_OFF } from '@/lib/seq-device-params'

describe('seq-device-params', () => {
  const cabled = ['Synth A', 'Synth B', 'Synth C']
  it('without routes every cabled device takes the Sequencer CC', () => {
    expect(hasDeviceRoutes(cabled, {})).toBe(false)
    expect(paramTargets(cabled, {}, 1)).toEqual({ plain: cabled, own: [] })
  })
  it('a device gets its own CC, an off device nothing, the rest the Sequencer CC', () => {
    const routes = { 'Synth A': { p1: 74, p2: null }, 'Synth B': { p1: PARAM_OFF, p2: 71 } }
    expect(hasDeviceRoutes(cabled, routes)).toBe(true)
    expect(paramTargets(cabled, routes, 1)).toEqual({ plain: ['Synth C'], own: [{ device: 'Synth A', cc: 74 }] })
    expect(paramTargets(cabled, routes, 2)).toEqual({ plain: ['Synth A', 'Synth C'], own: [{ device: 'Synth B', cc: 71 }] })
  })
  it('a route of a device no longer cabled is ignored', () => {
    expect(hasDeviceRoutes(['Synth C'], { 'Synth A': { p1: 74 } })).toBe(false)
  })
  it('the CC table: the device’s own, else its model’s', () => {
    const vi: any[] = [{ name: 'Synth A', ccTable: [{ cc: 74, name: 'Cutoff' }] }]
    expect(deviceCcTable('Synth A', vi, {})).toEqual([{ cc: 74, name: 'Cutoff' }])
    expect(deviceCcTable('Nope', vi, {})).toEqual([])
  })
})
