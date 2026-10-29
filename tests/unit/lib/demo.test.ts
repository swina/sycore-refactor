import { describe, it, expect, beforeEach } from 'vitest'
import { seedDemoRouting, DEMO_FM1_OUTPUT, demoGuestUser } from '@/lib/demo'

function fakeStore() {
  const s = {
    routingConfig: { registrations: {} as Record<string, any> },
    routing: {} as Record<string, string[]>,
    addRegistration(name: string) { s.routingConfig.registrations[name] = { name, inEnabled: true, outEnabled: true } },
    updateRegistration(name: string, field: string, value: any) { s.routingConfig.registrations[name][field] = value },
    setRouting(source: string, outs: string[]) { s.routing[source] = outs },
  }
  return s
}

describe('demo build', () => {
  beforeEach(() => localStorage.clear())

  it('seeds Chord Progression → FM-1 on the first visit only', () => {
    const store = fakeStore()
    expect(seedDemoRouting(store, 'CHORD_PROG', 'k')).toBe(true)
    expect(store.routing.CHORD_PROG).toEqual([DEMO_FM1_OUTPUT])
    expect(store.routingConfig.registrations[DEMO_FM1_OUTPUT]).toMatchObject({ inEnabled: false, outEnabled: true })

    store.setRouting('CHORD_PROG', [])           // the visitor removes the cable
    expect(seedDemoRouting(store, 'CHORD_PROG', 'k')).toBe(false)
    expect(store.routing.CHORD_PROG).toEqual([])
  })

  it('guest user has no password hash', () => {
    expect(demoGuestUser().__passwordHash).toBeUndefined()
  })
})
