import { describe, it, expect } from 'vitest'
import {
  createProject, activeSet, withActivePresets, withFlow, uniqueName, duplicateProject,
  migrateProjects, parseProjectsDoc, buildProjectFile, parseProjectFile, planImport, PROJECT_FILE_KIND,
} from '@/lib/projects'

describe('projects', () => {
  it('a new project: its setup and one set with the presets', () => {
    const p = createProject('Studio', 'Rig A', ['mix', 'lk'], 1)
    expect(p.flow).toBe('Rig A')
    expect(activeSet(p).presetIds).toEqual(['mix', 'lk'])
    expect(p.control.sets).toHaveLength(1)
  })

  it('follows the presets turned on and the setup loaded; unchanged = same object', () => {
    const p = createProject('Studio', 'Rig A', ['mix'], 1)
    expect(withActivePresets(p, ['mix'], 2)).toBe(p)
    const q = withActivePresets(p, ['lk'], 2)
    expect(activeSet(q).presetIds).toEqual(['lk'])
    expect(q.updatedAt).toBe(2)
    expect(withFlow(q, 'Rig A')).toBe(q)
    expect(withFlow(q, 'Rig B', 3).flow).toBe('Rig B')
  })

  it('unique names and duplicates (new ids, active set kept)', () => {
    expect(uniqueName(['A', 'A 2'], 'A')).toBe('A 3')
    const p = createProject('Studio', 'Rig A', ['mix'], 1)
    const d = duplicateProject(p, [p], 5)
    expect(d.name).toBe('Studio copy')
    expect(d.id).not.toBe(p.id)
    expect(d.control.activeSetId).not.toBe(p.control.activeSetId)
    expect(activeSet(d).presetIds).toEqual(['mix'])
  })
})

describe('migration of existing users', () => {
  const base = { v1: [], v1Current: '', lastSetup: 'Rig A', enabledPresetIds: ['mix'], hasSetups: true, hasPresets: true }

  it('a new user: nothing to migrate (the wizard)', () => {
    expect(migrateProjects({ ...base, lastSetup: '', enabledPresetIds: [], hasSetups: false, hasPresets: false })).toBeNull()
  })

  it('no v1 projects: "My project" from the setup on screen and the presets on', () => {
    const d = migrateProjects(base)!
    expect(d.projects.map(p => [p.name, p.flow, activeSet(p).presetIds])).toEqual([['My project', 'Rig A', ['mix']]])
    expect(d.currentId).toBe(d.projects[0].id)
  })

  it('v1 projects become projects; the v1 current one stays current', () => {
    const v1 = [{ name: 'Perf', setup: 'Rig A', controllerPresetIds: ['mix'] }, { name: 'Live', setup: 'Rig A', controllerPresetIds: [] }]
    const d = migrateProjects({ ...base, v1, v1Current: 'Live' })!
    expect(d.projects.map(p => p.name)).toEqual(['Perf', 'Live'])
    expect(d.projects.find(p => p.id === d.currentId)!.name).toBe('Live')
  })

  it('v1 projects but none current: the state on screen kept as "My project"', () => {
    const v1 = [{ name: 'Perf', setup: 'Rig A', controllerPresetIds: ['mix'] }]
    const d = migrateProjects({ ...base, v1, enabledPresetIds: ['lk'] })!
    const cur = d.projects.find(p => p.id === d.currentId)!
    expect(cur.name).toBe('My project')
    expect(activeSet(cur).presetIds).toEqual(['lk'])
  })

  it('parse keeps well-formed projects and a current id that exists', () => {
    const p = createProject('A', '', [], 1)
    expect(parseProjectsDoc({ projects: [p, { id: 'x' }], currentId: p.id })).toEqual({ projects: [p], currentId: p.id })
    expect(parseProjectsDoc({ projects: [p], currentId: 'gone' }).currentId).toBeNull()
    expect(parseProjectsDoc(null)).toEqual({ projects: [], currentId: null })
  })
})

describe('export / import', () => {
  const setup = { name: 'Rig A', createdAt: 'x', nodes: [1], cables: [] }
  const mix = { id: 'mix', name: 'MIDImix', controls: [1] }
  const lk = { id: 'lk', name: 'Launchkey', controls: [2] }
  const other = { id: 'other', name: 'Other' }
  let n = 0
  const ids = () => `id${++n}`

  it('the file carries the setup and only the presets its sets use', () => {
    const p = createProject('Studio', 'Rig A', ['mix', 'lk'], 1)
    const f = buildProjectFile(p, setup, [mix, lk, other])
    expect(f.kind).toBe(PROJECT_FILE_KIND)
    expect(f.presets.map(x => x.id)).toEqual(['mix', 'lk'])
    expect(parseProjectFile(JSON.parse(JSON.stringify(f))).project.name).toBe('Studio')
  })

  it('rejects files that are not projects', () => {
    expect(() => parseProjectFile({ kind: 'x' })).toThrow()
    expect(() => parseProjectFile({ kind: PROJECT_FILE_KIND, version: 2 })).toThrow()
    expect(() => parseProjectFile({ kind: PROJECT_FILE_KIND, version: 1, project: { id: 1 } })).toThrow()
  })

  it('on a clean install: everything added as it is', () => {
    const f = buildProjectFile(createProject('Studio', 'Rig A', ['mix'], 1), setup, [mix])
    const r = planImport(f, { setups: [], presets: [], projectNames: [] }, ids)
    expect(r.addSetup!.name).toBe('Rig A')
    expect(r.addPresets).toEqual([mix])
    expect(r.project.name).toBe('Studio')
    expect(activeSet(r.project).presetIds).toEqual(['mix'])
  })

  it('identical setup and presets reused; nothing of the user overwritten', () => {
    const f = buildProjectFile(createProject('Studio', 'Rig A', ['mix', 'lk'], 1), setup, [mix, lk])
    const changedLk = { ...lk, controls: [9] }
    const r = planImport(f, { setups: [{ ...setup, createdAt: 'other date' }], presets: [mix, changedLk], projectNames: ['Studio'] }, ids)
    expect(r.addSetup).toBeNull()
    expect(r.project.flow).toBe('Rig A')
    expect(r.addPresets).toHaveLength(1)
    const newLk = r.addPresets[0]
    expect(newLk.id).not.toBe('lk')
    expect(activeSet(r.project).presetIds).toEqual(['mix', newLk.id])
    expect(r.project.name).toBe('Studio 2')
  })

  it('a different setup with the same name is added renamed', () => {
    const f = buildProjectFile(createProject('Studio', 'Rig A', [], 1), setup, [])
    const r = planImport(f, { setups: [{ ...setup, nodes: [7] }], presets: [], projectNames: [] }, ids)
    expect(r.addSetup!.name).toBe('Rig A (imported)')
    expect(r.project.flow).toBe('Rig A (imported)')
  })
})

