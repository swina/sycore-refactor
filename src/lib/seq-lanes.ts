/**
 * seq-lanes.ts — the Sequencer's lanes (docs/plans/sequencer-lanes.md): Main (the Sequencer as it
 * always was), Bass and Arp. Each lane is a full Sequencer (its own engine instance, banks store,
 * MIDI source and channel); this file is what tells them apart.
 *
 * Main keeps every id it had (store `stepSequencer`, keys, events `seq-…` / `toggle-sequencer2`,
 * MIDI Learn `seq_…`, source SEQUENCER2); Bass and Arp get their own, suffixed.
 */
import { reactive, ref, watch } from 'vue'
import { MidiSource } from '@/types/midi'

export type SeqLane = 'main' | 'bass' | 'arp'
export const SEQ_LANES: readonly SeqLane[] = ['main', 'bass', 'arp']

export interface SeqLaneCfg {
  lane: SeqLane
  label: string
  /** MIDI Flow source of its notes / CCs */
  source: MidiSource
  /** window events' prefix: `${ev}-bank-select`, `${ev}-generate`, … */
  ev: string
  /** play / stop event (Play All, the Rig, MIDI Learn) */
  toggle: string
  /** MIDI Learn names' prefix: `${learn}_play`, `${learn}_bank_3`, … */
  learn: string
  /** Pinia store id */
  storeId: string
  /** suffix of its localStorage keys ('' for Main: the keys it always had) */
  keySuffix: string
  /** CLK SYS Worker-queue tag (a Stop cancels only its own queued notes) */
  workerTag: string
  /** the Rig row that drives it (rig-live.ts) */
  rigRow: 'seq' | 'bass' | 'arp'
  /** a new bank's style / octave */
  defaults: { selectedStyle: string; selectedOctave: number; octaveRange: number }
}

export const SEQ_LANE_CFG: Record<SeqLane, SeqLaneCfg> = {
  main: {
    lane: 'main', label: 'Main', source: MidiSource.SEQUENCER2, ev: 'seq', toggle: 'toggle-sequencer2', learn: 'seq',
    storeId: 'stepSequencer', keySuffix: '', workerTag: 'sequencer2', rigRow: 'seq',
    defaults: { selectedStyle: 'House', selectedOctave: 4, octaveRange: 0 },
  },
  bass: {
    lane: 'bass', label: 'Bass', source: MidiSource.SEQ_BASS, ev: 'seq-bass', toggle: 'toggle-seq-bass', learn: 'seqbass',
    storeId: 'stepSequencer-bass', keySuffix: '_BASS', workerTag: 'seq-bass', rigRow: 'bass',
    defaults: { selectedStyle: 'Acid', selectedOctave: 2, octaveRange: 0 },
  },
  arp: {
    lane: 'arp', label: 'Arp', source: MidiSource.SEQ_ARP, ev: 'seq-arp', toggle: 'toggle-seq-arp', learn: 'seqarp',
    storeId: 'stepSequencer-arp', keySuffix: '_ARP', workerTag: 'seq-arp', rigRow: 'arp',
    defaults: { selectedStyle: 'Arpeggio', selectedOctave: 4, octaveRange: 1 },
  },
}

/** Every lane's MIDI source (a lane never follows another lane's notes). */
export const SEQ_LANE_SOURCES: ReadonlySet<string> = new Set(SEQ_LANES.map(l => SEQ_LANE_CFG[l].source))

/** A lane's window event: laneEvent('bass', 'bank-select') → 'seq-bass-bank-select'. */
export const laneEvent = (lane: SeqLane, name: string) => `${SEQ_LANE_CFG[lane].ev}-${name}`

/** Each lane playing (its engine writes it; MIDI Learn's play toggles and the Rig read it). */
export const seqLanePlaying = reactive<Record<SeqLane, boolean>>({ main: false, bass: false, arp: false })
/** Each lane's bank queued for the end of its pattern (null = none), for the Rig's pads. */
export const seqLaneQueued = reactive<Record<SeqLane, number | null>>({ main: null, bass: null, arp: null })

/** The lane a MIDI Learn name belongs to and the name without its prefix ('seqbass_play' → bass, 'play'). */
export function parseLaneLearn(name: string): { lane: SeqLane; rest: string } | null {
  for (const lane of SEQ_LANES) {
    const p = `${SEQ_LANE_CFG[lane].learn}_`
    if (name.startsWith(p)) return { lane, rest: name.slice(p.length) }
  }
  return null
}

/** A lane's MIDI channel: 0 = the global channel (MIDI Flow's remaps apply), 1–16 = that channel as is. */
export const clampLaneChannel = (v: unknown): number => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.max(0, Math.min(16, n)) : 0
}

/** MIDI Learn names and labels of a lane: learnName('bass', 'steps') → 'seqbass_steps'; 'Seq Bass: Steps'. */
export const learnName = (lane: SeqLane, name: string) => `${SEQ_LANE_CFG[lane].learn}_${name}`
export const learnLabel = (lane: SeqLane, label: string) => `${lane === 'main' ? 'Sequencer' : `Seq ${SEQ_LANE_CFG[lane].label}`}: ${label}`

// The lane the Sequencer panel shows (its tabs), saved per browser.
const ACTIVE_KEY = 'SYCORE_SEQ_ACTIVE_LANE'
const readActive = (): SeqLane => {
  try { const v = localStorage.getItem(ACTIVE_KEY); return (SEQ_LANES as readonly string[]).includes(v ?? '') ? (v as SeqLane) : 'main' } catch { return 'main' }
}
export const seqActiveLane = ref<SeqLane>(readActive())
watch(seqActiveLane, v => { try { localStorage.setItem(ACTIVE_KEY, v) } catch {} })
/** Tests: re-read from storage. */
export function reloadSeqActiveLane() { seqActiveLane.value = readActive() }
