import type { DrumStep, ImportedPattern } from "@/types/drum-machine"

export const SOUND_TO_TRACK_INDEX: Record<string, number> = {
  BassDrum: 0,
  SnareDrum: 1,
  ClosedHiHat: 2,
  OpenHiHat: 3,
  Clap: 4,
  HighTom: 5,
  MediumTom: 6,
  LowTom: 6,
  Cymbal: 7,
  RimShot: 8,
  Cowbell: 9,
  Tambourine: 10,
}

export function patternToDrumSteps(pattern: ImportedPattern, defaultVelocity = 100): DrumStep[][] {
  const TRACK_COUNT = 11
  const tracks: DrumStep[][] = Array.from({ length: TRACK_COUNT }, () => [])
  const stepCount = pattern.length

  for (const [soundName, steps] of Object.entries(pattern.tracks)) {
    const trackIdx = SOUND_TO_TRACK_INDEX[soundName]
    if (trackIdx < 0) continue
    for (let i = 0; i < stepCount; i++) {
      const val = steps[i]
      const isNote = val === "Note" || val === "Flam"
      const vel = val === "Flam" ? 85 : defaultVelocity
      tracks[trackIdx][i] = {
        active: isNote,
        velocity: isNote ? vel : 0,
        accent: false,
        ratchet: 1,
      }
    }
  }

  for (let t = 0; t < TRACK_COUNT; t++) {
    for (let i = 0; i < stepCount; i++) {
      if (!tracks[t][i]) {
        tracks[t][i] = { active: false, velocity: 0, accent: false, ratchet: 1 }
      }
    }
  }

  if (pattern.accent) {
    for (let i = 0; i < Math.min(stepCount, pattern.accent.length); i++) {
      if (pattern.accent[i] === "Accent") {
  for (let t = 0; t < TRACK_COUNT; t++) {
          if (tracks[t][i]?.active) {
            tracks[t][i].accent = true
            tracks[t][i].velocity = Math.min(127, tracks[t][i].velocity + 20)
          }
        }
      }
    }
  }

  return tracks
}

