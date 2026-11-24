/**
 * song-samples.ts — the Samples lane's sounds (lib/songs.ts SongSampleRef): a file picked in the Sound Folder
 * Browser is copied into IndexedDB (store kv_large, per user), so it plays after a restart without the folder's
 * permission. Kept as the file's bytes (an ArrayBuffer, as is — big-storage's bigSave goes through JSON, which
 * turned them into {}: nothing to play); decoded when played (core/engines/song-audio.js).
 */
import { openDb } from './db/connection'
import { userKey } from './userKey'

const STORE = 'kv_large'
const key = (id: string) => userKey(`SYCORE_SONG_SAMPLE_${id}`)
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

async function put(k: string, value: ArrayBuffer): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, k)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}
async function get(k: string): Promise<unknown> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(k)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Keeps the file's bytes; its id (for SongSampleRef). */
export async function saveSongSample(file: Blob): Promise<string> {
  const id = uid()
  await put(key(id), await file.arrayBuffer())
  return id
}

/** The bytes of a sample kept, or null (a sample saved before this fix: gone, pick it again). */
export async function loadSongSample(id: string): Promise<ArrayBuffer | null> {
  try {
    const v = await get(key(id))
    return v instanceof ArrayBuffer ? v : null
  } catch { return null }
}
