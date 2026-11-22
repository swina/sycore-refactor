/**
 * projects.ts — a project: MIDI Flow + Control (+ Session, later). Pure.
 *
 * Plan: docs/plans/projects-and-control.md (phase 1). A project points to its
 * MIDI Flow setup by name and holds its control sets: each set is the
 * Controller Designer presets that are on together (several per project, D4).
 * The current project follows what the user does: loading another setup or
 * turning a preset on / off updates it, as a workspace keeps its layout.
 *
 * Saved per user with the presets (IDB, D5), with export / import as a file
 * that carries the setup and the presets it uses, so it opens on a clean install.
 */

/**
 * What a controller is in a control set: SY.CORE's (its presets), the Rig Controller's (the whole
 * controller, from a Rig template: Launchpad Mini MK1, AKAI MIDImix), or Ableton Live's (ignored).
 */
export type ControllerRole = 'perform' | 'rig' | 'live'

import { portBaseName } from '@/lib/led-feedback'

export interface ControlSet {
  id: string
  name: string
  /** Controller Designer presets on in this set. */
  presetIds: string[]
  /** A controller's role by its port name; missing = 'perform'. */
  roles?: Record<string, ControllerRole>
}

export interface Project {
  id: string
  name: string
  /** The MIDI Flow setup's name; '' = none saved yet (the routing on screen is kept). */
  flow: string
  control: {
    sets: ControlSet[]
    activeSetId: string
    /** The two sets the learned key switches between (null: the key does nothing). Missing: not migrated yet. */
    keySets?: [string, string] | null
  }
  createdAt: number
  updatedAt: number
}

export interface ProjectsDoc {
  projects: Project[]
  currentId: string | null
}

const rid = (): string => Math.random().toString(36).slice(2, 11)

export function createProject(name: string, flow: string, presetIds: readonly string[], now = Date.now()): Project {
  const set: ControlSet = { id: rid(), name: 'Perform', presetIds: [...presetIds], roles: {} }
  return { id: rid(), name, flow, control: { sets: [set], activeSetId: set.id, keySets: null }, createdAt: now, updatedAt: now }
}

export function activeSet(p: Project): ControlSet {
  return p.control.sets.find(s => s.id === p.control.activeSetId) ?? p.control.sets[0]
}

const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i])

/** The project with its active set's presets set to `ids` (the same project when nothing changes). */
export function withActivePresets(p: Project, ids: readonly string[], now = Date.now()): Project {
  const set = activeSet(p)
  if (set && sameIds(set.presetIds, ids)) return p
  const sets = p.control.sets.map(s => (s.id === set?.id ? { ...s, presetIds: [...ids] } : s))
  return { ...p, control: { ...p.control, sets }, updatedAt: now }
}

/** The project pointing to another setup (the same project when it already does). */
export function withFlow(p: Project, flow: string, now = Date.now()): Project {
  return p.flow === flow ? p : { ...p, flow, updatedAt: now }
}

/** A name not taken yet: `base`, then "base 2", "base 3"… */
export function uniqueName(taken: Iterable<string>, base: string): string {
  const t = new Set(taken)
  if (!t.has(base)) return base
  let n = 2
  while (t.has(`${base} ${n}`)) n++
  return `${base} ${n}`
}

export function duplicateProject(p: Project, list: readonly Project[], now = Date.now()): Project {
  const copy: Project = JSON.parse(JSON.stringify(p))
  const idMap = new Map(copy.control.sets.map(s => [s.id, rid()]))
  copy.control.sets = copy.control.sets.map(s => ({ ...s, id: idMap.get(s.id)! }))
  copy.control.activeSetId = idMap.get(p.control.activeSetId) ?? copy.control.sets[0]?.id ?? ''
  if (p.control.keySets) copy.control.keySets = [idMap.get(p.control.keySets[0])!, idMap.get(p.control.keySets[1])!]
  return { ...copy, id: rid(), name: uniqueName(list.map(x => x.name), `${p.name} copy`), createdAt: now, updatedAt: now }
}

