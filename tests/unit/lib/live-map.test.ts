import { describe, it, expect } from 'vitest'
import { mapSlotParam, parseMapSlot, parseMapButton, mapSlotCatalog, stepTrack, knobTrack, pickupSlot, pickupMove, pickupFeedback, ECHO_MS } from '@/lib/live-map'

describe('live-map', () => {
  it('slot parameter names, 1–16', () => {
    expect(mapSlotParam(0)).toBe('map_slot_1')
    expect(parseMapSlot('map_slot_16')).toBe(15)
    expect(parseMapSlot('map_slot_0')).toBeNull()
    expect(parseMapSlot('map_slot_17')).toBeNull()
    expect(parseMapSlot('rig_fill')).toBeNull()
    expect(mapSlotCatalog()).toHaveLength(16 + 2 + 8 + 1 + 2 + 4)
  })

  it('Map buttons: variations and randomize', () => {
    expect(parseMapButton('map_var_next')).toEqual({ kind: 'variation', v: 'next' })
    expect(parseMapButton('map_var_prev')).toEqual({ kind: 'variation', v: 'prev' })
    expect(parseMapButton('map_var_3')).toEqual({ kind: 'variation', v: 2 })
    expect(parseMapButton('map_var_9')).toBeNull()
    expect(parseMapButton('map_randomize')).toEqual({ kind: 'randomize' })
    expect(parseMapButton('map_var_store')).toEqual({ kind: 'variation', v: 'store' })
    expect(parseMapButton('map_var_delete')).toEqual({ kind: 'variation', v: 'delete' })
    expect(parseMapButton('map_slot_1')).toBeNull()
    expect(parseMapButton('map_track_next')).toEqual({ kind: 'track', step: 1 })
    expect(parseMapButton('map_track_follow')).toEqual({ kind: 'follow' })
  })

  it('track: steps among the tracks with an instrument, without wrapping; a knob across them', () => {
    const t = [1, 2, 4, 7]                               // 0 = a group, 3 / 5 / 6 = no instrument
    expect(stepTrack(t, 2, 1)).toBe(4)
    expect(stepTrack(t, 7, 1)).toBe(7)
    expect(stepTrack(t, 1, -1)).toBe(1)
    expect(stepTrack(t, 5, 1)).toBe(7)                   // from a track without one: the next after it
    expect(stepTrack(t, 5, -1)).toBe(4)
    expect(stepTrack(t, 0, -1)).toBe(1)
    expect(stepTrack(t, -1, 1)).toBe(1)
    expect(stepTrack(t, -1, -1)).toBe(7)
    expect(stepTrack([], 2, 1)).toBe(-1)
    expect(knobTrack(t, 0)).toBe(1)
    expect(knobTrack(t, 1)).toBe(7)
    expect(knobTrack(t, 0.5)).toBe(4)
    expect(knobTrack([], 0.5)).toBe(-1)
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
