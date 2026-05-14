# SY.CORE MIDI PERFORMANCE

The **MIDI Performance Panel** is the beating heart of live MIDI routing and management in SY.CORE. It allows you to define in real-time which message streams pass between the various controllers, hardware synthesizers, and software engines connected to the system. It offers an intuitive interface (Matrix or Flow) and unique generative features like *Smart Latch*.

## Key Features

### 1. Advanced Views (Grid vs Flow)
The interface offers two interchangeable modes:
- **Grid View (Matrix):** An M x N matrix where rows represent MIDI inputs (controllers, keyboards, internal engines like Arpeggiator and Sequencer) and columns represent hardware output devices. Checkboxes allow for fast, cross-connected routing.
- **Flow View:** A graphical visualization of signal flows (from Inputs to Outputs), indicating active connections in a clear, organic manner. Perfect for quick glances during live scenarios.

### 2. Broadcast Mode
A global "Master Thru" mode that, when activated, allows all registered inputs to send data to all registered outputs simultaneously, overriding individual matrix configurations. Excellent for "Panic Modes" or very quick, generic setups where everything controls everything.

### 3. Intelligent Ingress Filters
Routing is optimized to only display rows for devices that have active "MIDI IN" capabilities and expose columns only for devices with active "MIDI OUT" capabilities (based on settings registered in the MIDI MATRIX Settings panel). Virtual devices such as the Step Sequencer, Arpeggiator, or the system footer (MIDI START/STOP) are included by default.

### 4. Smart Latch (Intelligent Note Hold)
The *Smart Latch* is an advanced performance feature for holding/pausing notes generatively without using a conventional physical sustain pedal. Key characteristics:

- **Selective Routing (Per-Output):** From the Grid View, you can enable Latch *only* for specific hardware synthesizers by clicking the corresponding "padlock icon" in the column header.
- **Master Toggle:** The primary Smart Latch activation can be triggered via the panel toggle or mapped to a hardware pad/knob using `app-midi-actions` (`smart_latch_cc`). When the Master is activated, only synths configured with the padlock will hold notes; others will behave normally.
- **FIFO Policy:** Features a queue where you can configure the maximum number of notes to hold (from 1 to 8).
- **"Replace" Mode:** If checked, the FIFO enters circular mode: once the note limit is reached (e.g., 4 notes), a 5th note will kick out and replace the oldest note, sending a precise `Note Off` only for that specific old note. If disabled, any new note exceeding the limit will be discarded (useful for locking complex droning chords without accidentally polluting them).

### 5. "Pass Thru" Control
For controllers mapped with the SY.CORE MIDI MAPPER to control UI parameters, the `pass_thru` action allows commands or Notes to pass unharmed, while still triggering internal app actions. It is also highly recommended to use the `CONSUME` flag on controls dedicated to App actions (like the hardware button for the Smart Latch), so that the respective MIDI signal is eaten/hidden from hardware synths, preventing unexpected parameter jumps.

### 6. START / STOP Mapping
Classic global MIDI Transport controls (Start / Stop) present in the main UI are explicitly listed among the MIDI sources in the Performance Matrix. This allows you to selectively configure which drum machine or synth receives clock sync without spamming your entire workstation.

## Signal Safety & Panic
Every change to Latch states or filters has an immediate impact on Note On/Off buffers: surgically disabling the Smart Latch triggers an automatic "Garbage Collection", sending precise *Note Off* messages for any hanging notes, absolutely preventing frozen oscillators on your physical machines.
