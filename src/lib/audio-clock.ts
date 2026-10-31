// AudioContext time (what Tone.js passes to scheduled callbacks) → performance.now() ms (what a
// timestamped Web MIDI send takes), so MIDI notes leave when the audio scheduled for the same
// time is heard. getOutputTimestamp() pairs the context time being output now with its
// performance time, which takes the output latency into account; without it, currentTime ↔ now.
// Note: Tone.now() is currentTime + lookAhead, not the context's current time — converting from
// it put MIDI a lookahead (~100 ms) ahead of the audio.
import { getContext } from 'tone'

export function audioTimeToPerfMs(time: number, ctx: BaseAudioContext | undefined = (getContext() as any)?.rawContext): number {
  const now = performance.now()
  if (!ctx) return now
  const ts = typeof (ctx as AudioContext).getOutputTimestamp === 'function' ? (ctx as AudioContext).getOutputTimestamp() : null
  if (ts && ts.contextTime != null && ts.performanceTime != null && ts.performanceTime > 0) {
    return ts.performanceTime + (time - ts.contextTime) * 1000
  }
  return now + (time - ctx.currentTime) * 1000
}
