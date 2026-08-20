/**
 * useGlobalTransportControls.js — the "Play All / Stop All" logic shared by
 * TransportBar.vue and the Instrument Cockpit's transport button. Starting
 * playback fans out to whichever apps are sync-enabled (useSyncStore); this
 * is the single place that fan-out list lives so both UIs stay identical.
 *
 * Per-app start delays (in beats) are read from syncStore.appDelays.
 * The delay is calculated as: delayBeats * (60 / bpm) * 1000 ms.
 */
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

  function playAll() {
    transportManager.forceStopAll()
    transportManager.acquireTransport()
    clearPendingStarts()

    if (syncStore.syncSequencerToTransport) {
      scheduleStart(syncStore.appDelays['Step Sequencer'] ?? 0, () =>
        window.dispatchEvent(new CustomEvent('toggle-sequencer', { detail: { play: true } })))
    }
    if (syncStore.syncSequencer2ToTransport) {
      scheduleStart(syncStore.appDelays['Sequencer'] ?? 0, () =>
        window.dispatchEvent(new CustomEvent('toggle-sequencer2', { detail: { play: true } })))
    }
    if (syncStore.syncChordProgToTransport) {
      scheduleStart(syncStore.appDelays['Chord Prog'] ?? 0, () =>
        window.dispatchEvent(new CustomEvent('cp-start')))
    }
    if (syncStore.syncDrumMachineToTransport) {
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
  }

  function stopAll() {
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
    transportManager.forceStopAll()
  }

  return { transportManager, playAll, stopAll }
}
