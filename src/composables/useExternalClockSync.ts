/**
 * useExternalClockSync — makes the global transport follow an external MIDI
 * clock master (P1 of the Ableton Live integration plan).
 *
 * Mounted once, next to the Play All / Stop All controls (TransportBar):
 *   Start / Continue (on the bar line)  → playAll()  — the apps enabled in the
 *                                          "Sync Apps to Transport" list
 *   Stop                                → stopAll()
 *   tempo (every beat)                  → Tone.js transport BPM + global BPM
 *   bar line                            → per-bar phase lock of the Tone.js transport
 *   clock loss                          → stop, or carry on with INT at the last BPM
 *
 * Every app runs on the shared Tone.js transport, so retuning and re-phasing
 * that one transport keeps all of them on Live's grid.
 */
import { watch, nextTick, onMounted, onUnmounted } from 'vue'
import { getTransport, getContext } from 'tone'
import { midiService } from '@/core/midi/midi-service'
import { ExternalClockFollower, PhaseLock, TONE_PPQ, isClockSourceEcho } from '@/core/midi/external-clock'
import { useExternalClockStore } from '@/stores/useExternalClockStore'
import { externalGrid } from '@/core/midi/external-grid'
import { controlActionForNote, controlActionEvent, describeControlAction } from '@/lib/control-map'
import { useMidiStore } from '@/stores/useMidiStore'

const REALTIME = new Set([0xF8, 0xFA, 0xFB, 0xFC, 0xF2])

interface Controls {
  playAll: () => void
  stopAll: () => void
}

