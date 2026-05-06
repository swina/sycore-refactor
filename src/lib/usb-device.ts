/**
 * usb-device.ts
 * Roland S-1 hardware identification via WebUSB + WebMIDI fallback.
 *
 * WebUSB limitation: class-compliant USB-MIDI devices are claimed by the OS
 * driver (USB Audio class), so they never appear in the Chrome device picker.
 * As a fallback we derive a stable fingerprint from the WebMIDI port descriptor,
 * which Chrome builds from the USB device path and includes the serial number
 * on Windows (visible in the MIDIInput.id string).
 */

export const ROLAND_VID = 0x0582;
export const ROLAND_S1_PID = 0x02C9;

// ── Result types ─────────────────────────────────────────────────────────────

export type S1ScanResult =
  | { status: 'ok';           serial: string; source: 'usb' | 'midi' }
  | { status: 'cancelled' }
  | { status: 'not_found' }       // device not accessible via WebUSB (OS driver conflict)
  | { status: 'no_serial' }
  | { status: 'unsupported' }
  | { status: 'error'; message: string };

// ── WebUSB path ───────────────────────────────────────────────────────────────

/**
 * Attempts to read the serial number directly via WebUSB.
 * This will fail for most setups where the OS MIDI/Audio class driver is active,
 * because Chrome hides devices that already have a kernel driver bound.
 * In that case returns { status: 'not_found' }.
 */
export async function scanS1SerialViaUSB(): Promise<S1ScanResult> {
  if (!navigator.usb) {
    return { status: 'unsupported' };
  }

  try {
    const device = await navigator.usb.requestDevice({
      filters: [{ vendorId: ROLAND_VID, productId: ROLAND_S1_PID }],
    });

    const serial = device.serialNumber?.replace(/\0/g, '').trim();
    if (!serial) return { status: 'no_serial' };

    return { status: 'ok', serial, source: 'usb' };
  } catch (err: any) {
    // NotFoundError = user closed picker (possibly empty because device is driver-claimed)
    if (err?.name === 'NotFoundError') {
      return { status: 'not_found' };
    }
    // User explicitly cancelled
    if (err?.name === 'AbortError') {
      return { status: 'cancelled' };
    }
    return { status: 'error', message: err?.message ?? String(err) };
  }
}

// ── WebMIDI fallback ──────────────────────────────────────────────────────────

/**
 * Derives a hardware fingerprint from the WebMIDI port descriptor.
 *
 * Chrome (Windows) builds the MIDIPort.id for USB devices from the device path
 * which embeds the USB serial number. The resulting string is stable for the same
 * physical unit on the same machine.
 *
 * Format returned: "ROLAND-S1:<midi_port_id>" — prefix makes the source explicit.
 */
export function scanS1SerialViaMidi(inputs: MIDIInput[]): S1ScanResult {
  const s1 = inputs.find(
    i => i.name?.toUpperCase().includes('S-1') || i.name?.toUpperCase().includes('ROLAND S-1')
  );

  if (!s1) return { status: 'not_found' };

  // Build fingerprint: use the full id which on Chrome/Win contains USB path info
  const fingerprint = `ROLAND-S1:${s1.id}`;
  return { status: 'ok', serial: fingerprint, source: 'midi' };
}

// ── Combined scan ─────────────────────────────────────────────────────────────

/**
 * Tries WebUSB first; if the device is not accessible (OS driver conflict),
 * falls back to MIDI port fingerprint.
 */
export async function scanS1Serial(inputs: MIDIInput[]): Promise<S1ScanResult> {
  if (navigator.usb) {
    const usbResult = await scanS1SerialViaUSB();
    if (usbResult.status === 'ok' || usbResult.status === 'cancelled') {
      return usbResult;
    }
    // not_found / no_serial / error → try MIDI fallback
  }

  return scanS1SerialViaMidi(inputs);
}
