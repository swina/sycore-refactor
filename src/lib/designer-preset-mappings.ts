/**
 * designer-preset-mappings.ts — a Controller Designer preset is a setup you load (pure).
 *
 * Each control keeps its own mapping: an action as a copy of its app mapping
 * (`ctrl.appMapping`, id `designer_ctrl_<id>`), a parameter as its assignment
 * (`paramName` + the control's note / CC / channel + the preset's device). The
 * live mapping tables hold only the controls of the presets that are on:
 * turning a preset on writes its mappings, turning it off removes them. Two
 * presets on one button: the one later in the list wins.
 *
 * MIDI Learn entries written here carry `designerPreset` (the preset id), so
 * they are told from the user's own MIDI Learn; a hand-learned entry on the same
 * button is replaced while the preset is on.
 */

export const DESIGNER_APP_PREFIX = 'designer_ctrl_'

export interface DesignerControl {
  id: string
  type?: string
  noteNumber?: number
  ccNumber?: number
  channel?: number
  assignment?: { type: 'midi-action' | 'app-param'; action?: string; paramName?: string; label?: string }
  appMapping?: Record<string, any>
}

export interface DesignerPreset {
  id: string
  assignedDevice?: string
  controls?: DesignerControl[]
}

export interface SyncInput {
  presets: readonly DesignerPreset[]
  enabledIds: readonly string[]
  app: readonly Record<string, any>[]
  learn: Readonly<Record<string, any>>
  /**
   * What the previous run wrote (its `written`). With it, a change made to the tables from
   * outside (the App MIDI Mapper editing / deleting a preset's mapping, MIDI Learn's Remove)
   * goes into the preset instead of being undone. None: the first run, nothing taken back.
   */
  written?: { app: ReadonlySet<string>; learn: ReadonlySet<string> }
}

export interface SyncResult {
  app: Record<string, any>[]
  learn: Record<string, any>
  appChanged: boolean
  learnChanged: boolean
  /** Controls changed from the tables (older presets' copies, outside edits / deletions): save the presets. */
  backfilled: boolean
  /** What this run wrote: pass it to the next run. */
  written: { app: Set<string>; learn: Set<string> }
}

/** The MIDI Learn key of a control (as useMappingStore.confirmLearn builds it). */
export function learnKeyFor(device: string | null | undefined, ctrl: DesignerControl): string | null {
  const ch = (ctrl.channel ?? 1) - 1
  const frag = ctrl.ccNumber != null ? `CC${ctrl.ccNumber}` : ctrl.noteNumber != null ? `NOTE${ctrl.noteNumber}` : null
  if (!frag) return null
  return [device || null, `CH${ch + 1}`, frag].filter(Boolean).join(':')
}

function learnEntryFor(preset: DesignerPreset, ctrl: DesignerControl): Record<string, any> | null {
  const paramName = ctrl.assignment?.type === 'app-param' ? ctrl.assignment.paramName : undefined
  if (!paramName) return null
  const device = preset.assignedDevice || null
  const channel = (ctrl.channel ?? 1) - 1
  if (ctrl.ccNumber != null) return { cc: ctrl.ccNumber, device, channel, paramName, designerPreset: preset.id }
  if (ctrl.noteNumber != null) return { note: ctrl.noteNumber, device, channel, paramName, designerPreset: preset.id }
  return null
}

