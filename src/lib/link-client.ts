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
/** An app's exact beat is used only within this many ms of the beat of its time (else converted). */
export const EXACT_BEAT_MAX_MS = 15

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
  /** How much later than the device's estimate Live's position reports arrived (ms, max). */
  reportJitterMs?: number | null
  /** Bridge 1.4+: messages played on MIDI ports (via SY.CORE Link), late / dropped, to missing ports, timed-queue lateness (ms, max). */
  portMsgs?: number
  portLate?: number
  portDropped?: number
  portMissing?: number
  portTimerMaxMs?: number | null
}

export type LinkEvent =
  | { type: 'state'; state: LinkState }
  | { type: 'hello'; device: string; version: string; track: string; sim: boolean }
  /** playing, tempo or signature changed (not sent for every position report) */
  | { type: 'transport'; transport: LinkTransport }
  | { type: 'stats'; stats: LinkStats }
  | { type: 'error'; code: string; message: string }
  /** a click on a SY.CORE Rig device in Live: a rig action (rig_slot_drum_a, rig_mute_bass…) */
  | { type: 'rig-press'; name: string }
  /** SY.CORE Map (P12): the instrument the Map device drives now, and its slots */
  | { type: 'map-info'; info: LinkMapInfo }
  /** a slot's parameter moved in Live (mouse, automation): 0–1, for LEDs and pickup */
  | { type: 'map-value'; slot: number; value: number }
  /** the set's tracks; instrument: its first instrument's name ('' = none) */
  | { type: 'map-tracks'; tracks: { index: number; name: string; instrument?: string }[] }
  /** every parameter of an instrument (asked with requestMapParams), for the table editor */
  | { type: 'map-params'; cls: string; name: string; params: LinkMapParam[] }

/** One slot of a SY.CORE Map table: a Live parameter by original_name, its range (the parameter's
 *  own units, default its full range) and whether it moves by whole numbers. */
export interface LinkMapSlot { param: string; min?: number; max?: number; int?: boolean }
/** The tables by Live class_name (Drift, UltraAnalog, OriginalSimpler…), 16 slots each (null = empty). */
export type LinkMapTables = Record<string, (LinkMapSlot | null)[]>
export interface LinkMapInfo {
  track: { index: number; name: string } | null
  device: { name: string; cls: string; rack: string | null } | null
  /** table: the instrument's table · macros: a Rack's Macros · mixed: a Rack's configured Macros, then the
   *  first instrument's table (parameters a Macro holds left out) · auto: no table, the instrument's first
   *  16 parameters (Max for Live devices, plugins) · none: nothing to drive */
  mode: 'table' | 'macros' | 'mixed' | 'auto' | 'none'
  slots: ({ param: string; name: string; value: number } | null)[]
  /** the Macro Variations of the Rack in focus (selected -1 = none); null: no Rack */
  variations?: { count: number; selected: number } | null
}
export interface LinkMapParam { name: string; shown: string; min: number; max: number; quantized: 0 | 1 }

/** The Rig Controller's state for the SY.CORE Rig devices (5 rows: Chord Drum Seq Bass Arp). */
export interface LinkRigState {
  /** gen: Generates done on the row (a change flashes the devices' GEN) */
  rows: { filled: number; playing: number; queued: number; muted: boolean; solo: boolean; gen?: number }[]
  section: number
  queuedSection: number
  /** The Drum Machine's Fill is on (the devices' FILL lights). */
  fill?: boolean
  /** The chord sounding and the next one (labels: '1/1', '1/4'…), or null. */
  chord?: { now: string; dur: string; next: string; nextDur: string; ms: number; bars: number; seq: number } | null
}

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
/** Mirror vs report off by more than this: Live jumped (beats). */
const MIRROR_JUMP_BEATS = 0.25
/** Share of a report's difference taken when it is ahead of the mirror / behind it (see mirrorBeat). */
const MIRROR_GAIN_AHEAD = 0.3
const MIRROR_GAIN_BEHIND = 0.02
/** A report behind the mirror by up to this (beats) is most likely one read late (a long task on the
 *  page held the WebSocket message): taken as a jump only if the next report says the same. Taken at
 *  once it moved the mirror back, the Link clock saw Live "jump", and SY.CORE stopped all its apps and
 *  restarted them a bar later — on the first Play after a reload, whose long tasks are the longest. */
