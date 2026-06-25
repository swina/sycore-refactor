# MIDI Routing 

## MIDI FLOW

<img src="/help/guides/sycore-midi-routing-flow.png"/>

The MIDI FLOW is a graphical flow diagram to create/update/restore MIDI ROUTING configuration designed in order to simplify your MIDI connections.
In SY.CORE there are 2 type of MIDI Devices:

    - MIDI APPS (application the uses MIDI messages)
    - MIDI DEVICES (autodiscovery MIDI devices connected)


After the MIDI Devices registration the MIDI DEVICES list will be populated with the registered devices.

### CREATE A MIDI ROUTING (MIDI DEVICES)

To create a MIDI ROUTING between MIDI DEVICES: 

    - drag a MIDI DEVICE, usually a controller like a Master Keyboard or a Pad controller, to the canvas
    - drag a MIDI DEVICE like Synth, a GrooveBox, etc. 
      that should be controlled by the device dragged before
    - drag with the mouse from the MIDI OUT (right yellow ring) of the controller 
      to the MIDI IN (left blue ring) of the MIDI DEVICE to be controlled and release the mouse
    - a cable will be created that indicates the connection
    - set the MIDI CH OUT and MIDI CH IN in order to match your devices configuration
    - for each MIDI DEVICE you can enable/disable the following MIDI features (MIDI Filtering):
        - SYNC : forward MIDI Clock (0xF8) to this device
        - TRSP : forward Start / Stop / Continue messages
        - NOTE : forward note data (Note On / Note Off)
        - CC : forward Control Change messages
        - PC : enable Program Change dispatch

A typical controller + one synth setup looks like this:

<img src="/help/guides/sycore-midi-routing-flow-midi-devices.png"/>


*For the midi controllers you can leave to MIDI OUT Channel to OMNI if you don't know the controller output channel or you can't set the MIDI OUT CH on the device*

*MIDI Filtering* : this filters any MIDI Message from a controller. Thus means that if a MIDI DEVICE has NOTE unselected it will not respond to MIDI NOTE messages (NOTE ON,NOTE OFF, VELOCITY)

Click on <span class="text-synth-neon text-lg font-black">APPLY ROUTING</span> to save the configuration.




### CREATE A MIDI ROUTING (MIDI APPS)

To create a MIDI ROUTING between the app functionalities and the MIDI DEVICES repeat the same steps as before dragging a MIDI APP to the canvas and connect the out connector (violet ring) to a MIDI DEVICE (left blue ring).

MIDI APPS don't have an MIDI IN connector. This virtual MIDI devices are only sending MIDI OUT messages.

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