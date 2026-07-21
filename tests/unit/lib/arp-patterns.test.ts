import { describe, it, expect } from 'vitest'
import { ARP_MODES, nextArpIndex, defaultArpPatternState } from '@/lib/arp-patterns'
import type { ArpMode } from '@/lib/arp-patterns'

// Reference oracle — a literal, unmodified copy of ArpeggiatorPanel.vue's
// pre-extraction startArpEngine() index math (the "LOGICA DEGLI STILI DI
// ABLETON LIVE" block), reimplemented here with its own closure state
// instead of importing the component. This exists purely so the extracted
// nextArpIndex() can be checked against the exact algorithm it replaced,
// tick-for-tick, rather than trusting hand-traced expected sequences (easy
// to get wrong for the more intricate modes like converge/pinky-up).
function makeOracle() {
  let currentArpIndex = -1
  let arpDirection: 1 | -1 = 1
  let subIndex = 0

  return function oracleNext(mode: ArpMode, len: number): number {
    if (currentArpIndex >= len) {
      currentArpIndex = 0
      subIndex = 0
    }
    let nextIndex = 0

    if (mode === 'up') {
      nextIndex = (currentArpIndex + 1) % len
    } else if (mode === 'down') {
      nextIndex = currentArpIndex - 1
      if (nextIndex < 0) nextIndex = len - 1
    } else if (mode === 'up-down') {
      nextIndex = currentArpIndex + arpDirection
      if (nextIndex >= len) { nextIndex = len - 1; arpDirection = -1 }
      else if (nextIndex < 0) { nextIndex = 0; arpDirection = 1 }
    } else if (mode === 'down-up') {
      nextIndex = currentArpIndex + arpDirection
      if (nextIndex >= len) { nextIndex = len - 1; arpDirection = 1 }
      else if (nextIndex < 0) { nextIndex = 0; arpDirection = -1 }
    } else if (mode === 'converge') {
      subIndex = (subIndex + 1) % len
      const step = Math.floor(subIndex / 2)
      nextIndex = subIndex % 2 === 0 ? step : (len - 1) - step
    } else if (mode === 'diverge') {
      subIndex = (subIndex + 1) % len
      const mid = Math.floor((len - 1) / 2)
      const step = Math.floor((subIndex + 1) / 2)
      if (subIndex === 0) nextIndex = mid
      else if (subIndex % 2 === 1) { nextIndex = mid + step; if (nextIndex >= len) nextIndex = len - 1 }
      else { nextIndex = mid - step; if (nextIndex < 0) nextIndex = 0 }
    } else if (mode === 'pinky-up') {
      if (currentArpIndex === len - 1) { nextIndex = subIndex; subIndex = (subIndex + 1) % (len - 1) }
      else nextIndex = len - 1
    } else if (mode === 'thumb-up') {
      if (currentArpIndex === 0) {
        nextIndex = subIndex
        if (subIndex === 0) subIndex = 1
        subIndex = (subIndex + 1) % len
        if (subIndex === 0) subIndex = 1
      } else nextIndex = 0
    }
    // random/random-other excluded — non-deterministic, tested separately below

    currentArpIndex = nextIndex
    return nextIndex
  }
}

const DETERMINISTIC_MODES = ARP_MODES.filter(m => m !== 'random' && m !== 'random-other')

describe('nextArpIndex — matches the pre-extraction ArpeggiatorPanel.vue algorithm exactly', () => {
  for (const mode of DETERMINISTIC_MODES) {
    for (const len of [2, 3, 4, 5, 8]) {
      it(`mode "${mode}", ${len} notes: 40 ticks match the reference oracle`, () => {
        const oracle = makeOracle()
        const state = defaultArpPatternState()
        for (let i = 0; i < 40; i++) {
          const expected = oracle(mode, len)
          const actual = nextArpIndex(mode, state, len)
          expect(actual).toBe(expected)
        }
      })
    }
  }
})

describe('nextArpIndex — basic invariants', () => {
  it('returns -1 for an empty notes array', () => {
    const state = defaultArpPatternState()
    expect(nextArpIndex('up', state, 0)).toBe(-1)
  })

  it('every mode stays within [0, len) over many ticks', () => {
    for (const mode of ARP_MODES) {
      const state = defaultArpPatternState()
      for (let i = 0; i < 50; i++) {
        const idx = nextArpIndex(mode, state, 5)
        expect(idx).toBeGreaterThanOrEqual(0)
        expect(idx).toBeLessThan(5)
      }
    }
  })

  it('"random-other" never repeats the same index on consecutive ticks', () => {
    const state = defaultArpPatternState()
    let prev = nextArpIndex('random-other', state, 4)
    for (let i = 0; i < 50; i++) {
      const next = nextArpIndex('random-other', state, 4)
      expect(next).not.toBe(prev)
      prev = next
    }
  })

  it('recovers when the array shrinks out from under a stale currentIndex', () => {
    const state = defaultArpPatternState()
    nextArpIndex('up', state, 8)
    state.currentIndex = 20 // simulate notes released, array now shorter
    const idx = nextArpIndex('up', state, 3)
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(idx).toBeLessThan(3)
  })
})
