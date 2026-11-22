/**
 * flow-projects.ts — a project is a MIDI Flow setup + the controllers set for it (pure).
 *
 * The setup stays one (referenced by name): two projects on the same setup share
 * its routing and differ only in which Controller Designer presets are on.
 * Loading a project loads its setup and turns on exactly its presets (the
 * designer-presets sync then writes their mappings).
 */

export interface FlowProject {
  name: string
  /** The MIDI Flow configuration's name. */
  setup: string
  /** The Controller Designer presets on in this project. */
  controllerPresetIds: string[]
  updatedAt: string
}

/** The list with `p` added, or replacing the project of the same name. */
export function upsertProject(list: readonly FlowProject[], p: FlowProject): FlowProject[] {
  const i = list.findIndex(x => x.name === p.name)
  if (i < 0) return [...list, p]
  const next = [...list]
  next[i] = p
  return next
}

export function removeProject(list: readonly FlowProject[], name: string): FlowProject[] {
  return list.filter(p => p.name !== name)
}

/** The project's presets that still exist (in order), and the ones deleted since. */
export function projectPresetIds(p: FlowProject, existing: readonly string[]): { ids: string[]; missing: string[] } {
  const have = new Set(existing)
  const ids: string[] = []
  const missing: string[] = []
  for (const id of p.controllerPresetIds) (have.has(id) ? ids : missing).push(id)
  return { ids, missing }
}

/** The projects built on a setup. */
export function projectsOfSetup(list: readonly FlowProject[], setup: string): FlowProject[] {
  return list.filter(p => p.setup === setup)
}

/** A name for a new project of `setup` not taken yet: the setup's name, then "name 2", "name 3"… */
export function freeProjectName(list: readonly FlowProject[], setup: string): string {
  const taken = new Set(list.map(p => p.name))
  if (!taken.has(setup)) return setup
  let n = 2
  while (taken.has(`${setup} ${n}`)) n++
  return `${setup} ${n}`
}

/** Read from storage: only well-formed entries. */
export function parseProjects(raw: unknown): FlowProject[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((p): p is FlowProject =>
    !!p && typeof p.name === 'string' && typeof p.setup === 'string' && Array.isArray(p.controllerPresetIds))
    .map(p => ({ ...p, controllerPresetIds: p.controllerPresetIds.filter((x: unknown) => typeof x === 'string') }))
}
