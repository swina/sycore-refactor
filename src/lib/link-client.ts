/**
 * link-client.ts — SY.CORE side of "SY.CORE Link" (P11 of the Ableton Live plan):
 * a WebSocket client of the Max for Live bridge, protocol v1
 * (sycore-ableton/docs/link-protocol-v1.md).
 *
 * - keeps a mirror of Live's transport (playing, beat, tempo, signature) and
 *   interpolates the beat between the device's reports (beatAt);
 * - sends MIDI with the Live beat it must play on: a performance.now() time
 *   is turned into a beat, so the device plays it on Live's grid even if this
 *   page stalls after sending;
 * - reconnects with back-off while enabled; measures the round trip (ping).
 *
 * No Vue, no stores: the WebSocket constructor and the clock are injectable (tests).
 */

export const LINK_PROTOCOL_VERSION = 1
export const LINK_DEFAULT_URL = 'ws://127.0.0.1:9400'

export type LinkState = 'off' | 'connecting' | 'connected' | 'retrying'

export interface LinkTransport {
  playing: boolean
  /** Live song time in quarter notes, as of `at`. */
  beat: number
  tempo: number
  num: number
  den: number
  /** performance.now() of the report. */
  at: number
}

export interface LinkStats {
  msgs: number
  late: number
  dropped: number
  leadMinMs: number | null
  leadAvgMs: number | null
}

export type LinkEvent =
  | { type: 'state'; state: LinkState }
  | { type: 'hello'; device: string; version: string; track: string; sim: boolean }
  /** playing, tempo or signature changed (not sent for every position report) */
  | { type: 'transport'; transport: LinkTransport }
  | { type: 'stats'; stats: LinkStats }
  | { type: 'error'; code: string; message: string }

interface WsLike {
  readyState: number
  send(data: string): void
  close(): void
  onopen: ((ev?: unknown) => void) | null
  onclose: ((ev?: unknown) => void) | null
  onerror: ((ev?: unknown) => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
}

export interface LinkClientOptions {
  url?: string
  /** WebSocket constructor (tests: a fake). */
  WebSocketImpl?: new (url: string) => WsLike
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (id: unknown) => void
  /** App version announced in hello. */
  appVersion?: string
  pingEveryMs?: number
}

const OPEN = 1

/**
 * One channel message as plain integer bytes: the status byte kept (0x80–0xEF), the data
 * bytes rounded and kept in 0–127, missing ones as 0; the length the status needs
 * (2 for program change / channel pressure, else 3). Null when it isn't a channel message.
 * Real MIDI ports accept loose values (truncated by the browser); the bridge doesn't.
 */
export function sanitizeMidi(data: ArrayLike<number>): number[] | null {
  const status = Math.round(Number(data?.[0]))
  if (!(status >= 0x80 && status <= 0xef)) return null
  const kind = status & 0xf0
  const len = kind === 0xc0 || kind === 0xd0 ? 2 : 3
  const out = [status]
  for (let i = 1; i < len; i++) {
    const b = Math.round(Number(data[i]))
    out.push(Number.isFinite(b) ? Math.min(127, Math.max(0, b)) : 0)
  }
  return out
}
const BACKOFF_MS = [500, 1000, 2000, 5000]

export class LinkClient {
  readonly url: string
  private ws: WsLike | null = null
  private enabled = false
  private _state: LinkState = 'off'
  private retries = 0
  private retryTimer: unknown = null
  private pingTimer: unknown = null
  private pings = new Map<number, number>()
  private pingSeq = 0
  /** Got the device's hello and a first transport since (re)connecting: MIDI may go out. */
  private ready = false
  private listeners: ((e: LinkEvent) => void)[] = []
  private readonly WS: new (url: string) => WsLike
  private readonly now: () => number
  private readonly setTimer: (fn: () => void, ms: number) => unknown
  private readonly clearTimer: (id: unknown) => void
  private readonly appVersion: string
  private readonly pingEveryMs: number

