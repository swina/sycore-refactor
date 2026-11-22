import { describe, it, expect } from 'vitest'
import { upsertProject, removeProject, projectPresetIds, projectsOfSetup, freeProjectName, parseProjects, type FlowProject } from '@/lib/flow-projects'

const P = (name: string, setup: string, ids: string[] = []): FlowProject => ({ name, setup, controllerPresetIds: ids, updatedAt: '' })

describe('flow-projects', () => {
  it('upsert adds, then replaces by name', () => {
    let l = upsertProject([], P('Live', 'Studio', ['a']))
    l = upsertProject(l, P('Perf', 'Studio', ['b']))
    l = upsertProject(l, P('Live', 'Studio', ['c']))
    expect(l.map(p => [p.name, p.controllerPresetIds])).toEqual([['Live', ['c']], ['Perf', ['b']]])
  })

  it('remove by name', () => {
    expect(removeProject([P('a', 's'), P('b', 's')], 'a').map(p => p.name)).toEqual(['b'])
  })

  it('presets: kept in order, deleted ones reported', () => {
    expect(projectPresetIds(P('x', 's', ['b', 'gone', 'a']), ['a', 'b'])).toEqual({ ids: ['b', 'a'], missing: ['gone'] })
  })

  it('same setup, several projects', () => {
    const l = [P('Live', 'Studio'), P('Perf', 'Studio'), P('Other', 'Home')]
    expect(projectsOfSetup(l, 'Studio').map(p => p.name)).toEqual(['Live', 'Perf'])
  })

  it('free name: the setup, then numbered', () => {
    expect(freeProjectName([], 'Studio')).toBe('Studio')
    expect(freeProjectName([P('Studio', 'Studio'), P('Studio 2', 'Studio')], 'Studio')).toBe('Studio 3')
  })

  it('parse drops malformed entries', () => {
    expect(parseProjects(null)).toEqual([])
    expect(parseProjects([{ name: 'a' }, P('b', 's', ['x']), { name: 'c', setup: 's', controllerPresetIds: ['y', 3] }]).map(p => [p.name, p.controllerPresetIds]))
      .toEqual([['b', ['x']], ['c', ['y']]])
  })
})
