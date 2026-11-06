/**
 * external-grid.ts — the external master's beat grid, shared with the apps
 * that schedule on the system clock (StepScheduler). Fed by
 * useExternalClockSync from ExternalClockFollower; read by the apps.
 *
 * Positions are song sixteenths (as in Song Position Pointer); times are
 * performance.now() ms.
 */
export type ExternalGridEvent =
  | { type: 'start'; sixteenth: number; t: number; bpm: number }
  | { type: 'beat'; sixteenth: number; t: number; bpm: number }
  | { type: 'stop' }

class ExternalGrid {
  /** Following a master that is playing. */
  active = false
  bpm = 0
  /** Latest known grid point: song sixteenth `sixteenth` at time `t`. */
  anchor: { sixteenth: number; t: number } | null = null
  private listeners: ((e: ExternalGridEvent) => void)[] = []

  on(cb: (e: ExternalGridEvent) => void): () => void {
    this.listeners.push(cb)
    return () => { this.listeners = this.listeners.filter(l => l !== cb) }
  }

  emit(e: ExternalGridEvent): void {
    if (e.type === 'stop') {
      this.active = false
      this.anchor = null
    } else {
      this.active = true
      if (e.bpm > 0) this.bpm = e.bpm
      this.anchor = { sixteenth: e.sixteenth, t: e.t }
    }
    this.listeners.forEach(l => l(e))
  }

  /** Time of song sixteenth `s` from the latest anchor, or null. With no tempo
   *  yet (the first Start after a reload: Live sends no clock while stopped)
   *  only the anchor itself — the Start's downbeat — has a time. */
  timeOf(s: number): number | null {
    if (!this.anchor) return null
    if (!(this.bpm > 0)) return s === this.anchor.sixteenth ? this.anchor.t : null
    return this.anchor.t + (s - this.anchor.sixteenth) * (60000 / (this.bpm * 4))
  }

  /** The bar line (song sixteenth, multiple of 16) of the bar playing at time `t`. */
  barAtOrBefore(t: number): number | null {
    if (!this.anchor) return null
    // No tempo yet: the Start's downbeat (a bar line) is the bar playing.
    if (!(this.bpm > 0)) return Math.floor(this.anchor.sixteenth / 16) * 16
    const stepMs = 60000 / (this.bpm * 4)
    const s = this.anchor.sixteenth + Math.floor((t - this.anchor.t) / stepMs + 1e-6)
    return Math.max(0, Math.floor(s / 16) * 16)
  }

  /** The first bar line (song sixteenth, multiple of 16) at or after time `t`. */
  barAtOrAfter(t: number): number | null {
    if (!this.anchor || !(this.bpm > 0)) return null
    const stepMs = 60000 / (this.bpm * 4)
    const s = this.anchor.sixteenth + Math.ceil((t - this.anchor.t) / stepMs)
    return Math.ceil(s / 16) * 16
  }
}

export const externalGrid = new ExternalGrid()