  transport: LinkTransport = { playing: false, beat: 0, tempo: 120, num: 4, den: 4, at: 0 }
  device: { name: string; version: string; track: string; sim: boolean } | null = null
  /** Mean of the last round trips, ms (null until measured). */
  rttMs: number | null = null
  private rtts: number[] = []
  lastStats: LinkStats | null = null

  constructor(opts: LinkClientOptions = {}) {
    this.url = opts.url ?? LINK_DEFAULT_URL
    this.WS = opts.WebSocketImpl ?? (globalThis as any).WebSocket
    this.now = opts.now ?? (() => performance.now())
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
    this.clearTimer = opts.clearTimer ?? (id => clearTimeout(id as any))
    this.appVersion = opts.appVersion ?? ''
    this.pingEveryMs = opts.pingEveryMs ?? 2000
  }

  get state(): LinkState { return this._state }
  /** Connected and synced with the device: MIDI can be sent. */
  get isReady(): boolean { return this._state === 'connected' && this.ready }

  on(cb: (e: LinkEvent) => void): () => void {
    this.listeners.push(cb)
    return () => { this.listeners = this.listeners.filter(l => l !== cb) }
  }
  private emit(e: LinkEvent) { this.listeners.forEach(l => { try { l(e) } catch (err) { console.warn('[Link] listener', err) } }) }

  private setState(s: LinkState) {
    if (s === this._state) return
    this._state = s
    this.emit({ type: 'state', state: s })
  }

  // ── Connection ─────────────────────────────────────────────────────────────

  enable(): void {
    if (this.enabled) return
    this.enabled = true
    this.retries = 0
    this.connect()
  }

  disable(): void {
    this.enabled = false
    if (this.retryTimer !== null) { this.clearTimer(this.retryTimer); this.retryTimer = null }
    if (this.ws) {
      // End what sounds before leaving (the device also clears when its last client goes).
      if (this.ws.readyState === OPEN) this.sendRaw({ type: 'clear' })
      this.detach(this.ws)
      try { this.ws.close() } catch {}
      this.ws = null
    }
    this.stopPing()
    this.ready = false
    this.device = null
    this.setState('off')
  }

  private connect() {
    if (!this.enabled) return
    this.setState(this.retries === 0 ? 'connecting' : 'retrying')
    let ws: WsLike
    try { ws = new this.WS(this.url) } catch { this.scheduleRetry(); return }
    this.ws = ws
    this.ready = false
    ws.onopen = () => {
      this.retries = 0
      this.setState('connected')
      this.sendRaw({ type: 'hello', client: 'sycore', app: this.appVersion })
      this.startPing()
    }
    ws.onmessage = ev => this.onMessage(ev.data)
    ws.onerror = () => { /* followed by close */ }
    ws.onclose = () => {
      if (this.ws !== ws) return
      this.detach(ws)
      this.ws = null
      this.ready = false
      this.device = null
      this.stopPing()
      this.scheduleRetry()
    }
  }

  private detach(ws: WsLike) { ws.onopen = ws.onclose = ws.onerror = null; ws.onmessage = null }

  private scheduleRetry() {
    if (!this.enabled) return
    const ms = BACKOFF_MS[Math.min(this.retries, BACKOFF_MS.length - 1)]
    this.retries++
    this.setState('retrying')
    this.retryTimer = this.setTimer(() => { this.retryTimer = null; this.connect() }, ms)
  }

  private startPing() {
    this.stopPing()
    const tick = () => {
      this.ping()
      this.pingTimer = this.setTimer(tick, this.pingEveryMs)
    }
    tick()
  }
  private stopPing() {
    if (this.pingTimer !== null) { this.clearTimer(this.pingTimer); this.pingTimer = null }
    this.pings.clear()
  }

  ping(): void {
    const t = ++this.pingSeq
    this.pings.set(t, this.now())
    this.sendRaw({ type: 'ping', t })
  }

  // ── Incoming ───────────────────────────────────────────────────────────────

