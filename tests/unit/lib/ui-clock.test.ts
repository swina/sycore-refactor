import { describe, it, expect, vi } from 'vitest'

vi.mock('tone', () => ({ getContext: () => ({ currentTime: 0 }) }))
const ticks: (() => void)[] = []
vi.mock('@/core/midi/step-scheduler', () => ({ createWorkerTicker: (fn: () => void) => { ticks.push(fn); return () => { ticks.splice(ticks.indexOf(fn), 1) } } }))

describe('ui-clock', () => {
  it('runs callbacks when due, in order, late ones too (Tone Draw dropped them), without rAF', async () => {
    const { drawAt, flushUi, _setUiNow } = await import('@/lib/ui-clock')
    let now = 0
    _setUiNow(() => now)
    const ran: string[] = []
    drawAt(() => ran.push('b'), 2)
    drawAt(() => ran.push('a'), 1)
    flushUi()
    expect(ran).toEqual([])
    now = 10 // seconds late: still run
    ticks[0]()
    expect(ran).toEqual(['a', 'b'])
    expect(ticks.length).toBe(0) // the ticker stops with nothing queued
    drawAt(() => ran.push('c'), 0)
    expect(ticks.length).toBe(1)
    flushUi()
    expect(ran).toEqual(['a', 'b', 'c'])
  })
  it('uiTimeout runs from the worker timer, and cancels', async () => {
    const { uiTimeout } = await import('@/lib/ui-clock')
    let t = 1000
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => t)
    const ran: string[] = []
    uiTimeout(() => ran.push('x'), 20)
    const cancel = uiTimeout(() => ran.push('y'), 20)
    cancel()
    ticks[0]()
    expect(ran).toEqual([])
    t = 1030
    ticks[0]()
    expect(ran).toEqual(['x'])
    expect(ticks.length).toBe(0)
    spy.mockRestore()
  })
  it('frameLoop runs from the worker while the page is hidden', async () => {
    const { frameLoop } = await import('@/lib/ui-clock')
    const spy = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    let n = 0
    const stop = frameLoop(() => n++)
    ticks[ticks.length - 1]()
    ticks[ticks.length - 1]()
    expect(n).toBe(2)
    stop()
    spy.mockRestore()
  })
})
