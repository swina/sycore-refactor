/**
 * link-clock.ts — Live's transport read through SY.CORE Link (P11), turned into
 * the same events as the MIDI clock follower (ExternalClockFollower), so
 * useExternalClockSync drives the apps the same way from either source.
 *
 *   playing ↑   → wait for the next bar line, then 'start' on it
 *   every beat  → 'beat' (and 'bar' on bar lines, for the phase lock)
 *   tempo       → 'tempo'
 *   playing ↓   → 'stop'
 *   a jump in Live's position (loop, relocation) → 'stop', then start again on the next bar line
 *   the bridge gone while playing → 'clockLost' (+ 'stop' when the loss behaviour is stop)
 *
 * Times come from the Link client's mirror of Live's transport: an event's `t`
 * is the exact time of its beat, even when tick() runs late.
 */
import type { ClockLossBehavior, ExternalClockEvent, ExternalClockState } from './external-clock'

/** What the adapter reads from the Link client. */
export interface LinkTimeSource {
  transport: { playing: boolean; tempo: number; num: number; den: number }
  beatAt(t: number): number
  timeOfBeat(beat: number): number
}

const CLOCKS_PER_BEAT = 24
/** A start report this far past a bar line still starts on that bar line (beats). */
const START_EPS_BEATS = 0.05
/** Position off the expected one by more than this: Live jumped (beats). */
const JUMP_BEATS = 0.25

export class LinkClockAdapter {
  state: ExternalClockState = 'stopped'
  lossBehavior: ClockLossBehavior
  private listeners: ((e: ExternalClockEvent) => void)[] = []
  private pendingStartBeat = 0
  private startBeat = 0
  private nextBeat = 0
  private lastBpm = 0
  private last: { beat: number; t: number } | null = null

  constructor(private src: LinkTimeSource, opts: { lossBehavior?: ClockLossBehavior } = {}) {
    this.lossBehavior = opts.lossBehavior ?? 'stop'
  }

  on(cb: (e: ExternalClockEvent) => void): () => void {
    this.listeners.push(cb)
    return () => { this.listeners = this.listeners.filter(l => l !== cb) }
  }
  private emit(e: ExternalClockEvent) { this.listeners.forEach(l => l(e)) }

  get bpm(): number { return this.src.transport.tempo }
  private get barBeats(): number {
    const { num, den } = this.src.transport
    return num > 0 && den > 0 ? (num * 4) / den : 4
  }

  /** Bars.beats.sixteenths (1-based) of Live's position at `t`. */
  positionLabel(t: number): string {
    const b = Math.max(0, this.src.beatAt(t))
    const bar = this.barBeats
    const inBar = b - Math.floor(b / bar) * bar
    return `${Math.floor(b / bar) + 1}.${Math.floor(inBar) + 1}.${Math.floor((b % 1) * 4) + 1}`
  }

  /** The Link client reported a change of playing / tempo / signature. */
  onTransport(now: number): void {
    const tr = this.src.transport
    const running = this.state === 'playing' || this.state === 'waiting-bar'
    if (!tr.playing) {
      if (running) this.stopNow()
      return
    }
    if (tr.tempo !== this.lastBpm) {
      this.lastBpm = tr.tempo
      this.emit({ type: 'tempo', bpm: tr.tempo })
    }
    if (!running) this.waitForBar(now)
  }

  private waitForBar(now: number) {
    const bar = this.barBeats
    const b = this.src.beatAt(now)
    this.pendingStartBeat = Math.max(0, Math.ceil((b - START_EPS_BEATS) / bar) * bar)
    this.state = 'waiting-bar'
    this.last = { beat: b, t: now }
    if (this.src.transport.tempo !== this.lastBpm) {
      this.lastBpm = this.src.transport.tempo
      this.emit({ type: 'tempo', bpm: this.lastBpm })
    }
  }

  private stopNow() {
    this.state = 'stopped'
    this.last = null
    this.emit({ type: 'stop' })
  }

  /** Call often (a Worker timer, ~10 ms): emits the start, beats and bars due by `now`. */
  tick(now: number): void {
    if (this.state !== 'playing' && this.state !== 'waiting-bar') return
    if (!this.src.transport.playing) { this.stopNow(); return }
    const b = this.src.beatAt(now)
    const tempo = this.src.transport.tempo

    // A jump in Live's position (loop, relocation): start again on the next bar line.
    if (this.last) {
      const expected = this.last.beat + ((now - this.last.t) * tempo) / 60000
      if (Math.abs(b - expected) > JUMP_BEATS) {
        if (this.state === 'playing') this.emit({ type: 'stop' })
        this.waitForBar(now)
        return
      }
    }
    this.last = { beat: b, t: now }

    if (this.state === 'waiting-bar') {
      if (b < this.pendingStartBeat - 1e-6) return
      this.startBeat = this.pendingStartBeat
      this.nextBeat = this.startBeat + 1
      this.state = 'playing'
      this.emit({ type: 'start', sixteenth: Math.round(this.startBeat * 4), bpm: tempo, t: this.src.timeOfBeat(this.startBeat) })
    }

    const bar = this.barBeats
    for (let guard = 0; guard < 64 && this.nextBeat <= b + 1e-9; guard++) {
      const beat = this.nextBeat++
      const t = this.src.timeOfBeat(beat)
      this.emit({ type: 'beat', sixteenth: Math.round(beat * 4), t, bpm: tempo })
      const sinceStart = beat - this.startBeat
      if (Math.abs(sinceStart / bar - Math.round(sinceStart / bar)) < 1e-6) {
        this.emit({ type: 'bar', bar: Math.round(beat / bar), clocksSinceStart: Math.round(sinceStart * CLOCKS_PER_BEAT), bpm: tempo, t })
      }
    }
  }

  /** The bridge disconnected. */
  lost(): void {
    if (this.state !== 'playing' && this.state !== 'waiting-bar') return
    this.state = 'lost'
    this.last = null
    this.emit({ type: 'clockLost', behavior: this.lossBehavior, lastBpm: this.lastBpm })
    if (this.lossBehavior === 'stop') { this.state = 'stopped'; this.emit({ type: 'stop' }) }
  }

  reset(): void {
    this.state = 'stopped'
    this.last = null
    this.lastBpm = 0
  }
}
