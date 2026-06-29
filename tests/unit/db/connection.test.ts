import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import 'fake-indexeddb/auto'
import { openDb, resetDb, STORES } from '@/lib/db/connection'

describe('IndexedDB connection', () => {
  afterAll(() => {
    resetDb()
  })

  it('opens a database with the expected stores', async () => {
    const db = await openDb()
    expect(db).toBeTruthy()

    // Verify all expected stores exist
    for (const storeName of Object.keys(STORES)) {
      expect(db.objectStoreNames.contains(storeName)).toBe(true)
    }
  })

  it('returns the cached connection on second call', async () => {
    const db1 = await openDb()
    const db2 = await openDb()
    expect(db1).toBe(db2)
  })
})