describe('control sets', async () => {
  const m = await import('@/lib/projects')
  const base = () => m.createProject('Studio', 'Rig A', ['mix'], 1)

  it('roles: perform by default, by port name ignoring case', () => {
    let p = base()
    const id = p.control.activeSetId
    p = m.withSetRole(p, id, 'MIDI Mix', 'live')
    expect(m.roleOf(m.activeSet(p), 'midi mix')).toBe('live')
    expect(m.roleOf(m.activeSet(p), 'Launchkey')).toBe('perform')
    expect(m.liveDevicesOf(m.activeSet(p))).toEqual(['MIDI Mix'])
    p = m.withSetRole(p, id, 'midi mix', 'perform')
    expect(m.activeSet(p).roles).toEqual({})
  })

  it('add (a copy), rename, switch, remove; the key switches between its pair', () => {
    let p = base()
    const perform = p.control.activeSetId
    p = m.withSetRole(p, perform, 'Keys', 'live')
    const { project, set } = m.addSet(p, 'Live', perform)
    p = project
    expect(set.presetIds).toEqual(['mix'])
    expect(set.roles).toEqual({ Keys: 'live' })
    expect(m.activeSet(p).id).toBe(perform)
    p = m.renameSet(p, set.id, 'Perform')
    expect(p.control.sets.find(s => s.id === set.id)!.name).toBe('Perform 2')
    expect(m.keyTarget(p)).toBeNull()
    p = m.withKeySets(p, perform, set.id)
    expect(m.keyTarget(p)).toBe(set.id)
    p = m.withActiveSet(p, set.id)
    expect(m.keyTarget(p)).toBe(perform)
    p = m.removeSet(p, set.id)
    expect(p.control.activeSetId).toBe(perform)
    expect(p.control.keySets).toBeNull()
    expect(m.removeSet(p, perform)).toBe(p) // never the last
  })

  it('migration of Live / Performance: a Live set, the key on the pair, the mode active', () => {
    const old = { ...base(), control: { sets: [{ id: 's1', name: 'Main', presetIds: ['mix'] }], activeSetId: 's1' } } as any
    const p = m.migrateControlSets(old, { mode: 'live', liveDevices: ['MIDI Mix'] })
    expect(p.control.sets.map(s => s.name)).toEqual(['Perform', 'Live'])
    const live = p.control.sets[1]
    expect(live.presetIds).toEqual(['mix'])
    expect(m.roleOf(live, 'MIDI Mix')).toBe('live')
    expect(p.control.keySets).toEqual(['s1', live.id])
    expect(p.control.activeSetId).toBe(live.id)
    expect(m.migrateControlSets(p, { mode: 'performance', liveDevices: ['X'] })).toBe(p)
    const none = m.migrateControlSets(old, { mode: 'performance', liveDevices: [] })
    expect(none.control.sets).toHaveLength(1)
    expect(none.control.keySets).toBeNull()
  })

  it('duplicate and import keep the key pair on the new sets', () => {
    let p = base()
    const a = p.control.activeSetId
    const r = m.addSet(p, 'Live', a); p = m.withKeySets(r.project, a, r.set.id)
    const d = m.duplicateProject(p, [p])
    expect(d.control.keySets).toEqual([d.control.sets[0].id, d.control.sets[1].id])
    const f = m.buildProjectFile(p, null, [])
    const imp = m.planImport(f as any, { setups: [], presets: [], projectNames: [] })
    expect(imp.project.control.keySets).toEqual([imp.project.control.sets[0].id, imp.project.control.sets[1].id])
  })
})

describe('the Rig role', async () => {
  const m = await import('@/lib/projects')
  it('a role like the others; the old Rig switches become it where the controller is Perform', () => {
    let p = m.createProject('Studio', '', [], 1)
    const a = p.control.activeSetId
    const r = m.addSet(p, 'Live', a); p = m.withSetRole(r.project, r.set.id, 'MIDI Mix', 'live')
    p = m.migrateRigRole(p, ['MIDI Mix', 'Launchpad Mini'])
    expect(m.roleOf(m.activeSet(p), 'MIDI Mix')).toBe('rig')
    expect(m.rigDevicesOf(m.activeSet(p)).sort()).toEqual(['Launchpad Mini', 'MIDI Mix'])
    const live = p.control.sets.find(s => s.id === r.set.id)!
    expect(m.roleOf(live, 'MIDI Mix')).toBe('live')
    expect(m.roleOf(live, 'Launchpad Mini')).toBe('rig')
    expect(m.migrateRigRole(p, [])).toBe(p)
  })
})
