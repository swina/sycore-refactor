// Session takes (stores/useSessionTakesStore.ts): each app's slot as a snapshot, its restore, a
// one-line summary, and journaled() — the wrapper every Generate goes through (panel, Rig, MIDI).
//   drum  — target 'A'–'H': the 8 tracks' steps of that Drum sequence (sounds and mutes stay)
//   bass  — target 'A'–'H': the bassline voices' steps of that sequence
//   chord — target 0–7: the Chord Prog slot (steps, length, play mode, arp rate)
//   seq   — target 0–7: the Sequencer bank (steps, length, key, scale, style, generator settings)
import { useDrumMachineStore } from '@/stores/useDrumMachineStore'
import { useChordProgStore, DEFAULT_CHORD_STEP } from '@/stores/useChordProgStore'
import { useStepSequencerStore } from '@/stores/useStepSequencerStore'
import { useSessionTakesStore, type SessionTake, type TakeApp, type TakeTarget } from '@/stores/useSessionTakesStore'

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

export const TAKE_APP_LABELS: Record<TakeApp, string> = { drum: 'Drum', bass: 'Bass', chord: 'Chord', seq: 'Seq' }
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

/** The slots a take of the app can be loaded into. */
export function takeTargets(app: TakeApp): { value: TakeTarget; label: string }[] {
  if (app === 'drum' || app === 'bass') return LETTERS.map(l => ({ value: l, label: `${TAKE_APP_LABELS[app]} ${l}` }))
  const n = app === 'chord' ? useChordProgStore().slots.length : useStepSequencerStore().banks.length
  return Array.from({ length: n }, (_, i) => ({ value: i, label: `${app === 'chord' ? 'Slot' : 'Bank'} ${i + 1}` }))
}

export function targetLabel(app: TakeApp, target: TakeTarget): string {
  if (app === 'drum' || app === 'bass') return `${TAKE_APP_LABELS[app]} ${target}`
  return `${app === 'chord' ? 'Slot' : 'Bank'} ${Number(target) + 1}`
}

/** The slot's content now. */
export function snapshot(app: TakeApp, target: TakeTarget): unknown {
  if (app === 'drum') return clone((useDrumMachineStore().sequences[target as string] ?? []).map((t: any) => t.steps))
  if (app === 'bass') return clone((useDrumMachineStore().basslineSequences[target as string] ?? []).map((t: any) => t.steps))
  if (app === 'chord') {
    const cp = useChordProgStore()
    const i = Number(target)
    // the active slot is the working copy (the slot saved in cp.slots may be behind it)
    const src = i === cp.activeSlotIndex
      ? { steps: cp.steps, numSteps: cp.numSteps, playMode: cp.playMode, arpRate: cp.arpRate }
      : cp.slots[i]
    return clone(src ?? null)
  }
  const bank = useStepSequencerStore().banks[Number(target)]
  return bank ? clone(bank) : null
}

/** Load a snapshot into a slot (its own or another of the same app). The slot's content before is
 *  kept as a take first, so a restore can be undone too. Heard at once while playing. */
export function applyTake(take: Pick<SessionTake, 'app' | 'data'>, target: TakeTarget): boolean {
  const { app } = take
  const data = clone(take.data) as any
  if (data === null || data === undefined) return false
  useSessionTakesStore().before(app, target, snapshot(app, target))
  if (app === 'drum' || app === 'bass') {
    const dm = useDrumMachineStore()
    const tracks = (app === 'drum' ? dm.sequences : dm.basslineSequences)[target as string]
    if (!tracks || !Array.isArray(data)) return false
    tracks.forEach((t: any, i: number) => { if (Array.isArray(data[i])) t.steps = data[i] })
    return true
  }
  if (app === 'chord') {
    const cp = useChordProgStore()
    const i = Number(target)
    if (!cp.slots[i] || !Array.isArray(data.steps)) return false
    const steps = data.steps.slice(0, 16)
    while (steps.length < 16) steps.push({ ...DEFAULT_CHORD_STEP })
    const slot = { steps, numSteps: data.numSteps ?? 8, playMode: data.playMode ?? 'chord', arpRate: data.arpRate ?? '16n' }
    if (i === cp.activeSlotIndex) {
      cp.steps = slot.steps
      cp.numSteps = slot.numSteps
      cp.playMode = slot.playMode
      cp.arpRate = slot.arpRate
      cp.slotSave(i)
    } else {
      cp.slots[i] = slot
      cp.persistSlots()
    }
    return true
  }
  const seq = useStepSequencerStore()
  const i = Number(target)
  if (!seq.banks[i]) return false
  seq.banks[i] = { ...seq.banks[i], ...data }
  seq.banks = [...seq.banks]
  // the Sequencer plays its working copy of the active bank: reload it
  if (i === seq.activeBankIndex) window.dispatchEvent(new CustomEvent('seq-banks-reloaded'))
  return true
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** One line about a take's content: Drum hits, the chords, the Sequencer's key / style. */
export function takeSummary(take: Pick<SessionTake, 'app' | 'data' | 'note'>): string {
  const d = take.data as any
  if (!d) return '—'
  if (take.app === 'drum' || take.app === 'bass') {
    const hits = (d as any[]).reduce((n, steps) => n + (Array.isArray(steps) ? steps.filter((s: any) => s?.active).length : 0), 0)
    if (take.app === 'bass') {
      const notes = new Set<number>()
      ;(d as any[]).forEach(steps => (steps ?? []).forEach((s: any) => { if (s?.active && Number.isFinite(s.note)) notes.add(((s.note % 12) + 12) % 12) }))
      return `${hits} notes${notes.size ? ` · ${[...notes].sort((a, b) => a - b).map(n => NOTE_NAMES[n]).join(' ')}` : ''}`
    }
    return `${take.note ? `${take.note} · ` : ''}${hits} hits`
  }
  if (take.app === 'chord') {
    const steps = (d.steps ?? []).slice(0, d.numSteps ?? 8)
    const names = steps.filter((s: any) => s?.active).map((s: any) => s.chordName)
    return names.length ? names.join(' ') : 'empty'
  }
  const active = (d.steps ?? []).filter((s: any) => s?.active).length
  return `${d.selectedKey ?? ''} ${d.selectedScale ?? ''} · ${d.selectedStyle ?? ''} · ${active}/${d.numSteps ?? d.steps?.length ?? 0} steps`
}

/**
 * Run a Generate journaled: the slot's content before it, then what it made. `fn` may be async (AI);
 * it returning false (failed) records nothing after. `snap` reads the slot when the app's own
 * snapshot would be behind (the Sequencer's working copy).
 */
export function journaled<R>(
  app: TakeApp, target: TakeTarget, fn: () => R,
  opts: { source?: 'builtin' | 'ai'; note?: string; snap?: () => unknown } = {},
): R {
  const read = opts.snap ?? (() => snapshot(app, target))
  const takes = useSessionTakesStore()
  try { takes.before(app, target, read()) } catch {}
  const done = (ok: unknown) => {
    if (ok === false) return
    try { takes.after(app, target, read(), opts.source ?? 'builtin', opts.note) } catch {}
  }
  const r = fn()
  if (r && typeof (r as any).then === 'function') (r as any).then(done, () => {})
  else done(r)
  return r
}
