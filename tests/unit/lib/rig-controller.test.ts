import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  createRigState, slotState, slotColor, slotProgress, pressSlot, releaseSlot, setTrackOption,
  generate, undo, selectSection, panic, tick, startClock, stopClock, toggleClockSource,
  shiftKey, toggleSolo, motionNext, setRng, triggerSyncSteps,
  lpGridNote, lpSideNote, lpTopCc, LP_COLOR, STEPS_PER_BAR, type RigState, type RigAppId,
} from '@/lib/rig-controller'

const get = (s: RigState, id: RigAppId) => s.apps.find(a => a.id === id)!
const drum = (s: RigState) => get(s, 'drum')

/** Run the simulated clock (16ths) up to the next bar line. */
function toNextBar(s: RigState) {
  const bar = s.clock.bar
  while (s.clock.bar === bar) tick(s)
}
const ticks = (s: RigState, n: number) => { for (let i = 0; i < n; i++) tick(s) }

describe('rig-controller state (defaults: Latch, Stay, bar sync)', () => {
  let s: RigState
  beforeEach(() => { s = createRigState() })

  it('a pressed slot is queued, then plays on the next bar', () => {
    startClock(s)
    pressSlot(s, 'drum', 1)
    expect(slotState(drum(s), 1)).toBe('queued')
    ticks(s, 6)
    expect(slotState(drum(s), 1)).toBe('queued')
    toNextBar(s)
    expect(slotState(drum(s), 1)).toBe('playing')
    expect(drum(s).queued).toBeNull()
  })

  it('an empty slot cannot be queued', () => {
    pressSlot(s, 'drum', 7)
    expect(drum(s).queued).toBeNull()
    expect(s.display).toMatch(/empty/)
  })

  it('pressing the playing slot again stops the app (Latch)', () => {
    pressSlot(s, 'drum', 0)
    startClock(s)
    expect(drum(s).playing).toBe(0)
    pressSlot(s, 'drum', 0)
    expect(drum(s).playing).toBeNull()
  })

  it('Play applies what is queued at once; Stop keeps the queue', () => {
    pressSlot(s, 'drum', 2)
    startClock(s)
    expect(drum(s).playing).toBe(2)
    stopClock(s)
    pressSlot(s, 'drum', 3)
    ticks(s, 32)
    expect(drum(s).queued).toBe(3)
  })

  it('Stay loops the slot and the progress wraps', () => {
    pressSlot(s, 'drum', 0)
    startClock(s)
    ticks(s, 8)
    expect(slotProgress(drum(s), 0)).toBeCloseTo(0.5)
    ticks(s, 8)
    expect(drum(s).playing).toBe(0)
    expect(drum(s).pos).toBe(0)
  })

  it('Generate fills the first empty slot and queues it; Undo restores it', () => {
    const before = [...drum(s).filled]
    generate(s, 'drum')
    const target = before.findIndex(f => !f)
    expect(drum(s).filled[target]).toBe(true)
    expect(drum(s).queued).toBe(target)
    undo(s)
    expect(drum(s).filled).toEqual(before)
    expect(drum(s).queued).toBeNull()
  })

  it('a section switches every app that has that slot, on the bar', () => {
    startClock(s)
    selectSection(s, 1)
    expect(s.queuedSection).toBe(1)
    toNextBar(s)
    expect(s.section).toBe(1)
    for (const a of s.apps) if (a.filled[1]) expect(a.playing).toBe(1)
    expect(get(s, 'arp').playing).toBeNull()
  })

  it('Panic stops and clears every app', () => {
    selectSection(s, 0)
    startClock(s)
    pressSlot(s, 'chord', 1)
    s.latch = true
    panic(s)
    for (const a of s.apps) { expect(a.playing).toBeNull(); expect(a.queued).toBeNull() }
    expect(s.latch).toBe(false)
  })

  it('clock source, key and solo toggle as expected', () => {
    toggleClockSource(s)
    expect(s.clock.source).toBe('INT')
    shiftKey(s, -1)
    expect(s.key).toBe(11)
    toggleSolo(s, 'bass')
    toggleSolo(s, 'drum')
    expect(s.apps.filter(a => a.solo).map(a => a.id)).toEqual(['drum'])
  })
})

describe('rig-controller Trigger sync', () => {
  let s: RigState
  beforeEach(() => { s = createRigState(); startClock(s); ticks(s, 5) }) // bar 1, step 5

  it('Off starts at once', () => {
    setTrackOption(s, 'drum', 'triggerSync', 'off')
    pressSlot(s, 'drum', 1)
    expect(drum(s).playing).toBe(1)
  })

  it('1/4 beat starts on the next 16th, 1 beat on the next beat', () => {
    setTrackOption(s, 'drum', 'triggerSync', '1/4')
    pressSlot(s, 'drum', 1)
    expect(drum(s).queued).toBe(1)
    tick(s)
    expect(drum(s).playing).toBe(1)
    setTrackOption(s, 'bass', 'triggerSync', '1')
    pressSlot(s, 'bass', 0)
    tick(s) // step 7
    expect(get(s, 'bass').queued).toBe(0)
    tick(s) // step 8 = beat 3
    expect(get(s, 'bass').playing).toBe(0)
  })

  it('Auto syncs to the slot length, at most 4 beats', () => {
    setTrackOption(s, 'chord', 'triggerSync', 'auto')
    expect(triggerSyncSteps(get(s, 'chord'), 1)).toBe(STEPS_PER_BAR) // a 2-bar slot → 4 beats
  })

  it('Tolerant: a press just after the bar line starts at once, cut; a later one waits', () => {
    setTrackOption(s, 'drum', 'triggerSync', 'tolerant')
    toNextBar(s)
    ticks(s, 2) // step 2 of the bar
    pressSlot(s, 'drum', 1)
    expect(drum(s).playing).toBe(1)
    expect(drum(s).pos).toBe(2)
    setTrackOption(s, 'bass', 'triggerSync', 'tolerant')
    ticks(s, 6) // step 8
    pressSlot(s, 'bass', 0)
    expect(get(s, 'bass').queued).toBe(0)
  })

  it('Queue plays the pressed slots in order, each after the previous ends', () => {
    setTrackOption(s, 'drum', 'triggerSync', 'queue')
    pressSlot(s, 'drum', 0)
    toNextBar(s)
    expect(drum(s).playing).toBe(0)
    pressSlot(s, 'drum', 2)
    pressSlot(s, 'drum', 1)
    expect(drum(s).queue).toEqual([2, 1])
    toNextBar(s)
    expect(drum(s).playing).toBe(2)
    toNextBar(s)
    expect(drum(s).playing).toBe(1)
  })
})

