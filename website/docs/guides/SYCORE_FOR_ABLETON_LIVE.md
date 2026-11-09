# SY.CORE for Ableton Live
## Chords, patterns and grooves generated while you play. In time with Live, inside your set.

> *You don't generate first and play later. You generate, launch and reshape the music while you're playing it.*

*Versione italiana: [SY.CORE per Ableton Live](./SYCORE_FOR_ABLETON_LIVE_IT.md)*

---

## The problem

There are plenty of tools that generate MIDI now, and nearly all of them work the same way: **generate first, play later**.

You type a prompt or press a button, you get a clip, you **drag** it onto a Live track, drop it into Session View, and only then can you launch it. Many MIDI generators, AI-based ones included, work this way: upstream of the performance. The "live" alternatives usually need a Max for Live device that does all the work inside Live, with the interface and processing limits that come with it.

The result is always the same: the creative part stays in the studio, and on stage you bring finished clips. If halfway through a set you want another progression, a different drum pattern or a break you hadn't prepared, you have to stop and go back to the editor.

**SY.CORE is built for playing, not for preparing.**

---

## What SY.CORE is, with Live

SY.CORE is a performance environment that runs in the browser and **plays inside your Live set**:

- a **Drum Machine** with generative patterns, bass lines and fills;
- a **Chord Prog** with chord progressions, strums and arpeggios;
- a step **Sequencer** for melodic lines and basses;
- a **Rig Controller** that drives them from the Launchpad as if they were clips.

Everything reaches Live on ordinary MIDI tracks through a small Max for Live device, **SY.CORE Link**: no virtual MIDI ports, no routing to set up. The notes are played by your own instruments: your Drum Racks, your synths, your arpeggiators.

> **Not a VST or AU plugin.** Nothing to install, scan or authorize: SY.CORE opens in the browser, and in Live you only drop in one Max for Live device. No installer, no license manager, always the latest version.

---

## Generating *during* the performance

This is where SY.CORE stands apart.

| With a clip generator | With SY.CORE |
|---|---|
| Generate a clip, drag it into Live, launch it | Generate and play at once, without leaving the stage |
| A variation means going back to the editor | **Generate** makes a new drum pattern or chord progression on the fly, from the Launchpad |
| A fill has to be written in advance | **Fill** plays a fill on the next bar: the same one until you generate a new one, or a new one every time |
| A break needs other clips | **Density** thins drums and sequencer out in real time with one knob: build-ups, breaks and drops with nothing else prepared |
| The chords are the clip's chords | The **Chord Prog** generates progressions (algorithmic or with AI) and you play them one chord at a time from the pads |

And everything you generate can be **recorded in Live as ordinary MIDI clips**: it stays in the set, you edit it, you reuse it. SY.CORE doesn't lock you into the browser.

---

## It speaks Live's language

There's no new way of working to learn. The Rig Controller behaves like Session View:

| In Live you're used to… | In SY.CORE |
|---|---|
| Launching a clip from Session View | Launch slots A–H of Drum, Chord and Seq from the Launchpad pads |
| Global Launch Quantization | **Trigger sync** per track: now, 1 beat, 2 beats, bar |
| Pressing a playing clip to stop it | The pad of the playing slot stops the app, in time |
| Launching a clip with the transport stopped | The pad **arms** the slot: it starts with Live's Play |
| The transport's Stop | Live's Stop stops every SY.CORE app |
| A Macro on a Rack | **Density**, **Intensity** (volume and velocity), Mute and Solo per track, also from a controller through MIDI Learn |

You walk on stage with a progression armed and the drums ready, press Play in Live, and they start together on the first downbeat.

---

## Really in time

A generator that plays out of time is useless on stage. SY.CORE Link's timing was measured on real recordings in Live 12, at 120 BPM:

- **average offset from the grid: under 1 ms**;
- typical deviations of **±5 ms**, which is the resolution Live records notes at;
- note lengths steady, as written in the pattern.

SY.CORE follows Live's tempo and position, so it stays locked even when you change tempo or move the playhead.

---

## Setup, in three steps

1. **Drag `sycore-link.amxd`** onto a MIDI track of the set. It's the bridge between SY.CORE and Live.
2. **Put `sycore-link-receive.amxd`** on one track per part and pick its channel on the grid: Drums on 10, Chords on 1, and so on. The tracks that play take their MIDI from these.
3. **In SY.CORE, pick "Live (M4L)"** as the apps' output. Done.

The devices share SY.CORE's look and show what's going on at a glance: the status LED turns green when SY.CORE is connected, and the MIDI LED flashes on the track that's receiving.

---

## Made for playing live

- **You play, you don't press Play and wait.** Pick the progression, launch the chords one at a time, open and close the drums, end the phrase with a fill.
- **Use the controllers you have.** The Launchpad becomes the Rig's panel, the encoders of any controller drive Density and Intensity, and the rest of your setup stays mapped to Live as before.
- **Nothing to install.** SY.CORE opens from an address in the browser: no drivers, no plugins to update.

---

## A 60-second demo

1. Live is stopped. From the Launchpad, arm progression B and drum pattern A.
2. Press Play in Live: chords and drums start together on the first downbeat.
3. Change chords on the bar, then launch a **Fill**.
4. Pull **Density** down for the break, open it again for the drop.
5. Generate a new progression from the Launchpad and play it straight away.
6. Press Stop in Live: everything stops.
7. In Arrangement View you find it all recorded, as ordinary MIDI clips.

---

## Requirements and notes

- Ableton Live with Max for Live (Suite, or Standard with Max for Live).
- A browser with Web MIDI (Chrome or Edge).
- The **Launchpad** used by the Rig must not be set as a Live Control Surface, or Live will launch its own clips alongside SY.CORE.
- The sync grid counts bars in 4/4.
- The first note after Play may arrive a few tens of ms late: a **1-bar Count-In** in Live avoids it.

---

**SY.CORE: the generative part doesn't stay in the studio. It goes on stage with you.**
