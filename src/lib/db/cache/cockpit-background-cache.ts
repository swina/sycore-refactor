/**
 * cockpit-background-cache.ts — Data URL cache for the user's custom
 * DECK (Instrument Cockpit) background image.
 *
 * Operates on the 'cockpit_background' object store under a single fixed
 * key, since there is only ever one custom background per user. Stored as
 * a data: URI, too large for localStorage.
 */

import { openDb } from '../connection';

const KEY = 'background';

export async function idbCockpitBackgroundPut(dataUrl: string): Promise<void> {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('cockpit_background', 'readwrite');
    tx.objectStore('cockpit_background').put({ id: KEY, dataUrl }, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror   = () => reject(tx.error);
  });
}

export async function idbCockpitBackgroundGet(): Promise<string | undefined> {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = database.transaction('cockpit_background', 'readonly');
    const req = tx.objectStore('cockpit_background').get(KEY);
    req.onsuccess = () => resolve(req.result?.dataUrl);
    req.onerror   = () => reject(req.error);
  });
}

export async function idbCockpitBackgroundDelete(): Promise<void> {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('cockpit_background', 'readwrite');
    tx.objectStore('cockpit_background').delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror   = () => reject(tx.error);
  });
}
