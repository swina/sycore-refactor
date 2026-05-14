# Advanced MIDI Matrix // Features Summary

The **Advanced MIDI Matrix** is the beating heart of signal routing in the SY.CORE system. Designed as a central hub for managing complex hardware setups, it allows you to transform your browser into a professional control center for multiple MIDI devices.

---

## 1. Multi-Device Routing Architecture
The Matrix simultaneously manages various sources (Input) and destinations (Output), allowing you to orchestrate an entire set of synthesizers, drum machines, and hardware controllers.

- **Sources & Inputs**: Automatic detection and selective activation of hardware controllers, keyboards, and MIDI interfaces.
- **Destinations & Outputs**: Granular management of external synths and sound modules.

## 2. Display Modes

### 🎛️ Matrix Mode (Technical Management)
An operational grid for configuring every single technical aspect of the routing:
- **Channel Filters**: Ability to set specific MIDI channels (1-16) or OMNI mode for each device.
- **Granular Output Control**: For each output device, you can selectively activate/deactivate:
  - **SYNC (Clock)**: Sends time synchronization signals.
  - **TRSP (Transport)**: Sends Start/Stop/Continue commands.
  - **NOTE**: Enables the passing of note messages.
  - **CC (Control Change)**: Enables the passing of automation data and parameters.

### 🌊 Flow Mode (Dynamic Visualization)
A graphical representation "patch-bay style" that shows in real-time how the signal flows through the system:
- **Signal Animation**: Animated flow lines that visually connect Sources to the Core Engine and results to Destinations.
- **Immediate Feedback**: LED indicators to identify which protocols (Clock, Notes, CC) are active on each path.

## 3. Core Processing Engine

- **Master Sync Engine**: Internal clock generator to keep all hardware devices perfectly in time.
- **Experimental MIDI Thru Bridge**: An intelligent bridge that allows for direct connection of inputs to outputs (bypassing or integrating the internal engine), with dedicated filters for Note and CC.
- **Panic System**: Safety function to instantly send "All Notes Off" and "Reset All Controllers" commands across all 16 channels of every connected device.

## 4. Professional Design & UX
- **High-Tech Interface**: "Synth-neo" aesthetics with transparencies, blur, and micro-animations.
- **Persistence**: Automatic saving of routing configurations for future sessions.
- **Quick Access**: Instantly accessible floating panel for rapid interventions during live performances or production.

---
*SY.CORE LABS · Advanced MIDI Hub v2.0*
