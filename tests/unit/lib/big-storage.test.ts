import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { bigLoad, bigSave, reportQuota } from '@/lib/big-storage'
import { resetDb } from '@/lib/db/connection'

describe('big-storage (IndexedDB for large values)', () => {
  beforeEach(() => { localStorage.clear(); resetDb() })

  it('migrates a localStorage value to IndexedDB, then frees localStorage', async () => {
    localStorage.setItem('u_BANKS', JSON.stringify({ S1: [{ name: 'A', presets: [1, 2] }] }))
    expect(await bigLoad('u_BANKS', {})).toEqual({ S1: [{ name: 'A', presets: [1, 2] }] })
    expect(localStorage.getItem('u_BANKS')).toBeNull()
    // next start: from IndexedDB
    expect(await bigLoad('u_BANKS', {})).toEqual({ S1: [{ name: 'A', presets: [1, 2] }] })
  })

  it('saves and loads; nothing stored: the fallback', async () => {
    expect(await bigLoad('u_X', [])).toEqual([])
    await bigSave('u_X', [{ id: 1 }])
    expect(await bigLoad('u_X', [])).toEqual([{ id: 1 }])
  })

  it('a stale localStorage copy beside the IndexedDB one is removed', async () => {
    await bigSave('u_Y', { v: 2 })
    localStorage.setItem('u_Y', JSON.stringify({ v: 1 }))
    expect(await bigLoad('u_Y', {})).toEqual({ v: 2 })
    expect(localStorage.getItem('u_Y')).toBeNull()
  })

  it('a quota error is reported once as a storage-quota event', () => {
    const seen: string[] = []
    window.addEventListener('storage-quota', (e: any) => seen.push(e.detail.key))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = Object.assign(new Error('full'), { name: 'QuotaExceededError' })
    reportQuota(err, 'u_S1_SEQUENCER2_STATE')
    reportQuota(err, 'u_OTHER')
    reportQuota(new Error('other'), 'u_Z')
    expect(seen).toEqual(['u_S1_SEQUENCER2_STATE'])
  })
})
