/**
 * useExternalClockStore — clock source of the global transport (P1 of the
 * Ableton Live integration plan): INT (SY.CORE is the master) or EXT (follow
 * the MIDI clock arriving on one input port, e.g. Live on "SYC CTRL").
 *
 * Holds the persisted settings and the live status shown in the UI. The
 * follower itself (ExternalClockFollower) and the wiring to the Tone.js
 * transport live in useExternalClockSync.
 */
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { userKey } from '@/lib/userKey'
import type { ClockLossBehavior, ExternalClockState } from '@/core/midi/external-clock'

const LS_SOURCE = 'S1_CLOCK_SOURCE'
const LS_LOSS = 'S1_CLOCK_LOSS_BEHAVIOR'
const LS_FORWARD = 'S1_CLOCK_FORWARD'

/** 'internal', or `midi:<input port name>`. */
export type ClockSource = 'internal' | `midi:${string}`

export function clockSourcePort(source: string): string | null {
  return source.startsWith('midi:') ? source.slice(5) : null
}

function readSource(): ClockSource {
  const v = localStorage.getItem(userKey(LS_SOURCE))
  return v && (v === 'internal' || v.startsWith('midi:')) ? (v as ClockSource) : 'internal'
}

function readLoss(): ClockLossBehavior {
  return localStorage.getItem(userKey(LS_LOSS)) === 'continue' ? 'continue' : 'stop'
}

export const useExternalClockStore = defineStore('externalClock', () => {
  const source = ref<ClockSource>(readSource())
  const lossBehavior = ref<ClockLossBehavior>(readLoss())
  /** EXT: forward the source's clock / transport to the outputs with Clock on.
   *  Off by default — an output that loops back into the source doubles the clock. */
  const forwardClock = ref(localStorage.getItem(userKey(LS_FORWARD)) === 'true')

  // Live status (not persisted)
  const state = ref<ExternalClockState>('stopped')
  const bpm = ref(0)
  const position = ref('1.1.1')
  /** Clock lost with "continue on INT": the apps carry on with the internal clock. */
  const fallbackToInternal = ref(false)
  /** Last phase error measured at a bar line, in ms (diagnostics). */
  const lastPhaseErrorMs = ref(0)
  /** Inputs carrying the source's name (more than 1: the clock is taken from one only). */
  const samePortInputs = ref(0)
  /** One-line diagnostics of the incoming clock (clocks/s, near-duplicates, max gap). */
  const diag = ref('')
  /** Transport jumps made by the phase lock since the last Start (diagnostics). */
  const resyncs = ref(0)
  /** How fast the audio clock ran against the system clock over the last second, in %. */
  const audioClockPct = ref(100)
  /** The audio thread falls behind (drop-outs): the transport can't keep Live's time. */
  const audioOverloaded = computed(() => audioClockPct.value < 97)
  /** The last 30 diagnostics lines, one per second, for "Copy diagnostics". */
  const diagHistory = ref<string[]>([])
  function pushDiag(line: string) {
    diagHistory.value = [...diagHistory.value.slice(-29), line]
  }

  const port = computed(() => clockSourcePort(source.value))
  const isExternal = computed(() => port.value !== null)
  /** EXT while following, INT otherwise (including the clock-loss fallback). */
  const mode = computed<'EXT' | 'INT'>(() => (isExternal.value && !fallbackToInternal.value ? 'EXT' : 'INT'))

  function setSource(v: ClockSource) {
    source.value = v
    fallbackToInternal.value = false
  }

  /** Manual EXT → INT switch (e.g. on stage after Live crashed). */
  function switchToInternal() {
    setSource('internal')
  }

  watch(source, v => localStorage.setItem(userKey(LS_SOURCE), v))
  watch(lossBehavior, v => localStorage.setItem(userKey(LS_LOSS), v))
  watch(forwardClock, v => localStorage.setItem(userKey(LS_FORWARD), String(v)))

  return {
    source, lossBehavior, forwardClock, state, bpm, position, fallbackToInternal, lastPhaseErrorMs, samePortInputs, diag, resyncs, audioClockPct, audioOverloaded, diagHistory, pushDiag,
    port, isExternal, mode, setSource, switchToInternal,
  }
})
