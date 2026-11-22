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
6. [The Rig Controller](#6-the-rig-controller) (and the [Performance workspace](#the-performance-workspace))
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
| **Files** | **SY.CORE Live Devices** (1.8.0): a zip from the [GitHub release](https://github.com/swina/sycore-ableton/releases/tag/link-v1.8.0), or the *Ableton Live* page of the SY.CORE website. The four devices, their scripts and `node_modules`, in one folder. |

---

## 3. Install the SY.CORE Link devices

1. **Put the devices where Live sees them.** Unzip `SYCORE-Live-Devices-<version>` and keep its files together (the devices load the scripts and `node_modules` next to them, by name). Put the folder in your User Library (e.g. `Presets\MIDI Effects\Max MIDI Effect\`) or add it under Places.

   **Updating**: quit Live, replace the folder's files with the new version's (with Live open, `node_modules` may be locked), open Live again and reload SY.CORE. Play / Stop of Live from SY.CORE needs bridge **1.5** or later, its tempo **1.6**, the Launchpad layout in SY.CORE Rig **1.7**.
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

**Live's transport and tempo from SY.CORE** (bridge 1.5 / 1.6): the Rig Controller's **Play** (Rig Controls in the Performance workspace, the Rig's mode bar) starts and stops **Live** itself. The **Stop** comes at the **end of the next bar** (pressed at 3.2.4: bar 4 plays to its end, everything stops on 5.1.1 — no note from that bar line on; with the Drum Machine's *+Fill*, bar 4 is a fill), then stops Live; pressed again while waiting: at once. The same on SY.CORE's own clock; **TAP**, **− / +** and the tempo knob set **Live's tempo** (SY.CORE follows it, Live playing or stopped). See [Transport and tempo](#transport-and-tempo).

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
- **To play live, use Session View.** Live's Play in Arrangement View also plays the clips already in the arrangement, on top of what SY.CORE sends. In Session View, with no clip launched on those tracks, you hear SY.CORE only. Keep Arrangement View for recording.
- **To record**, arm the playing tracks and record in **Arrangement View**. Use a **1-bar Count-In**: the first note after Play can arrive a few tens of ms late, and the count-in covers it.
- What you record is an ordinary MIDI clip, which you can edit, quantize, consolidate or reuse.
- An arp track records the chords it receives, and its arpeggiator plays them back. That's normal: the arpeggio is made when the clip plays.

> **Measured timing** (Live 12, 120 BPM, a 34-bar take): mean offset from the grid **+0.7 ms**, typical deviation about ±5 ms (Live's own recording resolution), note lengths steady.

---

## 6. The Rig Controller

The **Rig Controller** is a performance surface for the whole rig, not for one instrument. Open it from the toolbar (grid icon, after DECK).

### The grid in Live: SY.CORE Rig

Drop **`sycore-rig.amxd`** on any track (more than one if you like). **With bridge 1.7 or later it mirrors the Rig Controller's Launchpad layout**: the same 8 top buttons, 8×8 pads and 8 side buttons, with the same labels and LED colours as the panel and the Launchpad (slots, Fill / AUTO / NOW / Repeat / Seq Free / chains, Sections or Captures, Latch 1–8, GEN, Key, Capt, S·SEC / S·CAP, Beat, EXT/INT, Shift, Panic…). A click is a press on the Launchpad (held while the mouse button is down: Repeat, a held slot); the floating window (**OPEN**) shows it larger, under NOW / NEXT and the chord's progress bar. With an older bridge it shows its own grid, as described next: the Rig Controller's slot grid inside Live — rows Chord, Drum, Seq, Bass, Arp × slots A–H, **M** / **S** / **GEN** per row (G in the device), **Sections 1–8** and **FILL** (the Drum Machine's Fill: blinks while it plays), in the Rig's colours (filled amber, playing green, queued or armed blinking, muted red). A click does what the panel's pad does (Trigger sync, arming with Live stopped, sections). The header shows the **chord sounding** with its duration and the **next one** (`NOW Cmaj7 1/1  NEXT Am7 1/2`; past the end of the slot, a queued Chord slot's first chord), with a **progress bar** under it: green as the chord goes on, **orange from 80 %** (the change is near), a tick per bar for chords longer than one bar). **OPEN** shows the floating **SY.CORE RIG** window: the title, NOW / NEXT over the pads with the progress bar under them, row labels on the left, pads A–H (filled: dark amber with amber letters), M / S / GEN set apart on the right, Sections 1–8 and FILL at the bottom. **Solo** works as in the panel: only the soloed row plays (the others' labels go dim); the panel has its own **S** per row. It goes through the SY.CORE Link device of the set (no extra connection) and works while the **Rig Controller is open in SY.CORE** (minimized is fine); otherwise it says *Open the Rig Controller in SY.CORE*.

**SY.CORE Map — your encoders on any Live instrument.** Drop **`sycore-map.amxd`** on any track (one per set; the track's MIDI passes through). It drives the instrument of the track **selected in Live** (**FOLLOW**; **LOCK** stays on the current one; a track without an instrument keeps the last) **by table**: slot *n* = a parameter of that instrument, so encoder *n* does the same on every Drift, Analog or Simpler. Factory tables are built in for Drift, Analog and Simpler. On an **Instrument Rack** with mapped Macros (Live's presets) the slots are its **configured Macros** first (with their labels), then the first instrument's table for the slots left, leaving out the parameters a Macro holds; with several chains the table acts on the first instrument. A slot moves its parameter like the mouse does: nothing is locked, the knob in Live follows, and the mouse and automation keep working (the moves enter Live's Undo history). Give the encoders to SY.CORE only: in Live's *Settings › Link, Tempo & MIDI*, set the controller's **Control Surface to None** and turn off its **Remote** input, or Live moves parameters of its own alongside SY.CORE Map. In SY.CORE, open **Live Map** (launcher, the DECK's **Map** app, or the button in the Rig Controller): right-click a slot → MIDI Learn an encoder; **Pickup** (on by default) lets an absolute knob take over only once it reaches the parameter's value. The track can be learnt too (**◀ ▶**, **FOLLOW**, a knob on the track menu), and a Rack's **Macro Variations** (1–8, ◀ ▶, **Rand**). Needs the SY.CORE Link device in the set (bridge 1.3.0 or later).

> **Note:** FOLLOW / LOCK switched **on the device in Live** is not reported to SY.CORE: Live Map's FOLLOW button may show the other state until you use it (or the track controls) again. Use the one in SY.CORE when you drive the track from a controller.


### LIVE and SIM

| Mode | What it does |
|---|---|
| **Live** (default) | The **Chord**, **Drum**, **Seq**, **Bass** and **Arp** rows drive the real Chord Prog, Drum Machine, Sequencer, the Drum Machine's bassline and the Arpeggiator, on the real clock. |
| **Sim** | A simulated rig and clock: try every option without sound. |

Rows are ordered **Drum, Chord, Seq, Bass, Arp** (top to bottom: the panel, the Launchpad's rows 1–5, the MIDImix's strips 1–5). The SY.CORE Rig device in Live shows the same layout (bridge 1.7+). Two rows work differently from the others:

- **Bass** is the Drum Machine's **bassline**, played as a **part of its own**: the Drum row launches the drums and the Bass row the bassline, independently — drums + bass, drums only, bass only. A Bass pad turns the bassline on from that sequence (it may be another one than the drums': drums on A, bass on C), the slot playing turns it off and the drums go on; the same for the Drum row. Both off, the Drum Machine stops; a pad on a stopped Drum Machine starts it with that part only. Trigger sync, arming with Live stopped and sections work per row; with Live stopped an armed Drum or Bass slot is **loaded at once** (the Drum Machine shows that sequence; the bassline is pinned to its own armed slot, so the drums' switch doesn't move it). The bassline plays on the Drum Machine's **bassline source pads** (the last three: Rim Shot, Cowbell, Tambourine by default): while no bassline is in use those pads play their **drum** steps like the others; with the Bass part on (or a Bass slot armed) they are its voices, shown as **BASS 1–3** in amber in the Drum Machine's play view (its EDIT colour). Its **Mute / Solo / Intensity** act on the bassline only, and the Drum row's (on the whole app) on the drums only. Intensity as **CC 7** needs the bassline on its own MIDI channel (Drum Machine › bassline › MIDI CH, with MIDI OUT ONLY); otherwise it scales velocity. **GEN** makes a new bassline in the sequence the bass plays, on the Chord Prog's key when it is exact, and switches the bassline on.
- **Arp** has no slots: pads **A–H pick an arp mode** (up, down, up-down, down-up, converge, diverge, pinky-up, random) and switch the Arpeggiator on; the mode playing, pressed again, switches it off. Its **Density** sets the Arpeggiator's **octave range** (−3…+3) and its **Intensity** the **rate** (the Arpeggiator's own rates, 1/1d … 1/64t, as its Rate slider); both follow the Arpeggiator's panel and can be MIDI-learned (*Arp Octave*, *Arp Rate*). Mute / Solo act on the Arpeggiator's output (no volume Intensity, and Global doesn't touch it). The Arpeggiator runs on its own rate: Trigger sync and Live's Stop don't apply to it.

In LIVE, **Repeat** (hold) is the Drum Machine's Repeat; **Seq Free** (where Latch was) decouples the Sequencer from the Chord Prog; splits, lane mutes and Undo are simulation-only (the splits and lane mutes are no longer on the Launchpad).

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

### Transport and tempo

The **Transport / Clock** box (Rig layout, Rig Controls):

| Control | With Live (EXT over SY.CORE Link) | SY.CORE's own clock (INT) |
|---|---|---|
| **Play / Stop** | starts / stops **Live** (bridge 1.5+); the button shows Live's transport | starts the armed slots / stops all |
| **Live Play** | **starts slots** (default): Live's Play starts the armed slots · **off (listen back)**: Live's Play starts nothing — to play back a take recorded in Live; the clock stays locked, a pad still starts its slot, the armed slots stay armed. Remembered | — |
| **TAP** | sets **Live's tempo**, in whole BPM (bridge 1.6+) | sets SY.CORE's tempo |
| **−** / **+** | Live's tempo ± 1 BPM (**Shift**: ± 0.1) | SY.CORE's tempo (whole BPM) |
| **Round** | Live's tempo to the nearest whole BPM | — |
| the **BPM number** | a knob: drag it up / down (mouse or touch), 0.1 BPM per 2 px | the same |

With a MIDI clock master (EXT over a MIDI port) the tempo is the master's: the display says so. All of them can be MIDI-learned (right-click): *Rig Tap tempo*, *Rig Tempo −*, *Rig Tempo +*, *Rig Tempo round*, *Rig Tempo (knob)* — the knob is **relative** (0.5 BPM per step it moves), so a knob picked up anywhere never jumps the tempo.

### The Performance workspace

The footer's workspace switch (**Classic | Performance**) lays out a stage screen: the panels side by side, no overlap, the others closed, lighter visual effects; what plays keeps playing.

- **Left**: Drum Machine, Chord Prog and Sequencer as **play views** (what plays, the settings folded away; **EDIT** in the header opens the full panel **full screen**, **Play view** puts it back where and as big as it was). The slots A–H show the **current** one outlined while stopped (after a restart too; none when it's empty). With **Chain** on, the slots narrow and the chain follows them on the same row. **Seq Chain** (Rig) turns on the chain of every Sequencer lane that has one (the lane cards show **CHN**). **Now / Next** — the chord sounding and the next one with their lengths (`1/1` = a bar) and a bar filling over the chord — is in the middle column (Rig Controls), right above **Play**.
- **Middle**: **Rig Controls** — the Rig Controller's Transport / Clock, Performance (Fill with its *Now / Bar* switch, Repeat, Seq Free, key, knobs, Generate mode), Safety, and a big **Play** (the Controller template is in the Rig's EDIT layout).
- **Right**: the Rig Controller (its Launchpad layout, labels on) and, with Live set up in MIDI Flow ("Live (M4L)"), **Map · Live Instruments** under it.
- The headers: name, **EDIT**, window buttons; the Drum Machine's and the Sequencer's carry their **style** menu (what GEN writes). The Chord Prog's pads show each chord with its length.
- Every panel resizes from any edge or corner, by mouse or touch, and can be made smaller than in Classic; a panel moved or resized stays there in Performance (**↺** puts them back on their tiles).
- **Map · Live Instruments**: **TILES** (drag a slot up / down), **SLIDERS** (two rows of eight vertical faders: a finger on a fader sets the value there — for touch screens) or **KNOBS** (Live-style encoders, dragged up / down), switched in the panel's header with the track, FOLLOW and Pickup; a value moved on the screen goes straight to Live (no pickup).

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
| **2 bars** | the next 2-bar line of the song grid |
| **4 bars** | the next 4-bar line (a phrase) |

Sync points are on **Live's song grid**: a drum pattern launched on beat 2 with *1 beat* keeps beat 2 as its own start, exactly as a clip launched with 1-beat quantization. On **SY.CORE's own clock** (no Live) they are on SY.CORE's bar grid while its transport runs: a Drum pad on *Bar* waits for the next bar line there too. On the Launchpad, the top **Sync** button cycles the focused track's Trigger sync.

### Fades

In Track options, **Fades** gives the master and each lane an **In** (from the Play) and an **Out** (ending on the Rig's Stop, at the end of the next bar), of ½, 1, 2 or 4 bars (Off = none). A lane fades through its Intensity: CC 7 to its devices, or the velocity of its new notes, as its Intensity mode. The master fades the Global intensity and the audio mixer's master. After the Stop everything is back to full.

### With Live stopped: arming

While SY.CORE follows Live and Live is **stopped**:

- a pad **arms** its slot: it is selected (loaded) at once and blinks — the Drum Machine's sequence and the bassline's too;
- press **Play in Live**, and every armed app **starts from its slot on the first downbeat**, together;
- an app with **no armed slot stays stopped**, even when it is in *Sync Apps to Transport*: with the Rig Controller in LIVE, Play starts Chord Prog, Drum Machine and Sequencer only from the Rig (Live's scenes: nothing plays that you didn't launch);
- the armed pad again **disarms** it; another pad of the same row moves the arm.

You can walk on stage with a progression and a drum pattern armed, and start the whole rig with Live's Play.

### Live's Stop

**Live's Stop stops the Drum Machine, the Chord Prog and the Sequencer at once**: Live's grid is gone, so there's no bar left to finish on. To end on a bar line, stop the apps from their pads (Trigger sync *Bar*) before stopping Live. Armed slots stay armed.

### Sections

**Sections 1–8** (the panel's *Sections* box, the Launchpad's **row 7**) work like a scene in Session View: every connected app that has that slot filled goes to it, as if you pressed its pad — on its track's **Trigger sync** (the Sequencer at the end of its pattern), and a stopped app starts. With Live stopped, the section **arms** those slots: they start on Live's Play. An app already on that slot is left alone (a section never stops anything). Bass follows the Drum Machine; Arp is left out. The section button is lit while its apps play it and blinks while one is still waiting.

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

**Fill** (rig layout row button, Rig Controls, Launchpad row 6) plays a Drum Machine fill. **Auto** (Rig Controls, next to Fill; Launchpad row 6, the pad after Fill) turns the Drum Machine's **Autofill** on / off — a fill every N bars, N set in the Drum Machine. Its switch (next to Fill, in the Drum Machine and in Rig Controls; on the Launchpad the pad after Auto Fill) says when:

| Fill | Plays |
|---|---|
| **Now** | at once, to the end of this bar (pressed late in a bar: only a few steps) |
| **Bar** | armed, then the **whole next bar**; pressed again while armed, cancelled |

The Fill pad / button: **dark amber** off, **light amber blinking** waiting for its bar, **red** while the fill plays.

- With no fill yet, the first Fill generates one. The **same fill** then plays on each Fill until you press **Gen** in the Drum Machine.
- **New** (next to Gen in the Drum Machine) generates a **new fill every time**.

### Repeat

**Seq Free** (Rig Controls, Launchpad row 6, pad 5; MIDI Learn `rig_seq_free`) decouples the Sequencer from the Chord Prog for now: its chords no longer transpose, start, stop or switch the bank of the Sequencer, which plays on as it is (started by a chord, it's now yours to stop). Off: the Sequencer moves at once to the chord the Chord Prog is holding. Panic turns it off; it isn't saved. Amber: off · green: on.

**Drum Chain · Chord Chain · Seq Chain** (Rig Controls, Launchpad row 6, pads 6–8; MIDI Learn `rig_chain_drum` / `rig_chain_chord` / `rig_chain_seq`) turn each app's **Chain** mode on / off, also while playing — the chain itself is set in the app's panel. The switch is taken at the end of what is playing: the Drum Machine on the next bar, the Chord Prog at the end of its slot, the Sequencer at the end of its pattern. On: the chain from its first slot; off: the slot / bank that was playing goes on looping. Dark red: off · red blinking: on.

**Repeat (hold)** (Rig Controls, Launchpad row 6) turns on the Drum Machine's **Repeat** while held: every drum step plays as a roll of 2, 3 or 4 hits (the Drum Machine's **÷2 / ÷3 / ÷4**); released, it goes back as it was.

---

## 9. Generating live: GEN and the key

**GEN** on a row generates new material into the app's **active slot**, while it plays.

| Row | GEN does |
|---|---|
| **Drum** | a new pattern in the current style |
| **Chord** | a new progression, played from the next chord: **built-in**, or **AI** with the rig's *Generate* mode on AI (falls back to built-in if the AI isn't configured) |
| **Seq** | a new sequence, in the Chord Prog's key when it's exact (see below) |

> GEN overwrites the active slot. Keep a progression you like in another slot, or save it, before generating over it.

**Shift + GEN** in the panel (Mutate) works in LIVE for the **Sequencer**: a part of its pattern is generated again (its **Vary** amount, or a quarter at Vary 100), the rest kept; for the other rows it is simulation-only for now.

### The key

The Chord Prog's key is a pair of relative keys from its library (e.g. *Eb Major / C min*) plus a **mode**:

| Key mode | Generates |
|---|---|
| **Minor** | the library's minor progressions, on the minor tonic (e.g. **Cm**) |
| **Major** | the library's major progressions, on the major tonic (e.g. **Eb**) |
| **Both** | any progression of the pair |

From the Rig Controller (LIVE):

- **Key ◀ ▶** (Rig Controls) moves the tonic a semitone, in the same mode: Cm → C#m.
- **Maj/Min** (Rig Controls) switches major ↔ minor on the same tonic: C ↔ Cm.
- The display shows the key: `Key Cm`.

The **Sequencer**'s GEN follows the Chord Prog's key when it's exact. If you picked a scale of the same family it's kept (e.g. *Pentatonic Min* in a minor key), otherwise it switches to Major or Minor. That way the line sits on the chords.

---

## 10. The Launchpad in Rig mode

Turn on **Launchpad Rig** in the Rig Controller's mode bar. The Launchpad then belongs to the rig: its usual mappings are paused, and they come back when Rig mode is off.

| Area | Function |
|---|---|
| **Rows 1–5** | Drum, Chord, Seq, Bass, Arp × slots A–H (Arp: modes) |
| **Row 6** | **Fill** (dark amber / light amber waiting / red playing) · **Auto Fill** (the Drum Machine's Autofill: on green, off amber) · **Now / Bar** (the Fill's when: NOW amber, BAR green) · **Repeat** (hold) · **Seq Free** (the Sequencer decoupled from the Chord Prog: on green, off amber) · **Drum Chain** · **Chord Chain** · **Seq Chain** (dark red off, red blinking on) |
| **Row 7** | **Sections 1–8** — or **Captures 1–8** (side **S·SEC / S·CAP**, below) |
| **Row 8** | **Latch 1–8**: the Chord Prog stays on chord 1–8 of the slot playing, without advancing (amber: a chord there · blinking: waits for the chord sounding to end · green: holding); press it again and the progression goes on from the chord after it. Another Latch pad moves the hold to that chord; Panic releases it. (To silence an app: its slot pads, the MIDImix's Mute, the panel's **M**.) |
| **Side** | **GEN** Drum, Chord, Seq, Bass, Arp (**Shift: Mute** that lane, red while muted; Mutate: the panel's Shift + GEN) · **DJ** Filter (hold: the cutoff CC — default 21, set in the Launchpad panel's **DJ Filter CC** — closes on every real app, release: opens) · **Capt** · **S·SEC / S·CAP** (row 7: Sections / Captures) |
| **Top** | Beat/Tap · EXT/INT (hold) · **Shift** · Gen AI · **Sync** · Rig · — · Panic (hold) |

### Captures (row 7 in Captures mode)

Record a phrase live and loop it as a MIDI clip, like a clip launcher row:

1. **S·SEC / S·CAP** (side, last button) switches row 7 to **Captures** (side button red; amber = Sections). The choice is remembered.
2. Optional: press an **empty** pad to pick it for the next capture (dark red); a second press un-picks it. With none picked the capture goes to the first empty pad.
3. **Capt** (side) starts recording (blinking red): play on any MIDI input (keyboard, pads — not the Rig's own controllers). **Capt** again stops it: the phrase goes to the pad, which turns **amber** (waiting). **While recording**, a press on any pad picks where the capture goes — a **full** pad blinks red and is **recorded over** (its old clip is kept in Session takes).
4. Press the amber pad: with Live / SY.CORE playing it starts on the **next bar**; with nothing playing it **waits for Play** and starts on its 1, in sync (blinking while it waits). Green while playing, **looped**. Press again: it ends at the end of the bar (waiting: called off).

The recording is placed on the song grid (Live's when following it, SY.CORE's transport otherwise, or from the first note when nothing plays): it starts on the bar line of the first note (a note just ahead of it counts as on it), its length is rounded to the bar nearest the Capt press, and the notes are **quantized to 1/16** automatically. Routing is the MIDI Flow app **Live Perf**: **IN** — cable the devices (or apps, e.g. Chord Sequencer) whose notes Capt records (nothing cabled: every input); **OUT** — cable Live Perf to the device that plays the clips and set the cable's **OUT ch**: a capture has no channel of its own (it goes out on ch 1, remapped by the cable or the device's OUT ch); a pitch arriving on several channels at once (a layered / multi-part keyboard) is kept once. An IN cable's channel filter records only those channels. Note: the MIDI Monitor shows Live Perf's notes on ch 1 and ~200 ms early (when they are scheduled), before the cable's remap. Without an OUT cable the clips reach only the broadcast outputs, which skip the devices you also play from: cable it (the display reminds you when a pad starts). Several captures can play together. Live's or SY.CORE's Stop stops them (they stay on their pads). **Shift + pad** clears a capture. Captures are saved per user.

**Keeping captures.** Every capture recorded, recorded over, cleared or loaded is journaled in **Session takes** (app **Capt**, targets Pad S1–S8): a clip lost can be loaded back onto any pad. **Sets**: the Rig layout's **Captures (Live Perf)** box saves the 8 pads under a name (Save; the same name updates it) and loads a set back onto the pads (Load: the pads stop; their clips before go to Session takes) — kept in the browser's IndexedDB, per user. The box also has the 8 pads (Shift-click: clear) and Capt.

- **Rig keys**: learn a hardware button to switch Rig mode on and off. **All** covers both controllers, **LP** only the Launchpad, **Mix** only the MIDImix.

> **Important:** in Live's *Settings › Link, Tempo & MIDI*, set the Launchpad's **Control Surface to None** and turn off its **Track** and **Remote** inputs. Otherwise Live receives the pads too and launches or records its own clips alongside SY.CORE. The Control Surface is what matters: with it set to *Launchpad*, Live's script reads the pads even with all the port's Track / Sync / Remote off (a pad in column 1, row 4 records a clip on track 1, slot 4). The Launchpad stays in Live's port list — a connected device always does; that's fine. Live saves these settings only when it quits cleanly (*File › Quit*): after a crash it may bring the Launchpad surface back, so check it again.

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
| **Tap**, **−**, **+**, **Round** (Transport) | tap tempo, tempo − / +, round to whole BPM | button |
| the **BPM number** (Transport) | tempo knob (relative: 0.5 BPM per step) | knob |
| **Intensity**, **Density** (Track options) | that app's value | knob / fader |
| **Global** fader | global intensity | knob / fader |

- Buttons work as momentary or toggle (detected automatically); notes work too.
- **LED feedback**: SY.CORE sends the same note or CC back to the controller. On a **Launchpad Mini MK1** the colours match its Rig mode: a slot that holds something amber, playing green, queued or armed blinking green, Mute red. On other controllers a pad is lit (127) while it plays, blinks while queued or armed, and is dark otherwise; Mute and Solo are lit while on. This works on controllers that light a pad when they receive its own note / CC; other colours and LED protocols need a controller template.
- The panel and the controller drive the same values: move either one and the other follows.
- The same actions are listed under **Rig Controller** in the **Controller Designer**, to build an on-screen layout of your controller.
- Parameter names, for reference: `rig_slot_<app>_<a–h>`, `rig_gen_<app>`, `rig_mute_<app>`, `rig_solo_<app>`, `rig_sync_<app>`, `rig_intensity_<app>`, `rig_density_drum`, `rig_density_seq`, `rig_density_arp` (Arp octave; `rig_intensity_arp` is its rate), `rig_global`, `rig_fill`, `rig_seq_free`, `rig_chain_drum` / `rig_chain_chord` / `rig_chain_seq`, `rig_play` (Rig Controls' Play / Stop), `rig_section_<1–8>`, `rig_key_down`, `rig_key_up`, `rig_key_mode`, `rig_tap`, `rig_tempo_down`, `rig_tempo_up`, `rig_tempo_round`, `rig_tempo` (`<app>` = chord, drum, seq, bass, arp).

### Live or Performance: one controller, two roles

A controller can belong to Live (its Control Surface, e.g. a MIDImix on Live's mixer) while you play with Live, and to SY.CORE when Live is closed. This is set in the project's **control sets** (MIDI Flow → **Control**):

- **A control set** gives each controller a **role** and turns its presets on:
  - **Perform**: SY.CORE uses it, with its Controller Designer presets and LEDs (see *LED feedback* in the Controller Designer guide).
  - **Live**: SY.CORE ignores it (no mappings, no MIDI Flow, no LEDs) and its Rig mode is turned off.
  - **Rig**: the whole controller drives the Rig Controller, with its LEDs (Launchpad Mini MK1 and AKAI MIDImix, from their Rig templates). The Rig Controller's **Launchpad Rig / MIDImix Rig** switches set this role in the set in force. It works while the Rig Controller is open.
- A project has as many sets as you want, e.g. *Perform* (MIDImix on the Mixer preset) and *Live* (MIDImix in the Live role). The footer chip shows the set in force (amber when it gives a controller to Live). Click the chip to switch.
- **Key**: in Control, click **Learn**, then press a button on any controller, and choose the two sets it switches between. It works even with every panel closed, and its release never reaches a mapping. It works even when the button is on a Live controller, but a button on another controller is better: Live receives the MIDImix's buttons too.
- **Follow the clock** (off by default): the key's second set while SY.CORE follows an external clock (Live's MIDI clock or Link), the first when that stops.
- If you used the earlier Live / Perf button, each project already has the two sets *Perform* and *Live*, with your Live controllers and your key.

With a controller in the Perform role and Live open, Live still receives it if it is selected as a Control Surface. Close Live, or set that Control Surface to None.

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
| Notes doubled, or parts you didn't launch | Clips already in the Arrangement play along with SY.CORE: play live in **Session View** (Arrangement for recording only), or delete the old takes. |
| Rig's Play / TAP don't move Live | The bridge is older than 1.5 (Play) / 1.6 (tempo): copy the new `sycore-link.js` and `.amxd`, drag the device in again, reload SY.CORE. The display says which version is needed. |
| Timing drifts | Test on a production build rather than a development server; dev tools slow the page down. |

---

## 13. Limits and notes

- The sync grid counts bars in **4/4**.
- The **first note after Play** may be a few tens of ms late: use a 1-bar Count-In when recording.
- In LIVE, **splits, lane mutes and Mutate** (except the Sequencer's) are simulation-only (Undo is no longer on the Launchpad). GEN and Fill aren't connected on the Arp row.
- **Trigger sync** applies to the Rig Controller's pads. The apps' own buttons (e.g. the Drum Machine's PLAY with *Start@bar*), Live's Start and the Control Map keep their own behaviour.
- With SY.CORE on its own clock (not following Live), pads act at once.
