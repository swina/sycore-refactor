# SY.CORE — Generative Engines

> **Role:** an overview of everything in SY.CORE that writes music for you: drums, basslines, sequences, chord progressions, whole songs, and how they work together live.
> **Audience:** musicians, live performers, producers who want ideas fast and keep control.

---

## The idea

SY.CORE's generators aren't random-note machines. Each one knows a musical **style**, stays in a **key**, and writes patterns you'd actually play. They also share that knowledge, so a progression, a bassline and a drum groove generated a minute apart still fit together.

Three things make them usable on stage:

1. **One vocabulary of styles.** The Drum Machine, the Sequencer and the Chord Prog offer the same 20 styles. Pick *Techno* and every engine knows what Techno means for it.
2. **One key.** The Chord Prog is the harmonic conductor. The Sequencer's lanes and the bassline generate in its key, or in its *mode* when the progression is modal (A Dorian, C Mixolydian…).
3. **Generate while playing.** From the panel, the Play View or the Rig Controller (a Launchpad), GEN writes into the slot that's queued or playing. Every generation is journaled, so you can always go back.

---

## The shared styles

| Style | Drum Machine | Sequencer | Chord Prog |
|---|---|---|---|
| House | four-on-the-floor, offbeat hats | 1–2 octaves, mid density | 7ths, 1–2 bar chords or pushed 3/4 + 1/4 |
| Techno | driving kick, tight hats | low, accented on the beats | stabs (no bass), 1–4 bars |
| HipHop | swung kick / snare, ghosts | sparse, wide range | 7ths, 1–2 bars |
| Trap | half-time, hi-hat rolls (ratchets) | sparse, accents on 1 and the "and" of 3 | open voicings, long chords |
| Acid | 909 under a 303: open hats on the offbeats | busy, slides | stabs |
| Funk | syncopated kick, ghost snares | accent grid on the 16ths | 7ths, half-bar and pushed chords |
| Jazz | brushes-like ghosts, wide dynamics | wide range, legato | 7ths, ii–V style rhythm |
| Ambient | barely-there pulses | slow, high, long notes | open / spread, 2–8 bar chords |
| Drum&Bass | breakbeat at double time | 32 steps | 7ths, 1–4 bars |
| Minimal | sparse, clicky | few notes | stabs, 2–4 bars |
| Latin | clave-based percussion | tresillo accents | triads, half-bar pushes |
| Industrial | ratcheted kicks, toms, crashes | low and hard | power chords |
| Reggae | one drop (kick + snare on 3), steppers | offbeat accents | triads, short "skank" gate |
| Pop | backbeat | mid range, accents on the beats | triads, 1–2 bars |
| Rock | backbeat, crashes | accented, wide | power chords |
| Electronic | synth-pop / electro | offbeat accents | triads |
| EDM | big four-on-the-floor | accents on the offbeats | triads, loud |
| Urban | R&B groove | relaxed, legato | 7ths |
| Arpeggio | trance drive, rolling 16ths | the Sequencer's arpeggiator | open voicings, played as arpeggios |
| Berlin School | motorik (steady kick and snare, even 8ths) | the Berlin-School sequence (a root pedal under a repeated cell) | open voicings, played as arpeggios |

The Sequencer also has four **bassline styles** of its own: Root-5-Oct, Offbeat, Acid Slide and Walking.

---

## Drum Machine

- **Generate** writes a new pattern into the active sequence (A–H) in the chosen style. Each style has three hand-written variants. One is picked, then reshaped with style-aware variation: ghost notes, accents moved, ratchets, velocity jitter. Two presses never give the same bar.
- **→ Fill** sends Generate to the fill pattern instead. **Auto Fill** plays a fill every 4, 8, 12 or 16 bars.
- **Euclidean** spreads N hits over M steps on the tracks you pick, each track with its own density and rotation.
- **Bassline**: three voices, generated from a root note (root / fifth / octave, offbeat syncopation, ghost notes). From the Rig, the bassline follows the Chord Prog's tonic.
- **Perform**: Dyn (dynamics), Density, Humanize and four CC knobs shape what plays without rewriting it.

## Sequencer and its lanes (Main · Bass · Arp)

