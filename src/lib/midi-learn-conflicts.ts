/**
 * midi-learn-conflicts.ts — one physical control, one function, but never silently.
 *
 * Several MIDI Learn systems store their own bindings (right-click MIDI Learn in
 * mappingStore, MIDI Actions, the Program Change panel's buttons and preset-list CC,
 * the FM-1 panel). Each registers an owner provider here; before a learn is stored,
 * askLearnConflict() lists who already uses that control and, if anyone does, asks
 * the user (MidiLearnConflictDialog.vue) whether to keep the existing binding or
 * replace it. Replace releases every other owner, then the new binding is stored.
 */
import { shallowRef } from 'vue'

export interface LearnControl {
  kind: 'cc' | 'note' | 'nrpn'
  number: number          // CC#, note#, or (msb << 7 | lsb) for NRPN
  channel: number | null  // 0-based; null = any
  device: string | null
}

export interface LearnOwner {
  id: string              // stable id of the binding (e.g. 'map:Keys:CH1:CC74')
  label: string           // what the control drives today, shown to the user
  release: () => void     // drops the binding
}

export type LearnOwnerProvider = (control: LearnControl) => LearnOwner[]

export interface PendingLearnConflict {
  control: LearnControl
  target: string          // what the user is learning now
  owners: LearnOwner[]
  resolve: (replace: boolean) => void
}

const providers = new Map<unknown, LearnOwnerProvider>()

export const pendingLearnConflict = shallowRef<PendingLearnConflict | null>(null)

/** Register a binding owner; a `key` replaces that key's previous provider. Returns the unregister function. */
export function registerLearnOwnerProvider(fn: LearnOwnerProvider, key: unknown = fn): () => void {
  providers.set(key, fn)
  return () => { if (providers.get(key) === fn) providers.delete(key) }
}

/** Bindings already on `control`, except the ids in `except` (the binding being re-learned). */
export function findLearnConflicts(control: LearnControl, except: string[] = []): LearnOwner[] {
  const out: LearnOwner[] = []
  const seen = new Set(except)
  providers.forEach(p => {
    for (const o of p(control)) {
      if (seen.has(o.id)) continue
      seen.add(o.id)
      out.push(o)
    }
  })
  return out
}

/**
 * Resolves true when the new binding may be stored: nobody else uses the control, or the
 * user chose Replace (the other owners are released first). false = keep the existing one.
 */
export function askLearnConflict(control: LearnControl, target: string, except: string[] = []): Promise<boolean> {
  const owners = findLearnConflicts(control, except)
  if (owners.length === 0) return Promise.resolve(true)
  // a newer learn supersedes an unanswered question
  pendingLearnConflict.value?.resolve(false)
  return new Promise(resolve => {
    pendingLearnConflict.value = {
      control, target, owners,
      resolve: (replace) => {
        pendingLearnConflict.value = null
        if (replace) owners.forEach(o => o.release())
        resolve(replace)
      },
    }
  })
}

/** "CC 74 · CH 1 · Keys" */
export function describeControl(c: LearnControl): string {
  const what = c.kind === 'note' ? `Note ${c.number}` : c.kind === 'nrpn' ? `NRPN ${c.number >> 7}:${c.number & 0x7f}` : `CC ${c.number}`
  const parts = [what]
  if (c.channel != null && c.channel >= 0) parts.push(`CH ${c.channel + 1}`)
  if (c.device) parts.push(c.device)
  return parts.join(' · ')
}

/** Readable name for a mappingStore param (vdp_cc:X3:74 → "X3 · Virtual Device CC 74"). */
export function describeParam(name: string): string {
  if (name.startsWith('vdp_cc:')) {
    const rest = name.slice('vdp_cc:'.length)
    const i = rest.lastIndexOf(':')
    return `${rest.slice(0, i)} · Virtual Device CC ${rest.slice(i + 1)}`
  }
  const vdp = name.match(/^vdp_([a-z_]+):(.+)$/)
  if (vdp) return `${vdp[2]} · Virtual Device ${vdp[1].replace(/_/g, ' ')}`
  if (name.startsWith('deck_view:')) return `DECK view ${name.slice('deck_view:'.length)}`
  return name.replace(/_/g, ' ')
}
