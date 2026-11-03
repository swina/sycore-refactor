// Audio Capture's input while the Drum Machine is MIDI OUT ONLY: the "Loopback" audio input,
// which brings back the sound of the instruments the Drum Machine plays (AudioCapture.vue).

/** An audio input named "Loopback" (any case, anywhere in its name). */
export function isLoopbackAudioInput(d: { label?: string } | null | undefined): boolean {
  return /loopback/i.test(d?.label ?? '')
}

/**
 * MIDI OUT ONLY in effect: the switch is on and the Drum Machine is wired in MIDI Flow to a
 * virtual instrument (same rule as DrumMachine.vue's `midiOutOnly`).
 */
export function dmMidiOutOnlyActive(switchOn: boolean, routedTo: string[] | null | undefined,
  virtualInstruments: { name: string }[] | null | undefined): boolean {
  if (!switchOn) return false
  return (routedTo ?? []).some(n => (virtualInstruments ?? []).some(v => v.name === n))
}

/**
 * The input Audio Capture records from: the Loopback while MIDI OUT ONLY is in effect (when
 * there's one), else the picked input ('default' when none).
 */
export function captureInputDeviceId(devices: { deviceId: string, label?: string }[] | null | undefined,
  pickedId: string | null | undefined, midiOutOnly: boolean): string {
  if (midiOutOnly) {
    const lb = (devices ?? []).find(isLoopbackAudioInput)
    if (lb) return lb.deviceId
  }
  return pickedId || 'default'
}
