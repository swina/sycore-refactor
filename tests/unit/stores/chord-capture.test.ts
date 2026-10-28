import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useChordProgStore, nameCapturedChord, CAPTURE_MAX } from '@/stores/useChordProgStore'
import { applyParamValue } from '@/composables/useMidiCCListener'

describe('Chord Capture buffer (useChordProgStore)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('captures the held notes, sorted and named', () => {
    const store = useChordProgStore()
    for (const n of [67, 60, 64]) store.trackCaptureNote(true, n)
    expect(store.captureChord()).toEqual({ chordName: 'C', notes: [60, 64, 67] })
    expect(store.captureBuffer).toHaveLength(1)
  })

  it('captures the last struck chord after it has been released', () => {
    const store = useChordProgStore()
    for (const n of [57, 60, 64]) store.trackCaptureNote(true, n)
    for (const n of [57, 60, 64]) store.trackCaptureNote(false, n)
    expect(store.captureChord()?.chordName).toBe('Am')
  })

  it('a new chord after full release replaces the last-chord memory', () => {
    const store = useChordProgStore()
    store.trackCaptureNote(true, 60); store.trackCaptureNote(false, 60)
    store.trackCaptureNote(true, 62); store.trackCaptureNote(true, 65)
    store.trackCaptureNote(false, 62); store.trackCaptureNote(false, 65)
    expect(store.captureChord()?.notes).toEqual([62, 65])
  })

  it('does nothing when no notes were played', () => {
    const store = useChordProgStore()
    expect(store.captureChord()).toBeNull()
    expect(store.captureBuffer).toHaveLength(0)
  })

  it('caps the buffer at CAPTURE_MAX, dropping the oldest', () => {
    const store = useChordProgStore()
    store.trackCaptureNote(true, 60)
    for (let i = 0; i < CAPTURE_MAX + 3; i++) store.captureChord()
    expect(store.captureBuffer).toHaveLength(CAPTURE_MAX)
  })

  it('imports from step 1 and sets the pattern length to the captured count', () => {
    const store = useChordProgStore()
    store.captureBuffer = [
      { chordName: 'C', notes: [60, 64, 67] },
      { chordName: 'F', notes: [65, 69, 72] },
      { chordName: 'G', notes: [67, 71, 74] },
    ]
    store.setStep(1, { duration: '1m', velocity: 70 })
    expect(store.importCaptureBuffer(0)).toBe(3)
    expect(store.numSteps).toBe(3)
    expect(store.steps[1]).toMatchObject({ chordName: 'F', notes: [65, 69, 72], active: true, duration: '1m', velocity: 70 })
  })

  it('imports at a start step, growing numSteps and clipping at 16', () => {
    const store = useChordProgStore()
    store.captureBuffer = Array.from({ length: 5 }, () => ({ chordName: 'C', notes: [60, 64, 67] }))
    store.numSteps = 8
    expect(store.importCaptureBuffer(14)).toBe(2)
    expect(store.numSteps).toBe(16)
    expect(store.importCaptureBuffer(2)).toBe(5)
    expect(store.numSteps).toBe(16)
  })

  it('names unknown voicings by their note labels', () => {
    expect(nameCapturedChord([60])).toBe('C4')
  })

  it('cp_capture MIDI param captures on press only', () => {
    const store = useChordProgStore()
    store.trackCaptureNote(true, 60)
    const stubs = { lfoStore: {}, mappingStore: {}, uiStore: {}, presetStore: { lastPreset: {}, updateFieldValue: vi.fn() },
      midiStore: {}, arpStore: {}, noteLatchStore: {}, drumStore: {}, mixerStore: {}, configStore: { midiConfig: [] }, cpStore: store }
    applyParamValue('cp_capture', 0, false, stubs)
    expect(store.captureBuffer).toHaveLength(0)
    applyParamValue('cp_capture', 127, false, stubs)
    applyParamValue('cp_capture', 90, true, stubs)
    expect(store.captureBuffer).toHaveLength(2)
  })
})
