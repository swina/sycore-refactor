// FX algorithm catalog + the EffectChain node-graph wrapper -- ported from
// Xynchrony's `src/core/audio/effects.ts` (see
// docs/plans/Sycore-DSP-Integration-Feasibility.md, Phase 2). A chain is a
// free-form graph of FxNodes wired by FxEdges (Input -> node(s) -> Output,
// parallel branches allowed), each node with its own dry/wet mix, plus one
// overall chain-level mix.
//
// Each algorithm maps to a Tone.js node, not a 1:1 port of any hardware
// manual's parameter set.
import * as Tone from 'tone'
import { EFFECT_ALGORITHMS, type EffectAlgorithm, type FxNode, type FxEdge, type FxChain } from './types'

export { EFFECT_ALGORITHMS }
export type { EffectAlgorithm, FxNode, FxEdge, FxChain }

/** `crypto.randomUUID()` with a fallback for contexts that lack it. */
function newId(prefix = 'id'): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// Default canvas position of the Input/Output pseudo-nodes.
export const DEFAULT_INPUT_POSITION = { x: 16, y: 16 }
export const DEFAULT_OUTPUT_POSITION = { x: 820, y: 16 }

/** A brand-new chain starts as a straight cable from Input to Output (fully
 * dry passthrough, audible immediately) rather than an empty, disconnected
 * graph -- the user reroutes/replaces that cable as they patch nodes in. */
export function blankFxChain(): FxChain {
  return {
    nodes: [], edges: [{ id: newId('fxedge'), from: 'input', to: 'output' }], wetDry: 100,
    inputGainDb: 0, inputPosition: { ...DEFAULT_INPUT_POSITION }, outputPosition: { ...DEFAULT_OUTPUT_POSITION },
  }
}

export function blankFxNode(algorithm: EffectAlgorithm, position: { x: number; y: number }): FxNode {
  return { id: newId('fxnode'), algorithm, params: paramsWithDefaults(algorithm, {}), wetDry: 100, position }
}

export interface EffectParamSchema {
  key: string
  label: string
  min: number
  max: number
  step: number
  default: number
  formatValue: (v: number) => string
}

const fmtPct = (v: number) => `${Math.round(v)}%`
const fmtMs = (v: number) => `${Math.round(v)}ms`
const fmtSec = (v: number) => (v >= 1 ? `${v.toFixed(2)}s` : `${Math.round(v * 1000)}ms`)
const fmtHz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}Hz`)
const fmtDb = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}dB`
const fmtPlain = (v: number) => v.toFixed(2)

