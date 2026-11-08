import { describe, it, expect, beforeEach } from 'vitest'
import { LinkClient, sanitizeMidi, type LinkEvent } from '@/lib/link-client'

/** A fake WebSocket the test drives by hand. */
class FakeWs {
  static last: FakeWs | null = null
  static all: FakeWs[] = []
  readyState = 0
  sent: any[] = []
  onopen: ((ev?: unknown) => void) | null = null
  onclose: ((ev?: unknown) => void) | null = null
  onerror: ((ev?: unknown) => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null
  closed = false
  constructor(public url: string) { FakeWs.last = this; FakeWs.all.push(this) }
  send(d: string) { this.sent.push(JSON.parse(d)) }
  close() { this.closed = true; this.readyState = 3 }
  open() { this.readyState = 1; this.onopen?.() }
  drop() { this.readyState = 3; this.onclose?.() }
  recv(obj: object) { this.onmessage?.({ data: JSON.stringify({ v: 1, ...obj }) }) }
}

function setup() {
  let now = 0
  const timers: { at: number; fn: () => void; id: number }[] = []
  let seq = 0
  const client = new LinkClient({
    WebSocketImpl: FakeWs as any,
    now: () => now,
    setTimer: (fn, ms) => { const id = ++seq; timers.push({ at: now + ms, fn, id }); return id },
    clearTimer: id => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1) },
    pingEveryMs: 1000,
  })
  const events: LinkEvent[] = []
  client.on(e => events.push(e))
  const advance = (ms: number) => {
    const until = now + ms
    for (;;) {
      timers.sort((a, b) => a.at - b.at)
      const t = timers[0]
      if (!t || t.at > until) break
      timers.shift(); now = t.at; t.fn()
    }
    now = until
  }
  return { client, events, advance, setNow: (t: number) => { now = t } }
}

/** Connected, hello + transport received (Live playing at 120 from beat 0 at t=0). */
function connected() {
  const s = setup()
  s.client.enable()
  const ws = FakeWs.last!
  ws.open()
  ws.recv({ type: 'hello', device: 'sycore-link', version: '1.0.0', track: 'Keys', sim: false })
  ws.recv({ type: 'transport', playing: true, beat: 0, tempo: 120, num: 4, den: 4 })
  return { ...s, ws }
}

