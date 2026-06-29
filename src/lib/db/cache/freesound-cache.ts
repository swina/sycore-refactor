/**
 * freesound-cache.ts — Raw blob-cache operations for Freesound previews.
 *
 * Operates on the 'freesound_cache' object store. Values include Blob
 * instances so they bypass JSON serialisation (IndexedDB structured clone).
 */

import { openDb } from '../connection';

export async function idbCachePut(value: { id: string; [key: string]: any }): Promise<void> {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('freesound_cache', 'readwrite');
    tx.objectStore('freesound_cache').put(value);
    tx.oncomplete = () => resolve();
    tx.onerror   = () => reject(tx.error);
  });
}

export async function idbCacheGet(id: string): Promise<any | undefined> {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = database.transaction('freesound_cache', 'readonly');
    const req = tx.objectStore('freesound_cache').get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function idbCacheDelete(id: string): Promise<void> {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('freesound_cache', 'readwrite');
    tx.objectStore('freesound_cache').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror   = () => reject(tx.error);
  });
}

export async function idbCacheGetAllKeys(): Promise<string[]> {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = database.transaction('freesound_cache', 'readonly');
    const req = tx.objectStore('freesound_cache').getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror   = () => reject(req.error);
  });
}

export async function idbCacheGetAll(): Promise<any[]> {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = database.transaction('freesound_cache', 'readonly');
    const req = tx.objectStore('freesound_cache').getAll();
    req.onsuccess = () => resolve(req.result as any[]);
    req.onerror   = () => reject(req.error);
  });
}