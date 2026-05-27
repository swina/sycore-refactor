# Backing Track Player

The Backing Track Player is a core module of SY.CORE designed for managing and playing audio files, backing tracks, and playlists during live performances. It provides advanced features like crossfading, MIDI synchronization, and real-time BPM updates.

## Key Features

### 1. Dual-Slot Playback Engine
The player uses two independent audio elements to enable seamless transitions. This architecture allows for:
- **Crossfading**: Smooth volume transitions between tracks (configurable duration).
- **Gapless Playback**: Pre-loading the next track in the playlist while the current one is still playing.

### 2. Playlist System
A robust playlist manager that supports:
- **Individual Repeats**: Set how many times each track should repeat before moving to the next.
- **Global Loop**: Toggle whether the entire playlist should restart upon completion.
- **Library Integration**: Quickly add tracks from the central library or capture audio recordings.
- **Local Files**: Temporary support for local audio files during a session.

### 3. MIDI Integration
The player is deeply integrated with the MIDI engine:
- **Transport Sync**: Automatically sends MIDI `START` and `STOP` commands when the audio player starts or stops. This can be toggled via the "Link" icon.
- **MIDI Actions**: 
    - `toggle_track_player`: Opens/closes the player UI.
    - `playlist_play_stop`: Global play/stop control.
    - `playlist_next`: Skips to the next track with an immediate crossfade.
    - `playlist_volume_cc`: Map external MIDI faders to the player's master volume.

### 4. BPM Synchronization
If a track in the library has a defined BPM value, the player will automatically:
- Update the application's global BPM when the track starts.
- Sync connected sequencers and arpeggiators to the backing track's tempo.

### 5. UI Components
- **Floating Control Bar**: A minimal, draggable bar for quick access to transport, progress, and volume.
- **Library & Settings Panel**: A detailed panel for browsing the track library, managing the active playlist, and configuring crossfade settings.

## Interface Elements

- **Play/Pause**: Main transport control.
- **Skip Back/Forward**: Navigate through the playlist.
- **Repeat (Loop)**: Toggles looping for a single track or the entire playlist.
- **Sync (Link Icon)**: Toggles sending MIDI transport commands.
- **Crossfade (Seconds)**: Adjust the overlap time between tracks (default: 3s).

## Administrative Functions
Users with Admin privileges can:
- Add new tracks to the library by providing a URL, label, and genre.
- Edit existing track metadata, including BPM.
- Delete tracks from the persistent database.

## Technical Details
- **Persistence**: Track library is stored in IndexedDB (local-first) with optional Firebase synchronization.
- **Storage**: Audio files are loaded via URL (cloud storage or local blob URLs).
- **Communication**: Uses `CustomEvent` for cross-component communication (e.g., `playlist-add-from-capture`, `bpm-update`).