export const IMPORTED_PATTERNS: Record<string, ImportedPattern[]> = {
  "Afro-Cuban": [
    {
      title: "Afro-Cuban1Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Note","Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Note"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Note","Note","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Accent"],
    },
    {
      title: "Afro-Cuban1MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        RimShot: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"]
      },
    },
    {
      title: "Afro-Cuban1MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        RimShot: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "AfroCub1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        RimShot: ["Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "AfroCubBreak1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        Cowbell: ["Note","Rest","Note","Note","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Afro-Cuban2Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Accent","Rest","Rest"],
    },
    {
      title: "Afro-Cuban2MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest"],
        RimShot: ["Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Afro-Cuban2MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        RimShot: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "AfroCub2",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        RimShot: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "AfroCubBreak2",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Note","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Note","Rest","Rest","Note"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        Cymbal: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Afro-Cuban3Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Note","Note"]
      },
      accent: ["Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Afro-Cuban3MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        RimShot: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Afro-Cuban3MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "AfroCub3",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        Cymbal: ["Note","Rest","Note","Note","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        RimShot: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "AfroCubBreak3",
      signature: "4/4",
      length: 16,
      tracks: {
        SnareDrum: ["Note","Note","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Note"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Accent","Rest","Rest","Accent","Accent","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Afro-Cuban4Break",
      signature: "4/4",
      length: 16,
      tracks: {
        SnareDrum: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Afro-Cuban4MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        RimShot: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "Afro-Cuban4MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        RimShot: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "AfroCub4",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        Cymbal: ["Note","Rest","Note","Note","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        RimShot: ["Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"]
      },
    },
    {
      title: "AfroCubBreak4",
      signature: "4/4",
      length: 16,
      tracks: {
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Note"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        Cowbell: ["Note","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Afro-Cuban5Break",
      signature: "4/4",
      length: 16,
      tracks: {
        SnareDrum: ["Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Afro-Cuban5MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        RimShot: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Afro-Cuban5MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        RimShot: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "AfroCub5",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Note","Note","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Note"],
        MediumTom: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Accent","Rest","Accent","Accent","Accent","Accent"],
    },
    {
      title: "AfroCubBreak5",
      signature: "4/4",
      length: 16,
      tracks: {
        SnareDrum: ["Flam","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        Cowbell: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Flam","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "AfroCub6",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        Cowbell: ["Note","Rest","Note","Note","Rest","Note","Rest","Note","Note","Rest","Note","Rest","Note","Note","Rest","Note"],
        RimShot: ["Note","Rest","Note","Note","Rest","Note","Rest","Note","Note","Rest","Note","Rest","Note","Note","Rest","Note"]
      },
    },
    {
      title: "AfroCubBreak6",
      signature: "4/4",
      length: 16,
      tracks: {
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Note"],
        MediumTom: ["Note","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "AfroCub7",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        Cymbal: ["Note","Rest","Note","Note","Note","Rest","Note","Rest","Note","Rest","Note","Note","Note","Rest","Note","Rest"],
        RimShot: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "AfroCub8",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Note","Note","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Rest"]
      },
      accent: ["Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest"],
    },
    {
      title: "AfroCub9",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest"],
        ClosedHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note"],
        Cowbell: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent"],
    }
  ],

  "Ballad": [
    {
      title: "Ballad1Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Note"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent"],
    },
    {
      title: "Ballad1MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "Ballad1MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "Ballad2Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Note","Note","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Note"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Ballad2MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Note","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"]
      },
    },
    {
      title: "Ballad2MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Note","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "Ballad3Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Ballad3MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Note"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest"]
      },
    },
    {
      title: "Ballad3MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "Ballad4Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Note","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "Ballad4MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Ballad4MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Ballad5Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Note","Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Ballad5MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Note","Note","Note","Note","Rest","Note","Note","Note","Note","Note","Note","Note","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note"]
      },
    },
    {
      title: "Ballad5MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note"]
      },
    }
  ],

  "Blues": [
    {
      title: "Blues1",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Note","Note","Rest","Note","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note"],
        ClosedHiHat: ["Note","Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Note","Note"]
      },
    },
    {
      title: "Blues1Break",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Note","Note","Note","Note","Note","Note","Note","Note","Note","Rest","Rest","Rest"],
        SnareDrum: ["Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note"],
        ClosedHiHat: ["Note","Note","Note","Note","Note","Note","Note","Note","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "Blues1MeasureA",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Note","Note","Rest","Note","Rest","Note","Note"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note"]
      },
    },
    {
      title: "Blues1MeasureB",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Note","Note","Rest","Note","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note"]
      },
    },
    {
      title: "BluesBreak1",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Note"],
        SnareDrum: ["Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Flam","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest"],
        Cymbal: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Accent","Rest","Accent","Rest","Accent","Rest","Rest"],
    },
    {
      title: "Blues2",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note"]
      },
    },
    {
      title: "Blues2Break",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Rest","Note","Note"],
        ClosedHiHat: ["Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest"]
      },
    },
    {
      title: "Blues2MeasureA",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Rest","Note"]
      },
    },
    {
      title: "Blues2MeasureB",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note"]
      },
    },
    {
      title: "BluesBreak2",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Note","Note","Rest","Note","Rest","Note","Note"],
        SnareDrum: ["Rest","Note","Note","Note","Rest","Rest","Rest","Note","Rest","Flam","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        Cymbal: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "Blues3",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Note","Note","Rest","Note","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Rest","Note"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"]
      },
      accent: ["Rest","Accent","Rest","Rest","Accent","Rest","Rest","Accent","Rest","Rest","Accent","Rest"],
    },
    {
      title: "BluesBreak3",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note"],
        SnareDrum: ["Rest","Note","Note","Note","Note","Note","Note","Note","Note","Flam","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        Cymbal: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Accent","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "Blues4",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Note","Note","Rest","Note","Rest","Note","Note"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Note"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        Cymbal: ["Note","Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Rest","Rest"]
      },
    },
    {
      title: "Blues5",
      signature: "12/8",
      length: 12,
      tracks: {
        ClosedHiHat: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        Cymbal: ["Note","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Note","Rest","Note"]
      },
    },
    {
      title: "Blues6",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        Cymbal: ["Note","Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Note","Note"]
      },
    }
  ],

  "Boogie": [
    {
      title: "Boogie1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Note","Note","Rest","Rest","Note","Rest","Rest","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        Cymbal: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "BoogieBreak1",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Note","Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note"],
        Cymbal: ["Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Boogie2",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        Cymbal: ["Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note"]
      },
    },
    {
      title: "BoogieBreak2",
      signature: "4/4",
      length: 12,
      tracks: {
        SnareDrum: ["Note","Note","Note","Rest","Rest","Rest","Note","Note","Note","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note"],
        MediumTom: ["Rest","Rest","Rest","Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Boogie3",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note"],
        Cymbal: ["Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note"]
      },
    },
    {
      title: "BoogieBreak3",
      signature: "4/4",
      length: 12,
      tracks: {
        SnareDrum: ["Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Rest","Note","Note"],
        LowTom: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"]
      },
    }
  ],

  "Bossa Nova": [
    {
      title: "Bossa1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        Cymbal: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        RimShot: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "BossaBreak1",
      signature: "4/4",
      length: 16,
      tracks: {
        SnareDrum: ["Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest"],
    },
    {
      title: "BossaNova1Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        Cymbal: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        RimShot: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "BossaNova1MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        RimShot: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "BossaNova1MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        RimShot: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Bossa2",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        RimShot: ["Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "BossaBreak2",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"]
      },
      accent: ["Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "BossaNova2Break",
      signature: "4/4",
      length: 16,
      tracks: {
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "BossaNova2MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        Cymbal: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        RimShot: ["Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "BossaNova2MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        Cymbal: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        RimShot: ["Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note"]
      },
    },
    {
      title: "Bossa3",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        Cymbal: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        RimShot: ["Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"]
      },
    },
    {
      title: "BossaBreak3",
      signature: "4/4",
      length: 16,
      tracks: {
        SnareDrum: ["Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Bossa4",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        Cymbal: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        RimShot: ["Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"]
      },
    },
    {
      title: "Bossa5",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        Cymbal: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        RimShot: ["Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Bossa6",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        Cymbal: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        RimShot: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    }
  ],

  "Cha-Cha": [
    {
      title: "Cha-ChaBreak",
      signature: "4/4",
      length: 16,
      tracks: {
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Cha-ChaMeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest"],
        Cowbell: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "Cha-ChaMeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        Cowbell: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "ChaCha1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        Cowbell: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        RimShot: ["Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "ChaChaBreak1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        Cowbell: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"]
      },
    },
    {
      title: "ChaCha2",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest"],
        OpenHiHat: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        Cowbell: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "ChaChaBreak2",
      signature: "4/4",
      length: 16,
      tracks: {
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Note","Note","Rest"],
        Cowbell: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Accent","Rest","Rest","Accent","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "ChaCha3",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest"],
        Cowbell: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "ChaChaBreak3",
      signature: "4/4",
      length: 16,
      tracks: {
        SnareDrum: ["Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Note","Rest","Note"],
        MediumTom: ["Rest","Rest","Flam","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    }
  ],

  "Charleston": [
    {
      title: "Charleston1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        Cymbal: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Note","Note","Rest","Rest","Rest","Note","Rest","Rest","Note"]
      },
    },
    {
      title: "CharlestonBreak1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    }
  ],

  "Disco": [
    {
      title: "Disco1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "Disco1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Rest","Rest","Note","Note","Note","Note","Note","Note","Rest","Rest","Note","Note"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        Clap: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "Disco1Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Note","Note","Note","Note","Note","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Disco1MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note"]
      },
      accent: ["Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Disco1MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Rest","Note","Note","Note","Rest","Note","Note","Rest","Note","Note","Note","Note","Rest","Note"],
        OpenHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest"]
      },
    },
    {
      title: "DiscoBreak1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Note","Rest","Rest","Rest","Note","Rest","Rest","Note","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        Clap: ["Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "Disco2",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Rest","Rest","Note","Note","Note","Note","Note","Note","Rest","Rest","Note","Note"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        Clap: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "Disco2Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Note","Note","Rest"],
        ClosedHiHat: ["Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Disco2MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        Cowbell: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "Disco2MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note"],
        Cowbell: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "DiscoBreak2",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note"]
      },
    },
    {
      title: "Disco3",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Note","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Rest","Rest","Note","Note","Note","Note","Note","Note","Rest","Rest","Note","Note","Note","Note"],
        OpenHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        Clap: ["Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "Disco3Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Note","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        Cowbell: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Note"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Disco3MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note"]
      },
    },
    {
      title: "Disco3MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note"]
      },
    },
    {
      title: "DiscoBreak3",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        Tambourine: ["Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Disco4",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Rest","Note","Rest","Note","Note","Note"],
        Clap: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        Tambourine: ["Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note"]
      },
    },
    {
      title: "Disco4Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note"],
        ClosedHiHat: ["Note","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"]
      },
    },
    {
      title: "Disco4MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Rest","Rest","Note","Note","Rest","Note","Note","Note","Rest","Rest","Note","Note","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note"]
      },
    },
    {
      title: "Disco4MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Note","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Rest","Rest","Note","Note","Rest","Note","Note","Note","Rest","Rest","Note","Note","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note"]
      },
    },
    {
      title: "DiscoBreak4",
      signature: "4/4",
      length: 16,
      tracks: {
        SnareDrum: ["Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Note","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Note"]
      },
    },
    {
      title: "Disco5",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Note","Rest","Note","Note","Note","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        Clap: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "Disco5Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Note"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Note","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Disco5MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Rest","Rest","Rest","Note","Rest","Note","Note","Note","Rest","Rest","Rest","Note","Rest","Note"],
        OpenHiHat: ["Rest","Rest","Note","Note","Rest","Rest","Note","Rest","Rest","Rest","Note","Note","Rest","Rest","Note","Rest"]
      },
    },
    {
      title: "Disco5MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Rest","Rest","Note","Note","Note","Note","Note","Note","Note","Rest","Note","Note","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note"]
      },
    },
    {
      title: "DiscoBreak5",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Rest","Rest","Rest","Rest","Rest"],
        OpenHiHat: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "Disco6",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Note","Note","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        Tambourine: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "DiscoBreak6",
      signature: "4/4",
      length: 16,
      tracks: {
        SnareDrum: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        ClosedHiHat: ["Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note"]
      },
    },
    {
      title: "Disco7",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Rest","Rest","Note","Rest","Note","Note","Note"],
        Clap: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Note","Rest","Rest"],
        Cowbell: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Note","Note","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "DiscoBreak7",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        Tambourine: ["Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note"]
      },
    },
    {
      title: "Disco8",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Rest","Rest","Note","Note","Rest","Note","Note","Note","Rest","Rest","Note","Note","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note"],
        Clap: ["Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "DiscoBreak8",
      signature: "4/4",
      length: 16,
      tracks: {
        SnareDrum: ["Note","Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note"],
        ClosedHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"]
      },
    },
    {
      title: "Disco9",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Note","Note","Rest","Rest","Note","Rest","Rest","Rest","Note","Note","Rest","Rest","Note","Rest"],
        Clap: ["Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        Cowbell: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "DiscoBreak9",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest"]
      },
    },
    {
      title: "Disco10",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Note","Rest","Note","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        Clap: ["Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "Disco11",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Note","Note","Rest","Rest","Rest","Note","Rest","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest"],
        Clap: ["Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "Disco12",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Note","Rest","Rest","Note"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        Tambourine: ["Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note"]
      },
    }
  ],

  "Endings": [
    {
      title: "EndingsMeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        Cymbal: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
    },
    {
      title: "EndingsMeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
    },
    {
      title: "Ending1",
      signature: "3/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
    },
    {
      title: "Ending2",
      signature: "3/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        Cymbal: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
    },
    {
      title: "Ending3",
      signature: "3/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        Cymbal: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
    }
  ],

  "Funk": [
    {
      title: "Funk1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note"]
      },
      accent: ["Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Funk1Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Rest","Rest","Note","Note"],
        ClosedHiHat: ["Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest"]
      },
      accent: ["Accent","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Accent","Accent"],
    },
    {
      title: "Funk1MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "Funk1MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"]
      },
    },
    {
      title: "FunkBreak1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Note","Note","Rest","Note","Note","Note","Note","Rest","Note","Note","Rest","Rest","Note","Note","Note"],
        ClosedHiHat: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Funk2",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "Funk2Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "Funk2MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Funk2MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note"]
      },
    },
    {
      title: "FunkBreak2",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Note"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Funk3",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Funk3Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Note","Note","Note","Note","Note","Note","Rest","Rest","Note","Note","Note","Note","Rest","Note","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Accent","Rest"],
    },
    {
      title: "Funk3MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note"]
      },
      accent: ["Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Funk3MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note"]
      },
      accent: ["Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "FunkBreak3",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Note","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Funk4",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "Funk4Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Note","Note","Note","Note","Rest","Rest","Rest","Rest","Note","Note","Note","Note","Note","Note","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Note","Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Funk4MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Note","Note","Note","Rest","Rest","Note","Rest","Note","Note","Note","Rest"]
      },
    },
    {
      title: "Funk4MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Note","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "FunkBreak4",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Note","Note","Rest","Flam","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Funk5",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Note","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note"]
      },
      accent: ["Rest","Accent","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Accent","Rest"],
    },
    {
      title: "Funk5Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Note"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Note","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Funk5MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Funk5MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Note","Note","Rest","Note","Rest","Note","Note","Note","Rest","Note","Note"]
      },
    },
    {
      title: "FunkBreak5",
      signature: "4/4",
      length: 16,
      tracks: {
        SnareDrum: ["Flam","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Flam","Rest","Note","Note"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Flam","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Flam","Note","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Flam","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Accent","Rest","Rest","Accent","Rest","Rest","Accent","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Accent"],
    },
    {
      title: "Funk6",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Note"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest"],
    },
    {
      title: "Funk6Break",
      signature: "4/4",
      length: 16,
      tracks: {
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Funk6MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Note","Rest","Note","Note","Rest","Note","Rest","Rest","Note","Rest","Note","Note","Rest","Note"],
        ClosedHiHat: ["Note","Note","Rest","Note","Rest","Rest","Note","Rest","Note","Note","Rest","Note","Rest","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Accent","Rest","Rest"],
    },
    {
      title: "Funk6MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Rest","Note","Rest","Rest","Note","Rest","Note","Note","Rest","Note","Rest","Rest","Note","Rest"],
        HighTom: ["Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Accent","Rest","Rest"],
    },
    {
      title: "FunkBreak6",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Flam","Rest","Rest","Rest","Note","Note"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Accent","Rest","Rest","Rest","Rest","Accent","Rest","Accent","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Accent"],
    },
    {
      title: "Funk7",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note"],
        ClosedHiHat: ["Note","Note","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Funk7Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Note","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Note","Note","Note","Note"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent"],
    },
    {
      title: "Funk7MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Rest","Rest","Note","Note","Rest","Note","Note","Note","Rest","Rest","Note","Note","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note"]
      },
    },
    {
      title: "Funk7MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Rest","Rest","Note","Note","Rest","Note","Note","Note","Rest","Rest","Note","Note","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "FunkBreak7",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Note","Note","Note","Note","Rest","Note","Note","Note","Rest","Flam","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Accent","Accent","Rest"],
    },
    {
      title: "Funk8",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Rest","Note","Rest","Note","Note","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Funk8Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Rest"],
        SnareDrum: ["Note","Rest","Note","Rest","Note","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Accent","Rest","Accent","Rest"],
    },
    {
      title: "Funk8MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        OpenHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "Funk8MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note"],
        OpenHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "FunkBreak8",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Note","Rest","Rest","Note","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Flam","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Accent","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Funk9",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Note","Note","Rest","Note","Note","Rest","Rest","Note","Rest","Note"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Note","Rest","Rest","Note","Rest","Rest","Note","Note","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Accent","Rest"],
    },
    {
      title: "Funk9Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Note","Note","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Funk9MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Note"],
        OpenHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Funk9MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "FunkBreak9",
      signature: "4/4",
      length: 16,
      tracks: {
        SnareDrum: ["Note","Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "Funk10",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Note","Rest","Rest","Note"],
        SnareDrum: ["Rest","Note","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Note","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Note"],
        OpenHiHat: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "Funk10Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Note","Note","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Rest","Note","Note","Note","Note"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest"],
    },
    {
      title: "Funk10MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Note","Rest","Note","Note","Note","Note","Note","Note","Note","Rest","Note","Note","Note"]
      },
    },
    {
      title: "Funk10MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Note","Rest","Note","Note","Note","Note","Note","Note","Note","Rest","Note","Note","Note"]
      },
    },
    {
      title: "FunkBreak10",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        Cymbal: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest"],
    },
    {
      title: "Funk11",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Note","Rest","Note","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Accent","Rest"],
    },
    {
      title: "Funk11Break",
      signature: "4/4",
      length: 16,
      tracks: {
        SnareDrum: ["Rest","Rest","Note","Note","Note","Rest","Rest","Rest","Note","Note","Note","Rest","Rest","Rest","Note","Note"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        LowTom: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent"],
    },
    {
      title: "Funk11MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Funk11MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Note","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "FunkBreak11",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Note","Note","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Accent","Accent","Rest","Accent","Rest","Accent","Accent","Rest"],
    },
    {
      title: "Funk12",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Note","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "Funk12Break",
      signature: "4/4",
      length: 16,
      tracks: {
        SnareDrum: ["Rest","Note","Rest","Note","Note","Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        OpenHiHat: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Note"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Note","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Funk12MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Rest","Rest","Note","Note","Rest","Note","Rest","Note","Rest","Rest","Note","Note","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Note"]
      },
    },
    {
      title: "Funk12MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Rest","Rest","Note","Note","Rest","Note","Note","Note","Rest","Rest","Note","Note","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note"]
      },
    },
    {
      title: "FunkBreak12",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Note","Note","Rest","Note","Note","Note","Note","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest"]
      },
    },
    {
      title: "Funk13",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Rest","Note","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Accent","Rest","Rest","Rest","Rest","Accent","Rest"],
    },
    {
      title: "Funk13Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note"]
      },
    },
    {
      title: "Funk13MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest"],
        ClosedHiHat: ["Note","Note","Note","Rest","Note","Note","Rest","Rest","Note","Note","Note","Rest","Note","Note","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"]
      },
    },
    {
      title: "Funk13MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Note"],
        ClosedHiHat: ["Note","Note","Note","Rest","Note","Note","Rest","Rest","Note","Note","Note","Rest","Note","Note","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"]
      },
    },
    {
      title: "FunkBreak13",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Funk14",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Rest","Note","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Accent","Rest","Rest","Rest","Rest","Accent","Rest"],
    },
    {
      title: "Funk14Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Note","Rest","Rest","Note","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Note","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "Funk14MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "Funk14MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "FunkBreak14",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Note","Rest","Rest","Flam","Rest","Flam","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Funk15",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Note","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Accent","Rest","Rest"],
    },
    {
      title: "Funk15Break",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Note","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest"],
    },
    {
      title: "Funk15MeasureA",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "Funk15MeasureB",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "FunkBreak15",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Note","Rest","Rest","Note","Rest","Rest","Flam"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
    }
  ],

  "Jazz": [
    {
      title: "Jazz1",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note"],
        Cymbal: ["Note","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Note","Rest","Note"]
      },
    },
    {
      title: "JazzBreak1",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Note","Note","Note","Rest","Rest","Rest"],
        Cymbal: ["Note","Rest","Note","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "Jazz2",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note"],
        Cymbal: ["Note","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Note","Rest","Note"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "JazzBreak2",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Note","Note","Note","Note","Note","Rest","Rest","Rest","Rest","Rest"],
        Cymbal: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Note"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "Jazz3",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest"],
        Cymbal: ["Note","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Note","Rest","Note"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "JazzBreak3",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Note","Note","Note"],
        Cymbal: ["Note","Rest","Note","Note","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "Jazz4",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note"],
        Cymbal: ["Note","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Note","Rest","Note"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "Jazz5",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        Cymbal: ["Note","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Note","Rest","Note"]
      },
    },
    {
      title: "Jazz6",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest"],
        Cymbal: ["Note","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Note","Rest","Note"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    }
  ],

  "March": [
    {
      title: "March1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Note","Rest","Note","Rest","Note","Note","Rest","Note","Note","Rest","Note","Rest","Note","Note","Note","Note"],
        ClosedHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"]
      },
      accent: ["Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "MarchBreak1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest"],
        Cymbal: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Paso1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Note","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        Cymbal: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Note","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "PasoBreak1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Note","Note","Rest","Note","Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "March2",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Note","Note","Note"],
        ClosedHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"]
      },
      accent: ["Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "MarchBreak2",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Note","Rest","Note","Note","Rest","Rest","Note","Rest","Note","Note","Note","Note","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest"],
    },
    {
      title: "Paso2",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        ClosedHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        Cymbal: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "PasoBreak2",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Flam","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    }
  ],

  "Pop": [
    {
      title: "Pop1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Note","Rest","Note","Rest","Note","Rest","Note","Note","Note","Rest","Note","Rest","Note","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Pop1Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Note","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Pop1MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Pop1MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
    },
    {
      title: "PopBreak1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Note","Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Pop2",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Note","Note","Note","Note","Rest","Note","Rest","Rest","Note","Note","Note"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Pop2Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Note"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest"],
    },
    {
      title: "Pop2MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "Pop2MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "PopBreak2",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Note"],
        SnareDrum: ["Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Accent","Rest","Rest","Accent","Rest","Rest","Accent","Rest","Rest","Accent","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Pop3",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Note","Rest","Note","Rest","Note","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Rest","Note","Note","Rest","Note","Rest","Note","Rest","Rest","Note"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Pop3Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest"],
    },
    {
      title: "Pop3MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Note","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "Pop3MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Note","Rest","Note","Rest","Rest","Note","Rest","Note","Note","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "PopBreak3",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Flam","Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note"],
        Cymbal: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Pop4",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Pop4Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Note"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Accent"],
    },
    {
      title: "Pop4MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "Pop4MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "PopBreak4",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Note","Note","Rest","Flam","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Pop5",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Note","Rest","Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Note","Note"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Pop5Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Note","Note","Note","Note","Rest","Note","Note","Note","Note","Note","Rest","Note","Note","Note","Note"],
        OpenHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "Pop5MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "Pop5MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Note","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "PopBreak5",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest"],
        SnareDrum: ["Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        Cymbal: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Pop6",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Note","Rest","Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "PopBreak6",
      signature: "4/4",
      length: 16,
      tracks: {
        SnareDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Note","Rest"],
        Cymbal: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Accent","Rest","Rest","Accent","Accent","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest"],
    },
    {
      title: "Pop7",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Note","Rest","Rest","Note","Rest","Rest","Rest","Note","Note","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Pop8",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Pop9",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Pop10",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Note","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Rest","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Pop11",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Note","Rest","Rest","Note","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Note"],
        SnareDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note","Note"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Pop12",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Rest","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Note","Rest","Note","Rest","Note","Note","Note","Note","Note","Rest","Note","Rest","Note"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    }
  ],

  "Reggae": [
    {
      title: "Reggae1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
    },
    {
      title: "Reggae1Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest"],
    },
    {
      title: "Reggae1MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note"],
        RimShot: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Note","Rest","Rest","Note","Rest","Rest","Note"]
      },
    },
    {
      title: "Reggae1MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note"],
        RimShot: ["Rest","Rest","Note","Note","Rest","Rest","Note","Rest","Rest","Rest","Note","Note","Rest","Rest","Note","Rest"]
      },
    },
    {
      title: "ReggaeBreak1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Reggae2",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        RimShot: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Reggae2Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Reggae2MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        RimShot: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Reggae2MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        RimShot: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "ReggaeBreak2",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Accent","Rest","Rest"],
    },
    {
      title: "Reggae3",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Note","Rest","Rest","Note","Rest","Rest","Rest","Note","Note"],
        RimShot: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Reggae3Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest"],
    },
    {
      title: "Reggae3MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Note","Note","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"]
      },
    },
    {
      title: "Reggae3MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Rest","Note","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"]
      },
    },
    {
      title: "ReggaeBreak3",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Note","Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Accent","Accent","Rest"],
    },
    {
      title: "Reggae4",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        RimShot: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "Reggae4Break",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "Reggae4MeasureA",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        RimShot: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Reggae4MeasureB",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        RimShot: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "ReggaeBreak4",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Flam","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
      accent: ["Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Accent","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Reggae5",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        RimShot: ["Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "Reggae5Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest"],
    },
    {
      title: "Reggae5MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note"],
        RimShot: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Note"]
      },
    },
    {
      title: "Reggae5MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note"],
        RimShot: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note"]
      },
    },
    {
      title: "ReggaeBreak5",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Flam","Rest","Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Reggae6",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        RimShot: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
    },
    {
      title: "ReggaeBreak6",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Reggae7",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Rest","Rest"],
        RimShot: ["Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "ReggaeBreak7",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Flam","Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "Reggae8",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        RimShot: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "ReggaeBreak8",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        HighTom: ["Rest","Rest","Rest","Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "Reggae9",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Note","Rest","Note"],
        RimShot: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note"]
      },
    },
    {
      title: "ReggaeBreak9",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest"],
        OpenHiHat: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note"],
        MediumTom: ["Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest"]
      },
      accent: ["Accent","Rest","Accent","Rest","Accent","Rest","Accent","Rest","Accent","Rest","Accent","Rest"],
    },
    {
      title: "Reggae10",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        RimShot: ["Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Reggae11",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Note","Rest","Note","Note","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        RimShot: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Reggae12",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        RimShot: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    }
  ],

  "Rhythm & Blues": [
    {
      title: "Rhythm&Blues1Break",
      signature: "4/4",
      length: 16,
      tracks: {
        SnareDrum: ["Note","Note","Rest","Note","Rest","Note","Note","Note","Rest","Note","Rest","Note","Note","Note","Note","Note"],
        LowTom: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Rhythm&Blues1MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "Rhythm&Blues1MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Note","Rest","Rest","Note","Rest","Rest","Note"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "Rnb1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Note","Note","Rest","Rest","Note","Rest","Rest","Note"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "RnbBreak1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Note","Rest","Rest","Note","Note","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        Cymbal: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Rhythm&Blues2Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Note"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Rhythm&Blues2MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Note","Rest","Note","Rest","Rest","Note","Note","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "Rhythm&Blues2MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Note","Rest","Note","Rest","Note","Note","Rest"],
        SnareDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "Rnb2",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "RnbBreak2",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Note","Rest","Note","Note","Note","Rest","Rest","Note","Note"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Rhythm&Blues3Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note"],
        SnareDrum: ["Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Note","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Rhythm&Blues3MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "Rhythm&Blues3MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note"]
      },
    },
    {
      title: "Rnb3",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "RnbBreak3",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Note","Note","Note","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        Cymbal: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Note"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Rhythm&Blues4Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Note","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Rest","Rest","Rest","Note","Rest","Note","Note"]
      },
    },
    {
      title: "Rhythm&Blues4MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Note","Rest","Rest","Note","Rest","Rest","Note"],
        ClosedHiHat: ["Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note"]
      },
    },
    {
      title: "Rhythm&Blues4MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note"],
        ClosedHiHat: ["Note","Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note"],
        OpenHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"]
      },
    },
    {
      title: "Rnb4",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Note","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "RnbBreak4",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Note","Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Flam","Rest","Rest","Flam","Rest","Rest","Flam","Rest","Rest","Flam","Rest","Rest","Flam","Rest"],
        Cymbal: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "Rhythm&Blues5Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Rhythm&Blues5MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Note","Rest","Note","Note","Rest","Note","Rest","Note","Note","Rest","Note"],
        SnareDrum: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "Rhythm&Blues5MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Note","Rest","Rest","Rest","Note","Note","Rest","Note","Note","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "Rnb5",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "RnbBreak5",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest"],
        Cymbal: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
    },
    {
      title: "Rnb6",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "RnbBreak6",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest"],
        Cymbal: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest"],
    },
    {
      title: "Rnb7",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Note","Rest","Rest","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"]
      },
    },
    {
      title: "Rnb8",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        Cymbal: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"]
      },
    },
    {
      title: "Rnb9",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Note","Rest","Note","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"]
      },
    },
    {
      title: "Rnb10",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Rnb11",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Note","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Note","Note","Note","Note","Rest","Note","Note","Note","Note","Note","Note","Note","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note"]
      },
    },
    {
      title: "Rnb12",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Note","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note"],
        OpenHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    }
  ],

  "Rock": [
    {
      title: "Rock1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Rock1Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Note","Note","Note"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest"]
      },
      accent: ["Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Accent"],
    },
    {
      title: "Rock1MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Rock1MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "RockBreak1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Rock2",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Rock2Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        SnareDrum: ["Note","Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Note","Rest","Rest","Rest","Rest"],
        Cymbal: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Note","Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Rock2MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note"]
      },
      accent: ["Accent","Rest","Accent","Rest","Accent","Rest","Accent","Rest","Accent","Rest","Accent","Rest","Accent","Rest","Accent","Rest"],
    },
    {
      title: "Rock2MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest"],
        ClosedHiHat: ["Note","Note","Note","Note","Note","Note","Note","Rest","Note","Note","Note","Note","Note","Note","Note","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note"]
      },
    },
    {
      title: "RockBreak2",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Note","Rest","Note","Rest","Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Note"],
        Cymbal: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent"],
    },
    {
      title: "Rock3",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Rock3Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"]
      },
    },
    {
      title: "Rock3MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "Rock3MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "RockBreak3",
      signature: "4/4",
      length: 16,
      tracks: {
        SnareDrum: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Flam","Rest","Rest","Rest"],
        LowTom: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Rock4",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Rock4Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note"]
      },
      accent: ["Accent","Rest","Rest","Accent","Accent","Rest","Rest","Accent","Accent","Rest","Rest","Accent","Accent","Rest","Rest","Accent"],
    },
    {
      title: "Rock4MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "Rock4MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "RockBreak4",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        Cymbal: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest"],
    },
    {
      title: "Rock5",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Rock5Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Accent","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Rock5MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "Rock5MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "RockBreak5",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Accent","Rest","Accent","Rest"],
    },
    {
      title: "Rock6",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "RockBreak6",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note"],
        SnareDrum: ["Note","Rest","Note","Rest","Note","Note","Note","Rest","Rest","Note","Note","Note","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        Cymbal: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Accent","Rest","Rest","Accent"],
    },
    {
      title: "Rock7",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "RockBreak7",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        Cymbal: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Rock8",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Note","Rest","Rest","Note","Rest","Rest","Note"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "RockBreak8",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        LowTom: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Rock9",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "RockBreak9",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Rest","Rest"]
      },
      accent: ["Accent","Rest","Accent","Rest","Accent","Rest","Accent","Rest","Rest","Accent","Rest","Accent","Rest","Rest","Accent","Rest"],
    },
    {
      title: "Rock10",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Note","Rest","Note","Rest","Rest","Note","Rest","Note","Note","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "RockBreak10",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Note"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest"]
      },
      accent: ["Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Accent","Rest","Rest","Rest","Accent","Rest"],
    },
    {
      title: "Rock11",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "RockBreak11",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        Cymbal: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
    },
    {
      title: "Rock12",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "RockBreak12",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Note","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Rock13",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note"]
      },
      accent: ["Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Rock14",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note"]
      },
      accent: ["Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Rock14",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Note","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    }
  ],

  "Samba": [
    {
      title: "Samba1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Note","Rest"],
        Cymbal: ["Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note"],
        MediumTom: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest"],
    },
    {
      title: "Samba1Break",
      signature: "4/4",
      length: 16,
      tracks: {
        SnareDrum: ["Note","Rest","Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest"],
    },
    {
      title: "Samba1MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note"],
        Cowbell: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Samba1MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note"],
        ClosedHiHat: ["Rest","Note","Rest","Note","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        Cowbell: ["Note","Rest","Note","Rest","Note","Note","Rest","Note","Rest","Note","Note","Rest","Note","Note","Rest","Note"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "SambaBreak1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note"],
        SnareDrum: ["Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Accent","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Accent","Rest","Rest","Rest","Accent","Rest"],
    },
    {
      title: "Samba2",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest"],
        Cymbal: ["Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note"],
        MediumTom: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest"],
    },
    {
      title: "Samba2Break",
      signature: "4/4",
      length: 16,
      tracks: {
        SnareDrum: ["Rest","Note","Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Note","Note","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note"]
      },
    },
    {
      title: "Samba2MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note"],
        RimShot: ["Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Samba2MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note"],
        RimShot: ["Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "SambaBreak2",
      signature: "4/4",
      length: 16,
      tracks: {
        SnareDrum: ["Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Accent","Rest"],
    },
    {
      title: "Samba3",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest"],
        Cymbal: ["Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Note"],
        MediumTom: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest"],
    },
    {
      title: "Samba3Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note"],
        SnareDrum: ["Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Note","Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note"],
        HighTom: ["Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Samba3MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note","Note"]
      },
      accent: ["Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Samba3MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note"],
        SnareDrum: ["Note","Rest","Note","Rest","Note","Note","Rest","Note","Rest","Note","Note","Rest","Note","Note","Rest","Note"],
        ClosedHiHat: ["Rest","Note","Rest","Note","Rest","Rest","Note","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest"],
    },
    {
      title: "SambaBreak3",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Samba4",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Note","Rest","Note","Rest","Rest","Note","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest"],
        HighTom: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Note"],
        MediumTom: ["Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest"],
    },
    {
      title: "Samba5",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note"],
        ClosedHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        Cymbal: ["Note","Rest","Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Rest","Rest"],
        RimShot: ["Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note"]
      },
    },
    {
      title: "Samba6",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note"],
        ClosedHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        Cymbal: ["Note","Rest","Note","Rest","Note","Note","Note","Note","Rest","Note","Rest","Note","Note","Rest","Note","Rest"],
        RimShot: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note"]
      },
    }
  ],

  "Shuffle": [
    {
      title: "Shuffle1",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        Cymbal: ["Note","Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Rest","Note"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "Shuffle1Break",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Note","Rest","Note","Note","Rest","Note","Note"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Shuffle1MeasureA",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Rest","Note"]
      },
    },
    {
      title: "Shuffle1MeasureB",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Rest","Note"]
      },
    },
    {
      title: "ShuffleBreak1",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Note","Note","Note","Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Rest","Rest","Rest"]
      },
      accent: ["Accent","Rest","Accent","Accent","Rest","Accent","Accent","Rest","Accent","Accent","Rest","Accent"],
    },
    {
      title: "Shuffle2",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest"],
        Cymbal: ["Note","Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Rest","Note"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "Shuffle2Break",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note","Rest","Rest","Note"],
        SnareDrum: ["Rest","Note","Note","Rest","Note","Note","Note","Note","Rest","Note","Note","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Shuffle2MeasureA",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Rest","Note"]
      },
    },
    {
      title: "Shuffle2MeasureB",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Rest","Note"]
      },
    },
    {
      title: "ShuffleBreak2",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Note","Note","Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Note"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Accent","Rest","Accent","Accent","Rest","Accent","Accent","Rest","Accent","Accent","Rest","Accent"],
    },
    {
      title: "Shuffle3",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Note","Note","Rest","Rest"],
        Cymbal: ["Note","Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Rest","Note"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "ShuffleBreak3",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Note","Rest","Note","Note","Note","Rest","Note","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note"]
      },
      accent: ["Accent","Rest","Accent","Accent","Rest","Accent","Accent","Rest","Accent","Accent","Rest","Accent"],
    },
    {
      title: "Shuffle4",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        Cymbal: ["Note","Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Rest","Note"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "Shuffle5",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Note","Note","Rest","Rest"],
        Cymbal: ["Note","Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Rest","Note"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "Shuffle6",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Rest","Note"],
        SnareDrum: ["Note","Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Rest","Note"],
        Cymbal: ["Note","Rest","Note","Note","Rest","Note","Note","Rest","Note","Note","Rest","Note"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    }
  ],

  "Ska": [
    {
      title: "SkaBreak",
      signature: "4/4",
      length: 16,
      tracks: {
        SnareDrum: ["Note","Rest","Note","Note","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "SkaMeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest"],
    },
    {
      title: "SkaMeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest"],
    },
    {
      title: "Ska1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"]
      },
    },
    {
      title: "SkaBreak1",
      signature: "4/4",
      length: 16,
      tracks: {
        SnareDrum: ["Note","Rest","Note","Note","Note","Rest","Note","Rest","Note","Rest","Note","Note","Note","Note","Note","Note"]
      },
      accent: ["Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Accent","Rest"],
    },
    {
      title: "Ska2",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "SkaBreak2",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Note","Note","Note","Rest","Note","Rest","Rest","Rest","Note","Note","Note","Note","Note","Note"],
        OpenHiHat: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Ska3",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"]
      },
      accent: ["Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "SkaBreak3",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Accent","Rest"],
    }
  ],

  "Slow": [
    {
      title: "Slow1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "SlowBreak1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Note"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "Slow2",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "SlowBreak2",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Note"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Slow3",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Note","Note","Rest"]
      },
    },
    {
      title: "SlowBreak3",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Flam","Rest","Rest","Note","Note","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Accent","Rest","Rest"],
    },
    {
      title: "Slow4",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Note","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"]
      },
    },
    {
      title: "SlowBreak4",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
    },
    {
      title: "Slow5",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "SlowBreak5",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Slow6",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"]
      },
    },
    {
      title: "SlowBreak6",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Flam","Rest"],
        Cymbal: ["Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Slow7",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest","Note","Note","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"]
      },
    },
    {
      title: "Slow8",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "Slow9",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Slow10",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Note","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Slow11",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Note","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Note","Note","Note","Note","Rest","Note","Note","Note","Note","Note","Note","Note","Rest"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note"]
      },
    },
    {
      title: "Slow12",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Note","Note","Note","Note","Note","Rest","Note","Note","Note","Note","Note","Note","Note","Rest","Note"],
        OpenHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"]
      },
    }
  ],

  "Swing": [
    {
      title: "Swing1",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        Cymbal: ["Note","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Note","Rest","Note"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "Swing1Break",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Note","Note","Note"],
        ClosedHiHat: ["Note","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Swing1MeasureA",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest"]
      },
    },
    {
      title: "Swing1MeasureB",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest"]
      },
    },
    {
      title: "SwingBreak1",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note"],
        SnareDrum: ["Flam","Rest","Flam","Rest","Flam","Rest","Flam","Rest","Flam","Rest","Flam","Rest"]
      },
    },
    {
      title: "Swing2",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note"],
        Cymbal: ["Note","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Note","Rest","Note"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "Swing2Break",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Note","Note","Note","Rest","Note","Note","Note","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Note","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"]
      },
    },
    {
      title: "Swing2MeasureA",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Note","Rest","Note"]
      },
    },
    {
      title: "Swing2MeasureB",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Note","Rest","Note"]
      },
    },
    {
      title: "SwingBreak2",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note"],
        SnareDrum: ["Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        HighTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest"],
        MediumTom: ["Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Accent","Rest","Rest","Accent","Rest","Rest","Accent","Rest","Rest","Accent","Rest"],
    },
    {
      title: "Swing3",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note"],
        Cymbal: ["Note","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Note","Rest","Note"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "Swing3",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest"],
        Cymbal: ["Note","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Note","Rest","Note"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "Swing3Break",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Note","Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest"],
        OpenHiHat: ["Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest","Rest","Note","Note"]
      },
    },
    {
      title: "Swing3MeasureA",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        Cymbal: ["Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Note"]
      },
    },
    {
      title: "Swing3MeasureB",
      signature: "12/8",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Note","Note","Rest","Note","Rest","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        Cymbal: ["Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest"]
      },
    },
    {
      title: "SwingBreak3",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Note","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Note","Rest","Rest","Rest"],
        Cymbal: ["Note","Rest","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note"]
      },
    },
    {
      title: "Swing5",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Note"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest"],
        Cymbal: ["Note","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Note","Rest","Note"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    },
    {
      title: "Swing6",
      signature: "4/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest"],
        Cymbal: ["Note","Rest","Rest","Note","Rest","Note","Note","Rest","Rest","Note","Rest","Note"]
      },
      accent: ["Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest"],
    }
  ],

  "Tango": [
    {
      title: "Tango1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        SnareDrum: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest"],
    },
    {
      title: "TangoBreak1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
    }
  ],

  "Twist": [
    {
      title: "Twist1",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        Cymbal: ["Note","Rest","Note","Note","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Twist1Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Note"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Twist1MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Twist1MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
    },
    {
      title: "TwistBreak1",
      signature: "4/4",
      length: 16,
      tracks: {
        SnareDrum: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Flam","Rest","Flam","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Accent","Rest"],
    },
    {
      title: "Twist2",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        Cymbal: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Twist2Break",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Note","Note","Note"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Twist2MeasureA",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "Twist2MeasureB",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Note","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest"],
    },
    {
      title: "TwistBreak2",
      signature: "4/4",
      length: 16,
      tracks: {
        SnareDrum: ["Flam","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Note","Note","Note"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
      accent: ["Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Accent","Rest"],
    },
    {
      title: "Twist3",
      signature: "4/4",
      length: 16,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        Cymbal: ["Note","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
    },
    {
      title: "TwistBreak3",
      signature: "4/4",
      length: 16,
      tracks: {
        SnareDrum: ["Note","Note","Rest","Note","Rest","Note","Note","Note","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        ClosedHiHat: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        Cymbal: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Note","Rest","Note","Rest","Note","Rest","Rest"]
      },
      accent: ["Rest","Rest","Rest","Rest","Rest","Accent","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Accent","Rest"],
    }
  ],

  "Waltz": [
    {
      title: "Waltz1",
      signature: "3/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        Cymbal: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Note","Note","Rest","Rest","Rest"]
      },
    },
    {
      title: "WaltzBreak1",
      signature: "3/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Note","Rest","Note","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        Cymbal: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Waltz2",
      signature: "3/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        Cymbal: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "WaltzBreak2",
      signature: "3/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest"]
      },
    },
    {
      title: "Waltz3",
      signature: "3/4",
      length: 12,
      tracks: {
        BassDrum: ["Note","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        SnareDrum: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Note"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        Cymbal: ["Note","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Note"]
      },
    },
    {
      title: "WaltzBreak3",
      signature: "3/4",
      length: 12,
      tracks: {
        SnareDrum: ["Flam","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest"],
        ClosedHiHat: ["Rest","Rest","Rest","Rest","Note","Rest","Rest","Rest","Note","Rest","Rest","Rest"],
        LowTom: ["Rest","Rest","Rest","Rest","Rest","Rest","Rest","Rest","Note","Rest","Note","Rest"],
        MediumTom: ["Rest","Rest","Rest","Rest","Note","Rest","Note","Rest","Rest","Rest","Rest","Rest"]
      },
    }
  ],
}
