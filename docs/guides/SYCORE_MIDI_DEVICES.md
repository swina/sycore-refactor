# MIDI DEVICES

<img src="/help/guides/sycore-midi-devices.png"/>

Open the **Devices** from the Main Page.

The panel lists every MIDI port detected by the Web MIDI API — inputs and outputs — grouped by physical device. Each entry shows:

| Column | Meaning |
|--------|---------|
| **Name** | Port name as reported by the OS / driver |
| **Type** | Auto-classified: Controller · Instrument · Audio Interface |
| **Status** | Online (green) or Offline (gray) |

### If your device is not listed

- Click the **Refresh** button (circular arrow) in the top-right of the Devices tab. This re-scans the Web MIDI API without reloading the page.
- Unplug and re-plug the USB cable, wait 3 seconds, then refresh again.
- Make sure no other application (DAW, standalone synth editor) has taken exclusive ownership of the port.

### Register the device

Click **Add to Routing** next to the device you want to use. This moves it into the routing system so it appears in all other tabs. Registered devices persist across sessions — you only need to do this once per device.

If the auto-detected type is wrong (e.g. a controller is classified as an instrument), click the type badge to cycle through the options. Your choice is saved immediately.

Click the button **FLOW** to connect your devices

[<button class="border px-8 py-2 border-neutral-700 rounded m-auto hover:bg-synth-neon bg-synth-neon/50">Next MIDI FLOW</button>](./SYCORE_MIDI_FLOW.md)