describe('LinkClient', () => {
  beforeEach(() => { FakeWs.last = null; FakeWs.all = [] })

  it('says hello on open and is ready after the device hello + a transport', () => {
    const s = setup()
    s.client.enable()
    const ws = FakeWs.last!
    expect(s.client.state).toBe('connecting')
    ws.open()
    expect(ws.sent[0]).toMatchObject({ v: 1, type: 'hello', client: 'sycore' })
    expect(s.client.isReady).toBe(false)
    ws.recv({ type: 'hello', device: 'sycore-link', version: '1.0.0', track: 'Keys', sim: false })
    expect(s.client.isReady).toBe(false)
    ws.recv({ type: 'transport', playing: false, beat: 4, tempo: 90, num: 3, den: 4 })
    expect(s.client.isReady).toBe(true)
    expect(s.client.device?.track).toBe('Keys')
    expect(s.events.some(e => e.type === 'transport')).toBe(true)
  })

  it('interpolates the beat while playing', () => {
    const { client, setNow } = connected()
    setNow(500)
    expect(client.beatAt(500)).toBeCloseTo(1)
    expect(client.timeOfBeat(2)).toBeCloseTo(1000)
  })

  it('emits transport only on playing / tempo / signature changes', () => {
    const { ws, events, setNow } = connected()
    const n = events.filter(e => e.type === 'transport').length
    setNow(50); ws.recv({ type: 'transport', playing: true, beat: 0.1, tempo: 120, num: 4, den: 4 })
    expect(events.filter(e => e.type === 'transport').length).toBe(n)
    ws.recv({ type: 'transport', playing: true, beat: 0.1, tempo: 100, num: 4, den: 4 })
    expect(events.filter(e => e.type === 'transport').length).toBe(n + 1)
  })

  it('sends MIDI with the Live beat of its time while playing', () => {
    const { client, ws } = connected()
    expect(client.sendMidi([0x90, 60, 100], 250)).toBe(true) // 250 ms at 120 BPM = beat 0.5
    const m = ws.sent.at(-1)
    expect(m).toMatchObject({ type: 'midi', data: [0x90, 60, 100] })
    expect(m.beat).toBeCloseTo(0.5)
  })

  it('sends MIDI without a beat when stopped or already due', () => {
    const { client, ws } = connected()
    client.sendMidi([0xb0, 7, 64])
    expect(ws.sent.at(-1).beat).toBeUndefined()
    ws.recv({ type: 'transport', playing: false, beat: 8, tempo: 120 })
    client.sendMidi([0x90, 60, 100], 1000)
    expect(ws.sent.at(-1).beat).toBeUndefined()
  })

  it('sends nothing while not ready', () => {
    const s = setup()
    s.client.enable()
    FakeWs.last!.open()
    expect(s.client.sendMidi([0x90, 60, 100])).toBe(false)
  })

  it('measures the round trip', () => {
    const { client, ws, setNow } = connected()
    const ping = ws.sent.find(m => m.type === 'ping')
    setNow(2)
    ws.recv({ type: 'pong', t: ping.t, beat: 0 })
    expect(client.rttMs).toBe(2)
  })

  it('reconnects with back-off and waits for a new hello before sending', () => {
    const { client, ws, advance, events } = connected()
    ws.drop()
    expect(client.state).toBe('retrying')
    expect(client.isReady).toBe(false)
    advance(499); expect(FakeWs.all.length).toBe(1)
    advance(1); expect(FakeWs.all.length).toBe(2)
    FakeWs.last!.drop()            // still down: next try after 1 s
    advance(999); expect(FakeWs.all.length).toBe(2)
    advance(1); expect(FakeWs.all.length).toBe(3)
    const ws3 = FakeWs.last!
    ws3.open()
    ws3.recv({ type: 'transport', playing: true, beat: 0, tempo: 120 })
    expect(client.isReady).toBe(false) // no hello yet on this connection
    ws3.recv({ type: 'hello', device: 'sycore-link', version: '1.0.0', track: '', sim: false })
    ws3.recv({ type: 'transport', playing: true, beat: 0, tempo: 120 })
    expect(client.isReady).toBe(true)
    expect(events.filter(e => e.type === 'state').map(e => (e as any).state)).toContain('retrying')
  })

  it('disable clears the device, closes and stops retrying', () => {
    const { client, ws, advance } = connected()
    client.disable()
    expect(ws.sent.at(-1)).toMatchObject({ type: 'clear' })
    expect(ws.closed).toBe(true)
    expect(client.state).toBe('off')
    advance(10000)
    expect(FakeWs.all.length).toBe(1)
  })

  it('reports a protocol version mismatch', () => {
    const { ws, events } = connected()
    ws.onmessage?.({ data: JSON.stringify({ v: 2, type: 'hello' }) })
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'version' })
  })

  it('keeps the device stats', () => {
    const { client, ws } = connected()
    ws.recv({ type: 'stats', msgs: 10, late: 1, dropped: 0, leadMinMs: 80, leadAvgMs: 92 })
    expect(client.lastStats).toEqual({ msgs: 10, late: 1, dropped: 0, leadMinMs: 80, leadAvgMs: 92, reportJitterMs: null })
  })
})

describe('sanitizeMidi', () => {
  it('integer bytes in range, the right length, missing ones as 0', () => {
    expect(sanitizeMidi([0x90, 60.4, 101.6])).toEqual([0x90, 60, 102])
    expect(sanitizeMidi([0x80, 60, undefined as any])).toEqual([0x80, 60, 0])
    expect(sanitizeMidi([0x90, 60, 200])).toEqual([0x90, 60, 127])
    expect(sanitizeMidi([0xc0, 5, 9])).toEqual([0xc0, 5])
    expect(sanitizeMidi(new Uint8Array([0xb0, 7, 64]))).toEqual([0xb0, 7, 64])
  })
  it('not a channel message: null', () => {
    expect(sanitizeMidi([0xf8])).toBeNull()
    expect(sanitizeMidi([60, 100, 0])).toBeNull()
    expect(sanitizeMidi([])).toBeNull()
  })
})
