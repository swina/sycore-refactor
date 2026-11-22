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

export interface ControlSet {
  id: string
  name: string
  /** Controller Designer presets on in this set. */
  presetIds: string[]
}

export interface Project {
  id: string
  name: string
  /** The MIDI Flow setup's name; '' = none saved yet (the routing on screen is kept). */
  flow: string
  control: { sets: ControlSet[]; activeSetId: string }
  createdAt: number
  updatedAt: number
}

export interface ProjectsDoc {
  projects: Project[]
  currentId: string | null
}

const rid = (): string => Math.random().toString(36).slice(2, 11)

export function createProject(name: string, flow: string, presetIds: readonly string[], now = Date.now()): Project {
  const set: ControlSet = { id: rid(), name: 'Main', presetIds: [...presetIds] }
  return { id: rid(), name, flow, control: { sets: [set], activeSetId: set.id }, createdAt: now, updatedAt: now }
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
  const sets = file.project.control.sets.map(s => ({ ...s, id: newId(), presetIds: s.presetIds.map(id => idMap.get(id) ?? id) }))
  const activeIdx = Math.max(0, file.project.control.sets.findIndex(s => s.id === file.project.control.activeSetId))
  const project: Project = {
    ...file.project,
    id: newId(),
    name: uniqueName(have.projectNames, file.project.name),
    flow,
    control: { sets, activeSetId: sets[activeIdx].id },
    createdAt: now,
    updatedAt: now,
  }
  return { project, addSetup, addPresets }
}