/**
 * Existing users (D6): their projects from what is there now. The v1 projects
 * (MIDI Flow menu, setup + presets) become projects; with none, one
 * "My project" from the setup on screen and the presets on. `null` = nothing
 * to migrate (a new user: the first-start wizard).
 */
export function migrateProjects(input: {
  v1: readonly { name: string; setup: string; controllerPresetIds: string[] }[]
  v1Current: string
  lastSetup: string
  enabledPresetIds: readonly string[]
  hasSetups: boolean
  hasPresets: boolean
}, now = Date.now()): ProjectsDoc | null {
  if (input.v1.length) {
    const projects = input.v1.map(p => createProject(p.name, p.setup, p.controllerPresetIds, now))
    const current = projects.find(p => p.name === input.v1Current) ?? null
    if (current) return { projects, currentId: current.id }
    // The state on screen belongs to no v1 project: kept as "My project", current.
    const mine = createProject(uniqueName(projects.map(p => p.name), 'My project'), input.lastSetup, input.enabledPresetIds, now)
    return { projects: [...projects, mine], currentId: mine.id }
  }
  if (!input.hasSetups && !input.hasPresets) return null
  const mine = createProject('My project', input.lastSetup, input.enabledPresetIds, now)
  return { projects: [mine], currentId: mine.id }
}

/** Read from storage: well-formed projects only; the current one kept if it still exists. */
export function parseProjectsDoc(raw: unknown): ProjectsDoc {
  const r = raw as Partial<ProjectsDoc> | null
  const projects = Array.isArray(r?.projects) ? r!.projects.filter(isProject) : []
  const currentId = typeof r?.currentId === 'string' && projects.some(p => p.id === r.currentId) ? r.currentId : null
  return { projects, currentId }
}

function isProject(p: any): p is Project {
  return !!p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.flow === 'string'
    && Array.isArray(p.control?.sets) && p.control.sets.length > 0
    && p.control.sets.every((s: any) => typeof s?.id === 'string' && Array.isArray(s.presetIds))
}

// ── Export / import ──────────────────────────────────────────────────────────

export const PROJECT_FILE_KIND = 'sycore-project'

export interface ProjectFile<S = any, P extends { id: string } = { id: string; name?: string }> {
  kind: typeof PROJECT_FILE_KIND
  version: 1
  project: Project
  /** The MIDI Flow setup ({ name, nodes, cables… }), null when the project has none. */
  setup: S | null
  /** The Controller Designer presets its sets use. */
  presets: P[]
}

/** The file of a project: its setup and the presets any of its sets uses. */
export function buildProjectFile<S, P extends { id: string }>(p: Project, setup: S | null, allPresets: readonly P[]): ProjectFile<S, P> {
  const used = new Set(p.control.sets.flatMap(s => s.presetIds))
  return { kind: PROJECT_FILE_KIND, version: 1, project: p, setup, presets: allPresets.filter(x => used.has(x.id)) }
}