  private onMessage(raw: unknown) {
    let m: any
    try { m = JSON.parse(String(raw)) } catch { return }
    if (!m || typeof m.type !== 'string') return
    if (m.v !== undefined && Math.floor(Number(m.v)) !== LINK_PROTOCOL_VERSION) {
      this.emit({ type: 'error', code: 'version', message: `device speaks protocol v${m.v}, SY.CORE v${LINK_PROTOCOL_VERSION}` })
      return
    }
    const now = this.now()
    switch (m.type) {
      case 'hello':
        this.device = { name: String(m.device ?? ''), version: String(m.version ?? ''), track: String(m.track ?? ''), sim: !!m.sim }
        this.emit({ type: 'hello', device: this.device.name, version: this.device.version, track: this.device.track, sim: this.device.sim })
        break
      case 'transport': {
        const prev = this.transport
        const next: LinkTransport = {
          playing: !!m.playing,
          beat: Number.isFinite(Number(m.beat)) ? Number(m.beat) : this.beatAt(now),
          tempo: Number(m.tempo) > 0 ? Number(m.tempo) : prev.tempo,
          num: Number(m.num) > 0 ? Number(m.num) : prev.num,
          den: Number(m.den) > 0 ? Number(m.den) : prev.den,
          at: now,
        }
        this.transport = next
        const firstSinceConnect = !this.ready && this.device !== null
        if (this.device) this.ready = true
        if (firstSinceConnect || next.playing !== prev.playing || next.tempo !== prev.tempo || next.num !== prev.num || next.den !== prev.den) {
          this.emit({ type: 'transport', transport: next })
        }
        break
      }
      case 'pong': {
        const sent = this.pings.get(m.t)
        if (sent !== undefined) {
          this.pings.delete(m.t)
          this.rtts = [...this.rtts.slice(-9), now - sent]
          this.rttMs = Math.round((this.rtts.reduce((a, b) => a + b, 0) / this.rtts.length) * 100) / 100
        }
        break
      }
      case 'stats':
        this.lastStats = { msgs: m.msgs | 0, late: m.late | 0, dropped: m.dropped | 0, leadMinMs: m.leadMinMs ?? null, leadAvgMs: m.leadAvgMs ?? null }
        this.emit({ type: 'stats', stats: this.lastStats })
        break
      case 'error':
        this.emit({ type: 'error', code: String(m.code ?? ''), message: String(m.message ?? '') })
        break
    }
  }

  // ── Time ───────────────────────────────────────────────────────────────────

  /** Live's beat at performance.now() time `t` (extrapolated while playing). */
  beatAt(t: number): number {
    const tr = this.transport
    return tr.playing ? tr.beat + ((t - tr.at) * tr.tempo) / 60000 : tr.beat
  }

  /** performance.now() time of Live beat `beat` (only meaningful while playing). */
  timeOfBeat(beat: number): number {
    const tr = this.transport
    return tr.at + ((beat - tr.beat) * 60000) / tr.tempo
  }

  // ── Outgoing ───────────────────────────────────────────────────────────────

  private sendRaw(obj: Record<string, unknown>): boolean {
    const ws = this.ws
    if (!ws || ws.readyState !== OPEN) return false
    try { ws.send(JSON.stringify({ v: LINK_PROTOCOL_VERSION, ...obj })); return true } catch { return false }
  }

  /**
   * One channel message, to play at performance.now() time `at` (omitted or past: now).
   * While Live plays, `at` becomes a Live beat; stopped, it goes out at once.
   * False when not connected (nothing sent).
   */
  sendMidi(data: ArrayLike<number>, at?: number): boolean {
    if (!this.isReady) return false
    const bytes = sanitizeMidi(data)
    if (!bytes) return false
    const now = this.now()
    if (this.transport.playing && at !== undefined && at > now) {
      return this.sendRaw({ type: 'midi', data: bytes, beat: this.beatAt(at) })
    }
    return this.sendRaw({ type: 'midi', data: bytes })
  }

  /** Drop everything queued in the device and end the notes sounding (stop, panic). */
  clear(): boolean {
    return this.sendRaw({ type: 'clear' })
  }
}