describe('rig-controller Position sync', () => {
  it('Auto starts from the song position, 1 beat from the beat grid', () => {
    const s = createRigState()
    startClock(s)
    ticks(s, 6) // song step 6
    setTrackOption(s, 'drum', 'triggerSync', 'off')
    setTrackOption(s, 'drum', 'positionSync', 'auto')
    pressSlot(s, 'drum', 1)
    expect(drum(s).pos).toBe(6)
    setTrackOption(s, 'bass', 'triggerSync', 'off')
    setTrackOption(s, 'bass', 'positionSync', '1')
    pressSlot(s, 'bass', 0)
    expect(get(s, 'bass').pos).toBe(4)
  })
})

describe('rig-controller Motion', () => {
  afterEach(() => setRng(Math.random))

  it('One shot plays once then stops', () => {
    const s = createRigState()
    setTrackOption(s, 'drum', 'motion', 'oneShot')
    pressSlot(s, 'drum', 0)
    startClock(s)
    toNextBar(s)
    expect(drum(s).playing).toBeNull()
  })

  it('March & wrap / stay / stop move along the filled slots', () => {
    const s = createRigState() // drum filled A–D
    const d = drum(s)
    setTrackOption(s, 'drum', 'motion', 'marchWrap')
    expect([motionNext(d, 0), motionNext(d, 3)]).toEqual([1, 0])
    setTrackOption(s, 'drum', 'motion', 'marchStay')
    expect(motionNext(d, 3)).toBe(3)
    setTrackOption(s, 'drum', 'motion', 'marchStop')
    expect(motionNext(d, 3)).toBeNull()
    pressSlot(s, 'drum', 2)
    startClock(s)
    toNextBar(s)
    expect(d.playing).toBe(3)
    toNextBar(s)
    expect(d.playing).toBeNull()
  })

  it('Random may repeat, Exclusive random never repeats the current slot', () => {
    const s = createRigState()
    const d = drum(s)
    setRng(() => 0)
    setTrackOption(s, 'drum', 'motion', 'random')
    expect(motionNext(d, 0)).toBe(0)
    setTrackOption(s, 'drum', 'motion', 'exclusiveRandom')
    expect(motionNext(d, 0)).toBe(1)
  })
})

describe('rig-controller Press', () => {
  let s: RigState
  beforeEach(() => { s = createRigState(); startClock(s); setTrackOption(s, 'drum', 'triggerSync', 'off') })

  it('Retrigger restarts the playing slot; Shift + press stops', () => {
    setTrackOption(s, 'drum', 'press', 'retrigger')
    pressSlot(s, 'drum', 0)
    ticks(s, 5)
    pressSlot(s, 'drum', 0)
    expect(drum(s).playing).toBe(0)
    expect(drum(s).pos).toBe(0)
    s.shift = true
    pressSlot(s, 'drum', 0)
    expect(drum(s).playing).toBeNull()
  })

  it('Hold & stop plays while held', () => {
    setTrackOption(s, 'drum', 'press', 'holdStop')
    pressSlot(s, 'drum', 1)
    expect(drum(s).playing).toBe(1)
    releaseSlot(s, 'drum', 1)
    expect(drum(s).playing).toBeNull()
  })

  it('Hold & motion: on release the next press of that pad plays the next slot', () => {
    setTrackOption(s, 'drum', 'press', 'holdMotion')
    setTrackOption(s, 'drum', 'motion', 'marchWrap')
    pressSlot(s, 'drum', 0)
    releaseSlot(s, 'drum', 0)
    expect(drum(s).playing).toBeNull()
    expect(drum(s).cursor).toBe(1)
    pressSlot(s, 'drum', 0)
    expect(drum(s).playing).toBe(1)
    releaseSlot(s, 'drum', 0)
    pressSlot(s, 'drum', 0)
    expect(drum(s).playing).toBe(2)
  })
})

describe('rig-controller Launchpad Mini MK1 mapping', () => {
  it('uses the XY layout notes and the top-row CCs', () => {
    expect(lpGridNote(0, 0)).toBe(0)
    expect(lpGridNote(4, 7)).toBe(71)
    expect(lpGridNote(7, 7)).toBe(119)
    expect(lpSideNote(0)).toBe(8)
    expect(lpSideNote(7)).toBe(120)
    expect(lpTopCc(0)).toBe(104)
    expect(lpTopCc(7)).toBe(111)
  })

  it('maps slot states to LED colors', () => {
    expect(slotColor('empty')).toBe('off')
    expect(slotColor('filled')).toBe('amber')
    expect(slotColor('queued')).toBe('amberFlash')
    expect(slotColor('playing')).toBe('green')
    expect(LP_COLOR.green).toBe(60)
    expect(LP_COLOR.amber).toBe(51)
  })
})
