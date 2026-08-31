// FX chain data shapes -- ported from Xynchrony's `src/core/audio/types.ts`
// (see docs/plans/Sycore-DSP-Integration-Feasibility.md, Phase 2). Data
// shapes only; the actual Tone.js node construction (EffectChain,
// buildAlgorithmNode) lives in `effects.ts`, which imports these rather than
// the other way around.
//
// Real Emulator X3 has 16 algorithms (Xynchrony's source manual); Xynchrony
// itself implements 6, and this is a straight port of that same 6.
export const EFFECT_ALGORITHMS = ['reverb', 'delay', 'chorus', 'eq4', 'compressor', 'phaser'] as const
export type EffectAlgorithm = (typeof EFFECT_ALGORITHMS)[number]

// One instance of an effect algorithm, placed on an FX patch canvas.
// Deleting a node removes it from `FxChain.nodes` entirely.
export interface FxNode {
  id: string
  algorithm: EffectAlgorithm
  params: Record<string, number>
  wetDry: number // 0-100, this node's own dry/wet mix (default 100 = fully wet)
  // Bypasses this node's processing entirely (fully dry passthrough) without
  // touching its cables or its `wetDry` value. Optional/absent = false (not
  // bypassed) -- a freshly added node is audible immediately.
  bypass?: boolean
  position: { x: number; y: number } // canvas layout, persisted with the chain
}

// A cable: `from`/`to` are FxNode ids, or the literal 'input'/'output'
// pseudo-node ids representing the chain's own dry signal in / summed wet
// bus out. Multiple edges into one node's `to` sum (Web Audio fan-in);
// multiple edges out of one node's `from` fan out (parallel branches).
export interface FxEdge {
  id: string
  from: string
  to: string
}

export interface FxChain {
  nodes: FxNode[]
  edges: FxEdge[]
  wetDry: number // 0-100, overall chain mix: dry input vs. the summed 'output' bus
  // dB, capped at 0 (unity) -- never a boost, only attenuation. Applied
  // between the chain's Input jack and whatever's cabled from it (i.e. the
  // wet/processing path only, not the dry path the overall Mix above blends
  // against) -- see `effects.ts`'s EffectChain. Read defensively (`?? 0`)
  // wherever consumed since a chain saved before this field existed won't
  // have it at runtime despite the type.
  inputGainDb: number
  // Canvas position of the Input/Output pseudo-nodes -- UI layout only, the
  // engine never reads these (routing is purely topological via `edges`).
  inputPosition?: { x: number; y: number }
  outputPosition?: { x: number; y: number }
}

// Modulation Matrix data shapes -- ported from Xynchrony's `ModMatrixSlot`
// (see docs/plans/Sycore-DSP-Integration-Feasibility.md, Phase 5), but with
// a deliberately small source/destination catalog: Xynchrony's full set
// (patch glide, sample-start, key tracking, per-voice envelopes, ...)
// doesn't apply to sycore's shared, persistent-per-pad signal chain --
// only what a drum track / sampler pad actually has to modulate. `velocity`
// is a one-time source (resolved fresh at each trigger, see modMatrix.ts's
// applyVelocityModulation); `lfo1`/`lfo2` are live, continuous sources
// mirroring `useLfoStore`'s existing two LFOs.
export const MOD_SOURCES = ['velocity', 'lfo1', 'lfo2'] as const
export type ModSource = (typeof MOD_SOURCES)[number]

export const MOD_DESTINATIONS = ['filterFreq', 'filterQ', 'ampVolume', 'ampPan', 'wetDryMix'] as const
export type ModDestination = (typeof MOD_DESTINATIONS)[number]

export interface ModMatrixSlot {
  id: string
  source: ModSource
  destination: ModDestination
  amountPct: number // -100..100
}