export const EFFECT_PARAM_SCHEMAS: Record<EffectAlgorithm, EffectParamSchema[]> = {
  reverb: [
    { key: 'roomSize', label: 'Room Size', min: 0, max: 0.97, step: 0.01, default: 0.7, formatValue: fmtPct },
    { key: 'dampening', label: 'Dampening', min: 500, max: 15000, step: 100, default: 3000, formatValue: fmtHz },
  ],
  delay: [
    { key: 'delayTime', label: 'Delay', min: 0.01, max: 1, step: 0.01, default: 0.25, formatValue: fmtSec },
    { key: 'feedback', label: 'Feedback', min: 0, max: 0.9, step: 0.01, default: 0.3, formatValue: fmtPct },
  ],
  chorus: [
    { key: 'frequency', label: 'Rate', min: 0.01, max: 10, step: 0.01, default: 1.5, formatValue: (v) => `${v.toFixed(2)}Hz` },
    { key: 'delayTime', label: 'Delay', min: 2, max: 20, step: 0.5, default: 3.5, formatValue: fmtMs },
    { key: 'depth', label: 'Depth', min: 0, max: 1, step: 0.01, default: 0.7, formatValue: fmtPct },
    { key: 'feedback', label: 'Feedback', min: 0, max: 0.9, step: 0.01, default: 0, formatValue: fmtPct },
  ],
  eq4: [
    { key: 'lowFreq', label: 'Low Freq', min: 40, max: 800, step: 10, default: 200, formatValue: fmtHz },
    { key: 'lowGain', label: 'Low Gain', min: -24, max: 15, step: 0.5, default: 0, formatValue: fmtDb },
    { key: 'loMidFreq', label: 'Lo-Mid Freq', min: 200, max: 3000, step: 10, default: 600, formatValue: fmtHz },
    { key: 'loMidGain', label: 'Lo-Mid Gain', min: -24, max: 15, step: 0.5, default: 0, formatValue: fmtDb },
    { key: 'loMidQ', label: 'Lo-Mid Q', min: 0.1, max: 10, step: 0.1, default: 1, formatValue: fmtPlain },
    { key: 'hiMidFreq', label: 'Hi-Mid Freq', min: 1000, max: 8000, step: 50, default: 2500, formatValue: fmtHz },
    { key: 'hiMidGain', label: 'Hi-Mid Gain', min: -24, max: 15, step: 0.5, default: 0, formatValue: fmtDb },
    { key: 'hiMidQ', label: 'Hi-Mid Q', min: 0.1, max: 10, step: 0.1, default: 1, formatValue: fmtPlain },
    { key: 'highFreq', label: 'High Freq', min: 4000, max: 16000, step: 100, default: 8000, formatValue: fmtHz },
    { key: 'highGain', label: 'High Gain', min: -24, max: 15, step: 0.5, default: 0, formatValue: fmtDb },
  ],
  compressor: [
    { key: 'threshold', label: 'Threshold', min: -50, max: 0, step: 1, default: -24, formatValue: fmtDb },
    { key: 'ratio', label: 'Ratio', min: 1, max: 20, step: 0.5, default: 4, formatValue: (v) => `${v}:1` },
    { key: 'attack', label: 'Attack', min: 0.001, max: 0.2, step: 0.001, default: 0.01, formatValue: fmtSec },
    { key: 'release', label: 'Release', min: 0.02, max: 1, step: 0.01, default: 0.2, formatValue: fmtSec },
    { key: 'outputGain', label: 'Output Gain', min: -24, max: 12, step: 0.5, default: 0, formatValue: fmtDb },
  ],
  phaser: [
    { key: 'frequency', label: 'Rate', min: 0.01, max: 10, step: 0.01, default: 0.5, formatValue: (v) => `${v.toFixed(2)}Hz` },
    { key: 'octaves', label: 'Depth', min: 0.5, max: 8, step: 0.1, default: 3, formatValue: fmtPlain },
    { key: 'stages', label: 'Stages', min: 2, max: 12, step: 2, default: 4, formatValue: (v) => `${Math.round(v)}` },
    { key: 'Q', label: 'Q', min: 0.1, max: 20, step: 0.1, default: 10, formatValue: fmtPlain },
    { key: 'baseFrequency', label: 'Base Freq', min: 20, max: 2000, step: 10, default: 350, formatValue: fmtHz },
  ],
}

/** Fills in any params missing from a node with the schema's defaults --
 * used both when constructing a Tone node and when the UI first shows a
 * freshly-added algorithm's dials. */
export function paramsWithDefaults(algorithm: EffectAlgorithm, params: Record<string, number>): Record<string, number> {
  const filled: Record<string, number> = { ...params }
  for (const schema of EFFECT_PARAM_SCHEMAS[algorithm]) {
    if (!(schema.key in filled)) filled[schema.key] = schema.default
  }
  return filled
}

// What an algorithm needs from any built node, regardless of whether it's
// one Tone node (reverb/delay/chorus/phaser) or several chained together
// internally (compressor+makeup gain, the 4-filter EQ) -- `target` is
// where incoming audio connects, `tail` is what the chain continues from.
interface BuiltAlgorithm {
  target: Tone.ToneAudioNode
  tail: Tone.ToneAudioNode
  dispose(): void
}

