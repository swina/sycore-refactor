# MIDI Routing 

<img src="/help/guides/sycore-midi-routing.png"/>

Switch to the **Routing** tab. You will see one row per registered device in **Grid view**.

### Enable inputs and outputs

| Column | What to do |
|--------|-----------|
| **MIDI IN** | Toggle ON for every device you want SY.CORE to *receive* from (controllers, sequencers, clock sources) |
| **MIDI OUT** | Toggle ON for every device SY.CORE should *send* to (synths, drum machines, audio interfaces with MIDI) |
| **SYNC** | Toggle ON to forward MIDI Clock (0xF8) to this device |
| **TRSP** | Toggle ON to forward Start / Stop / Continue messages |
| **NOTE** | Toggle ON to forward note data (Note On / Note Off) |
| **CC** | Toggle ON to forward Control Change messages |
| **PC** | Toggle ON to enable Program Change dispatch (only when OUT is enabled) |

A typical controller + one synth setup looks like this:

```
Device              IN   OUT  SYNC  TRSP  NOTE  CC   PC
─────────────────── ──── ──── ───── ───── ───── ──── ────
Keystep (ctrl)       ✔    —    —     —     —     —    —
Roland S-1           —    ✔    ✔     ✔     ✔     ✔    ✔
```

### Set MIDI channels

Each device row has channel selectors next to the IN and OUT toggles:

- **IN channel** — `OMNI` (receive all channels) or `1–16` (receive one specific channel only). Use OMNI unless you need to filter a specific channel.
- **OUT channel** — `Pass-through` (send on the channel the message arrived on) or `1–16` (force all outgoing messages to a fixed channel). Set this to match the receive channel on your hardware.

### Global Thru Bridge

At the bottom of the Routing tab, enabling **Global Thru Bridge** forwards all incoming messages directly to all active outputs without any processing. Useful for connecting a controller to a hardware synth in pass-through mode. You can limit the bridge to Notes only or CC only using the Thru Filters toggles.

---