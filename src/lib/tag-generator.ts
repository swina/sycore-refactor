type ParamRange = [number, number];
type TagParams = Partial<Record<string, ParamRange>>;

const ALL_FIELDS = [
  'attack', 'decay', 'sustain', 'release',
  'cutoff', 'res', 'envFilt',
  'lfoFilt', 'lfoRate', 'lfoMod', 'lfoWave',
  'oscSaw', 'oscSq', 'oscSub', 'oscNoise',
  'pwWidth', 'pwmSrc',
  'chorusMode', 'reverbType', 'reverb', 'delayLvl', 'delayTime',
  'drawMode', 'drawMultiply',
  'oscLFO', 'oscChopOvertone', 'oscChopComb',
  'btnSync', 'btnKeyTrig', 'polyMode',
] as const;

// Neutral ranges used when no tag covers a parameter
const NEUTRAL: Record<string, ParamRange> = {
  attack:         [20,  60],  decay:         [40,  90],
  sustain:        [60, 100],  release:       [30,  70],
  cutoff:         [60, 100],  res:           [10,  30],
  envFilt:        [30,  70],  lfoFilt:       [0,   15],
  lfoRate:        [10,  40],  lfoMod:        [0,   20],
  lfoWave:        [0,    2],  oscSaw:        [70, 127],
  oscSq:          [0,   40],  oscSub:        [20,  60],
  oscNoise:       [0,   10],  pwWidth:       [40,  80],
  pwmSrc:         [0,   30],  chorusMode:    [0,    2],
  reverbType:     [0,  127],  reverb:        [20,  60],
  delayLvl:       [0,   40],  delayTime:     [30,  80],
  drawMode:       [0,    1],  drawMultiply:  [0,   10],
  oscLFO:         [0,   10],  oscChopOvertone:[0,  30],
  oscChopComb:    [0,   30],  btnSync:       [0,    1],
  btnKeyTrig:     [0,    1],  polyMode:      [0,    2],
};

const TAG_PARAMS: Record<string, TagParams> = {
  // --- Timbre ---
  bright:     { cutoff: [85, 127], res: [20, 60],  envFilt: [60, 110] },
  dark:       { cutoff: [10,  50], res: [0,  25],  envFilt: [15,  55] },
  warm:       { cutoff: [40,  75], res: [0,  20],  oscSaw: [90, 127], oscSub: [40,  80] },
  cold:       { cutoff: [70, 110], res: [25,  55], oscSq: [60, 127] },
  harsh:      { res: [70, 110],   cutoff: [70, 127], envFilt: [80, 127] },
  soft:       { res: [0,   15],   cutoff: [30,  65], envFilt: [20,  55], attack: [20, 70] },
  thin:       { oscSub: [0,  20], oscSaw: [60, 100], chorusMode: [0, 1] },
  thick:      { oscSub: [70, 127], oscSaw: [90, 127], chorusMode: [1, 3] },
  metallic:   { res: [60, 100],   oscNoise: [20,  50], drawMode: [1, 2] },
  noisy:      { oscNoise: [60, 127], res: [30,  70] },

  // --- Envelope ---
  pluck:      { attack: [0,   5],  decay: [20,  60], sustain: [0,   20], release: [10,  30] },
  pad:        { attack: [60, 110], decay: [80, 127], sustain: [80, 127], release: [70, 120],
                chorusMode: [1, 3], reverb: [70, 127] },
  stab:       { attack: [0,  10],  decay: [20,  50], sustain: [0,   40], release: [5,   30] },
  drone:      { attack: [80, 127], decay: [100, 127], sustain: [100, 127], release: [90, 127] },
  percussive: { attack: [0,   5],  decay: [30,  80], sustain: [0,   20], release: [10,  40] },
  slow:       { attack: [60, 100], release: [60, 100] },
  fast:       { attack: [0,  15],  decay: [20,  60], release: [10,  40] },

  // --- Oscillator character ---
  bass:       { oscSub: [80, 127], cutoff: [30,  70], polyMode: [0, 1] },
  sub:        { oscSub: [100, 127], cutoff: [20,  50], oscSaw: [60, 100] },
  lead:       { attack: [0,  20],  cutoff: [60, 110], oscSaw: [80, 127], polyMode: [0, 1] },
  sawtooth:   { oscSaw: [100, 127], oscSq: [0,   20] },
  square:     { oscSq: [100, 127], oscSaw: [0,   20], pwWidth: [60, 100] },
  pulse:      { oscSq: [80, 127],  pwWidth: [10,  40] },

  // --- Modulation ---
  vibrato:    { oscLFO: [30,  70], lfoRate: [40,  80], lfoWave: [0, 1] },
  tremolo:    { lfoMod: [50,  90], lfoRate: [40,  80], lfoWave: [0, 1] },
  wobble:     { lfoFilt: [60, 100], lfoRate: [20,  60] },
  modulated:  { lfoMod: [40,  80], lfoFilt: [30,  60], lfoRate: [20, 70] },
  static:     { lfoMod: [0,   10], lfoFilt: [0,   10], lfoRate: [0,  20] },

  // --- Effects ---
  reverb:     { reverb: [80, 127] },
  dry:        { reverb: [0,   20], delayLvl: [0,  20] },
  echo:       { delayLvl: [60, 100], delayTime: [40,  90] },
  spacious:   { reverb: [70, 127], delayLvl: [40,  80], chorusMode: [1, 3] },
  tight:      { reverb: [0,   30], delayLvl: [0,  30] },
  chorus:     { chorusMode: [1, 3] },

  // --- Character ---
  aggressive: { res: [70, 110], cutoff: [70, 120], envFilt: [80, 127], attack: [0, 20] },
  gentle:     { res: [0,   20], cutoff: [40,  70], envFilt: [30,  60], attack: [30, 70] },
  punchy:     { attack: [0,   5], decay: [30,  70], envFilt: [60, 100] },
  smooth:     { res: [0,   15], attack: [20,  50], chorusMode: [1, 2] },
  growl:      { res: [60,  90], lfoFilt: [40,  70], lfoRate: [20, 50] },
  glassy:     { oscSaw: [60, 100], res: [20,  50], reverb: [50,  90], chorusMode: [1, 2] },
  fuzzy:      { oscNoise: [30, 70], res: [50,  80] },
  electric:   { oscSaw: [80, 127], envFilt: [50,  90], lfoMod: [20, 50] },
  organic:    { oscNoise: [10, 30], lfoMod: [10,  30], lfoRate: [5,  25], reverb: [50, 80] },
  digital:    { oscSq: [80, 127],  cutoff: [80, 127], res: [40,  70] },
  retro:      { oscSaw: [70, 127], chorusMode: [0, 1], reverb: [20,  60], drawMode: [0, 1] },
  poly:       { polyMode: [2, 3],  chorusMode: [1, 3], reverb: [50,  90] },
  mono:       { polyMode: [0, 1],  btnKeyTrig: [0, 1] },

  // --- S-1 specific ---
  acid:       { res: [80, 127], cutoff: [50, 90], envFilt: [80, 127],
                decay: [20, 60], oscSaw: [90, 127], attack: [0, 10] },
  filter:     { cutoff: [40, 90], res: [30, 80], envFilt: [60, 110] },
  lfo:        { lfoRate: [30, 100], lfoMod: [40, 90] },
  arp:        { btnSync: [1, 1], polyMode: [0, 0] },
  chop:       { oscChopOvertone: [40, 100], oscChopComb: [40, 100] },
};

