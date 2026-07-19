# Plan: Virtual MIDI Instrument Support

## Problem

Some MIDI instruments are standalone apps that cannot be discovered via WebMIDI (`navigator.requestMIDIAccess()`). They receive MIDI from a hardware controller registered in SY.CORE, but SY.CORE has no way to send them program changes or manage them as a device.

## Solution Overview

1. **Define a virtual instrument registration** — a manual entry stored separately from WebMIDI devices
2. **Allow virtual instruments as output destinations** in the routing matrix
3. **Show them in MidiDeviceProgramChangePanel.vue** for bank/preset browsing and PC transmission
4. **Send MIDI messages to virtual instruments** via the MIDI routing system as if they were real output ports

## Files to Change

| File | Changes |
|------|---------|
| `src/types/midi.ts` | Add `VirtualRegistration` interface |
| `src/stores/useMidiStore.ts` | Add virtual instruments CRUD + persistence; expose as outputs in `outputs` computed |
| `src/core/midi/midi-routing.ts` | Accept virtual destinations in `sendMessage` |
| `src/components/MidiDeviceProgramChangePanel.vue` | Include virtual instruments in `devices` computed, show virtual badge, same PC flow |
| `src/components/MidiMatrixPanel.vue` (or equivalent UI) | Allow virtual instruments as source-to-destination targets |

## Detailed Steps

### 1. Types (`src/types/midi.ts`)

Add a `VirtualRegistration` interface:

```ts
export interface VirtualRegistration {
  name: string;
  channel: number;       // MIDI channel (0-15)
  bankMsb: number;
  bankLsb: number;
  program: number;
}
```

### 2. Store (`src/stores/useMidiStore.ts`)

```ts
// ── Virtual Instruments ────────────────────────────────────────────────
const virtualInstruments = ref<VirtualRegistration[]>([])
const VIRTUAL_INSTRUMENTS_KEY = 'S1_VIRTUAL_INSTRUMENTS'

function loadVirtualInstruments() { /* from localStorage */ }
function persistVirtualInstruments() { /* to localStorage */ }

function addVirtualInstrument(name: string) { /* push with defaults */ }
function removeVirtualInstrument(name: string) { /* filter out */ }
function updateVirtualInstrument(name: string, data: Partial<VirtualRegistration>) { /* merge */ }

// Extend 'outputs' computed to include virtual instruments:
const outputs = computed(() => {
  const real = midiService.getOutputs()
  const virtual = virtualInstruments.value.map(v => ({
    id: `virtual:${v.name}`,
    name: v.name,
    type: 'virtual' as const,
  }))
  return [...real, ...virtual]
})

// Auto-open virtual output ports so they accept messages
// In midi-service.ts, we treat virtual outputs as always-open synthetic ports.
```

### 3. Routing (`src/core/midi/midi-routing.ts`)

In `sendMessage` / `sendMessageToPorts`, add a check: if the port name matches a virtual instrument, call a dedicated send method that logs or forwards the MIDI message to a virtual output handler.

Virtual instruments have no real `MIDIOutput.send()`, but SY.CORE still needs to track what was sent for PC state and monitor display. Options:

- Use a **synthetic port** object with a `.send()` shim that writes to a ring buffer / monitor
- OR create a `VirtualMidiOutput` class that mimics `MIDIOutput.send()`

For simplicity: create a `Map<string, (data: number[]) => void>` in `midi-service.ts` for virtual output handlers. The default handler just writes to the MIDI monitor and notifies listeners.

```ts
// In midi-service.ts:
private virtualOutputs = new Map<string, (data: number[]) => void>();

registerVirtualOutput(name: string, sendFn?: (data: number[]) => void) {
  this.virtualOutputs.set(name, sendFn ?? ((data) => {
    this.monitor.add({ direction: 'out', device: name, data, ... });
    this.notifyRawListeners(data);
  }));
}

unregisterVirtualOutput(name: string) {
  this.virtualOutputs.delete(name);
}
```

### 4. PC Panel (`MidiDeviceProgramChangePanel.vue`)

The `devices` computed currently filters `midiStore.routingConfig.registrations` for PC-enabled devices. Extend it to also include virtual instruments:

```ts
const devices = computed(() => {
  const real = /* existing logic */
  const virtual = midiStore.virtualInstruments.map(v => ({
    name: v.name,
    isOnline: true, // always online
    pcEnabled: true,
    isMulti: false,
    pcChannel: v.channel,
    pcProgram: v.program,
    pcMsb: v.bankMsb,
    pcLsb: v.bankLsb,
    pcBank: '',
    pcChannels: {},
  }))
  return [...real, ...virtual].sort(...)
})
```

The rest of the panel (bank browse, preset select, sendManual, manual PC/MSB/LSB controls) works identically.

Add a small "VIRTUAL" badge next to the device name in the left column.

### 5. UI for Adding Virtual Instruments

**Option A**: A simple dialog in the MIDI Matrix panel or PC panel with an "Add Virtual Instrument" button that prompts for a name.

**Option B**: A dedicated tab/section in settings.

Recommend A — minimal surface area. Add a button that opens a prompt:

```
[Add Virtual Instrument] → prompt("Instrument name:") → addVirtualInstrument(name)
```

Place it at the bottom of the device list in both:
- The MIDI Matrix panel (so it appears as a routable destination)
- MidiDeviceProgramChangePanel.vue (so it appears in the PC device list)

### 6. PC Notification for Virtual Instruments

The existing `showPcNotification` toast already works — it just needs the virtual device name in the toast title, same as any real device.

## Edge Cases

- Virtual instruments must persist across page reloads (localStorage, not Firestore)
- If user deletes a virtual instrument, clear any routing paths that reference it
- Virtual instruments are always "online" — no offline detection needed
- No need for `inEnabled` / `inChannel` — virtual instruments only receive, they don't send

## Implementation Order

1. `src/types/midi.ts` — add `VirtualRegistration`
2. `src/stores/useMidiStore.ts` — add virtual instruments CRUD, extend `outputs`
3. `src/core/midi/midi-service.ts` — add virtual output registry + send shim
4. `src/core/midi/midi-routing.ts` — route messages to virtual outputs
5. `src/components/MidiDeviceProgramChangePanel.vue` — include virtuals in device list
6. Router matrix panel — add "Add Virtual" button

## Future Considerations

- Per-virtual-instrument bank/preset catalog (loadable from JSON)
- Virtual instrument plugin architecture
- Virtual instrument that hosts Tone.js synths internally
