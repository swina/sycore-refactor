import { ref, onMounted, onUnmounted } from 'vue'
import { midiService } from '@/core/midi/MidiService'
import { useLocalStorage } from './useLocalStorage'

const LS_CAPTURE_ENABLED  = 'S1_CAPTURE_ENABLED'
const LS_CAPTURE_DURATION = 'S1_CAPTURE_DURATION_SEC'
const DEFAULT_DURATION_SEC = 60

/**
 * Always-on MIDI note capture composable.
 *
 * captureNotesRef: plain (non-reactive) array — updated imperatively to avoid
 *   triggering Vue reactivity on every MIDI event (can be hundreds/sec).
 * captureNoteCount: reactive ref used only to update the badge counter in the UI.
 * captureEnabled / captureDurationSec: reactive, persisted to localStorage.
 */
export function useMidiCapture() {
  const { state: captureEnabled }     = useLocalStorage(LS_CAPTURE_ENABLED, false)
  const { state: captureDurationSec } = useLocalStorage(LS_CAPTURE_DURATION, DEFAULT_DURATION_SEC)
  const captureNoteCount              = ref(0)

  // Plain array — intentionally NOT reactive (performance)
  let captureNotes    = []
  const activeNoteMap = new Map()   // `${chan}-${note}` → startTime ms

  // Expose as a plain object ref so components can pass it around without
  // triggering Vue's reactivity system on every push/pop
  const captureNotesRef = { current: captureNotes }

  function onNote(type, note, velocity, chan) {
    if (!captureEnabled.value) return
    const now    = Date.now()
    const cutoff = now - captureDurationSec.value * 1000
    const key    = `${chan}-${note}`

    if (type === 'on' && velocity > 0) {
      activeNoteMap.set(key, now)
      // Prune stale notes and add new one
      captureNotes = [
        ...captureNotes.filter(n => n.startTime >= cutoff),
        { pitch: note, velocity, channel: chan, startTime: now, duration: 0 },
      ]
    } else {
      const st = activeNoteMap.get(key)
      if (st !== undefined) {
        captureNotes = captureNotes.map(n =>
          n.pitch === note && n.channel === chan && n.startTime === st
            ? { ...n, duration: now - st }
            : n
        )
        activeNoteMap.delete(key)
      }
    }

    captureNotesRef.current = captureNotes
    captureNoteCount.value  = captureNotes.length
  }

  function resetCapture() {
    captureNotes = []
    activeNoteMap.clear()
    captureNotesRef.current = captureNotes
    captureNoteCount.value  = 0
  }

  let unsubNote
  let pruneInterval

  onMounted(() => {
    unsubNote     = midiService.addNoteListener(onNote)
    pruneInterval = setInterval(() => {
      if (!captureEnabled.value) return
      const cutoff = Date.now() - captureDurationSec.value * 1000
      captureNotes = captureNotes.filter(n => n.startTime >= cutoff)
      captureNotesRef.current = captureNotes
      captureNoteCount.value  = captureNotes.length
    }, 5000)
  })

  onUnmounted(() => {
    unsubNote?.()
    clearInterval(pruneInterval)
  })

  return {
    captureEnabled,
    captureDurationSec,
    captureNoteCount,
    captureNotesRef,
    resetCapture,
  }
}