/** A Designer canvas control's learn entry (`ctrl_designer_<id>`): a helper, not a mapping. */
export function isDesignerLearnHelper(v: unknown): boolean {
  const name = v && typeof v === 'object' ? (v as any).paramName : v
  return typeof name === 'string' && name.startsWith('ctrl_designer_')
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/**
 * The mapping tables with exactly the enabled presets' controls. Mutates the
 * presets only to backfill `appMapping` from the table (see SyncResult.backfilled).
 */
export function syncPresetMappings({ presets, enabledIds, app, learn, written }: SyncInput): SyncResult {
  const enabled = new Set(enabledIds)
  let backfilled = false

  // Older presets: the action's mapping lived only in the table — copy it into the control.
  const byId = new Map(app.filter(m => typeof m?.id === 'string').map(m => [m.id, m]))
  for (const p of presets) {
    for (const c of p.controls ?? []) {
      if (c.assignment?.type !== 'midi-action' || c.appMapping) continue
      const m = byId.get(DESIGNER_APP_PREFIX + c.id)
      if (m) { c.appMapping = { ...m }; backfilled = true }
    }
  }

  // Outside changes to what the previous run wrote (enabled presets only): into the presets.
  if (written) {
    for (const p of presets) {
      if (!enabled.has(p.id)) continue
      for (const c of p.controls ?? []) {
        if (c.assignment?.type === 'midi-action' && c.appMapping) {
          const id = DESIGNER_APP_PREFIX + c.id
          const cur = byId.get(id)
          if (!cur) {
            if (written.app.has(id)) { c.assignment = undefined; c.appMapping = undefined; backfilled = true }
          } else if (!same(cur, { ...c.appMapping, id, device: p.assignedDevice ?? c.appMapping.device })) {
            c.appMapping = { ...cur }
            if (cur.action && cur.action !== c.assignment.action) c.assignment = { ...c.assignment, action: cur.action }
            backfilled = true
          }
        } else if (c.assignment?.type === 'app-param') {
          const e = learnEntryFor(p, c)
          const k = e && learnKeyFor(e.device, c)
          if (k && written.learn.has(k) && !learn[k]) { c.assignment = undefined; backfilled = true }
        }
      }
    }
  }

  // App mappings: the user's own, then the enabled presets' controls.
  const wantedApp: Record<string, any>[] = []
  for (const p of presets) {
    if (!enabled.has(p.id)) continue
    for (const c of p.controls ?? []) {
      if (c.assignment?.type !== 'midi-action' || !c.appMapping) continue
      wantedApp.push({ ...c.appMapping, id: DESIGNER_APP_PREFIX + c.id, device: p.assignedDevice ?? c.appMapping.device })
    }
  }
  const ownApp = app.filter(m => !(typeof m?.id === 'string' && m.id.startsWith(DESIGNER_APP_PREFIX)))
  const nextApp = [...ownApp, ...wantedApp]
  const appChanged = !same(nextApp, app)

  // MIDI Learn: drop every preset entry, and the untagged ones a preset control holds
  // (written before tagging); then the enabled presets' entries.
  const owned = new Set<string>()
  for (const p of presets) {
    for (const c of p.controls ?? []) {
      const e = learnEntryFor(p, c)
      const k = e && learnKeyFor(e.device, c)
      if (k && learn[k] && typeof learn[k] === 'object' && learn[k].paramName === e.paramName) owned.add(k)
    }
  }
  const nextLearn: Record<string, any> = {}
  for (const [k, v] of Object.entries(learn)) {
    if (v && typeof v === 'object' && (v.designerPreset || owned.has(k))) continue
    // A canvas control's own learn (right-click → MIDI Learn, `ctrl_designer_<id>`) only finds
    // the button's note / CC, copied into the control: left in the table it was a second
    // mapping on that button (a conflict, and it stopped the action consuming the message).
    if (isDesignerLearnHelper(v)) continue
    nextLearn[k] = v
  }
  for (const p of presets) {
    if (!enabled.has(p.id)) continue
    for (const c of p.controls ?? []) {
      const e = learnEntryFor(p, c)
      const k = e && learnKeyFor(e.device, c)
      if (k) nextLearn[k] = e
    }
  }
  const learnChanged = !same(nextLearn, learn)

  const out = {
    app: new Set(wantedApp.map(m => m.id as string)),
    learn: new Set(Object.entries(nextLearn).filter(([, v]) => v && typeof v === 'object' && v.designerPreset).map(([k]) => k)),
  }
  return { app: nextApp, learn: nextLearn, appChanged, learnChanged, backfilled, written: out }
}