export function parseProjectFile(raw: unknown): ProjectFile {
  const f = raw as Partial<ProjectFile> | null
  if (!f || f.kind !== PROJECT_FILE_KIND) throw new Error('Not a SY.CORE project file')
  if (f.version !== 1) throw new Error(`Unsupported project file version: ${String(f.version)}`)
  if (!isProject(f.project)) throw new Error('The project in the file is malformed')
  const presets = Array.isArray(f.presets) ? f.presets.filter((x: any) => x && typeof x.id === 'string') : []
  return { kind: PROJECT_FILE_KIND, version: 1, project: f.project, setup: f.setup ?? null, presets }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * What importing a file adds. Nothing of the user's is overwritten:
 * - the setup: reused when one of that name is identical, else added (renamed if the name is taken);
 * - a preset: reused when the same id is identical, else added (a new id if the id is taken);
 * - the project: always a new one (new id, renamed if the name is taken), pointing to them.
 */
export function planImport<S extends { name: string }, P extends { id: string; name?: string }>(
  file: ProjectFile<S, P>,
  have: { setups: readonly S[]; presets: readonly P[]; projectNames: readonly string[] },
  newId: () => string = rid,
  now = Date.now(),
): { project: Project; addSetup: S | null; addPresets: P[] } {
  let flow = file.project.flow
  let addSetup: S | null = null
  if (file.setup) {
    const strip = (s: any) => { const { createdAt: _c, ...rest } = s ?? {}; return rest }
    const existing = have.setups.find(s => s.name === file.setup!.name)
    if (existing && same(strip(existing), strip(file.setup))) flow = existing.name
    else {
      const name = existing ? uniqueName(have.setups.map(s => s.name), `${file.setup.name} (imported)`) : file.setup.name
      addSetup = { ...file.setup, name }
      flow = name
    }
  }
  const idMap = new Map<string, string>()
  const addPresets: P[] = []
  for (const pr of file.presets) {
    const existing = have.presets.find(x => x.id === pr.id)
    if (existing && same(existing, pr)) continue
    if (existing) { const id = newId(); idMap.set(pr.id, id); addPresets.push({ ...pr, id }) }
    else addPresets.push(pr)
  }
  const setIds = new Map(file.project.control.sets.map(s => [s.id, newId()]))
  const sets = file.project.control.sets.map(s => ({ ...s, id: setIds.get(s.id)!, presetIds: s.presetIds.map(id => idMap.get(id) ?? id) }))
  const activeIdx = Math.max(0, file.project.control.sets.findIndex(s => s.id === file.project.control.activeSetId))
  const ks = file.project.control.keySets
  const keySets: [string, string] | null | undefined = ks ? [setIds.get(ks[0])!, setIds.get(ks[1])!] : ks
  const project: Project = {
    ...file.project,
    id: newId(),
    name: uniqueName(have.projectNames, file.project.name),
    flow,
    control: { sets, activeSetId: sets[activeIdx].id, ...(keySets !== undefined ? { keySets } : {}) },
    createdAt: now,
    updatedAt: now,
  }
  return { project, addSetup, addPresets }
}

// ── Control sets (phase 3a) ─────────────────────────────────────────────────

// port names compared as the LEDs find a controller's output: "MIDIIN2 (x)" = "MIDIOUT2 (x)" = "x"
const normName = (s: string) => portBaseName(s)

/** A controller's role in a set (port names compared ignoring case). */
export function roleOf(set: ControlSet | null | undefined, device: string | null | undefined): ControllerRole {
  if (!set?.roles || !device) return 'perform'
  const n = normName(device)
  for (const [k, r] of Object.entries(set.roles)) if (normName(k) === n) return r
  return 'perform'
}

/** The port names that are Live's in a set. */
export function liveDevicesOf(set: ControlSet | null | undefined): string[] {
  return Object.entries(set?.roles ?? {}).filter(([, r]) => r === 'live').map(([k]) => k)
}

/** The port names that are the Rig Controller's in a set. */
export function rigDevicesOf(set: ControlSet | null | undefined): string[] {
  return Object.entries(set?.roles ?? {}).filter(([, r]) => r === 'rig').map(([k]) => k)
}

/**
 * Projects from before the Rig role: the Rig Controller's Launchpad / MIDImix switches
 * (on in localStorage) become the Rig role of that controller, in every set where it is
 * Perform. The same project when nothing changes.
 */
export function migrateRigRole(p: Project, devices: readonly string[], now = Date.now()): Project {
  if (!devices.length) return p
  let next = p
  for (const s of p.control.sets) for (const d of devices) if (roleOf(s, d) === 'perform') next = withSetRole(next, s.id, d, 'rig', now)
  return next
}

function mapSets(p: Project, fn: (s: ControlSet) => ControlSet, now: number): Project {
  return { ...p, control: { ...p.control, sets: p.control.sets.map(fn) }, updatedAt: now }
}

export function withSetRole(p: Project, setId: string, device: string, role: ControllerRole, now = Date.now()): Project {
  return mapSets(p, s => {
    if (s.id !== setId) return s
    const roles = Object.fromEntries(Object.entries(s.roles ?? {}).filter(([k]) => normName(k) !== normName(device)))
    if (role !== 'perform') roles[device] = role
    return { ...s, roles }
  }, now)
}

export function withActiveSet(p: Project, setId: string, now = Date.now()): Project {
  if (p.control.activeSetId === setId || !p.control.sets.some(s => s.id === setId)) return p
  return { ...p, control: { ...p.control, activeSetId: setId }, updatedAt: now }
}

/** A new set, a copy of `fromId` (its presets and roles) or empty; it is not made active. */
export function addSet(p: Project, name: string, fromId?: string | null, now = Date.now()): { project: Project; set: ControlSet } {
  const from = p.control.sets.find(s => s.id === fromId)
  const set: ControlSet = {
    id: rid(),
    name: uniqueName(p.control.sets.map(s => s.name), name.trim() || 'Set'),
    presetIds: [...(from?.presetIds ?? [])],
    roles: { ...(from?.roles ?? {}) },
  }
  return { project: { ...p, control: { ...p.control, sets: [...p.control.sets, set] }, updatedAt: now }, set }
}

export function renameSet(p: Project, setId: string, name: string, now = Date.now()): Project {
  const n = name.trim()
  if (!n) return p
  const taken = p.control.sets.filter(s => s.id !== setId).map(s => s.name)
  return mapSets(p, s => (s.id === setId ? { ...s, name: uniqueName(taken, n) } : s), now)
}

/** Remove a set (not the last one); the active set and the key's pair move off it. */
export function removeSet(p: Project, setId: string, now = Date.now()): Project {
  if (p.control.sets.length <= 1 || !p.control.sets.some(s => s.id === setId)) return p
  const sets = p.control.sets.filter(s => s.id !== setId)
  const activeSetId = p.control.activeSetId === setId ? sets[0].id : p.control.activeSetId
  const ks = p.control.keySets
  const keySets = ks && (ks[0] === setId || ks[1] === setId) ? null : ks ?? null
  return { ...p, control: { sets, activeSetId, keySets }, updatedAt: now }
}

export function withKeySets(p: Project, a: string | null, b: string | null, now = Date.now()): Project {
  const ok = (id: string | null) => !!id && p.control.sets.some(s => s.id === id)
  const keySets: [string, string] | null = ok(a) && ok(b) && a !== b ? [a!, b!] : null
  return { ...p, control: { ...p.control, keySets }, updatedAt: now }
}

/** The set the key switches to: the other one of its pair (from any other set: the first). */
export function keyTarget(p: Project): string | null {
  const ks = p.control.keySets
  if (!ks) return null
  return p.control.activeSetId === ks[0] ? ks[1] : ks[0]
}

/**
 * Projects from before control sets (no `keySets`): the Live / Performance mode
 * becomes two sets. "Perform" (the project's own) and "Live" (the same presets,
 * Live's controllers in the Live role), switched by the key; the set active is
 * the mode's. The same project when already migrated.
 */
export function migrateControlSets(p: Project, old: { mode: 'live' | 'performance'; liveDevices: readonly string[] }, now = Date.now()): Project {
  if (p.control.keySets !== undefined) return p
  const base = activeSet(p)
  const perform: ControlSet = { ...base, name: base.name === 'Main' ? 'Perform' : base.name, roles: base.roles ?? {} }
  const others = p.control.sets.filter(s => s.id !== base.id).map(s => ({ ...s, roles: s.roles ?? {} }))
  if (!old.liveDevices.length) {
    return { ...p, control: { sets: [perform, ...others], activeSetId: perform.id, keySets: null }, updatedAt: now }
  }
  const live: ControlSet = {
    id: rid(),
    name: uniqueName([perform.name, ...others.map(s => s.name)], 'Live'),
    presetIds: [...perform.presetIds],
    roles: Object.fromEntries(old.liveDevices.map(d => [d, 'live' as ControllerRole])),
  }
  return {
    ...p,
    control: {
      sets: [perform, ...others, live],
      activeSetId: old.mode === 'live' ? live.id : perform.id,
      keySets: [perform.id, live.id],
    },
    updatedAt: now,
  }
}
