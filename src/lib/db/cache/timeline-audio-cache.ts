/**
 * timeline-audio-cache.ts — Data URL cache for local folder tracks in LiveTimeline.
 *
 * Operates on the 'timeline_audio_cache' object store. Stores are large
 * data: URIs that would exceed localStorage quotas.
 */

import { openDb } from '../connection';

export async function idbTimelineAudioPut(id: string, dataUrl: string): Promise<void> {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('timeline_audio_cache', 'readwrite');
    tx.objectStore('timeline_audio_cache').put({ id, dataUrl });
    tx.oncomplete = () => resolve();
    tx.onerror   = () => reject(tx.error);
  });
}

export async function idbTimelineAudioGet(id: string): Promise<string | undefined> {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = database.transaction('timeline_audio_cache', 'readonly');
    const req = tx.objectStore('timeline_audio_cache').get(id);
    req.onsuccess = () => resolve(req.result?.dataUrl);
    req.onerror   = () => reject(req.error);
  });
}

export async function idbTimelineAudioDelete(id: string): Promise<void> {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('timeline_audio_cache', 'readwrite');
    tx.objectStore('timeline_audio_cache').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror   = () => reject(tx.error);
  });
}