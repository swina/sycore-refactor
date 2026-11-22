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
