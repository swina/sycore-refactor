/**
 * projects.ts — the user's projects at runtime (phase 1 of docs/plans/projects-and-control.md).
 *
 * A project = its MIDI Flow setup + its control sets (lib/projects.ts). Saved per
 * user with the presets (IDB doc users/<uid>/system/projects). The current
 * project follows what the user does: loading a setup in MIDI Flow or turning a
 * Controller Designer preset on / off updates it. Loading a project loads its
 * setup (MIDI Flow is always mounted: a load request) and turns on exactly the
 * presets of its active set. Installed by SynthApp.
 */
import { ref, computed, watch } from 'vue'
import { getDoc, setDoc, doc, db } from '@/lib/idb'
import { auth } from '@/lib/auth'
import {
  type Project, type ProjectsDoc, createProject, activeSet, withActivePresets, withFlow, uniqueName,
  duplicateProject, migrateProjects, parseProjectsDoc, buildProjectFile, parseProjectFile, planImport,
  withActiveSet, withSetRole, addSet, renameSet, removeSet, withKeySets, keyTarget, migrateControlSets, migrateRigRole,
  type ControllerRole,
} from '@/lib/projects'
import { loadMode, loadProfile } from '@/lib/controller-profile'
import { isMidimixName } from '@/lib/rig-midimix'
import { isLaunchpadName } from '@/lib/rig-launchpad'
import { midiService } from '@/core/midi/midi-service'
import { designerPresets, designerPresetsLoaded, setDesignerPresets } from '@/core/midi/designer-presets'
import { persistControllerPresets } from '@/lib/midi-controller-presets'
import { useMidiFlowConfigsStore } from '@/stores/useMidiFlowConfigsStore'
import { useUiStore } from '@/stores/useUiStore'
import { useAuthStore } from '@/stores/useAuthStore'

export const projects = ref<Project[]>([])
export const currentProjectId = ref<string | null>(null)
/** True once the user's projects are read (and migrated). */
export const projectsLoaded = ref(false)
export const currentProject = computed(() => projects.value.find(p => p.id === currentProjectId.value) ?? null)
/** The current project's active control set (roles: who is Live's). */
export const currentSet = computed(() => (currentProject.value ? activeSet(currentProject.value) : null))
/** A user with no project yet: the first-start wizard asks for one. */
export const needsFirstProject = computed(() => projectsLoaded.value && projects.value.length === 0)

const IDB_DOC = 'projects'

function userDoc() {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Not authenticated')
  return doc(db, 'users', uid, 'system', IDB_DOC)
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
function persistSoon() {
  if (!projectsLoaded.value) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const data: ProjectsDoc = { projects: projects.value, currentId: currentProjectId.value }
    setDoc(userDoc(), JSON.parse(JSON.stringify(data))).catch(() => {})
  }, 300)
}

function replace(p: Project) {
  projects.value = projects.value.map(x => (x.id === p.id ? p : x))
  persistSoon()
}

const existingPresetIds = () => new Set(designerPresets.value.map(p => p.id))

/** Load a project: its setup in MIDI Flow, exactly its active set's presets on. */
export function loadProject(id: string): void {
  const p = projects.value.find(x => x.id === id)
  if (!p) return
  currentProjectId.value = p.id
  applyProject(p)
  persistSoon()
}

function applyProject(p: Project) {
  const flow = useMidiFlowConfigsStore()
  const ui = useUiStore()
  const have = existingPresetIds()
  ui.enabledControllerDesignerPresetIds = activeSet(p).presetIds.filter(id => have.has(id))
  if (p.flow && flow.hasConfig(p.flow) && flow.lastConfigName !== p.flow) flow.requestLoad(p.flow)
}

/** A new project from what is on screen now (setup, presets on); it becomes current. */
export function newProject(name: string): Project {
  const flow = useMidiFlowConfigsStore()
  const ui = useUiStore()
  const p = createProject(uniqueName(projects.value.map(x => x.name), name.trim() || 'My project'), flow.lastConfigName, ui.enabledControllerDesignerPresetIds)
  projects.value = [...projects.value, p]
  currentProjectId.value = p.id
  persistSoon()
  return p
}

/**
 * Saving a setup with its controllers (MIDI Flow's "Controllers for this setup"):
 * the project of that name updated, or a new one; it becomes current and is applied.
 */
