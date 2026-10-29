// Firmware catalog of the FM-1 emulator (github.com/joakimeriksson/fm1-emu, web/firmwares.json).
// Only ids + names: the emulator page fetches each firmware from its author's site itself.
export const FM1_EMU_URL = 'https://joakimeriksson.github.io/fm1-emu/'
export const FM1_DEFAULT_FIRMWARE = 'felucca'

export const FM1_FIRMWARES: { id: string; name: string }[] = [
  { id: 'mvave', name: 'M-VAVE stock firmware' },
  { id: 'felucca', name: 'Felucca' },
  { id: 'felucca-salt', name: 'Felucca [Salt]' },
  { id: '386dx', name: '386DX' },
  { id: 'amb', name: 'AMB-1' },
  { id: 'april', name: 'April OS' },
  { id: 'beetle', name: 'BEETLE' },
  { id: 'bunker', name: 'Bunker Evolved' },
  { id: 'bytemania', name: 'Bytemania' },
  { id: 'carnac', name: 'Carnac OS' },
  { id: 'chipbox', name: 'Chipbox' },
  { id: 'choralroot', name: 'ChoralRoot' },
  { id: 'chord', name: 'fm1-chord' },
  { id: 'clipper', name: 'Clipper' },
  { id: 'coralflower', name: 'CoralFlower' },
  { id: 'cs1', name: 'CS-1' },
  { id: 'ctl', name: 'CTL-1' },
  { id: 'cutador', name: 'Cut-A-Dor' },
  { id: 'delrio', name: 'Del Rio' },
  { id: 'dinghy', name: 'Dinghy' },
  { id: 'drift', name: 'DRIFT' },
  { id: 'dub', name: 'DUB-1' },
  { id: 'duell', name: 'DUELL' },
  { id: 'emb', name: 'Evander\'s Music Box' },
  { id: 'etch', name: 'ETCH' },
  { id: 'fart', name: 'Fart Machine One' },
  { id: 'felucca8', name: 'Felucca 8 Patterns' },
  { id: 'fimba', name: 'FiMba-1' },
  { id: 'flyfish', name: 'Flyfish' },
  { id: 'fm106', name: 'FM-106' },
  { id: 'fm1dock', name: 'fm1-dock' },
  { id: 'fm1doom', name: 'FM-1 Doom' },
  { id: 'fm1gm', name: 'FM1-GM' },
  { id: 'fmel', name: 'FMEL-1' },
  { id: 'fmini', name: 'FMini-1' },
  { id: 'fomajam', name: 'FOMAJAM' },
  { id: 'fomni', name: 'FoMni' },
  { id: 'frasil', name: 'FRASIL' },
  { id: 'frodhes', name: 'Frodhes' },
  { id: 'fumi', name: 'FuMi-1' },
  { id: 'gammawave', name: 'Pocket GammaWave' },
  { id: 'ghoulbox', name: 'GHOULBOX' },
  { id: 'golana', name: 'Golana' },
  { id: 'golanadz', name: 'Golana DZ Edition' },
  { id: 'grimm', name: 'GR!MM' },
  { id: 'hera', name: 'HERA' },
  { id: 'hortator', name: 'Hortator' },
  { id: 'hyp1', name: 'HYP-1' },
  { id: 'jangada', name: 'Jangada' },
  { id: 'jiant', name: 'JIANT FM' },
  { id: 'kawa', name: 'KAWA' },
  { id: 'ketch', name: 'Ketch' },
  { id: 'loom', name: 'LOOM-8' },
  { id: 'maku', name: 'MAKU' },
  { id: 'mc1', name: 'MC-1' },
  { id: 'melodee', name: 'Melodee' },
  { id: 'min1', name: 'MIN-1' },
  { id: 'minitone', name: 'Mini-Tone' },
  { id: 'modelar', name: 'MODELAR' },
  { id: 'monk', name: 'MONK-1' },
  { id: 'morpheus', name: 'MORPHEUS' },
  { id: 'mutable', name: 'Mutable Dreams' },
  { id: 'mycelium', name: 'MYCELIUM' },
  { id: 'niagara', name: 'Niagara Drift' },
  { id: 'nmsfm', name: 'No Man Sky FM' },
  { id: 'noizdemons', name: 'NOIZ DEMONS' },
  { id: 'obervave', name: 'OberVave' },
  { id: 'opn1', name: 'OPN-1' },
  { id: 'orbit', name: 'ORBIT' },
  { id: 'pigeon', name: 'PIGEON' },
  { id: 'polly', name: 'Polly' },
  { id: 'purplemonkey', name: 'PurpleMonkey' },
  { id: 'quest', name: 'FM1 Quest' },
  { id: 'rainbow', name: 'Rainbow Mode' },
  { id: 'shineon', name: 'Shine On' },
  { id: 'sid', name: 'FM-1 SID' },
  { id: 'sid1', name: 'SID-1' },
  { id: 'sidou', name: 'SIDOU' },
  { id: 'skiff', name: 'Skiff' },
  { id: 'sloop', name: 'SLOOP' },
  { id: 'sloop-alg', name: 'SLOOP ALG' },
  { id: 'sloop-banks', name: 'SLOOP DX7 Banks' },
  { id: 'sloop-floyd', name: 'SLOOP Floyd FM' },
  { id: 'sloopdx', name: 'sloopDX' },
  { id: 'tessera', name: 'Tessera' },
  { id: 'tonitor', name: 'Tonitor' },
  { id: 'tribe', name: 'TRIBE' },
  { id: 'tuna', name: 'Tuna' },
  { id: 'unholy', name: 'Unholy Union' },
  { id: 'vector37', name: 'Vector37' },
  { id: 'waveloop', name: 'WaveLoop FM-1' },
  { id: 'winampfm', name: 'winampFM Synth' },
  { id: 'x0x', name: 'X0X' },
  { id: 'x0xrmx', name: 'X0X-RMX' },
  { id: 'zen', name: 'ZEN-1' },
  { id: 'zp12', name: 'zp12' },
]

// Self-hosted copy of the emulator build (public/fm1, see SYCORE.md there): same origin as the
// app, so the panel can feed it MIDI with postMessage and read its load figures.
export const FM1_LOCAL_URL = '/fm1/index.html'

/** Embed URL: only the device panel (`embed=1`), firmware preselected. */
export function fm1EmbedUrl(firmwareId: string): string {
  const q = new URLSearchParams({ fw: firmwareId, embed: '1' })
  return `${FM1_LOCAL_URL}?${q}`
}

// MIDI channels (0-based) a firmware's parts listen on, where known — from the emulator's own
// notes (public/fm1/main.js, MIDI_NOTES). More than one: a multi-timbral firmware. Anything else
// gets channel 1 shown; SY.CORE sends to it on the channel each app plays on.
const FM1_FIRMWARE_PARTS: Record<string, number[]> = {
  felucca: [0, 1, 2, 3],
  mvave: [1],
}

export function fm1Parts(firmwareId: string): number[] {
  return FM1_FIRMWARE_PARTS[firmwareId] ?? [0]
}
