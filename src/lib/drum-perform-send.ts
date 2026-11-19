// Drum CC knobs (drum-perform.ts) → MIDI: the CC on the Drum Machine's channel, through its MIDI Flow
// cables (virtual instruments, SY.CORE Link to Live, the FM-1 panel) — as the Sequencer's P1 / P2.
import { drumPerform, DRUM_CC_COUNT } from '@/lib/drum-perform'
import { MidiSource } from '@/core/midi/midi-service'
import { useMidiStore } from '@/stores/useMidiStore'

/** Set knob `i` (0–3) to `value` (0–127) and send it; the same value again isn't resent. */
export function setDrumCc(i: number, value: number) {
  const k = drumPerform.knobs[i]
  if (!k || i < 0 || i >= DRUM_CC_COUNT) return
  const v = Math.max(0, Math.min(127, Math.round(value)))
  if (v === k.value) return
  k.value = v
  useMidiStore().sendCC(k.cc, v, null, MidiSource.DRUM_MACHINE)
}
