# Workspaces — Classic and Performance

> One screen per way of working: the panels of a scenario side by side, the others closed. What plays keeps playing.

---

## Switching

The **workspace switch** is in the footer: **Classic | Performance**. The workspace of the last session comes back at start.

| Workspace | What it does |
|---|---|
| **Classic** | Manages nothing: the floating panels as you place them. Back to Classic, the panels open and their places are the ones Classic was left with. |
| **Performance** | A stage screen: the players, the Rig's controls and the Rig side by side (tiled, no overlap), every other panel closed, lighter visual effects (no blur, no transitions). |

Switching never stops the music: the Drum Machine, Chord Prog and Sequencer play on whether their panels are open or not.

---

## The Performance layout

| Column | Panels |
|---|---|
| **Left** | **Drum Machine**, **Chord Prog**, **Sequencer** (play views) |
| **Middle** | **Rig Controls** — Transport / Clock (Play / Stop, TAP, − / +, Round, the tempo knob), Performance (Fill with *Now / Bar*, Repeat, Seq Free, key, the focused track's knobs, Generate mode), Safety (Panic, → INT, Undo, Shift), **Now / Next** (the chord sounding over the next one) right above a big **Play** (the Controller template: in the Rig's EDIT) |
| **Right** | the **Rig Controller** (its Launchpad layout, labels on) and — with Ableton Live set up in MIDI Flow ("Live (M4L)") — **Map · Live Instruments** under it |

A panel moved or resized by hand stays there in Performance (remembered per user); **↺** puts them back on their tiles. Every panel resizes from any edge or corner, by mouse or touch, and can be made smaller than in Classic.

### Play views

The players show **what plays**, in one colour scheme with the Rig (dark amber filled · amber blinking queued / armed · full amber playing). **EDIT** in the header opens the full panel; **Play view** in the full panel's header goes back.

| Player | Play view | Header |
|---|---|---|
| **Drum Machine** | sequences A–H, a beat bar, every pad of the sequence; with a bassline in use the last three rows are **BASS 1–3** (purple). The pads edit as in the panel: click a step on / off, right-click for velocity, accent, ratchet, tie; on BASS rows the wheel changes the note and a double-click takes it from MIDI (the bassline shown: the Rig's bass part's own sequence, else the drums'); a row's name previews its pad | EDIT · **style** menu (what GEN writes) |
| **Chord Prog** | slots A–H, the slot's chords, each with its **length** (`1/1`, `1/4`…), the chord sounding lit | EDIT |
| **Sequencer** | banks A–H, **Steps** (2–64), **Time** and **Direction** (right-click each: MIDI Learn `seq_steps`, `seq_time`, `seq_direction` — a knob sweeps the values, a note steps to the next), the pattern on one row (low cells: each step's note, its background the **velocity** — green low < 70, orange medium, red high ≥ 105; **click** a step to turn it on / off, its notes kept), the step sounding lit | EDIT · the bank's **style** menu |
| **Now / Next** (Rig Controls, above Play) | the chord sounding and the next one with their lengths, a bar filling over the chord | — |

With an app's **Chain** on (its panel, or the Rig's Drum / Chord / Seq Chain), its play view shows a **Chain** strip under the slots: the chain's entries in order (the Drum Machine's empty ones as `·`, they play on the one before), the one playing in red.

### Map · Live Instruments

A slim header (as the players). Its 16 slots: **TILES** (drag a slot up / down) or **SLIDERS** (two rows of eight vertical faders filling the panel — a finger on a fader sets the value there), switched in its bar and remembered. A value moved on the screen goes straight to Live (no pickup); an encoder picks the new value up again.

## Session — nothing Generate replaces is lost

Generate writes into the slot in use (Drum sequence, bassline, Chord Prog slot, Sequencer bank), and the slots save themselves: an edit not saved elsewhere was gone after the next Generate. Now every Generate — from the panels, the Rig (pads, GEN rows, Launchpad), MIDI or the AI — keeps in the **session**:

- the slot's content **before** it (the first time a slot is touched: **Start**, as it was when the session began; then **Before**, only when it changed since the last take — an edit made by hand between two Generates);
- what it **made** (**Gen**, or **AI**).

**Session** (Rig Controls, next to *Generate*, or the footer's ⟲ button) lists them, newest first, filtered by app (Drum · Bass · Chord · Seq), with the time and a summary (the style and hits, the chords, the key and style). **Load** puts a take back into its slot — or, choosing another one in its menu, into a free slot / bank to keep it; what was in the slot is kept as a take first, so a Load can be undone too. While playing, a take loaded into the slot playing is heard at once. ✕ deletes a take; **Clear** (twice) empties the session and starts a new one.

The session stays across reloads and restarts until cleared (in the browser, per user), up to the last 60 takes per app — the **Start** takes always stay.

---

See [SY.CORE with Ableton Live](./SYCORE_ABLETON_LIVE_GUIDE.md) for the Rig Controller, its Launchpad layout, Fill, Repeat and Live's transport and tempo.
