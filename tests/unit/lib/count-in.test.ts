import { describe, it, expect, vi, afterEach } from 'vitest'
import { countIn, startCountIn, cancelCountIn } from '@/lib/count-in'

describe('count-in', () => {
  afterEach(() => { cancelCountIn(); vi.useRealTimers() })

  it('0 bars: no count-in, nothing run', () => {
    const go = vi.fn()
    expect(startCountIn(0, 120, go)).toBe(false)
    expect(countIn.active).toBe(false)
    expect(go).not.toHaveBeenCalled()
  })

  it('1 bar at 120 BPM: 4 3 2 1, then Play after 2 s', () => {
    vi.useFakeTimers()
    const go = vi.fn()
    expect(startCountIn(1, 120, go)).toBe(true)
    vi.advanceTimersByTime(0)
    expect(countIn).toMatchObject({ active: true, left: 4, beat: 1 })
    vi.advanceTimersByTime(500)
    expect(countIn).toMatchObject({ left: 3, beat: 2 })
    vi.advanceTimersByTime(1000)
    expect(countIn).toMatchObject({ left: 1, beat: 4 })
    expect(go).not.toHaveBeenCalled()
    vi.advanceTimersByTime(500)
    expect(go).toHaveBeenCalledOnce()
    expect(countIn.active).toBe(false)
  })

  it('2 bars: the beat restarts on the second bar', () => {
    vi.useFakeTimers()
    startCountIn(2, 60, () => {})
    vi.advanceTimersByTime(4000)
    expect(countIn).toMatchObject({ left: 4, beat: 1 })
  })

  it('cancel: nothing starts', () => {
    vi.useFakeTimers()
    const go = vi.fn()
    startCountIn(1, 120, go)
    vi.advanceTimersByTime(700)
    expect(cancelCountIn()).toBe(true)
    vi.advanceTimersByTime(5000)
    expect(go).not.toHaveBeenCalled()
    expect(countIn.active).toBe(false)
  })
})
