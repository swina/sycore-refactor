/**
 * S1_MUSICAL_VARIATIONS
 * 
 * A comprehensive collection of sound variations based on musical keywords,
 * designed to respect the physical and timbral limits of the Roland S-1.
 * These presets represent specific instantiations of the categories defined in s1-config.ts.
 */

export const S1_MUSICAL_VARIATIONS = {
  pad: [
    {
      name: "Ethereal Silk",
      keywords: "soft, airy, lush, reverb",
      values: {
        attack: 105, decay: 100, sustain: 90, release: 110,
        cutoff: 45, res: 10, envFilt: 50,
        oscSaw: 110, oscSq: 0, oscSub: 60,
        chorusMode: 2, reverb: 115, delayLvl: 40,
        transpose: 64
      }
    },
    {
      name: "Dark Tension",
      keywords: "dark, underground, filtered, deep",
      values: {
        attack: 90, decay: 120, sustain: 80, release: 95,
        cutoff: 25, res: 15, envFilt: 40,
        oscSaw: 60, oscSq: 40, oscSub: 90,
        chorusMode: 1, reverb: 90, delayLvl: 20,
        transpose: 64
      }
    }
  ],
  lead: [
    {
      name: "Cutting Edge",
      keywords: "cutting, sharp, sawtooth, edge",
      values: {
        attack: 5, decay: 60, sustain: 100, release: 25,
        cutoff: 95, res: 30, envFilt: 80,
        oscSaw: 127, oscSq: 40, oscSub: 0,
        delayLvl: 50, delayTime: 60,
        transpose: 64
      }
    },
    {
      name: "Soft Dream",
      keywords: "soft, sweet, flute-like, dreamy",
      values: {
        attack: 15, decay: 70, sustain: 80, release: 40,
        cutoff: 60, res: 10, envFilt: 55,
        oscSaw: 40, oscSq: 80, oscSub: 20,
        reverb: 70, chorusMode: 2,
        transpose: 64
      }
    }
  ],
  key: [
    {
      name: "Classic Electric",
      keywords: "rhodes-style, warm, bell-like, keys",
      values: {
        attack: 2, decay: 100, sustain: 40, release: 30,
        cutoff: 80, res: 5, envFilt: 70,
        oscSaw: 40, oscSq: 110, oscSub: 0,
        chorusMode: 2, reverb: 50,
        transpose: 64
      }
    },
    {
      name: "Lo-Fi Wurlitzer",
      keywords: "vintage, dusty, keys, percussive",
      values: {
        attack: 0, decay: 80, sustain: 30, release: 45,
        cutoff: 70, res: 15, envFilt: 90,
        oscSaw: 80, oscSq: 50, oscSub: 20,
        chorusMode: 1, reverb: 40, delayLvl: 25,
        transpose: 64
      }
    }
  ],
  bass: [
    {
      name: "Deep Sub",
      keywords: "deep, sub, low-end, solid",
      values: {
        attack: 5, decay: 40, sustain: 100, release: 20,
        cutoff: 40, res: 20, envFilt: 50,
        oscSaw: 30, oscSq: 20, oscSub: 127,
        chorusMode: 0, reverb: 0,
        transpose: 40
      }
    },
    {
      name: "Fat Analog",
      keywords: "fat, analog, warm, thick",
      values: {
        attack: 2, decay: 60, sustain: 90, release: 25,
        cutoff: 65, res: 40, envFilt: 75,
        oscSaw: 110, oscSq: 90, oscSub: 70,
        chorusMode: 1, delayLvl: 20,
        transpose: 52
      }
    }
  ],
  drone: [
    {
      name: "Ominous Low",
      keywords: "dark, scary, low-frequency, tension",
      values: {
        attack: 110, decay: 150, sustain: 110, release: 127,
        cutoff: 50, res: 10, envFilt: 30, lfoFilt: 60, lfoRate: 8,
        oscSaw: 80, oscSq: 60, oscSub: 100, oscNoise: 10,
        reverb: 100, delayLvl: 40,
        transpose: 64
      }
    },
    {
      name: "Space Station",
      keywords: "sci-fi, engine, hum, metallic",
      values: {
        attack: 100, decay: 120, sustain: 127, release: 110,
        cutoff: 60, res: 5, lfoRate: 15, lfoMod: 40,
        oscSaw: 100, oscSq: 100, oscSub: 40, oscChopOvertone: 80,
        reverb: 120, delayLvl: 50,
        transpose: 64
      }
    }
  ],
  ambient: [
    {
      name: "Underwater Vibe",
      keywords: "underwater, muffled, pulsing, vibe",
      values: {
        attack: 100, decay: 150, sustain: 90, release: 120,
        cutoff: 50, res: 5, envFilt: 30, lfoFilt: 35, lfoRate: 15,
        oscSaw: 40, oscSq: 60, oscSub: 100,
        reverb: 127, delayLvl: 60,
        transpose: 64
      }
    },
    {
      name: "Ghostly Choir",
      keywords: "ghostly, ethereal, choir, vast",
      values: {
        attack: 110, decay: 180, sustain: 80, release: 127,
        cutoff: 65, res: 10, envFilt: 40,
        oscSaw: 100, oscSq: 100, oscSub: 40, oscNoise: 15,
        chorusMode: 2, reverb: 127, delayLvl: 70,
        transpose: 64
      }
    }
  ],
  texture: [
    {
      name: "Granular Dust",
      keywords: "crackly, organic, micro-detail, noise",
      values: {
        attack: 110, decay: 150, sustain: 100, release: 120,
        cutoff: 40, res: 15, envFilt: 20, lfoFilt: 70, lfoRate: 25,
        oscSaw: 50, oscSq: 40, oscNoise: 25, oscChopOvertone: 90,
        reverb: 110, delayLvl: 60,
        transpose: 64
      }
    },
    {
      name: "Metallic Breath",
      keywords: "cold, wind, metallic, hollow",
      values: {
        attack: 100, decay: 140, sustain: 90, release: 115,
        cutoff: 60, res: 5, lfoMod: 30, lfoWave: 3,
        oscSaw: 40, oscSq: 80, oscNoise: 15, oscChopComb: 100,
        reverb: 120, delayLvl: 40,
        transpose: 64
      }
    }
  ],
  bell: [
    {
      name: "Temple Bell",
      keywords: "zen, organic, decay, chime",
      values: {
        attack: 0, decay: 80, sustain: 5, release: 100,
        cutoff: 100, res: 40, envFilt: 30,
        oscSaw: 5, oscSq: 60, oscChopOvertone: 110,
        reverb: 90, delayLvl: 50,
        transpose: 64
      }
    },
    {
      name: "Crystal Tine",
      keywords: "glass, bright, sharp, digital-feel",
      values: {
        attack: 0, decay: 70, sustain: 0, release: 80,
        cutoff: 115, res: 20, envFilt: 40,
        oscSq: 40, pwWidth: 100, oscChopOvertone: 127,
        reverb: 80, chorusMode: 2,
        transpose: 64
      }
    }
  ],
  arp: [
    {
      name: "Clockwork",
      keywords: "mechanical, steady, tight, rhythmic",
      values: {
        attack: 2, decay: 40, sustain: 50, release: 15,
        cutoff: 80, res: 20, envFilt: 60,
        oscSaw: 100, oscSq: 50,
        reverb: 20, delayLvl: 60,
        transpose: 64
      }
    },
    {
      name: "Bouncing Ball",
      keywords: "dynamic, rubbery, playful, resonant",
      values: {
        attack: 5, decay: 60, sustain: 30, release: 20,
        cutoff: 65, res: 35, envFilt: 80,
        oscSaw: 70, oscSq: 70, oscSub: 30,
        chorusMode: 1, delayLvl: 40,
        transpose: 64
      }
    }
  ],
  percussion: [
    {
      name: "Analog Kick",
      keywords: "analog, kick, deep, punchy",
      values: {
        attack: 0, decay: 25, sustain: 0, release: 15,
        cutoff: 45, res: 30, envFilt: 90,
        oscSaw: 0, oscSq: 0, oscSub: 127,
        chorusMode: 0, reverb: 10,
        transpose: 64
      }
    },
    {
      name: "Noise Snare",
      keywords: "noise, snare, white-noise, sharp",
      values: {
        attack: 0, decay: 35, sustain: 0, release: 20,
        cutoff: 100, res: 10, envFilt: 110,
        oscSaw: 20, oscSq: 0, oscSub: 0, oscNoise: 110,
        chorusMode: 0, reverb: 40,
        transpose: 64
      }
    }
  ],
  strings: [
    {
      name: "Vintage Solina",
      keywords: "retro, ensemble, warm, classic-string",
      values: {
        attack: 25, decay: 80, sustain: 110, release: 45,
        cutoff: 90, res: 10, envFilt: 60,
        oscSaw: 127, oscSq: 20, oscSub: 20,
        chorusMode: 1, reverb: 60,
        transpose: 64
      }
    }
  ],
  orchestra: [
    {
      name: "Majestic Swell",
      keywords: "epic, cinematic, rising, brassy",
      values: {
        attack: 60, decay: 100, sustain: 110, release: 80,
        cutoff: 100, res: 5, envFilt: 45,
        oscSaw: 127, oscSq: 40, oscSub: 40,
        chorusMode: 2, reverb: 110, delayLvl: 40,
        transpose: 64
      }
    }
  ],
  organ: [
    {
      name: "Percussive B3",
      keywords: "soul, rock, clicky, classic-organ",
      values: {
        attack: 0, decay: 40, sustain: 120, release: 10,
        cutoff: 90, res: 5, lfoMod: 20, lfoRate: 10,
        oscSaw: 100, oscSq: 80, oscSub: 60,
        chorusMode: 3, reverb: 40,
        transpose: 64
      }
    }
  ],
  brass: [
    {
      name: "Synth Stab",
      keywords: "powerful, punchy, 80s-feel, bright",
      values: {
        attack: 15, decay: 75, sustain: 80, release: 30,
        cutoff: 90, res: 40, envFilt: 75,
        oscSaw: 127, oscSq: 50,
        chorusMode: 2, reverb: 60,
        transpose: 64
      }
    }
  ],
  piano: [
    {
      name: "Dreamy Upright",
      keywords: "soft, felt, emotional, percussive",
      values: {
        attack: 2, decay: 90, sustain: 15, release: 40,
        cutoff: 80, res: 0, envFilt: 50,
        oscSaw: 80, oscSq: 40,
        reverb: 50, delayLvl: 20,
        transpose: 64
      }
    }
  ],
  synth: [
    {
      name: "Poly Stack",
      keywords: "classic, versatile, rich, polyphonic",
      values: {
        attack: 20, decay: 80, sustain: 90, release: 60,
        cutoff: 85, res: 20, envFilt: 70,
        oscSaw: 100, oscSq: 80, oscSub: 40,
        chorusMode: 2, reverb: 60
      }
    }
  ],
  pluck: [
    {
      name: "Guitarish",
      keywords: "short, pluck, string-like, organic",
      values: {
        attack: 0, decay: 45, sustain: 5, release: 20,
        cutoff: 90, res: 15, envFilt: 90,
        oscSaw: 110, oscSq: 30,
        reverb: 30, delayLvl: 40,
        transpose: 64
      }
    }
  ],
  padchord: [
    {
      name: "Vapor Wash",
      keywords: "slow, sweeping, dreamy, cinematic",
      values: {
        attack: 90, decay: 120, sustain: 110, release: 100,
        cutoff: 60, res: 5, envFilt: 75, oscChopComb: 80,
        oscSaw: 127, oscSub: 70,
        chorusMode: 2, reverb: 110,
        transpose: 64
      }
    }
  ],
  acid: [
    {
      name: "Classic Squeltch",
      keywords: "acid, squelch, 303, resonance",
      values: {
        attack: 2, decay: 45, sustain: 10, release: 30,
        cutoff: 35, res: 110, envFilt: 110,
        oscSaw: 127, oscSq: 0,
        delayLvl: 40, delayTime: 65,
        transpose: 64
      }
    },
    {
      name: "Nasty Box",
      keywords: "nasty, distorted, dirty, industrial",
      values: {
        attack: 0, decay: 60, sustain: 20, release: 25,
        cutoff: 80, res: 120, envFilt: 100,
        oscSaw: 0, oscSq: 127, oscSub: 20,
        chorusMode: 1, delayLvl: 50,
        transpose: 64
      }
    }
  ],
  experimental: [
    {
      name: "Signal Loss",
      keywords: "glitch, broken, digital, lo-fi",
      values: {
        attack: 10, decay: 100, sustain: 50, release: 80,
        cutoff: 60, res: 80, lfoRate: 25, lfoMod: 80, lfoWave: 4,
        oscSaw: 60, oscNoise: 80, oscChopOvertone: 110,
        delayLvl: 80, delayTime: 20,
        transpose: 64
      }
    }
  ],
  ai: [
    {
      name: "Neural Genesis",
      keywords: "evolving, unknown, machine-logic, random-beauty",
      values: {
        attack: 40, decay: 80, sustain: 60, release: 70,
        cutoff: 70, res: 40, envFilt: 60, lfoMod: 50,
        oscSaw: 80, oscSq: 80, oscSub: 80, oscNoise: 20,
        chorusMode: 2, reverb: 80, delayLvl: 40,
        transpose: 64
      }
    }
  ]
};