export function saveSetupAsProject(name: string, setup: string, presetIds: readonly string[]): void {
  const n = name.trim()
  if (!n) return
  const existing = projects.value.find(p => p.name === n)
  let p: Project
  if (existing) {
    p = withActivePresets(withFlow(existing, setup), presetIds)
    replace(p)
  } else {
    p = createProject(n, setup, presetIds)
    projects.value = [...projects.value, p]
  }
  currentProjectId.value = p.id
  applyProject(p)
  persistSoon()
}

export function renameProject(id: string, name: string): void {
  const p = projects.value.find(x => x.id === id)
  const n = name.trim()
  if (!p || !n || n === p.name) return
  replace({ ...p, name: uniqueName(projects.value.filter(x => x.id !== id).map(x => x.name), n), updatedAt: Date.now() })
}

export function duplicate(id: string): void {
  const p = projects.value.find(x => x.id === id)
  if (!p) return
  projects.value = [...projects.value, duplicateProject(p, projects.value)]
  persistSoon()
}

/** Delete a project (its setup and presets stay). The last one can't be deleted. */
export function deleteProject(id: string): boolean {
  if (projects.value.length <= 1) return false
  projects.value = projects.value.filter(p => p.id !== id)
  if (currentProjectId.value === id) currentProjectId.value = projects.value[0]?.id ?? null
  persistSoon()
  return true
}

