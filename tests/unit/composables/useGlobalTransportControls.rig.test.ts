import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/composables/useTransportManager', () => ({
  useTransportManager: () => ({ forceStopAll: vi.fn(), acquireTransport: vi.fn(), releaseTransport: vi.fn(), isRunning: { value: false } }),
}))

describe('playAll with the Rig Controller in LIVE', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('skips Chord Prog, Drum Machine and Sequencer, starts the armed slots instead', async () => {
    const { useGlobalTransportControls } = await import('@/composables/useGlobalTransportControls')
    const { useSyncStore } = await import('@/stores/useSyncStore')
    const { rigTransport } = await import('@/lib/rig-live')
    const sync = useSyncStore()
    Object.assign(sync, { syncChordProgToTransport: true, syncDrumMachineToTransport: true, syncSequencer2ToTransport: true, appDelays: {} })
    const names: string[] = []
    const on = (e: Event) => names.push(e.type)
    for (const n of ['cp-start', 'timeline-dm-start', 'toggle-sequencer2']) window.addEventListener(n, on)
    const armed = vi.fn()
    const { playAll } = useGlobalTransportControls()
    rigTransport.live = true; rigTransport.onPlayAll = armed
    playAll()
    expect(names).toEqual([])
    expect(armed).toHaveBeenCalledOnce()
    rigTransport.live = false
    playAll()
    expect(names.sort()).toEqual(['cp-start', 'timeline-dm-start', 'toggle-sequencer2'])
    expect(armed).toHaveBeenCalledOnce()
    rigTransport.onPlayAll = null
  })
})