function blendRanges(tags: string[]): Record<string, ParamRange> {
  const result: Record<string, ParamRange> = { ...NEUTRAL };
  for (const field of ALL_FIELDS) {
    const covering = tags.filter(t => TAG_PARAMS[t]?.[field] !== undefined);
    if (covering.length === 0) continue;
    const mins = covering.map(t => TAG_PARAMS[t][field]![0]);
    const maxs = covering.map(t => TAG_PARAMS[t][field]![1]);
    result[field] = [
      Math.round(mins.reduce((a, b) => a + b, 0) / mins.length),
      Math.round(maxs.reduce((a, b) => a + b, 0) / maxs.length),
    ];
  }
  return result;
}

function sampleRange(range: ParamRange, bias = 0): number {
  const [lo, hi] = range;
  const v = lo + Math.floor(Math.random() * (hi - lo + 1)) + bias;
  return Math.max(0, Math.min(127, v));
}

function buildPatchNotes(matched: string[], unmatched: string[], params: Record<string, number>): string {
  const tagLine = matched.length > 0
    ? `Tags: ${matched.join(', ')}.`
    : 'No specific tags matched — using neutral defaults.';
  const unknownLine = unmatched.length > 0
    ? ` (Unrecognized: ${unmatched.join(', ')}.)`
    : '';
  const cutoffDesc = params.cutoff > 90 ? 'open filter' : params.cutoff < 40 ? 'closed filter' : 'medium filter';
  const envDesc = params.attack > 60 ? 'slow attack' : params.attack < 10 ? 'instant attack' : 'medium attack';
  const modDesc = params.lfoMod > 50 || params.lfoFilt > 50 ? ', rich LFO modulation' : '';
  const fxDesc = params.reverb > 80 ? ', heavy reverb' : params.reverb < 20 ? ', dry signal' : '';
  return `[Tag-based] ${tagLine}${unknownLine} Synthesized with ${cutoffDesc}, ${envDesc}${modDesc}${fxDesc}. Generated without AI engine.`;
}

export function generateFromTags(input: string): Array<Record<string, number>> {
  const rawTags = input.toLowerCase().split(/[\s,;/|]+/).map(t => t.trim()).filter(Boolean);
  const matched = rawTags.filter(t => t in TAG_PARAMS);
  const unmatched = rawTags.filter(t => t && !(t in TAG_PARAMS));
  const effectiveTags = matched.length > 0 ? matched : ['lead', 'warm'];

  const ranges = blendRanges(effectiveTags);

  const buildVariant = (biasMag = 0): Record<string, number> => {
    const params: Record<string, number> = {};
    for (const field of ALL_FIELDS) {
      const bias = biasMag > 0 ? (Math.random() > 0.5 ? biasMag : -biasMag) : 0;
      params[field] = sampleRange(ranges[field], Math.round(bias));
    }
    params['patchNotes' as any] = buildPatchNotes(matched, unmatched, params) as any;
    return params;
  };

  return [buildVariant(0), buildVariant(8)];
}

export const KNOWN_TAGS = Object.keys(TAG_PARAMS);
