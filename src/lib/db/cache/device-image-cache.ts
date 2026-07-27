/**
 * device-image-cache.ts — Data URL cache for user-uploaded MIDI device images.
 *
 * Operates on the 'device_images' object store, keyed by device name (the
 * same string used as the key everywhere else in the MIDI system — routing
 * registrations, DeviceRegistry descriptors, virtual instrument names).
 * Stores are large data: URIs that would exceed localStorage quotas.
 */

import { openDb } from '../connection';

export async function idbDeviceImagePut(deviceName: string, dataUrl: string): Promise<void> {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('device_images', 'readwrite');
    // Out-of-line key store (no keyPath, no key generator) — the key must be
    // passed explicitly as put()'s second argument.
    tx.objectStore('device_images').put({ id: deviceName, dataUrl }, deviceName);
    tx.oncomplete = () => resolve();
    tx.onerror   = () => reject(tx.error);
  });
}

export async function idbDeviceImageGet(deviceName: string): Promise<string | undefined> {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = database.transaction('device_images', 'readonly');
    const req = tx.objectStore('device_images').get(deviceName);
    req.onsuccess = () => resolve(req.result?.dataUrl);
    req.onerror   = () => reject(req.error);
  });
}

export async function idbDeviceImageDelete(deviceName: string): Promise<void> {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('device_images', 'readwrite');
    tx.objectStore('device_images').delete(deviceName);
    tx.oncomplete = () => resolve();
    tx.onerror   = () => reject(tx.error);
  });
}

export async function idbDeviceImageGetAll(): Promise<Record<string, string>> {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = database.transaction('device_images', 'readonly');
    const req = tx.objectStore('device_images').getAll();
    req.onsuccess = () => {
      const out: Record<string, string> = {};
      for (const entry of (req.result as { id: string; dataUrl: string }[])) {
        out[entry.id] = entry.dataUrl;
      }
      resolve(out);
    };
    req.onerror = () => reject(req.error);
  });
}
