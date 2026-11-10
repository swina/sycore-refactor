import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useExternalClockStore, clockSourcePort } from '@/stores/useExternalClockStore'

describe('useExternalClockStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('defaults to the internal clock with "stop" on clock loss', () => {
    const s = useExternalClockStore()
    expect(s.source).toBe('internal')
    expect(s.isExternal).toBe(false)
    expect(s.mode).toBe('INT')
    expect(s.lossBehavior).toBe('stop')
  })

  it('a MIDI source is EXT, and the fallback after clock loss shows INT', () => {
    const s = useExternalClockStore()
    s.setSource('midi:SYC CTRL')
    expect(s.port).toBe('SYC CTRL')
    expect(s.mode).toBe('EXT')
    s.fallbackToInternal = true
    expect(s.mode).toBe('INT')
    s.setSource('midi:SYC CTRL')
    expect(s.fallbackToInternal).toBe(false)
  })

  it('manual switch to INT', () => {
    const s = useExternalClockStore()
    s.setSource('midi:SYC CTRL')
    s.switchToInternal()
    expect(s.isExternal).toBe(false)
  })

  it('persists the source and the clock-loss behavior', async () => {
    const s = useExternalClockStore()
    s.setSource('midi:SYC CTRL')
    s.lossBehavior = 'continue'
    await nextTick()
    setActivePinia(createPinia())
    const again = useExternalClockStore()
    expect(again.source).toBe('midi:SYC CTRL')
    expect(again.lossBehavior).toBe('continue')
  })

  it('clockSourcePort', () => {
    expect(clockSourcePort('internal')).toBeNull()
    expect(clockSourcePort('midi:loopMIDI Port')).toBe('loopMIDI Port')
  })
})
