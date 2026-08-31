# Audio Looper (Beta)

The Audio Looper is a high-fidelity, sample-accurate performance tool designed for seamless integration between live instrumental performance and digital production. 

***This tool is still under development to fix stability issues***

<img src="../../help/guides/sycore-looper.png"/>

## 🎸 For the Musician (Performance Features)

The Looper is built to feel like a rugged hardware unit, but with the flexibility of a modern digital audio workstation.

*   **8-Track Layering**: Move beyond simple loops. Record up to 8 independent audio layers to build complex, evolving textures and arrangements.
*   **Touch-Optimized Mixer**: Large, high-precision faders and oversized pads designed for fail-proof interaction on touch screens during high-pressure live sets.
*   **Intelligent Syncing**:
    *   **BPM Alignment**: Automatically scales recording duration to matches your session BPM.
    *   **MIDI Triggered Recording**: Arm a track and let your MIDI gear (pedalboard, keyboard, or sequencer) trigger the start of the recording for hands-free operation.
*   **Instant Playlist Integration**: Finished a great take? One tap on **"+ Playlist"** renders your mix and injects it directly into the global playlist as a new backing track.
*   **High-Fidelity MP3 Export**: Share your creations instantly. Export your mixed loops as professional-grade MP3 files with human-readable timestamps (`SyCore_Loop_YYYY-MM-DD-HH-mm`).
*   **Monitoring & Control**: Dedicated Mute/Solo for each layer and a global transport bar with "Rewind on Record" functionality to ensure you always start on the downbeat.

---

## 💻 For the Tech-Savvy (Architecture & Engine)

Under the hood, SY.CORE uses a custom-built low-latency audio engine designed for stability and precision.

*   **Sample-Accurate Timing**: Built on the Web Audio API's `ScriptProcessor` (optimized for stability) and `OfflineAudioContext`, ensuring that loops never drift, even over long sessions.
*   **Soft-Clipping Engine**: A custom digital limiter is integrated into the master output to prevent harsh digital distortion, ensuring your audio remains warm and professional even when layering multiple loud tracks.
*   **Offline Rendering Pipeline**:
    *   **Parallel Processing**: When exporting, the engine replicates your entire mix (volumes, mutes, and layers) in a separate high-speed context.
    *   **Native MP3 Encoding**: Integrated with `@breezystack/lamejs`, providing local, client-side MP3 encoding without needing external servers.
*   **State Management & Persistence**: Leverages **Pinia** for reactive state and **LocalStorage** for persistence of input device preferences and loop configurations.
*   **Event-Driven Integration**: Uses a robust custom event system to communicate between the Looper, the Backing Track Player, and the MIDI Hub, allowing for a decoupled but highly responsive architecture.

---

## 🛠 Tech Stack
*   **Audio Core**: Web Audio API / OfflineAudioContext
*   **MP3 Encoder**: lamejs
