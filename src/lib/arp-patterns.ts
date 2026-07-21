/**
 * Shared arpeggiator pattern engine.
 *
 * Exact port of ArpeggiatorPanel.vue's startArpEngine() per-mode index math
 * (the "LOGICA DEGLI STILI DI ABLETON LIVE" block), extracted into a pure,
 * stateless-per-call function so it can be reused anywhere a note order
 * needs to follow one of these 10 patterns — the standalone Arpeggiator and
 * Chord Prog Sequencer's per-step arp mode both call this, instead of each
 * keeping their own copy of the pattern branches.
 *
 * Do not change the per-mode math here without also verifying the
 * standalone Arpeggiator still sounds identical — see
 * docs/plans/modular/ChordProg-Per-Step-Mode.md Phase 1.
 */

export const ARP_MODES = [
  'up', 'down', 'up-down', 'down-up', 'converge', 'diverge',
  'pinky-up', 'thumb-up', 'random', 'random-other',
] as const

export type ArpMode = typeof ARP_MODES[number]

export interface ArpPatternState {
  currentIndex: number
  subIndex: number
  direction: 1 | -1
}

export function defaultArpPatternState(): ArpPatternState {
  return { currentIndex: -1, subIndex: 0, direction: 1 }
}

/**
 * Mutates `state` in place and returns the next index into a notes array of
 * length `len` (the caller's notes array — already sorted/deduped, matching
 * ArpeggiatorPanel.vue's `[...new Set(expandedNotes)].sort((a,b) => a-b)`
 * convention). Returns -1 if `len` is 0 (nothing to play).
 */
export function nextArpIndex(mode: ArpMode, state: ArpPatternState, len: number): number {
  if (len <= 0) return -1

  // Stale index guard (e.g. notes were released, shrinking the array)
  if (state.currentIndex >= len) {
    state.currentIndex = 0
    state.subIndex = 0
  }

  let nextIndex = 0

  if (mode === 'up') {
    nextIndex = (state.currentIndex + 1) % len

  } else if (mode === 'down') {
    nextIndex = state.currentIndex - 1
    if (nextIndex < 0) nextIndex = len - 1

  } else if (mode === 'up-down') {
    nextIndex = state.currentIndex + state.direction
    if (nextIndex >= len) {
      nextIndex = len - 1
      state.direction = -1
    } else if (nextIndex < 0) {
      nextIndex = 0
      state.direction = 1
    }

  } else if (mode === 'down-up') {
    nextIndex = state.currentIndex + state.direction
    if (nextIndex >= len) {
      nextIndex = len - 1
      state.direction = 1
    } else if (nextIndex < 0) {
      nextIndex = 0
      state.direction = -1
    }

  } else if (mode === 'converge') {
    state.subIndex = (state.subIndex + 1) % len
    const step = Math.floor(state.subIndex / 2)
    if (state.subIndex % 2 === 0) {
      nextIndex = step
    } else {
      nextIndex = (len - 1) - step
    }

  } else if (mode === 'diverge') {
    state.subIndex = (state.subIndex + 1) % len
    const mid = Math.floor((len - 1) / 2)
    const step = Math.floor((state.subIndex + 1) / 2)
    if (state.subIndex === 0) {
      nextIndex = mid
    } else if (state.subIndex % 2 === 1) {
      nextIndex = mid + step
      if (nextIndex >= len) nextIndex = len - 1
    } else {
      nextIndex = mid - step
      if (nextIndex < 0) nextIndex = 0
    }

  } else if (mode === 'pinky-up') {
    if (state.currentIndex === len - 1) {
      nextIndex = state.subIndex
      state.subIndex = (state.subIndex + 1) % (len - 1)
    } else {
      nextIndex = len - 1
    }

  } else if (mode === 'thumb-up') {
    if (state.currentIndex === 0) {
      nextIndex = state.subIndex
      if (state.subIndex === 0) state.subIndex = 1
      state.subIndex = (state.subIndex + 1) % len
      if (state.subIndex === 0) state.subIndex = 1
    } else {
      nextIndex = 0
    }

  } else if (mode === 'random') {
    nextIndex = Math.floor(Math.random() * len)

  } else if (mode === 'random-other') {
    do {
      nextIndex = Math.floor(Math.random() * len)
    } while (nextIndex === state.currentIndex)
  }

  state.currentIndex = nextIndex
  return nextIndex
}