function buildAlgorithmNode(algorithm: EffectAlgorithm, params: Record<string, number>): BuiltAlgorithm {
  const p = paramsWithDefaults(algorithm, params)
  switch (algorithm) {
    case 'reverb': {
      const node = new Tone.Freeverb({ roomSize: p.roomSize, dampening: p.dampening })
      return { target: node, tail: node, dispose: () => node.dispose() }
    }
    case 'delay': {
      const node = new Tone.FeedbackDelay({ delayTime: p.delayTime, feedback: p.feedback })
      return { target: node, tail: node, dispose: () => node.dispose() }
    }
    case 'chorus': {
      const node = new Tone.Chorus({ frequency: p.frequency, delayTime: p.delayTime, depth: p.depth, feedback: p.feedback }).start()
      return { target: node, tail: node, dispose: () => node.dispose() }
    }
    case 'phaser': {
      const node = new Tone.Phaser({ frequency: p.frequency, octaves: p.octaves, stages: Math.round(p.stages), Q: p.Q, baseFrequency: p.baseFrequency })
      return { target: node, tail: node, dispose: () => node.dispose() }
    }
    case 'compressor': {
      const comp = new Tone.Compressor({ threshold: p.threshold, ratio: p.ratio, attack: p.attack, release: p.release })
      const makeup = new Tone.Gain(Tone.dbToGain(p.outputGain))
      comp.connect(makeup)
      return { target: comp, tail: makeup, dispose: () => { comp.dispose(); makeup.dispose() } }
    }
    case 'eq4': {
      const eq = new FourBandEq(p)
      return { target: eq.input, tail: eq.output, dispose: () => eq.dispose() }
    }
  }
}

/** 4-band EQ: lowshelf -> peaking -> peaking -> highshelf in series. */
class FourBandEq {
  private low: Tone.Filter
  private loMid: Tone.Filter
  private hiMid: Tone.Filter
  private high: Tone.Filter
  readonly input: Tone.Filter
  readonly output: Tone.Filter

  constructor(p: Record<string, number>) {
    this.low = new Tone.Filter({ type: 'lowshelf', frequency: p.lowFreq, gain: p.lowGain })
    this.loMid = new Tone.Filter({ type: 'peaking', frequency: p.loMidFreq, gain: p.loMidGain, Q: p.loMidQ })
    this.hiMid = new Tone.Filter({ type: 'peaking', frequency: p.hiMidFreq, gain: p.hiMidGain, Q: p.hiMidQ })
    this.high = new Tone.Filter({ type: 'highshelf', frequency: p.highFreq, gain: p.highGain })
    this.low.chain(this.loMid, this.hiMid, this.high)
    this.input = this.low
    this.output = this.high
  }

  dispose(): void {
    this.low.dispose()
    this.loMid.dispose()
    this.hiMid.dispose()
    this.high.dispose()
  }
}

// Legacy pre-patch-editor shape, kept only so `normalizeFxChain()` stays a
// safe no-op passthrough for the current shape (sycore has never produced
// this shape itself -- ported defensively, matching Xynchrony's own guard).
interface LegacyEffectSlot {
  algorithm: EffectAlgorithm | 'off'
  params: Record<string, number>
}
interface LegacyEffectChainConfig {
  slotA: LegacyEffectSlot
  slotB: LegacyEffectSlot
  wetDry: number
}

function isLegacyShape(config: FxChain | LegacyEffectChainConfig): config is LegacyEffectChainConfig {
  return !('nodes' in config) || !('edges' in config)
}

/** Converts the legacy fixed-2-slot shape into an equivalent straight-line
 * 2-node graph (input -> slotA? -> slotB? -> output). No-op (returns as-is)
 * for anything already in the current shape -- which is everything sycore
 * itself ever produces. Never mutates its input. */
