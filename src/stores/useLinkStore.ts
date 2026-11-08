/**
 * useLinkStore — SY.CORE Link (P11 of the Ableton Live plan): the connection to
 * the Max for Live bridge, its status for the UI, and the "Live (M4L)" output.
 *
 * While the bridge is connected, "Live (M4L)" is a MIDI Flow destination like a
 * virtual instrument: the notes cabled to it go to the device's track in Live,
 * played on Live's beat (timestamped output: no timer on this side).
 * The clock source "Live (M4L)" (useExternalClockStore) follows Live's
 * transport through the same connection (useExternalClockSync).
 */
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { userKey } from '@/lib/userKey'
import { LinkClient, type LinkState, type LinkStats } from '@/lib/link-client'
import { useMidiStore } from '@/stores/useMidiStore'

export const LINK_OUTPUT_NAME = 'Live (M4L)'
const LS_ENABLED = 'S1_LINK_ENABLED'

/** One client for the whole app. */
export const linkClient = new LinkClient({ appVersion: 'sycore' })

export const useLinkStore = defineStore('link', () => {
  const midiStore = useMidiStore()

  /** The user wants the connection (persisted). Also on while the clock source is Live (M4L). */
  const enabled = ref(localStorage.getItem(userKey(LS_ENABLED)) === 'true')
  const state = ref<LinkState>(linkClient.state)
  const ready = ref(false)
  const track = ref('')
  const deviceVersion = ref('')
  const sim = ref(false)
  const rttMs = ref<number | null>(null)
  const stats = ref<LinkStats | null>(null)
  const lastError = ref('')
  /** Failed attempts in a row since enabling, never connected: the bridge isn't running, or
   *  Chrome's local network permission was refused. */
  const failedAttempts = ref(0)
  let everConnected = false

  const connected = computed(() => state.value === 'connected')
  const hint = computed(() => {
    if (!enabled.value || everConnected || failedAttempts.value < 3) return ''
    return 'No SY.CORE Link device found on ws://127.0.0.1:9400. Check that Live is open with the "SY.CORE Link" device on a track. '
      + 'If Chrome asked to access devices on your local network and it was blocked, allow it in the site settings (lock icon › Local network access).'
  })

  function registerOutput() {
    midiStore.registerPanelOutput(LINK_OUTPUT_NAME, (data, at) => { linkClient.sendMidi(data, at) }, undefined, { timestamped: true })
  }
  function unregisterOutput() {
    if (midiStore.panelOutputs.includes(LINK_OUTPUT_NAME)) midiStore.unregisterPanelOutput(LINK_OUTPUT_NAME)
  }

  linkClient.on(e => {
    switch (e.type) {
      case 'state':
        state.value = e.state
        if (e.state === 'connected') { everConnected = true; failedAttempts.value = 0; lastError.value = '' }
        else if (e.state === 'retrying') failedAttempts.value++
        if (e.state !== 'connected') { ready.value = false; unregisterOutput() }
        break
      case 'hello':
        track.value = e.track
        deviceVersion.value = e.version
        sim.value = e.sim
        break
      case 'transport':
        if (linkClient.isReady && !ready.value) { ready.value = true; registerOutput() }
        break
      case 'stats':
        stats.value = e.stats
        break
      case 'error':
        lastError.value = e.message || e.code
        break
    }
    rttMs.value = linkClient.rttMs
  })

  /** Kept on by the clock source too (set by useExternalClockSync). */
  const neededByClock = ref(false)
  const active = computed(() => enabled.value || neededByClock.value)
  watch(active, on => {
    if (on) { everConnected = false; failedAttempts.value = 0; linkClient.enable() }
    else linkClient.disable()
  }, { immediate: true })
  watch(enabled, v => localStorage.setItem(userKey(LS_ENABLED), String(v)))

  // RTT refreshes with every pong; poll it for the UI (cheap).
  setInterval(() => { if (linkClient.rttMs !== rttMs.value) rttMs.value = linkClient.rttMs }, 1000)

  return { enabled, neededByClock, active, state, ready, connected, track, deviceVersion, sim, rttMs, stats, lastError, failedAttempts, hint }
})
