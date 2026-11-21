import { midiService } from '@/core/midi/midi-service'
import { findOutputFor } from '@/lib/led-feedback'

/**
 * Test LED (mapping editors). The LEDs that follow the app's state are sent by
 * core/midi/led-feedback-service.ts, always on.
 */
export function useMidiFeedback() {
  function sendFeedback(mapping, isOn) {
    if (mapping.feedbackOn === undefined || mapping.feedbackOff === undefined) return
    const val = isOn ? mapping.feedbackOn : mapping.feedbackOff
    const chan = mapping.channel === -1 ? 0 : mapping.channel
    const out = findOutputFor(mapping.device ?? '', midiService.getOutputs())
    if (!out) return
    if (mapping.note !== undefined) midiService.sendRawToDevice(out.id, [0x90 | chan, mapping.note, val])
    else if (mapping.cc !== undefined) midiService.sendRawToDevice(out.id, [0xB0 | chan, mapping.cc, val])
  }

  function testFeedback(mapping) {
    if (mapping.feedbackOn === undefined) return
    sendFeedback(mapping, true)
    setTimeout(() => sendFeedback(mapping, false), 500)
  }

  return { testFeedback }
}