export function normalizeFxChain(config: FxChain | LegacyEffectChainConfig): FxChain {
  if (!isLegacyShape(config)) return config
  const nodes: FxNode[] = []
  const edges: FxEdge[] = []
  let prev = 'input'
  let x = 0
  for (const slot of [config.slotA, config.slotB]) {
    if (!slot || slot.algorithm === 'off') continue
    const node: FxNode = { id: newId('fxnode'), algorithm: slot.algorithm, params: slot.params, wetDry: 100, position: { x, y: 0 } }
    nodes.push(node)
    edges.push({ id: newId('fxedge'), from: prev, to: node.id })
    prev = node.id
    x += 220
  }
  edges.push({ id: newId('fxedge'), from: prev, to: 'output' })
  return {
    nodes, edges, wetDry: config.wetDry, inputGainDb: 0,
    inputPosition: { ...DEFAULT_INPUT_POSITION }, outputPosition: { ...DEFAULT_OUTPUT_POSITION },
  }
}

/** Cycle check over the graph including the 'input'/'output' pseudo-nodes
 * -- a feedback loop needs real audio-rate feedback design, so v1 rejects
 * it outright rather than building an unstable graph. Exported so a future
 * patch editor UI can reject a cycle-forming cable at edge-creation time,
 * not just have `rebuild()` silently fall back to dry passthrough after
 * the fact. */
export function hasCycle(nodes: FxNode[], edges: FxEdge[]): boolean {
  const ids = new Set<string>(['input', 'output', ...nodes.map((n) => n.id)])
  const adj = new Map<string, string[]>()
  for (const id of ids) adj.set(id, [])
  for (const e of edges) {
    if (ids.has(e.from) && ids.has(e.to)) adj.get(e.from)!.push(e.to)
  }
  const UNVISITED = 0, VISITING = 1, DONE = 2
  const state = new Map<string, number>()
  for (const id of ids) state.set(id, UNVISITED)

  function visit(id: string): boolean {
    state.set(id, VISITING)
    for (const next of adj.get(id) ?? []) {
      const s = state.get(next)
      if (s === VISITING) return true
      if (s === UNVISITED && visit(next)) return true
    }
    state.set(id, DONE)
    return false
  }

  for (const id of ids) {
    if (state.get(id) === UNVISITED && visit(id)) return true
  }
  return false
}

/** One node's own dry/wet mix stage: `stageIn` feeds both a dry tap
 * (straight to the node's own CrossFade) and a wet tap (through the
 * algorithm), `node.wetDry/100` blends them into `stageOut`. */
interface Stage {
  input: Tone.Gain
  output: Tone.Gain
  dispose(): void
}

function buildStage(node: FxNode): Stage {
  // Bypassed: skip the algorithm and the dry/wet crossfade entirely -- a
  // single Gain node stands in for the whole stage, `wetDry` untouched for
  // whenever bypass comes back off.
  if (node.bypass) {
    const pass = new Tone.Gain()
    return { input: pass, output: pass, dispose: () => pass.dispose() }
  }

  const input = new Tone.Gain()
  const dryTap = new Tone.Gain()
  const wetTap = new Tone.Gain()
  const output = new Tone.Gain()
  const cross = new Tone.CrossFade(Math.min(1, Math.max(0, node.wetDry / 100)))
  const built = buildAlgorithmNode(node.algorithm, node.params)

  input.connect(dryTap)
  input.connect(wetTap)
  dryTap.connect(cross.a)
  wetTap.connect(built.target)
  built.tail.connect(cross.b)
  cross.connect(output)

  return {
    input,
    output,
    dispose: () => {
      built.dispose()
      input.dispose()
      dryTap.dispose()
      wetTap.dispose()
      cross.dispose()
      output.dispose()
    },
  }
}

