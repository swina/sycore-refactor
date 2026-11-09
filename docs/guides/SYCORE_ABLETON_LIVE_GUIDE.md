# SY.CORE with Ableton Live — SY.CORE Link & Rig Controller

> The complete guide: connect SY.CORE to Live, play its apps on Live's grid, record them as clips, and perform with the Rig Controller.

*Looking for the short version? See [SY.CORE for Ableton Live](./SYCORE_FOR_ABLETON_LIVE.md).*

---

## Contents

1. [How it fits together](#1-how-it-fits-together)
2. [Requirements](#2-requirements)
3. [Install the SY.CORE Link devices](#3-install-the-sycore-link-devices)
4. [Connect SY.CORE](#4-connect-sycore)
5. [Track layout: playing and recording](#5-track-layout-playing-and-recording)
6. [The Rig Controller](#6-the-rig-controller)
7. [Launching slots: Trigger sync, arming, stopping](#7-launching-slots-trigger-sync-arming-stopping)
8. [Shaping the performance: Mute, Solo, Intensity, Density, Fill](#8-shaping-the-performance)
9. [Generating live: GEN and the key](#9-generating-live-gen-and-the-key)
10. [The Launchpad in Rig mode](#10-the-launchpad-in-rig-mode)
11. [Mapping any controller](#11-mapping-other-controllers)
12. [Troubleshooting](#12-troubleshooting)
13. [Limits and notes](#13-limits-and-notes)

---

## 1. How it fits together

```
SY.CORE (browser)                          Ableton Live
┌──────────────────────┐   WebSocket   ┌───────────────────────────────┐
│ Drum Machine  ch 10  │ ───────────▶  │ sycore-link        (bridge)    │
│ Chord Prog    ch 1   │  127.0.0.1    │   ├─▶ SYC Drums  Receive ch 10 │──▶ Drums  (Drum Rack)
│ Sequencer     ch 2   │    :9400      │   ├─▶ SYC Chords Receive ch 1  │──▶ Chords (synth)
│ Rig Controller       │ ◀───────────  │   └─▶ …                        │──▶ …
└──────────────────────┘  Live's tempo, └───────────────────────────────┘
                          position, Play/Stop
```

- **SY.CORE Link** is a Max for Live device, `sycore-link`. It runs a small server inside Live, reads Live's transport (Play, Stop, tempo, position, time signature) and sends it to SY.CORE.
- SY.CORE **follows Live's clock** and sends each note **with the Live beat it must play on**. The device plays it on that beat, so browser delays don't move the notes.
- **SY.CORE Link Receive**, `sycore-link-receive`, sits on any other track and lets through one MIDI channel. One app per track: the Drum Machine on channel 10, the Chord Prog on channel 1, and so on.
- There are **no virtual MIDI ports**: the notes go straight from SY.CORE to the devices.

---

## 2. Requirements

| | |
|---|---|
| **Ableton Live** | Live with Max for Live (Suite, or Standard + Max for Live). Tested with Live 12. |
| **Browser** | Chrome or Edge (Web MIDI). |
| **Network permission** | The browser must be allowed to reach `127.0.0.1` (Chrome may ask about *local network access*: allow it). |
| **Files** | `sycore-link.amxd`, `sycore-link-receive.amxd` and the bridge script `sycore-link.js` (with its `node_modules`), in one folder. |

---

## 3. Install the SY.CORE Link devices

1. **Put the device folder in place.** The bridge looks for its script at a fixed path, `C:\Users\<you>\Documents\sycore-link\sycore-link.js`. Copy the whole `sycore-link` folder there, including `node_modules`.
2. **Add the bridge.** Drag `sycore-link.amxd` onto a MIDI track. Only one per set; a dedicated track such as "SY.CORE Control" is a good home.
3. **Check it started.** The device panel shows:
   - **status LED**: amber = waiting for SY.CORE, green = connected, red = error (e.g. port 9400 already in use);
   - the status line (`SY.CORE connected · track SY.CORE Control`) and a stats line (messages per second, late, dropped);
   - a **MIDI LED** that flashes on each message it plays on its own track.
4. **Add the receivers.** Drag `sycore-link-receive.amxd` onto one track per app and click its channel on the **2×8 grid** (1–16). The receiver's MIDI LED flashes when its channel plays.

> The bridge's own track has a **Channel** menu too: *All* plays every channel there, or pick one.

---

## 4. Connect SY.CORE

1. Open SY.CORE in the browser while Live is open with the bridge in the set.
2. **Clock** — in the transport's clock settings, pick the source **EXT · Live (M4L) — SY.CORE Link**. SY.CORE now follows Live's Play, Stop, tempo and position.
3. **SY.CORE Link section** (Sync panel) — check that it shows *connected*, the bridge's track and the round-trip time. If no device is found, see [Troubleshooting](#12-troubleshooting).
4. **Outputs** — in **MIDI Flow**, cable each app to the **Live (M4L)** destination and set the cable's **OUT channel**:

| App | OUT channel | Live track |
|---|---|---|
| Drum Machine | 10 | Receive ch 10 → Drum Rack |
| Chord Prog | 1 | Receive ch 1 → instrument |
| Sequencer | 2 | Receive ch 2 → instrument |

From now on, pressing **Play in Live** starts the apps that are in *Sync Apps to Transport*, and Live's **Stop** stops them.

---

## 5. Track layout: playing and recording

The receivers play SY.CORE's MIDI only: they ignore their track's own input. The layout below is the one tested for recording:

| Track | MIDI From | Monitor | Devices |
|---|---|---|---|
| **SYC Drums** | **No Input** | In | Receive ch 10, no instrument |
| **Drums** | SYC Drums, **Post FX** | Auto, armed | Drum Rack |
| **SYC Chords** | **No Input** | In | Receive ch 1, no instrument |
| **Chords** | SYC Chords, **Post FX** | Auto, armed | instrument |
| **Arp tracks** | Chords, Post FX | Auto | arpeggiator + instrument |

- The "SYC" tracks only receive. The tracks that play (and record) take their MIDI from them, **Post FX**, that is after the receiver.
- **To record**, arm the playing tracks and record in **Arrangement View**. Use a **1-bar Count-In**: the first note after Play can arrive a few tens of ms late, and the count-in covers it.
- What you record is an ordinary MIDI clip, which you can edit, quantize, consolidate or reuse.
- An arp track records the chords it receives, and its arpeggiator plays them back. That's normal: the arpeggio is made when the clip plays.

> **Measured timing** (Live 12, 120 BPM, a 34-bar take): mean offset from the grid **+0.7 ms**, typical deviation about ±5 ms (Live's own recording resolution), note lengths steady.

---

## 6. The Rig Controller

The **Rig Controller** is a performance surface for the whole rig, not for one instrument. Open it from the toolbar (grid icon, after DECK).

### LIVE and SIM

| Mode | What it does |
|---|---|
| **Live** (default) | The **Chord**, **Drum**, **Seq**, **Bass** and **Arp** rows drive the real Chord Prog, Drum Machine, Sequencer, the Drum Machine's bassline and the Arpeggiator, on the real clock. |
| **Sim** | A simulated rig and clock: try every option without sound. |

Rows are ordered **Chord, Drum, Seq, Bass, Arp**. Two rows work differently from the others:

- **Bass** is the Drum Machine's **bassline**, which lives inside the same sequences A–H as the drums. The row lights the sequences that hold a bassline (none while the bassline is off), and its pads switch the Drum Machine's sequence exactly like the Drum row (Latch, Trigger sync, arming). Its **Mute / Solo / Intensity** act on the bassline only, and the Drum row's (on the whole app) on the drums only, so you can drop the bass while the drums keep going. Intensity as **CC 7** needs the bassline on its own MIDI channel (Drum Machine › bassline › MIDI channel); otherwise it scales velocity. **GEN** makes a new bassline in the active sequence, on the Chord Prog's key when it is exact, and switches the bassline on.
- **Arp** has no slots: pads **A–H pick an arp mode** (up, down, up-down, down-up, converge, diverge, pinky-up, random) and switch the Arpeggiator on; the mode playing, pressed again, switches it off. Mute / Solo / Intensity act on the Arpeggiator's output. The Arpeggiator runs on its own rate: Trigger sync and Live's Stop don't apply to it.

Splits, repeat, latch, lane mutes and Undo are still simulation-only in LIVE; the panel says *not connected yet (SIM only)* when you press them.

### Three views of the same state

- **Rig layout** — rows of slots A–H per app, with **M** (mute), **GEN** and **Fill** at the end of each row, plus the transport, track options and the display.
- **Launchpad Mini MK1** — the same rig laid out on an 8×8 grid (see [section 10](#10-the-launchpad-in-rig-mode)).
- **AKAI MIDImix** — strips of knobs, faders and buttons per app.

### Reading a row

| Pad | Meaning |
|---|---|
| amber | the slot holds something |
| green | the slot is playing (with a progress bar) |
| blinking | queued: it starts on the next sync point, or it's armed for Live's Play |
| dark | empty slot |

The **display** (green text on black) always says what the last action did, e.g. `Chord A starts on the next bar`, `Drum B armed: starts on Live's Play`, `Chord A stops now`.

---

## 7. Launching slots: Trigger sync, arming, stopping

A slot pad works like a clip in Session View (**Latch**):

| You press… | What happens |
|---|---|
| a slot of a **stopped** app | the slot is selected and the app **starts** from it on the next sync point |
| the slot that is **playing** | the app **stops** on the next sync point; the notes still sounding end there |
| **another** slot while it plays | it **switches** on the next sync point (the Sequencer: at the end of its pattern) |

### Trigger sync

Each track has a **Trigger sync** in its *Track options*, equivalent to Live's launch quantization:

| Value | Sync point |
|---|---|
| **Off** | at once |
| **1 beat** | the next beat |
| **2 beats** | the next half bar |
| **Bar** (default) | the next bar line |

Sync points are on **Live's song grid**: a drum pattern launched on beat 2 with *1 beat* keeps beat 2 as its own start, exactly as a clip launched with 1-beat quantization. On the Launchpad, the top **Sync** button cycles the focused track's Trigger sync.

### With Live stopped: arming

While SY.CORE follows Live and Live is **stopped**:

- a pad **arms** its slot: it is selected at once and blinks;
- press **Play in Live**, and every armed app **starts from its slot on the first downbeat**, together;
- the armed pad again **disarms** it; another pad of the same row moves the arm.

You can walk on stage with a progression and a drum pattern armed, and start the whole rig with Live's Play.

### Live's Stop

**Live's Stop stops the Drum Machine, the Chord Prog and the Sequencer at once**: Live's grid is gone, so there's no bar left to finish on. To end on a bar line, stop the apps from their pads (Trigger sync *Bar*) before stopping Live. Armed slots stay armed.

### Sections

On the Launchpad, **row 6 (Sections 1–8)** switches every connected app that has that slot filled to it, like a scene in Session View: on the next bar while they play (the Sequencer at the end of its pattern); a stopped app is only switched to that slot, not started.

---

## 8. Shaping the performance

### Mute and Solo

- **M** mutes an app: its note-ons are dropped, so notes already sounding end normally and the app keeps running in time. Unmuting comes back on the grid.
- **Solo** silences the other real apps.
- **Mute / Solo / Intensity act on** (Track options): the **whole app**, or only some of its MIDI Flow cables. For example, *Chord → Live* only, while the same chords keep playing on another synth.

### Intensity and Global

Each app has an **Intensity** fader; **Global** scales them all.

| Intensity sends | Effect |
|---|---|
| **CC 7 (volume)** (default) | CC 7 = Intensity × Global. In Live, MIDI-map it to the track volume. |
| **Velocity** | note-on velocity scaled (127 × 127 = as played). Needs an instrument that responds to velocity. |
| **Both** | both of the above |

### Density

**Density** (Drum and Seq, Track options) thins a pattern out in real time, for build-ups, breaks and drops with nothing else prepared:

| Density | What plays |
|---|---|
| **127** | the pattern as written |
| ~100 | off-beat 16ths gone |
| ~60 | quarter notes only |
| ~40 | beats 1 and 3 |
| **0** | the downbeat alone |

The weakest steps go first, and an accented step holds one level longer. It isn't random: the same steps stay every pass, so the groove stays recognizable. Density acts while the Rig Controller is open in LIVE; in SIM or with the panel closed, the apps play as written.

**Right-click the Density slider** to MIDI Learn it on an encoder (see [section 11](#11-mapping-other-controllers)).

### Fill

**Fill** (rig layout row button, Launchpad row 7) plays a Drum Machine fill **on the next bar**.

- With no fill yet, the first Fill generates one. The **same fill** then plays on each Fill until you press **Gen** in the Drum Machine.
- **New** (next to Gen in the Drum Machine) generates a **new fill every time**.

---

## 9. Generating live: GEN and the key

**GEN** on a row generates new material into the app's **active slot**, while it plays.

| Row | GEN does |
|---|---|
| **Drum** | a new pattern in the current style |
| **Chord** | a new progression, played from the next chord: **built-in**, or **AI** with the rig's *Generate* mode on AI (falls back to built-in if the AI isn't configured) |
| **Seq** | a new sequence, in the Chord Prog's key when it's exact (see below) |

> GEN overwrites the active slot. Keep a progression you like in another slot, or save it, before generating over it.

**Shift + GEN** (Mutate) is simulation-only for now.

### The key

The Chord Prog's key is a pair of relative keys from its library (e.g. *Eb Major / C min*) plus a **mode**:

| Key mode | Generates |
|---|---|
| **Minor** | from the library: its progressions are written on the minor tonic (e.g. **Cm**) |
| **Major** | common major progressions (I–V–vi–IV, ii–V–I…), diatonic triads voiced close, with a bass (e.g. **Eb**) |
| **Both** | any progression of the pair |

From the Rig Controller (LIVE):

- **Key ◀ ▶** (Launchpad: **Key −** / **Key +**) moves the tonic a semitone, in the same mode: Cm → C#m.
- **Maj/Min** (Launchpad: **Shift + Key − / Key +**) switches major ↔ minor on the same tonic: C ↔ Cm.
- The display shows the key: `Key Cm`.

The **Sequencer**'s GEN follows the Chord Prog's key when it's exact. If you picked a scale of the same family it's kept (e.g. *Pentatonic Min* in a minor key), otherwise it switches to Major or Minor. That way the line sits on the chords.

---

## 10. The Launchpad in Rig mode

Turn on **Launchpad Rig** in the Rig Controller's mode bar. The Launchpad then belongs to the rig: its usual mappings are paused, and they come back when Rig mode is off.

| Area | Function |
|---|---|
| **Rows 1–5** | Chord, Drum, Seq, Bass, Arp × slots A–H (Arp: modes) |
| **Row 6** | Sections 1–8 |
| **Row 7** | Split 1–4 · **Fill** · Repeat (hold) · Latch · Release all |
| **Row 8** | Lane mute 1–8 (Shift: 9–16) |
| **Side** | **GEN** per row (Shift: Mutate) · Undo · **Key −** · **Key +** (Shift: Maj/Min) |
| **Top** | Beat/Tap · EXT/INT (hold) · **Shift** · Gen AI · **Sync** · Rig · — · Panic (hold) |

- **Rig keys**: learn a hardware button to switch Rig mode on and off. **All** covers both controllers, **LP** only the Launchpad, **Mix** only the MIDImix.

> **Important:** in Live's *Settings › Link, Tempo & MIDI*, set the Launchpad's **Control Surface to None** and turn off its **Track** and **Remote** inputs. Otherwise Live receives the pads too and launches or records its own clips alongside SY.CORE.

---

## 11. Mapping other controllers

You don't need a Launchpad: **every Rig Controller function can be MIDI-learned on any controller** — pads, buttons, knobs and faders of a Launchkey, an MPK, an APC, a nanoKONTROL…

1. Open the Rig Controller (it acts while open, also minimized).
2. **Right-click** the control in the panel → **MIDI Learn** → press or move the control on your controller.
3. A learned control gets an **amber ring** in the panel.

| Right-click on… | Learns | Control type |
|---|---|---|
| a slot pad (Chord, Drum, Seq rows) | that slot: Latch, Trigger sync, arming — exactly as the panel's pad | pad / button |
| **M**, **Gen**, **Fill** at the end of a row | Mute, GEN of that app; Fill | button |
| a **section** button | Section 1–8 | button |
| **Sync** (Track options) | cycles that track's Trigger sync | button |
| **Key ◀ ▶**, **Maj/Min** | key down / up, major ↔ minor | button |
| **Intensity**, **Density** (Track options) | that app's value | knob / fader |
| **Global** fader | global intensity | knob / fader |

- Buttons work as momentary or toggle (detected automatically); notes work too.
- **LED feedback**: SY.CORE sends the same note or CC back to the controller. On a **Launchpad Mini MK1** the colours match its Rig mode: a slot that holds something amber, playing green, queued or armed blinking green, Mute red. On other controllers a pad is lit (127) while it plays, blinks while queued or armed, and is dark otherwise; Mute and Solo are lit while on. This works on controllers that light a pad when they receive its own note / CC; other colours and LED protocols need a controller template.
- The panel and the controller drive the same values: move either one and the other follows.
- The same actions are listed under **Rig Controller** in the **Controller Designer**, to build an on-screen layout of your controller.
- Parameter names, for reference: `rig_slot_<app>_<a–h>`, `rig_gen_<app>`, `rig_mute_<app>`, `rig_solo_<app>`, `rig_sync_<app>`, `rig_intensity_<app>`, `rig_density_drum`, `rig_density_seq`, `rig_global`, `rig_fill`, `rig_section_<1–8>`, `rig_key_down`, `rig_key_up`, `rig_key_mode` (`<app>` = chord, drum, seq).

Controllers you keep for Live (e.g. a MIDImix mapped to Live's mixer) are unaffected.

### Controller templates (JSON)

A controller's rig controls can be saved as a **JSON file** and loaded again. Use the **Controller template** box in the Rig layout:

- **Export** — pick the controller and download its rig controls as `<name>.sycore-rig.json`.
- **Import** — load a template. It goes to the connected controller whose port name contains the template's `match`, or else to the controller picked in the box. Applying it replaces that controller's rig controls and leaves its other MIDI Learn mappings alone.
- **✕** — forget the controller's rig controls.

The file holds exactly what MIDI Learn stores, so LED feedback, the amber rings and the Controller Designer work as with hand-made mappings:

```json
{
  "format": "sycore-rig-template",
  "version": 1,
  "name": "My Launchkey 49",
  "match": "Launchkey",
  "init": ["F0 … F7"],
  "controls": {
    "rig_slot_drum_a":  { "note": 40, "channel": 10 },
    "rig_gen_drum":     { "note": 44, "channel": 10 },
    "rig_density_drum": { "cc": 21, "channel": 1 }
  },
  "leds": { "palette": { "off": 0, "filled": 9, "playing": 21, "queued": 21, "muted": 5, "solo": 37 } }
}
```

| Field | |
|---|---|
| `match` | part of the controller's MIDI port name (optional) |
| `init` | SysEx messages sent when the template is applied and when the Rig Controller opens, e.g. to switch a controller to a programmer mode (optional) |
| `controls` | rig parameter → `note` or `cc` (0–127) and `channel` (1–16) |
| `leds.palette` | the value sent back for each LED state: `off`, `filled`, `playing`, `queued` (blink), `muted`, `solo` (optional; otherwise lit 127 / dark 0, or the Launchpad Mini MK1 colours) |

Unknown controls and out-of-range values are skipped and reported after the import.

---

## 12. Troubleshooting

| Symptom | Check |
|---|---|
| Status LED stays **amber** | SY.CORE isn't connected: open SY.CORE, pick the *Live (M4L)* clock source, allow local network access in the browser. |
| Status LED **red** | Port 9400 is in use: only one bridge per set, and close other copies of Live or test pages. |
| No sound on a track | The receiver's channel must match the cable's OUT channel; the playing track takes MIDI From the "SYC" track, **Post FX**. |
| Controller notes reach the Drum Rack | Set the "SYC" tracks to **MIDI From = No Input**. |
| Launchpad pads record clips in Live | Remove the Launchpad as Control Surface in Live (see [section 10](#10-the-launchpad-in-rig-mode)). |
| A pad doesn't start the app | Read the display: an empty slot, or the app armed for Live's Play. |
| Timing drifts | Test on a production build rather than a development server; dev tools slow the page down. |

---

## 13. Limits and notes

- The sync grid counts bars in **4/4**.
- The **first note after Play** may be a few tens of ms late: use a 1-bar Count-In when recording.
- In LIVE, **splits, repeat, latch, lane mutes, Undo and Mutate** are simulation-only. GEN and Fill aren't connected on the Arp row.
- **Trigger sync** applies to the Rig Controller's pads. The apps' own buttons (e.g. the Drum Machine's PLAY with *Start@bar*), Live's Start and the Control Map keep their own behaviour.
- With SY.CORE on its own clock (not following Live), pads act at once.
