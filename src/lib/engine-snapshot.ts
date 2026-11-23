/**
 * engine-snapshot.ts — the three engines' material, taken together (plan phase 6a / SG4):
 *   - Chord Prog: slots A–H, chain, the slot open, key (selectedKey / keyMode), per-slot tempo and presets;
 *   - Drum Machine: sequences A–H (with their tracks' sounds), the basslines, the sequence open, chain on, swing;
 *   - Sequencer: every lane (Main, Bass, Arp) — banks A–H, chain, the bank open;
 *   - the tempo.
 * A session and a song with its own material are both one of these. Apply only with the apps
 * stopped (a slot playing would change under the notes).
 */
import { useChordProgStore } from '@/stores/useChordProgStore'
import { useDrumMachineStore } from '@/stores/useDrumMachineStore'
import { useSeqLaneStore } from '@/stores/useStepSequencerStore'
import { useArpStore } from '@/stores/useArpStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { SEQ_LANES, laneEvent, type SeqLane } from '@/lib/seq-lanes'

export interface EngineSnapshot {
  v: 1
  takenAt: string
  chord: {
    slots: unknown[]; chain: number[]; chainEnabled: boolean; activeSlotIndex: number
    selectedKey: number; keyMode: unknown; slotBpm: Record<number, number | null>; slotPresets: Record<number, unknown>
  }
  drum: { sequences: Record<string, unknown>; basslineSequences: Record<string, unknown>; activeSequence: string; chainEnabled: boolean; swing: number }
  lanes: Partial<Record<SeqLane, { banks: unknown[]; chain: unknown; chainEnabled: boolean; activeBankIndex: number }>>
  bpm: number
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v ?? null))

export function captureEngines(): EngineSnapshot {
  const cp = useChordProgStore()
  const dm = useDrumMachineStore()
  cp.slotSave(cp.activeSlotIndex) // the slot being edited is part of it
  return {
    v: 1,
    takenAt: new Date().toISOString(),
    chord: {
      slots: clone(cp.slots), chain: [...cp.chain], chainEnabled: cp.chainEnabled, activeSlotIndex: cp.activeSlotIndex,
      selectedKey: cp.selectedKey, keyMode: cp.keyMode ?? null, slotBpm: clone(cp.slotBpm), slotPresets: clone(cp.slotPresets),
    },
    drum: {
      sequences: clone(dm.sequences), basslineSequences: clone(dm.basslineSequences),
      activeSequence: dm.activeSequence, chainEnabled: dm.chainEnabled, swing: dm.swing,
    },
    lanes: Object.fromEntries(SEQ_LANES.map(l => [l, useSeqLaneStore(l).captureAllBanks()])),
    bpm: useArpStore().arpBpm,
  }
}

/** Puts a snapshot into the apps (stopped). Parts missing from it are left as they are. */
export function applyEngines(s: EngineSnapshot): void {
  if (!s || s.v !== 1) return
  const cp = useChordProgStore()
  const dm = useDrumMachineStore()
  if (s.chord && Array.isArray(s.chord.slots) && s.chord.slots.length) {
    cp.slots = clone(s.chord.slots) as any
    cp.persistSlots()
    if (Array.isArray(s.chord.chain) && s.chord.chain.length === cp.chain.length) { cp.chain = [...s.chord.chain]; cp.persistChain() }
    cp.chainEnabled = !!s.chord.chainEnabled
    cp.slotBpm = clone(s.chord.slotBpm ?? {})
    cp.slotPresets = clone(s.chord.slotPresets ?? {}) as any
    cp.slotLoad(s.chord.activeSlotIndex ?? 0)
    if (typeof s.chord.selectedKey === 'number') cp.selectedKey = s.chord.selectedKey
    cp.keyMode = (s.chord.keyMode ?? null) as any
  }
  if (s.drum?.sequences) {
    dm.sequences = clone(s.drum.sequences) as any
    if (s.drum.basslineSequences) dm.basslineSequences = clone(s.drum.basslineSequences) as any
    dm.chainEnabled = !!s.drum.chainEnabled
    if (typeof s.drum.swing === 'number') dm.swing = s.drum.swing
    if (s.drum.activeSequence) dm.swapSequence(s.drum.activeSequence)
  }
  for (const l of SEQ_LANES) {
    const snap = s.lanes?.[l]
    if (!snap) continue
    useSeqLaneStore(l).restoreAllBanks(snap as any)
    // the lane keeps a working copy of its open bank: it reloads it, or it would write the old steps back
    window.dispatchEvent(new CustomEvent(laneEvent(l, 'banks-reloaded')))
  }
  if (s.bpm > 0) useMidiStore().setGlobalBpm(s.bpm)
}
