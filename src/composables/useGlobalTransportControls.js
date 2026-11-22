/**
 * useGlobalTransportControls.js — the "Play All / Stop All" logic shared by
 * TransportBar.vue and the Instrument Cockpit's transport button. Starting
 * playback fans out to whichever apps are sync-enabled (useSyncStore); this
 * is the single place that fan-out list lives so both UIs stay identical.
 *
 * Per-app start delays (in beats) are read from syncStore.appDelays.
 * The delay is calculated as: delayBeats * (60 / bpm) * 1000 ms.
 */
import { rigTransport, stopRows, stopEvents, dispatchRig } from '@/lib/rig-live'
import { SEQ_LANE_CFG } from '@/lib/seq-lanes'
import { countIn, startCountIn, cancelCountIn } from '@/lib/count-in'
import { runStopHooks } from '@/lib/stop-hooks'
import { useTransportManager } from '@/composables/useTransportManager'
import { useSyncStore } from '@/stores/useSyncStore'
import { useArpStore } from '@/stores/useArpStore'

export function useGlobalTransportControls() {
  const transportManager = useTransportManager()
  const syncStore = useSyncStore()
  const arpStore = useArpStore()

  const _pendingTimeouts = new Set()

  function delayMs(beats) {
    if (!beats || beats <= 0) return 0
    const bpm = arpStore.arpBpm || 120
    return beats * (60 / bpm) * 1000
  }

  function scheduleStart(beats, fn) {
    const ms = delayMs(beats)
    if (ms <= 0) { fn(); return }
    const tid = setTimeout(() => {
      _pendingTimeouts.delete(tid)
      fn()
    }, ms)
    _pendingTimeouts.add(tid)
  }

  function clearPendingStarts() {
    _pendingTimeouts.forEach(tid => clearTimeout(tid))
    _pendingTimeouts.clear()
  }

  /**
   * Play All. With a count-in set (sync panel) a Play pressed in SY.CORE counts the bars first
   * (CountInOverlay.vue); a Play while counting calls it off. `{ countIn: false }`: start now (an
   * external clock's Start, useExternalClockSync — the master owns the bar).
   */
  function playAll({ countIn: useCountIn = true } = {}) {
    if (countIn.active) { cancelCountIn(); return }
    if (useCountIn && startCountIn(syncStore.countInBars, arpStore.arpBpm || 120, startAll)) return
    startAll()
  }

  function startAll() {
    transportManager.forceStopAll()
    transportManager.acquireTransport()
    clearPendingStarts()

    if (syncStore.syncSequencerToTransport) {
      scheduleStart(syncStore.appDelays['Step Sequencer'] ?? 0, () =>
        window.dispatchEvent(new CustomEvent('toggle-sequencer', { detail: { play: true } })))
    }
    // Rig Controller in LIVE: Chord Prog, Drum Machine and Sequencer start only from an armed slot
    const rig = rigTransport.live
    if (syncStore.syncSequencer2ToTransport && !rig) {
      scheduleStart(syncStore.appDelays['Sequencer'] ?? 0, () =>
        // sync 0: on the transport's start, in phase with the bar playing (its SYNC is for a start on its own)
        window.dispatchEvent(new CustomEvent('toggle-sequencer2', { detail: { play: true, sync: 0 } })))
    }
    if (syncStore.syncChordProgToTransport && !rig) {
      scheduleStart(syncStore.appDelays['Chord Prog'] ?? 0, () =>
        window.dispatchEvent(new CustomEvent('cp-start')))
    }
    if (syncStore.syncDrumMachineToTransport && !rig) {
      scheduleStart(syncStore.appDelays['Drum Machine'] ?? 0, () =>
        window.dispatchEvent(new CustomEvent('timeline-dm-start', { detail: {} })))
    }
    if (syncStore.syncLoopMachineToTransport) {
      scheduleStart(syncStore.appDelays['Samples Machine'] ?? 0, () =>
        window.dispatchEvent(new CustomEvent('toggle-looper', { detail: { play: true } })))
    }
    if (syncStore.syncBackingTrackToTransport) {
      scheduleStart(syncStore.appDelays['Backing Track'] ?? 0, () =>
        window.dispatchEvent(new CustomEvent('toggle-backing-track', { detail: { play: true, restart: true } })))
    }
    if (syncStore.syncRecordToTransport) {
      scheduleStart(syncStore.appDelays['Arm Record'] ?? 0, () =>
        window.dispatchEvent(new CustomEvent('capture-start-rec', { detail: { background: true } })))
    }
    if (rig) rigTransport.onPlayAll?.()
  }

  function stopAll() {
    cancelCountIn()
    clearPendingStarts()
    if (syncStore.syncSequencerToTransport) {
      window.dispatchEvent(new CustomEvent('toggle-sequencer', { detail: { play: false } }))
    }
    if (syncStore.syncSequencer2ToTransport) {
      window.dispatchEvent(new CustomEvent('toggle-sequencer2', { detail: { play: false } }))
    }
    if (syncStore.syncChordProgToTransport) {
      window.dispatchEvent(new CustomEvent('cp-stop'))
    }
    if (syncStore.syncDrumMachineToTransport) {
      window.dispatchEvent(new CustomEvent('timeline-dm-stop'))
    }
    if (syncStore.syncLoopMachineToTransport) {
      window.dispatchEvent(new CustomEvent('toggle-looper', { detail: { play: false } }))
    }
    if (syncStore.syncBackingTrackToTransport) {
      window.dispatchEvent(new CustomEvent('toggle-backing-track', { detail: { play: false } }))
    }
    if (syncStore.syncRecordToTransport) {
      window.dispatchEvent(new CustomEvent('capture-stop-rec'))
    }
    // Rig Controller in LIVE: its armed slots started Chord Prog, Drum Machine and Sequencer
    // whatever their sync flag (startAll skips them) — Stop All stops them too.
    if (rigTransport.live) for (const id of stopRows()) for (const ev of stopEvents(id)) dispatchRig(ev)
    // the Sequencer's Bass / Arp lanes: no transport sync of their own — a Stop All stops them
    for (const lane of ['bass', 'arp']) window.dispatchEvent(new CustomEvent(SEQ_LANE_CFG[lane].toggle, { detail: { play: false } }))
    // what registered itself (the Rig's capture clips C1–C8: they stay in their pads)
    runStopHooks()
    transportManager.forceStopAll()
  }

  return { transportManager, playAll, stopAll }
}
