import { describe, it, expect } from 'vitest'
import { mapSlotParam, parseMapSlot, mapSlotCatalog, pickupSlot, pickupMove, pickupFeedback, ECHO_MS } from '@/lib/live-map'

describe('live-map', () => {
  it('slot parameter names, 1–16', () => {
    expect(mapSlotParam(0)).toBe('map_slot_1')
    expect(parseMapSlot('map_slot_16')).toBe(15)
    expect(parseMapSlot('map_slot_0')).toBeNull()
    expect(parseMapSlot('map_slot_17')).toBeNull()
    expect(parseMapSlot('rig_fill')).toBeNull()
    expect(mapSlotCatalog()).toHaveLength(16)
  })

  it('pickup: a knob far from the parameter waits until it reaches or crosses it', () => {
    const st = pickupSlot()
    expect(pickupMove(st, 0.1, 0.6, 0)).toBe(false)
    expect(pickupMove(st, 0.3, 0.6, 10)).toBe(false)
    expect(pickupMove(st, 0.7, 0.6, 20)).toBe(true)      // crossed 0.6
    expect(pickupMove(st, 0.2, 0.6, 30)).toBe(true)      // caught: follows
    const near = pickupSlot()
    expect(pickupMove(near, 0.59, 0.6, 0)).toBe(true)    // within the tolerance
    const unknown = pickupSlot()
    expect(pickupMove(unknown, 0.1, null, 0)).toBe(true) // no feedback yet: at once
  })

  it('pickup: our echo keeps control, a move in Live releases it', () => {
    const st = pickupSlot()
    pickupMove(st, 0.5, 0.5, 1000)
    pickupFeedback(st, 0.3, 1000 + ECHO_MS - 1)         // a late echo of an older move: ignored
    expect(st.caught).toBe(true)
    pickupFeedback(st, 0.51, 2000)                       // close to the knob: still ours
    expect(st.caught).toBe(true)
    pickupFeedback(st, 0.9, 2000)                        // the mouse moved it
    expect(st.caught).toBe(false)
    expect(pickupMove(st, 0.55, 0.9, 2100)).toBe(false)
    expect(pickupMove(st, 0.92, 0.9, 2200)).toBe(true)
  })
})