/** The chain-level insert node: input -> [dry tap] -> CrossFade.a
 *                                       \-> [wet tap] -> (per-node graph) -> outputBus -> CrossFade.b
 *            CrossFade.fade = wetDry/100 -> output
 * One instance per pad (drum track or sampler pad) -- see
 * docs/plans/Sycore-DSP-Integration-Feasibility.md's per-pad-vs-shared-bus
 * note. `rebuild()` fully tears down and reconstructs the node graph on any
 * config change -- an editing-time operation, not a hot path, so simplicity
 * wins over incremental per-node patching. The chain-level dry path and the
 * wetTap/outputBus endpoints are wired once in the constructor and never
 * torn down -- only the per-node stages and the edges between them are
 * rebuilt. */
export class EffectChain {
  readonly input: Tone.Gain
  readonly output: Tone.Gain
  private crossFade: Tone.CrossFade
  private dryTap: Tone.Gain
  private wetTap: Tone.Gain
  private outputBus: Tone.Gain
  // FX Input Gain (FxChain.inputGainDb, capped at 0dB/unity): sits between
  // `input` and `wetTap`, so it attenuates only what's cabled from the
  // Input jack (the wet/processing path) -- the dry path (dryTap ->
  // crossFade.a) bypasses it entirely, same as it bypasses every FX node.
  private inputGainNode: Tone.Gain
  private stages = new Map<string, Stage>()

  /** For the Mod Matrix's `wetDryMix` destination (modMatrix.ts) -- live
   * modulation connects here, additive on top of whatever rebuild() last
   * set from config.wetDry. Untouched by the per-node mixing above. */
  get wetDryFade(): Tone.Signal<'normalRange'> {
    return this.crossFade.fade
  }

  constructor() {
    this.input = new Tone.Gain()
    this.output = new Tone.Gain()
    this.crossFade = new Tone.CrossFade(0)
    this.dryTap = new Tone.Gain()
    this.wetTap = new Tone.Gain()
    this.outputBus = new Tone.Gain()
    this.inputGainNode = new Tone.Gain()
    this.input.connect(this.dryTap)
    this.input.connect(this.inputGainNode)
    this.inputGainNode.connect(this.wetTap)
    this.dryTap.connect(this.crossFade.a)
    this.outputBus.connect(this.crossFade.b)
    this.wetTap.connect(this.outputBus) // straight through until rebuild() inserts nodes
    this.crossFade.connect(this.output)
  }

  rebuild(rawConfig: FxChain): void {
    const config = normalizeFxChain(rawConfig)
    this.inputGainNode.gain.value = Tone.dbToGain(Math.min(0, config.inputGainDb ?? 0))

    for (const stage of this.stages.values()) stage.dispose()
    this.stages.clear()
    this.wetTap.disconnect() // safe/idempotent even with no connections

    if (hasCycle(config.nodes, config.edges)) {
      console.warn('[EffectChain] FX graph has a cycle -- skipping rebuild, chain stays fully dry')
      this.wetTap.connect(this.outputBus)
      this.crossFade.fade.value = Math.min(1, Math.max(0, config.wetDry / 100))
      return
    }

    for (const node of config.nodes) {
      this.stages.set(node.id, buildStage(node))
    }

    const resolveOut = (id: string): Tone.Gain | undefined => (id === 'input' ? this.wetTap : this.stages.get(id)?.output)
    const resolveIn = (id: string): Tone.Gain | undefined => (id === 'output' ? this.outputBus : this.stages.get(id)?.input)
    for (const edge of config.edges) {
      const from = resolveOut(edge.from)
      const to = resolveIn(edge.to)
      if (from && to) from.connect(to)
    }

    this.crossFade.fade.value = Math.min(1, Math.max(0, config.wetDry / 100))
  }

  dispose(): void {
    for (const stage of this.stages.values()) stage.dispose()
    this.input.dispose()
    this.output.dispose()
    this.crossFade.dispose()
    this.dryTap.dispose()
    this.wetTap.dispose()
    this.outputBus.dispose()
    this.inputGainNode.dispose()
  }
}