- Three lanes, each with eight banks (A–H), its own MIDI channel and its own style.
- **Generate** follows Style, Key / Scale, octave and range, Density, **Rhythm** (Weighted with Sync, Euclidean with rotation, Random) and **Melody** (Line: a motif repeated and varied, A A′ A A″; or Classic).
- **Chords** mode writes chords from progressions typical of the style. **Arpeggio** and **Berlin School** have their own generators.
- **Vary / Mutate** works like a Turing Machine's lock: only a share of the pattern changes, and the motif keeps its shape.
- **P1 / P2** are two CC lanes per step (filter, resonance…), generated around the preset's value. They can also drive Ableton Live parameters through the Map.
- **Key: CP**: the lanes generate in the key of the Chord Prog's chords. With a modal progression they detect the mode (Major, Minor, Dorian, Phrygian, Lydian, Mixolydian, Harmonic Minor, Locrian) and use exactly that scale.
- While playing, the lanes **follow the Chord Prog** by scale degree, so a pattern moves onto every chord. With **Fit: CHD** (per lane; Bass and Arp by default) the notes are also fitted onto the chord sounding, so borrowed chords outside the scale don't clash.

## Chord Prog

- **Source**: **Modal Chords** by default: 816 progressions, 68 for each of the 12 roots, named by mood ("A Mysterious Dark", "C Peaceful Tender"). You can also use the 12 key files (major / minor pairs) or the genre files (Blues, Jazz, Pop, Rock, R&B, Latin, EDM, Funk).
- **Root** (Modal Chords): stay on one root, or Any. The Rig's Key ◀ ▶ moves it.
- **Style** sets the **harmonic rhythm**. Each chord's length comes from whole-bar patterns: Ambient 2–8 bars, House 1–2 bars or pushed 3/4 + 1/4, Funk and Latin half-bar pushes. The style also sets the **gate**, the **velocity**, the **voicing** (triads, 7ths, stabs, power chords, open / spread with a 9th) and the **moods** it picks first. Arpeggio and Berlin School play the chords as arpeggios.
- **Major / Minor** on a key file: generates in exactly that key (major keys from common major progressions).
- **AI Generate**: describe the progression in words. The style and the key go into the prompt.
- Source, Root and Style are also in the Play View's header.

## AI Song Composer

Give it a key, a style and a tempo. The AI writes a **song plan**, which SY.CORE validates and turns into Chord Prog slots plus a chain (the song form), Drum Machine sequences and Sequencer banks. The Chord Prog's chain conducts the song, and the drums and the Sequencer switch section with it. One click undoes the whole plan.

## Sound Engine (Roland S-1)

The adaptive sound generator creates and recalls presets for the Roland S-1 (from the library or from AI) and sends every parameter as MIDI CC in real time.

---

## On stage: the Rig Controller

The Rig Controller turns all of this into an instrument (a Launchpad or the screen):

| Control | What it does |
|---|---|
| **GEN** (side buttons) | generate Drum, Chord, Seq, Bass, Arp into the slot playing or queued: in the Chord Prog's key or mode |
| **Shift + GEN** | Mutate: change part of the pattern (Vary), the rest kept |
| **Gen AI** | GEN asks the AI instead of the built-in generator |
| **Slots A–H** | launch, queue and arm like clips, with Trigger sync (next bar, beat…) |
| **Density** | thin each part out live (the weakest steps first), for crescendos and breaks without new patterns |
| **Fill / Auto Fill / Repeat / Latch** | performance moves on the generated material |
| **DJ Filter** | hold to close the filter cutoff (configurable CC) on every part, release to open it |
| **Capt** | record what you play into a capture pad |

With **SY.CORE Link**, all of it plays inside Ableton Live, on Live's grid.

---

## Why it matters

- **Ideas in seconds, in context.** A new bassline lands in the key and mode of the chords that are already playing, at the next bar.
- **Variation without losing the song.** Vary / Mutate, Density and fills change the music while the motif, the groove and the form stay recognisable.
- **Nothing is lost.** Every Generate, from the panel, the Rig or MIDI, goes into the session journal with a take before and after.
- **Everything is MIDI.** The generated parts play your hardware synths, drum machines and Live's instruments. SY.CORE writes the music, your sounds play it.

---

## See also

| Guide | |
|---|---|
| [Sequencer — Generate](./SYCORE_SEQUENCER_GENERATE.md) | every option of the Sequencer's Generate |
| [Chord Progression Sequencer](./SYCORE_CHORD_PROG_SEQUENCER.md) | the Chord Prog, its library and Generate tab |
| [Drum Machine](./SYCORE_DRUM_MACHINE.md) | styles, fills, Euclidean, bassline |
| [SY.CORE with Ableton Live](./SYCORE_ABLETON_LIVE_GUIDE.md) | Link devices and the Rig Controller |
