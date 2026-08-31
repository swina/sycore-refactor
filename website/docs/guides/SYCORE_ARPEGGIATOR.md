# Arpeggiator

The **Arpeggiator** is a MIDI FLOW app source that generates note patterns from held chords, synced to a configurable BPM and subdivision. It sits as a cable-able node on the MIDI Flow canvas with its own **IN** port — route a controller or app into it via a cable, just like the Chord Progression Sequencer and Drum Machine. Play a chord and it automatically cycles through the notes in one of 10 pattern modes.

<img src="../../help/guides/sycore-arpeggiator-app.png"/>

---

## Controls

### Master Switch

Toggles the arpeggiator on/off. When switched **Off**, any currently playing note is released immediately. Right-click to MIDI Learn.

### Mode

Selects the note-cycling pattern from 10 modes:

| Mode | Behavior |
|------|----------|
| `up` | Notes played from lowest to highest, looping |
| `down` | Notes played from highest to lowest, looping |
| `up-down` | Ascends then descends (bounces at both ends) |
| `down-up` | Descends then ascends (bounces at both ends) |
| `converge` | Alternates outer→inner: lowest, highest, second-lowest, second-highest… |
| `diverge` | Starts at the middle note and spirals outward |
| `pinky-up` | Highest note alternates with each lower note in sequence |
| `thumb-up` | Lowest note alternates with each higher note in sequence |
| `random` | Picks a random note from the held set each step |
| `random-other` | Random but never repeats the same note twice in a row |

Right-click to MIDI Learn.

### Rate

Sets the rhythmic subdivision of the arpeggio. Values range from whole notes (`1/1`) through to sixty-fourth note triplets (`1/64t`), including dotted and triplet variants at each division. Use the slider to scrub through all 21 subdivisions.

Right-click to MIDI Learn.

### Hold

When **On**, held notes persist in the arpeggiator buffer even after you release the physical keys. Play a chord, toggle Hold, and the arpeggio continues indefinitely — freeing your hands for other controls. Toggle Hold **Off** to release all held notes and stop the pattern.

Right-click to MIDI Learn.

### Arp BPM

Independent BPM for the arpeggiator (40–250 BPM). This is separate from the global session BPM, letting you run the arpeggio at a different tempo from your backing track or other time-based effects.

Right-click to MIDI Learn.

### Octave

Spreads the arpeggio across multiple octaves (-3 to +3). Positive values duplicate each held note one or more octaves above the original; negative values go below. At `0`, only the original pitches are used.

Right-click to MIDI Learn.

---

## Setup

### Input Routing

The Arpeggiator requires explicit cabling — no broadcast-mode fail-open. You must route a MIDI input device or another app source to the Arpeggiator node. The routing respects any per-cable note-range filter (keyboard split) drawn on the cable.

### Engine Details

- **Step calculation**: Each step's duration is derived from `60000 / bpm × 4 × ratio`, where `ratio` accounts for the subdivision (including dotted ×1.5 and triplet ×2/3 multipliers).
- **Note-off timing**: Each note plays for 50% of the step duration (gate = 0.5), then a note-off is sent before the next step fires.
- **Octave expansion**: The held notes are duplicated across the selected octave range, deduplicated, and sorted before the pattern engine iterates over them.

---

## Practical Use Cases

- **Rhythmic pads**: Hold a chord with a slow subdivision (`1/2`, `1/1`) for a lush, rolling pad texture.
- **Fast lead lines**: Set Rate to `1/16` or `1/32` with `up` or `random` mode for instant melodic phrases.
- **Generative patterns**: Use `random-other` with Hold On and let the arpeggiator run as a background texture while you play other parts.
- **Bass lines**: Use `down` mode with Octave -1 for a descending bass pattern.
- **Call-and-response**: Use `pinky-up` or `thumb-up` to create alternating high/low note patterns that sound like two instruments trading phrases.

---

## Tips

- **Cabling is required**: If notes seem to pass through but never arpeggiate, check that the input device is explicitly routed to the Arpeggiator.
- **Hold + hands-free**: Toggle Hold on, play a chord, release your hands, and the arpeggio keeps running — perfect for layering while you tweak synth parameters.
- **Octave offset for variety**: A setting of +1 or +2 dramatically expands the pitch range of small chords, turning a simple triad into a multi-octave cascade.
- **BPM independence**: Set Arp BPM to double the session BPM for a halftime feel, or to a coprime value for polyrhythmic effects.