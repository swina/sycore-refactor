/**
 * handle-storage.ts — Persist FileSystemDirectoryHandles across sessions.
 *
 * Operates on the 'sound_folder_handles' object store. Handles are stored
 * via IndexedDB structured clone (they aren't JSON-serialisable).
 */

import { openDb } from '../connection';

export async function idbHandlePut(id: string, handle: any): Promise<void> {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('sound_folder_handles', 'readwrite');
    tx.objectStore('sound_folder_handles').put({ id, handle });
    tx.oncomplete = () => resolve();
    tx.onerror   = () => reject(tx.error);
  });
}

export async function idbHandleGet(id: string): Promise<any | undefined> {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = database.transaction('sound_folder_handles', 'readonly');
    const req = tx.objectStore('sound_folder_handles').get(id);
    req.onsuccess = () => resolve(req.result?.handle);
    req.onerror   = () => reject(req.error);
  });
}