const MIRROR_LATE_BEATS = 1

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

  /** Diagnostics: a note sent with its exact beat, and how far (ms) its converted time was. */
  onExactBeat: ((ms: number) => void) | null = null
  transport: LinkTransport = { playing: false, beat: 0, tempo: 120, num: 4, den: 4, at: 0 }
  device: { name: string; version: string; track: string; sim: boolean; ports: boolean; play: boolean } | null = null
  /** Mean of the last round trips, ms (null until measured). */
  rttMs: number | null = null
  private rtts: number[] = []
  lastStats: LinkStats | null = null
  /** performance.now() of lastStats (the device sends stats only while MIDI arrives). */
  lastStatsAt = 0

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
    this.offsets = []
    this.clockOffset = null
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
        this.device = { name: String(m.device ?? ''), version: String(m.version ?? ''), track: String(m.track ?? ''), sim: !!m.sim, ports: !!m.ports, play: !!m.play }
        this.emit({ type: 'hello', device: this.device.name, version: this.device.version, track: this.device.track, sim: this.device.sim })
        break
      case 'transport': {
        const prev = this.transport
        const playing = !!m.playing
        const tempo = Number(m.tempo) > 0 ? Number(m.tempo) : prev.tempo
        const next: LinkTransport = {
          playing,
          beat: this.mirrorBeat(prev, playing, tempo, this.reportBeatNow(m, playing, tempo, now), now, this.reportAge(m, now) !== null),
          tempo,
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
          // The device's clock at the pong (1.3.4+): offset = its clock − ours, from the ping with the
          // shortest round trip of the last ones (the least delayed, so the most exact).
          if (Number.isFinite(Number(m.nt))) {
            const rtt = now - sent
            this.offsets = [...this.offsets.slice(-9), { rtt, off: Number(m.nt) - (sent + rtt / 2) }]
            this.clockOffset = this.offsets.reduce((a, b) => (b.rtt < a.rtt ? b : a)).off
          }
        }
        break
      }
      case 'stats':
        this.lastStats = { msgs: m.msgs | 0, late: m.late | 0, dropped: m.dropped | 0, leadMinMs: m.leadMinMs ?? null, leadAvgMs: m.leadAvgMs ?? null, reportJitterMs: m.reportJitterMs ?? null,
          portMsgs: m.portMsgs | 0, portLate: m.portLate | 0, portDropped: m.portDropped | 0, portMissing: m.portMissing | 0, portTimerMaxMs: m.portTimerMaxMs ?? null }
        this.lastStatsAt = performance.now()
        this.emit({ type: 'stats', stats: this.lastStats })
        break
      case 'error':
        this.emit({ type: 'error', code: String(m.code ?? ''), message: String(m.message ?? '') })
        break
      case 'rig-press':
        if (typeof m.name === 'string' && m.name.startsWith('rig_')) this.emit({ type: 'rig-press', name: m.name })
        break
      case 'map-info':
        if (Array.isArray(m.slots)) this.emit({ type: 'map-info', info: { track: m.track ?? null, device: m.device ?? null, mode: m.mode ?? 'none', slots: m.slots, variations: m.variations ?? null } })
        break
      case 'map-value':
        if (Number.isInteger(m.slot) && typeof m.value === 'number') this.emit({ type: 'map-value', slot: m.slot, value: m.value })
        break
      case 'map-tracks':
        if (Array.isArray(m.tracks)) this.emit({ type: 'map-tracks', tracks: m.tracks })
        break
      case 'map-params':
        if (Array.isArray(m.params)) this.emit({ type: 'map-params', cls: String(m.cls ?? ''), name: String(m.name ?? ''), params: m.params })
        break
    }
  }

  // ── Time ───────────────────────────────────────────────────────────────────

  /**
   * The mirror's beat after a report `reported` received at `now`. While Live plays at a
   * steady tempo the mirror runs on its own and only leans towards the reports: a report is
   * never early (it was true when sent, it is read later — a busy page, the WebSocket), so
   * one ahead of the mirror is taken in a good part (the mirror was behind), one behind it
   * barely (most likely just read late). A big difference is a jump (loop, relocation) and
   * is taken at once, as are a start, a stop and a tempo change. Without this each report
   * re-anchored the mirror with its own delivery delay, and the beat of every note sent
   * (`beatAt` of its time) wobbled by tens of ms.
   */
  /** How old a transport report is (ms), from its `at` and the clocks' offset; null = not known
   *  (a bridge before 1.3.4, or no pong yet). */
  private reportAge(m: any, now: number): number | null {
    if (this.clockOffset === null || !Number.isFinite(Number(m.at))) return null
    return Math.min(5000, Math.max(0, now - (Number(m.at) - this.clockOffset)))
  }
  /** The report's beat brought to `now`: a report read late (the page busy, reports queued) is
   *  where Live was when it was sent, not now. */
  private reportBeatNow(m: any, playing: boolean, tempo: number, now: number): unknown {
    const age = this.reportAge(m, now)
    if (age === null || !playing || !Number.isFinite(Number(m.beat))) return m.beat
    return Number(m.beat) + (age * tempo) / 60000
  }
  /** The device's clock − ours (ms), from the pongs; null until the first one (1.3.4+). */
  private clockOffset: number | null = null
  private offsets: { rtt: number; off: number }[] = []

  private mirrorBeat(prev: LinkTransport, playing: boolean, tempo: number, reported: unknown, now: number, aged = false): number {
    const predicted = this.beatAt(now)
    if (!Number.isFinite(Number(reported))) return predicted
    const beat = Number(reported)
    if (!playing || !prev.playing || tempo !== prev.tempo) { this.lateSuspect = false; return beat }
    const err = beat - predicted
    // Reports with their age (bridge 1.3.4+) are already corrected: a difference is Live's own.
    const suspect = !aged && err < -MIRROR_JUMP_BEATS && err >= -MIRROR_LATE_BEATS
    if (suspect && !this.lateSuspect) { this.lateSuspect = true; return predicted }
    this.lateSuspect = false
    if (Math.abs(err) > MIRROR_JUMP_BEATS) return beat
    return predicted + err * (err > 0 ? MIRROR_GAIN_AHEAD : MIRROR_GAIN_BEHIND)
  }
  /** The last report was behind the mirror by a late read's amount (see MIRROR_LATE_BEATS). */
  private lateSuspect = false

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
  sendMidi(data: ArrayLike<number>, at?: number, beat?: number): boolean {
    if (!this.isReady) return false
    const bytes = sanitizeMidi(data)
    if (!bytes) return false
    const now = this.now()
    if (this.transport.playing && at !== undefined && at > now) {
      const converted = this.beatAt(at)
      // The exact beat from the app's grid (a chord on beat 4 is 4.000): the time → beat round trip
      // wobbled with the transport mirror's corrections (< 2 ms measured). Trusted only that close
      // to its time (EXACT_BEAT_MAX_MS): at a late start the grid's beat can be gone already.
      if (this.exactBeatOk(beat, converted)) {
        this.onExactBeat?.((beat - converted) * 60000 / this.transport.tempo)
        return this.sendRaw({ type: 'midi', data: bytes, beat })
      }
      return this.sendRaw({ type: 'midi', data: bytes, beat: converted })
    }
    return this.sendRaw({ type: 'midi', data: bytes })
  }

  /** An app's exact beat, close enough to the beat of its time to be used (see sendMidi). */
  private exactBeatOk(beat: number | undefined, converted: number): boolean {
    return beat !== undefined && Number.isFinite(beat) && Math.abs(beat - converted) * 60000 / this.transport.tempo < EXACT_BEAT_MAX_MS
  }

  /** The device plays MIDI ports itself (bridge 1.4+: MIDI Flow cables "via SY.CORE Link"). */
  get portsSupported(): boolean { return !!this.device?.ports }

  /**
   * One channel message to the MIDI port `port`, played by the device (bridge 1.4+) at the Live
   * beat of `at` — or `beat`, exact from the app's grid (see sendMidi) — or now.
   */
  sendMidiPort(port: string, data: ArrayLike<number>, at?: number, beat?: number): boolean {
    if (!this.isReady || !this.portsSupported) return false
    const bytes = sanitizeMidi(data)
    if (!bytes) return false
    const now = this.now()
    if (this.transport.playing && at !== undefined && at > now) {
      const converted = this.beatAt(at)
      const b = this.exactBeatOk(beat, converted) ? beat! : converted
      return this.sendRaw({ type: 'midi', data: bytes, beat: b, port })
    }
    return this.sendRaw({ type: 'midi', data: bytes, port })
  }

  /** The Rig Controller's state to the SY.CORE Rig devices (null: no Rig Controller open). */
  sendRig(state: LinkRigState | null): boolean {
    return this.sendRaw(state ? { type: 'rig', ...state } : { type: 'rig', active: false })
  }

  // ── SY.CORE Map (P12) ──────────────────────────────────────────────────────
  /** The tables to the Map device (on connect and after each edit). */
  sendMapTables(tables: LinkMapTables): boolean {
    return this.sendRaw({ type: 'map-tables', tables })
  }
  /** Slot 0–15 to 0–1 (an encoder moved). */
  sendMap(slot: number, value: number): boolean {
    return this.sendRaw({ type: 'map', slot, value: Math.max(0, Math.min(1, value)) })
  }
  /** Follow Live's selected track, or one track (index). */
  sendMapTarget(target: 'follow' | number): boolean {
    return this.sendRaw(target === 'follow' ? { type: 'map-target', follow: true } : { type: 'map-target', track: target })
  }
  /** A Macro Variation of the Rack in focus: recall it (index, next, previous), store the Macros as a new
   *  one, or delete the selected one. */
  sendMapVariation(v: number | 'next' | 'prev' | 'store' | 'delete'): boolean {
    if (v === 'store' || v === 'delete') return this.sendRaw({ type: 'map-variation', action: v })
    return this.sendRaw(typeof v === 'number' ? { type: 'map-variation', index: v } : { type: 'map-variation', step: v === 'next' ? 1 : -1 })
  }
  /** Randomize the Macros of the Rack in focus. */
  sendMapRandomize(): boolean {
    return this.sendRaw({ type: 'map-randomize' })
  }
  /** Every parameter of the instrument driven now (answered with a map-params event). */
  requestMapParams(): boolean {
    return this.sendRaw({ type: 'map-params-request' })
  }

  /** The device can start / stop Live (bridge 1.5+: `play`). */
  get playSupported(): boolean { return !!this.device?.play }

  /** Start (true) or stop (false) Live's transport (bridge 1.5+). False: not sent. */
  sendPlay(on: boolean): boolean {
    if (!this.isReady || !this.playSupported) return false
    return this.sendRaw({ type: 'play', on })
  }

  /** Drop everything queued in the device and end the notes sounding (stop, panic). */
  clear(): boolean {
    return this.sendRaw({ type: 'clear' })
  }
}