/** The project as a file to keep or move: its setup and the presets it uses. */
export function exportProject(id: string): void {
  const p = projects.value.find(x => x.id === id)
  if (!p) return
  const flow = useMidiFlowConfigsStore()
  const file = buildProjectFile(p, p.flow ? flow.getConfig(p.flow) ?? null : null, designerPresets.value)
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${p.name.replace(/[^\w\- ]+/g, '_')}.sycore-project.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/** Import a project file: added as a new project (nothing overwritten), then loaded. */
export async function importProjectFile(file: File): Promise<Project> {
  const parsed = parseProjectFile(JSON.parse(await file.text()))
  const flow = useMidiFlowConfigsStore()
  const plan = planImport(parsed as any, {
    setups: flow.configs as any[],
    presets: designerPresets.value as any[],
    projectNames: projects.value.map(p => p.name),
  })
  if (plan.addSetup) flow.saveConfig(plan.addSetup.name, plan.addSetup.nodes ?? [], plan.addSetup.cables ?? [])
  if (plan.addPresets.length) {
    const list = [...designerPresets.value, ...plan.addPresets] as any[]
    setDesignerPresets(list)
    await persistControllerPresets(list).catch(() => {})
  }
  projects.value = [...projects.value, plan.project]
  loadProject(plan.project.id)
  return plan.project
}

// ── Control sets (phase 3a) ─────────────────────────────────────────────────

function updateCurrent(fn: (p: Project) => Project): Project | null {
  const p = currentProject.value
  if (!p) return null
  const next = fn(p)
  if (next !== p) replace(next)
  return next
}

/** Make a set of the current project active: its presets on, its roles in force. */
export function switchSet(setId: string): void {
  const next = updateCurrent(p => withActiveSet(p, setId))
  if (next) applyProject(next)
}

/** The learned key: to the other set of its pair. False: no pair set. */
export function toggleKeySet(): boolean {
  const p = currentProject.value
  const target = p ? keyTarget(p) : null
  if (!target) return false
  switchSet(target)
  return true
}

export function setControllerRole(device: string, role: ControllerRole, setId?: string): void {
  updateCurrent(p => withSetRole(p, setId ?? p.control.activeSetId, device, role))
}

/** A new set, a copy of the active one; made active. */
export function newControlSet(name: string): void {
  const p = currentProject.value
  if (!p) return
  const r = addSet(p, name, p.control.activeSetId)
  replace(r.project)
  switchSet(r.set.id)
}

export function renameControlSet(setId: string, name: string): void {
  updateCurrent(p => renameSet(p, setId, name))
}

export function removeControlSet(setId: string): void {
  const next = updateCurrent(p => removeSet(p, setId))
  if (next) applyProject(next)
}

export function setKeyPair(a: string | null, b: string | null): void {
  updateCurrent(p => withKeySets(p, a, b))
}

/** The Live / Performance settings of before (localStorage) as control sets, once per project. */
function oldLiveSettings(): { mode: 'live' | 'performance'; liveDevices: string[] } {
  const mode = loadMode()
  const prof = loadProfile()
  const used = mode === 'live' || !!prof.key || prof.liveDevices !== null
  if (!used) return { mode, liveDevices: [] }
  if (prof.liveDevices) return { mode, liveDevices: prof.liveDevices }
  const mixes = [...new Set(midiService.getInputs().map(i => i.name).filter((n): n is string => !!n && isMidimixName(n)))]
  return { mode, liveDevices: mixes.length ? mixes : ['MIDI Mix'] }
}

/** The Rig Controller's Launchpad / MIDImix switches of before (localStorage '1'), once: their port names. */
const OLD_RIG_SWITCHES: [string, (n: string) => boolean, string][] = [
  ['SYCORE_RIG_LAUNCHPAD', isLaunchpadName, 'Launchpad Mini'],
  ['SYCORE_RIG_MIDIMIX', isMidimixName, 'MIDI Mix'],
]
function takeOldRigSwitches(): string[] {
  const names = midiService.getInputs().map(i => i.name).filter((n): n is string => !!n)
  const out: string[] = []
  for (const [key, is, fallback] of OLD_RIG_SWITCHES) {
    let v: string | null = null
    try { v = localStorage.getItem(key) } catch {}
    if (v === '1') out.push(names.find(is) ?? fallback)
    if (v === '1' || v === '0') try { localStorage.setItem(key, 'migrated') } catch {}
  }
  return out
}

let installed = false

export function installProjects(): void {
  if (installed) return
  installed = true
  const flow = useMidiFlowConfigsStore()
  const ui = useUiStore()
  const authStore = useAuthStore()

  async function load() {
    let parsed: ProjectsDoc
    let found = false
    try {
      const snap = await getDoc(userDoc())
      found = snap.exists()
      parsed = parseProjectsDoc(found ? snap.data() : null)
    } catch { parsed = { projects: [], currentId: null } }
    if (!found) {
      // Existing users: their projects from what is there now (D6); a new user: none (the wizard).
      const migrated = migrateProjects({
        v1: flow.projects,
        v1Current: flow.lastProjectName,
        lastSetup: flow.lastConfigName,
        enabledPresetIds: ui.enabledControllerDesignerPresetIds,
        hasSetups: flow.configs.length > 0,
        hasPresets: designerPresets.value.some(p => (p.controls?.length ?? 0) > 0 || !!p.assignedDevice),
      })
      // …with their Live / Performance settings as control sets (below).
      if (migrated) parsed = { ...migrated, projects: migrated.projects.map(p => ({ ...p, control: { ...p.control, keySets: undefined } })) }
    }
    // Projects from before control sets: Live / Performance becomes their sets.
    let migratedSets = false
    if (parsed.projects.some(p => p.control.keySets === undefined)) {
      const old = oldLiveSettings()
      parsed.projects = parsed.projects.map(p => migrateControlSets(p, old))
      migratedSets = true
    }
    // The Rig Controller's old Launchpad / MIDImix switches: the Rig role in the sets.
    const rigDevices = takeOldRigSwitches()
    if (rigDevices.length) { parsed.projects = parsed.projects.map(p => migrateRigRole(p, rigDevices)); migratedSets = true }
    projects.value = parsed.projects
    currentProjectId.value = parsed.currentId ?? parsed.projects[0]?.id ?? null
    projectsLoaded.value = true
    if ((!found || migratedSets) && parsed.projects.length) persistSoon()
    // At start the current project is the source: its presets, its setup.
    if (currentProject.value) applyProject(currentProject.value)
  }

  watch(() => authStore.user?.uid, uid => {
    projectsLoaded.value = false
    projects.value = []
    currentProjectId.value = null
    if (!uid) return
    // The presets first: the migration and the project's set need them.
    if (designerPresetsLoaded.value) { load(); return }
    const stop = watch(designerPresetsLoaded, ok => { if (ok) { stop(); load() } })
  }, { immediate: true })

  // The current project follows what the user does.
  watch(() => [...ui.enabledControllerDesignerPresetIds], ids => {
    const p = currentProject.value
    if (!projectsLoaded.value || !p || !designerPresetsLoaded.value) return
    const next = withActivePresets(p, ids)
    if (next !== p) replace(next)
  })
  watch(() => flow.lastConfigName, name => {
    const p = currentProject.value
    if (!projectsLoaded.value || !p || !name) return
    const next = withFlow(p, name)
    if (next !== p) replace(next)
  })
}
