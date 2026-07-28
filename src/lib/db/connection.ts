/**
 * connection.ts — IndexedDB connection + store registry + migrations.
 *
 * Manages the database lifecycle (open, upgrade, store creation) and
 * runs startup migrations. Other modules import `openDb` to get a
 * connected instance.
 */

// ---------------------------------------------------------------------------
// Store registry
// ---------------------------------------------------------------------------

export const DB_NAME = import.meta.env.VITE_DB_NAME || 's1core_db';
export const DB_VERSION = 20;

/**
 * Store name → IDBKeyPath mapping.
 * - string: the keyPath (in-line key stored in the object)
 * - null:   out-of-line key (explicit key supplied on each put)
 */
export const STORES: Record<string, string | null> = {
  users: 'id',
  user_presets: 'id',
  user_playlists: 'id',
  user_sequences: 'id',
  user_chord_progressions: 'id',
  system: 'id',
  settings: 'id',
  backing_tracks: 'id',
  support_tickets: 'id',
  timeline_sets: 'id',
  freesound_cache: 'id',
  sound_folder_handles: 'id',
  user_backing_tracks: 'id',
  user_timeline_sets: 'id',
  user_system: 'id',
  timeline_audio_cache: 'id',
  device_images: null,
  cockpit_background: null,
};

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

let _db: IDBDatabase | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      const tx = (e.target as IDBOpenDBRequest).transaction!;
      for (const [storeName, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(storeName)) {
          if (keyPath) {
            db.createObjectStore(storeName, { keyPath });
          } else {
            db.createObjectStore(storeName);
          }
        }
      }
      // v7 → v8 migration: backfill device: "S-1" on all existing user_presets
      if (e.oldVersion < 8 && db.objectStoreNames.contains('user_presets')) {
        const store = tx.objectStore('user_presets');
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = (ce) => {
          const cursor = (ce.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            if (!cursor.value.device) {
              cursor.update({ ...cursor.value, device: 'S-1' });
            }
            cursor.continue();
          }
        };
      }
    };
    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
    // Fires when another open tab/connection to this same database is still
    // holding an older version, so the version-change transaction can't run
    // and no store created by this upgrade will exist until it's closed.
    req.onblocked = () => {
      console.warn(`[idb] Upgrade to v${DB_VERSION} blocked — close other open tabs/windows of this app, then reload.`);
    };
  });
}

/** Reset the cached connection (for testing / re-init) */
export function resetDb(): void {
  _db = null;
}

// ---------------------------------------------------------------------------
// Listener system (for onSnapshot)
// ---------------------------------------------------------------------------

const listeners = new Map<string, Set<() => void>>();

export function addListener(storeKey: string, fn: () => void): void {
  if (!listeners.has(storeKey)) listeners.set(storeKey, new Set());
  listeners.get(storeKey)!.add(fn);
}

export function removeListener(storeKey: string, fn: () => void): void {
  listeners.get(storeKey)?.delete(fn);
}

export function notifyListeners(storeKey: string): void {
  (listeners.get(storeKey) || new Set()).forEach(fn => fn());
}

// ---------------------------------------------------------------------------
// Startup migrations
// ---------------------------------------------------------------------------

export async function runStartupMigrations(): Promise<void> {
  const FLAG = 'sycore_migration_device_field_done';
  if (localStorage.getItem(FLAG)) return;

  const database = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction('user_presets', 'readwrite');
    const store = tx.objectStore('user_presets');
    const req = store.openCursor();
    req.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        if (!cursor.value.device) {
          cursor.update({ ...cursor.value, device: 'S-1' });
        }
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  localStorage.setItem(FLAG, '1');
}