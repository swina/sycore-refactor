/**
 * useGlobalTransportControls.js — the "Play All / Stop All" logic shared by
 * TransportBar.vue and the Instrument Cockpit's transport button. Starting
 * playback fans out to whichever apps are sync-enabled (useSyncStore); this
 * is the single place that fan-out list lives so both UIs stay identical.
 */
import { useTransportManager } from '@/composables/useTransportManager'
import { useSyncStore } from '@/stores/useSyncStore'

export function useGlobalTransportControls() {
  const transportManager = useTransportManager()
  const syncStore = useSyncStore()

  function playAll() {
    transportManager.forceStopAll()
    transportManager.acquireTransport()

    if (syncStore.syncSequencerToTransport) {
      window.dispatchEvent(new CustomEvent('toggle-sequencer', { detail: { play: true } }))
    }
    if (syncStore.syncChordProgToTransport) {
      window.dispatchEvent(new CustomEvent('cp-start'))
    }
    if (syncStore.syncDrumMachineToTransport) {
      window.dispatchEvent(new CustomEvent('timeline-dm-start', { detail: {} }))
    }
    if (syncStore.syncBackingTrackToTransport) {
      window.dispatchEvent(new CustomEvent('toggle-backing-track', { detail: { play: true, restart: true } }))
    }
    if (syncStore.syncRecordToTransport) {
      window.dispatchEvent(new CustomEvent('capture-start-rec', { detail: { background: true } }))
    }
  }

  function stopAll() {
    if (syncStore.syncSequencerToTransport) {
      window.dispatchEvent(new CustomEvent('toggle-sequencer', { detail: { play: false } }))
    }
    if (syncStore.syncChordProgToTransport) {
      window.dispatchEvent(new CustomEvent('cp-stop'))
    }
    if (syncStore.syncDrumMachineToTransport) {
      window.dispatchEvent(new CustomEvent('timeline-dm-stop'))
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
