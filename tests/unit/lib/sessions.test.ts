import { describe, it, expect } from 'vitest'
import { createSession, uniqueSessionName, parseSessionsDoc, duplicateData, ownSongIds, type SessionData } from '@/lib/sessions'

const data = (songs: { id: string; own: boolean }[] = []): SessionData => ({
  engines: null,
  rig: { sync: { scope: 'global' }, fades: null, chFades: null },
  songs: { songs: songs.map(s => ({ ...s, name: s.id, end: 'stop', sections: [] })) as any, currentId: songs[0]?.id ?? null, loadedId: songs[0]?.id ?? null },
})

describe('sessions', () => {
  it('unique names', () => {
    expect(uniqueSessionName(['Gig'], 'Rehearsal')).toBe('Rehearsal')
    expect(uniqueSessionName(['Gig', 'Gig 2'], 'Gig')).toBe('Gig 3')
    expect(uniqueSessionName([], '  ')).toBe('Session')
  })

  it('parse: bad sessions dropped, the current one existing, empty projects dropped', () => {
    const a = createSession('A', data())
    const b = createSession('B', data())
    const doc = parseSessionsDoc({
      p1: { sessions: [a, { id: '', name: 'x', data: {} }, b], currentId: 'gone' },
      p2: { sessions: [] },
      p3: 'junk',
    })
    expect(Object.keys(doc)).toEqual(['p1'])
    expect(doc.p1.sessions.map(s => s.name)).toEqual(['A', 'B'])
    expect(doc.p1.currentId).toBe(a.id)
    expect(parseSessionsDoc(null)).toEqual({})
  })

  it('duplicate: songs get new ids, the own ones listed to copy their material, nothing loaded', () => {
    const d = data([{ id: 's1', own: true }, { id: 's2', own: false }])
    const { data: c, ownIds } = duplicateData(d)
    const ids = c.songs!.songs.map(s => s.id)
    expect(ids).not.toContain('s1')
    expect(ownIds).toEqual([['s1', ids[0]]])
    expect(c.songs!.currentId).toBe(ids[0])
    expect(c.songs!.loadedId).toBeNull()
    expect(d.songs!.songs[0].id).toBe('s1') // the original untouched
    expect(c.rig).toEqual(d.rig)
  })

  it('own song ids (their material goes with the session)', () => {
    expect(ownSongIds(data([{ id: 'a', own: true }, { id: 'b', own: false }]))).toEqual(['a'])
    expect(ownSongIds({ engines: null, rig: { sync: null, fades: null, chFades: null }, songs: null })).toEqual([])
  })
})