export function useExternalClockSync({ playAll, stopAll }: Controls) {
  const store = useExternalClockStore()
  const midiStore = useMidiStore()
  const follower = new ExternalClockFollower({ lossBehavior: store.lossBehavior })
  // Over 1/4 beat off (e.g. a start delayed by a busy main thread): jump, don't drift back over bars.
  // Up to ±8% nudge: short audio drop-outs (the transport runs on the audio
  // clock, measured at 92–98% with the window in the background) are absorbed
  // without jumps; ±3% left a 5% shortfall growing into a jump every few bars.
  const lock = new PhaseLock({ resyncBeats: 0.25, maxNudge: 0.08 })

  /** Tone ticks at the moment the apps were started on Live's downbeat. */
  let startTicks = 0
  /** Fine (non-integer) tempo the transport must keep; global BPM is rounded. */
  let fineBpm = 0
  let lastSixteenth = -1

  function applyFineBpm(bpm: number) {
    fineBpm = bpm
    getTransport().bpm.value = bpm
    const rounded = Math.round(bpm)
    if (rounded !== midiStore.currentBpm) {
      // Fans out to arpBpm, the apps' own watchers and the outgoing clock —
      // those set the transport to the rounded value, so put the fine value
      // back once they have run.
      midiStore.setGlobalBpm(rounded)
      nextTick(() => { if (fineBpm) getTransport().bpm.value = fineBpm })
    }
  }

  /** Tone ticks elapsed since the start, as of time `t` (performance.now ms). */
  function followerTicksAt(t: number): number {
    const lateMs = Math.max(0, performance.now() - t)
    const ticksPerMs = (getTransport().bpm.value * TONE_PPQ) / 60000
    return getTransport().ticks - startTicks - lateMs * ticksPerMs
  }

  follower.on(e => {
    switch (e.type) {
      case 'start': {
        if (store.fallbackToInternal) {
          store.fallbackToInternal = false
          setFollowing(true)
        }
        lock.reset()
        store.resyncs = 0
        if (e.bpm > 0) applyFineBpm(e.bpm)
        // System-clock apps (StepScheduler) align on this downbeat.
        externalGrid.emit({ type: 'start', sixteenth: e.sixteenth, t: e.t, bpm: e.bpm || follower.bpm })
        playAll()
        // Starting the apps can block the main thread for a few hundred ms
        // (samples, presets): the transport started that late after Live's
        // downbeat. Count the start from the downbeat itself.
        startTicks = getTransport().ticks - Math.max(0, performance.now() - e.t) * (getTransport().bpm.value * TONE_PPQ) / 60000
        // Apps that set the transport BPM from the global (integer) BPM on start.
        setTimeout(() => { if (fineBpm) getTransport().bpm.value = fineBpm }, 0)
        break
      }
      case 'stop':
        fineBpm = 0
        externalGrid.emit({ type: 'stop' })
        stopAll()
        break
      case 'tempo': {
        store.bpm = Math.round(e.bpm * 10) / 10
        // Coarse follow on every beat (e.g. the first bar, or a tempo jump);
        // small differences are left to the phase lock.
        if (follower.state === 'playing' && (!fineBpm || Math.abs(e.bpm - fineBpm) / fineBpm > 0.005)) {
          applyFineBpm(e.bpm)
        }
        break
      }
      case 'bar': {
        const ticks = followerTicksAt(e.t)
        const r = lock.update(e.bpm, e.clocksSinceStart, ticks)
        store.lastPhaseErrorMs = Math.round((r.errorBeats * 60000 / e.bpm) * 10) / 10
        if (r.resyncTicks !== null) {
          // resyncTicks is where the transport should have been when the bar
          // clock *arrived*; it is handled later than that (more so with the
          // window in the background), so add the time gone since.
          const lateTicks = Math.max(0, performance.now() - e.t) * (getTransport().bpm.value * TONE_PPQ) / 60000
          getTransport().ticks = Math.round(startTicks + r.resyncTicks + lateTicks)
          store.resyncs++
          applyFineBpm(r.bpm)
        } else {
          fineBpm = r.bpm
          getTransport().bpm.value = r.bpm
        }
        break
      }
      case 'clockLost':
        console.warn('[ExtClock] clock lost', {
          silenceMs: Math.round(performance.now() - diag.lastT),
          timeoutMs: Math.round(follower.lossTimeoutMs()),
          lastBpm: e.lastBpm, diag: store.diag,
        })
        // No master grid any more: system-clock apps keep their own tempo.
        externalGrid.emit({ type: 'stop' })
        if (e.behavior === 'continue') {
          store.fallbackToInternal = true
          if (e.lastBpm > 0) applyFineBpm(e.lastBpm)
          // Devices synced to SY.CORE keep a clock: our own, at the last BPM.
          setFollowing(false)
        }
        break
      case 'beat':
        externalGrid.emit({ type: 'beat', sixteenth: e.sixteenth, t: e.t, bpm: e.bpm })
        break
      case 'position':
        break
    }
    store.state = follower.state
  })

  /** The one input the clock is taken from. Windows MIDI Services can show
   *  the same endpoint to the browser as two inputs with the same name: taking
   *  clocks from both counted every clock twice (Live at 75 BPM read as 150). */
  let pinnedInputId: string | null = null

  /** Diagnostics over the last second: what the follower really receives. */
  const diag = { clocks: 0, nearDup: 0, dropped: 0, maxGap: 0, lastT: -1, windowStart: performance.now(), audioStart: -1,
    controlNotes: [] as number[], otherNotes: [] as string[] }
  function flushDiag(now: number) {
    if (now - diag.windowStart < 1000) return
    const secs = (now - diag.windowStart) / 1000
    const own = [...ownClockSends.entries()].sort((a, b) => b[1] - a[1])
      .map(([name, n]) => `${name} ${Math.round(n / secs)}/s`).join(', ')
    // The Tone.js transport runs on the audio clock: if the audio thread
    // falls behind (drop-outs), the transport falls behind Live with it.
    const audioNow = getContext().currentTime
    const audioPct = diag.audioStart >= 0 ? Math.round(((audioNow - diag.audioStart) * 1000 / (now - diag.windowStart)) * 1000) / 10 : 100
    store.audioClockPct = audioPct
    store.diag = `${Math.round(diag.clocks / secs)} clk/s · near-dup ${diag.nearDup} · dropped copies ${diag.dropped} · max gap ${Math.round(diag.maxGap)} ms`
      + ` · audio clock ${audioPct}% · resyncs ${store.resyncs} · own clock out: ${own || 'none'}`
      + ` · ctrl notes [${diag.controlNotes.join(',')}] other notes [${diag.otherNotes.join(',')}] last action: ${store.lastControlAction || '—'}`
    const clockTime = new Date().toLocaleTimeString()
    const focus = typeof document !== 'undefined' && document.hasFocus() ? 'focus' : 'NO focus'
    store.pushDiag(`${clockTime} [${focus}] ${store.mode} ${store.bpm.toFixed(1)} BPM · ${store.position} · phase ${store.lastPhaseErrorMs} ms · ${store.diag} · ${store.state}`)
    diag.clocks = 0; diag.nearDup = 0; diag.dropped = 0; diag.maxGap = 0; diag.windowStart = now; diag.audioStart = audioNow
    // A control track plays a few notes per bar; a steady stream means notes are looping back
    // into the source (in Live: the control track's MIDI From on All Ins, monitoring).
    store.controlMapFlood = diag.controlNotes.length / secs > 6
    diag.controlNotes = []; diag.otherNotes = []
    ownClockSends.clear()
  }

  // Diagnostics: count every clock SY.CORE itself sends, per output, whatever
  // the code path (transport, Thru, virtual instruments bound to a port…) —
  // one that loops back into the source doubles the clock it measures.
  const ownClockSends = new Map<string, number>()
  let restoreSend: (() => void) | null = null
  function watchOwnClockSends() {
    const proto = (globalThis as any).MIDIOutput?.prototype
    if (!proto || restoreSend) return
    const orig = proto.send
    proto.send = function (this: MIDIOutput, data: ArrayLike<number>, ts?: number) {
      if (data && data[0] === 0xF8) ownClockSends.set(this.name ?? '?', (ownClockSends.get(this.name ?? '?') ?? 0) + 1)
      return orig.call(this, data, ts)
    }
    restoreSend = () => { proto.send = orig; restoreSend = null }
  }

  function onRaw(event: MIDIMessageEvent) {
    const port = store.port
    if (!port || !event.data || event.data.length === 0) return
    if (!REALTIME.has(event.data[0])) return
    const input = event.target as MIDIInput | null
    if (!input || input.name !== port) return
    if (pinnedInputId !== input.id) {
      const pinnedStillThere = pinnedInputId !== null && midiService.getInputs().some(i => i.id === pinnedInputId)
      if (pinnedStillThere) return
      pinnedInputId = input.id
    }
    // timeStamp is the arrival time on the performance.now() clock.
    const t = event.timeStamp || performance.now()
    if (event.data[0] === 0xF8) {
      // The same message delivered twice (same arrival time to the µs): drop the copy.
      if (t === diag.lastT) { diag.dropped++; return }
      diag.clocks++
      if (diag.lastT >= 0) {
        const gap = t - diag.lastT
        if (gap < 3) diag.nearDup++
        if (gap > diag.maxGap) diag.maxGap = gap
      }
      diag.lastT = t
    }
    follower.handleMessage(event.data, t)
    if (store.forwardClock && !store.fallbackToInternal) midiService.forwardExternalRealTime(event.data)
    const s = follower.positionSixteenths
    if (s !== lastSixteenth) {
      lastSixteenth = s
      store.position = follower.positionLabel
    }
  }

  let removeRaw: (() => void) | null = null
  let removeState: (() => void) | null = null
  let timeoutId: number | null = null

  watch(() => store.lossBehavior, v => { follower.lossBehavior = v })
  function countSamePortInputs() {
    const port = store.port
    store.samePortInputs = port ? midiService.getInputs().filter(i => i.name === port).length : 0
  }

  /** While following a port, never send it (or its loopback peer) our own clock. */
  function applySyncOutputBlock() {
    const port = store.port
    midiService.setSyncOutputBlock(port ? (name: string) => isClockSourceEcho(port, name) : null)
    // The source port is a control port: nothing from it is forwarded to devices (Thru).
    midiService.setThruBlockedInput(port ? (name: string) => name === port : null)
    midiService.setControlConsumer(port ? onControl : null)
    setFollowing(!!port)
  }

  /** Control Map (P3): a note-on on the map's channel of the source port → the app's action.
   *  Every message on that channel is consumed (reaches no app as a note). */
  function onControl(data: ArrayLike<number>, inputName: string): boolean {
    if (inputName !== store.port) return false
    const status = data[0]
    const type = status & 0xf0
    const isNoteOn = type === 0x90 && (data[2] ?? 0) > 0
    if (!store.controlMapEnabled || (status & 0x0f) !== store.controlMapChannel) {
      if (isNoteOn) diag.otherNotes.push(`ch${(status & 0x0f) + 1}:${data[1]}`)
      return false
    }
    if (isNoteOn) diag.controlNotes.push(data[1])
    if (isNoteOn) {
      const action = controlActionForNote(data[1])
      if (action) {
        const ev = controlActionEvent(action)
        window.dispatchEvent(new CustomEvent(ev.name, ev.detail ? { detail: ev.detail } : undefined))
        store.lastControlAction = describeControlAction(action)
      }
    }
    return true
  }

  /** EXT: no clock of our own (it echoed back into the source through
   *  virtual instruments and timers), the source's clock is forwarded instead.
   *  INT (or the clock-loss fallback): our own clock again, if enabled. */
  function setFollowing(on: boolean) {
    midiService.setFollowingExternalClock(on)
    if (!on) midiStore.startClock()
  }

  watch(() => store.source, () => {
    applySyncOutputBlock()
    pinnedInputId = null
    countSamePortInputs()
    follower.reset()
    store.state = follower.state
    store.bpm = 0
    store.position = '1.1.1'
    fineBpm = 0
  })

  onMounted(() => {
    applySyncOutputBlock()
    watchOwnClockSends()
    removeRaw = midiService.addRawListener(onRaw)
    removeState = midiService.addStateChangeListener(() => countSamePortInputs())
    countSamePortInputs()
    // Tone's context timers tick from a Worker, so clock loss is still
    // detected when the tab is in the background (window timers get throttled).
    timeoutId = getContext().setInterval(() => {
      const now = performance.now()
      if (store.port) { follower.checkTimeout(now); flushDiag(now) }
      store.state = follower.state
    }, 0.1)
  })

  onUnmounted(() => {
    removeRaw?.()
    midiService.setSyncOutputBlock(null)
    midiService.setThruBlockedInput(null)
    midiService.setControlConsumer(null)
    midiService.setFollowingExternalClock(false)
    removeState?.()
    restoreSend?.()
    if (timeoutId !== null) getContext().clearInterval(timeoutId)
  })

  return { follower }
}
