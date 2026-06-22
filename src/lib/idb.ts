/**
 * idb.ts — IndexedDB layer emulating a subset of the Firestore API.
 *
 * Supported collections (auto-created):
 *   users, presets (sub-collection via users/{uid}/presets),
 *   system, settings, backing_tracks, support_tickets
 *
 * Collections are stored as IndexedDB object stores.
 * Sub-collections (e.g. users/{uid}/presets) are encoded as a single
 * top-level store "user_presets" with a composite key "uid__docId".
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type FieldValue = { __type: 'serverTimestamp' } | { __type: 'increment'; n: number } | { __type: 'deleteField' };

export function serverTimestamp(): FieldValue { return { __type: 'serverTimestamp' }; }
export function increment(n: number): FieldValue { return { __type: 'increment', n }; }
export function deleteField(): FieldValue { return { __type: 'deleteField' }; }

function resolveFieldValues(data: Record<string, any>, existing?: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && '__type' in v) {
      const fv = v as FieldValue;
      if (fv.__type === 'serverTimestamp') {
        result[k] = new Date().toISOString();
      } else if (fv.__type === 'increment') {
        const base = (existing?.[k] as number) ?? 0;
        result[k] = base + fv.n;
      } else if (fv.__type === 'deleteField') {
        result[k] = undefined;
      }
    } else {
      result[k] = v;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// IndexedDB Setup
// ---------------------------------------------------------------------------
const DB_NAME = 's1core_db';
const DB_VERSION = 15;

const STORES: Record<string, string | null> = {
  // key → IDBKeyPath  (null = out-of-line key)
  users: 'id',
  user_presets: 'id',              // composite id = uid + '__' + docId
  user_playlists: 'id',            // composite id = uid + '__' + docId
  user_sequences: 'id',            // composite id = uid + '__' + docId
  user_chord_progressions: 'id',   // composite id = uid + '__' + docId
  system: 'id',
  settings: 'id',
  backing_tracks: 'id',
  support_tickets: 'id',
  timeline_sets: 'id',
  freesound_cache: 'id',           // downloaded Freesound preview blobs
  sound_folder_handles: 'id',      // remembered FileSystemDirectoryHandle for the local Sound Folder Browser
  user_backing_tracks: 'id',       // per-user backing tracks (uid__docId)
  user_timeline_sets: 'id',        // per-user timeline sets (uid__docId)
  user_system: 'id',               // per-user system docs e.g. midiConfigPresets, midiMappingPresets (uid__docId)
};

let _db: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
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
      // v7 → v8: backfill device: "S-1" on all existing user_presets
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
  });
}

type PathSegments = string[];

function parsePath(segments: PathSegments): { store: string; key: string } {
  if (segments.length === 2) {
    // top-level doc: e.g. ['users', uid]
    const [store, key] = segments;
    return { store, key };
  }
  if (segments.length === 4) {
    // sub-collection doc: e.g. ['users', uid, 'presets', pid]
    const [, uid, collectionName, docId] = segments;
    const storeMap: Record<string, string> = {
      'presets': 'user_presets',
      'playlists': 'user_playlists',
      'sequences': 'user_sequences',
      'chord_progressions': 'user_chord_progressions',
      'backing_tracks': 'user_backing_tracks',
      'timeline_sets': 'user_timeline_sets',
      'system': 'user_system',
    };
    const store = storeMap[collectionName];
    if (!store) throw new Error(`Unsupported sub-collection: ${collectionName}`);
    return { store, key: `${uid}__${docId}` };
  }
  throw new Error(`Invalid path segments: ${segments.join('/')}`);
}

const listeners = new Map<string, Set<() => void>>();

function notifyListeners(storeKey: string) {
  (listeners.get(storeKey) || new Set()).forEach(fn => fn());
}

// ---------------------------------------------------------------------------
// Store Operations
// ---------------------------------------------------------------------------

async function idbGet(store: string, key: string): Promise<any | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(store: string, value: Record<string, any>): Promise<void> {
  const db = await openDb();
  const plain = JSON.parse(JSON.stringify(value));
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(plain);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(store: string, key: string): Promise<void> {
  console.log(`[IDB] Deleting from ${store}: ${key}`);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => {
      console.log(`[IDB] Successfully deleted: ${key}`);
      resolve();
    };
    req.onerror = () => {
      console.error(`[IDB] Failed to delete: ${key}`, req.error);
      reject(req.error);
    };
  });
}

async function idbGetAll(store: string): Promise<any[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// "Firestore" API Emulation
// ---------------------------------------------------------------------------

export class DocumentReference {
  constructor(public _segments: PathSegments) {}
}

export class CollectionReference {
  constructor(public _segments: PathSegments) {}
}

export class Query {
  constructor(public _colRef: CollectionReference, public _ops: any[] = []) {}
}

export class DocumentSnapshot {
  constructor(public id: string, private _data: any) {}
  data() {
    if (!this._data) return this._data;
    const result = { ...this._data };
    if ('id' in result) {
      result.id = this.id;
    }
    return result;
  }
  exists() { return !!this._data; }
}

export class QuerySnapshot {
  constructor(public docs: DocumentSnapshot[]) {}
  get size() { return this.docs.length; }
  get empty() { return this.docs.length === 0; }
  forEach(callback: (doc: DocumentSnapshot) => void) {
    this.docs.forEach(callback);
  }
}

export function doc(dbOrCol: any, ...pathSegments: string[]): DocumentReference {
  if (dbOrCol instanceof CollectionReference) {
    return new DocumentReference([...dbOrCol._segments, pathSegments[0]]);
  }
  return new DocumentReference(pathSegments);
}

export function collection(db: any, ...pathSegments: string[]): CollectionReference {
  return new CollectionReference(pathSegments);
}

export function query(colRef: CollectionReference, ...ops: any[]): Query {
  return new Query(colRef, ops);
}

export function orderBy(field: string, dir: 'asc' | 'desc' = 'asc') { return { type: 'orderBy', field, dir }; }
export function where(field: string, op: string, val: any) { return { type: 'where', field, op, val }; }
export function limit(n: number) { return { type: 'limit', n }; }

export async function getDoc(ref: DocumentReference): Promise<DocumentSnapshot> {
  const { store, key } = parsePath(ref._segments);
  const data = await idbGet(store, key);
  const id = ref._segments[ref._segments.length - 1];
  return new DocumentSnapshot(id, data);
}

export async function getDocs(target: CollectionReference | Query): Promise<QuerySnapshot> {
  const colRef = target instanceof Query ? target._colRef : target;
  const { store } = parsePath([...colRef._segments, '__ph__']);
  
  let all = await idbGetAll(store);
  
  // Filter by user if it's user_presets
  if (colRef._segments.length === 3) {
    const uid = colRef._segments[1];
    all = all.filter((r: any) => r.id?.startsWith(`${uid}__`));
  }

  const docs = all.map((raw: any) => {
    const id = colRef._segments.length === 3
      ? raw.id?.split('__').slice(1).join('__') // strip uid prefix
      : raw.id;
    return new DocumentSnapshot(id, raw);
  });
  
  // Minimal query logic support (orderBy)
  const ops = target instanceof Query ? target._ops : [];
  let result = [...docs];
  
  ops.forEach(op => {
    if (op.type === 'orderBy') {
      result.sort((a, b) => {
        const va = a.data()[op.field];
        const vb = b.data()[op.field];
        if (va < vb) return op.dir === 'asc' ? -1 : 1;
        if (va > vb) return op.dir === 'asc' ? 1 : -1;
        return 0;
      });
    }
    if (op.type === 'limit') {
      result = result.slice(0, op.n);
    }
  });

  return new QuerySnapshot(result);
}

export async function setDoc(ref: DocumentReference, data: Record<string, any>, options?: { merge?: boolean }): Promise<void> {
  const { store, key } = parsePath(ref._segments);
  const existing = await idbGet(store, key);
  const resolved = resolveFieldValues(data, existing);
  
  const toWrite = options?.merge 
    ? { ...(existing || {}), ...resolved, id: key }
    : { ...resolved, id: key };
  
  await idbPut(store, toWrite);
  notifyListeners(store);
}

export async function updateDoc(ref: DocumentReference, data: Record<string, any>): Promise<void> {
  await setDoc(ref, data, { merge: true });
}

export async function deleteDoc(ref: DocumentReference): Promise<void> {
  const { store, key } = parsePath(ref._segments);
  await idbDelete(store, key);
  notifyListeners(store);
}

export async function deleteDocs(refs: DocumentReference[]): Promise<void> {
  if (refs.length === 0) return;
  const { store } = parsePath(refs[0]._segments);
  const keys = refs.map(ref => parsePath(ref._segments).key);
  
  console.log(`[IDB] Batch deleting ${keys.length} items from ${store}`, keys);

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    
    tx.oncomplete = () => {
      console.log(`[IDB] Batch delete complete for ${keys.length} items`);
      resolve();
    };
    tx.onerror = () => {
      console.error("[IDB] Batch delete failed", tx.error);
      reject(tx.error);
    };
    tx.onabort = () => {
      console.error("[IDB] Batch delete aborted");
      reject(new Error("Transaction aborted"));
    };

    keys.forEach(key => {
      try {
        os.delete(key);
      } catch (e) {
        console.error(`[IDB] Error calling delete for key: ${key}`, e);
      }
    });
  });
  
  notifyListeners(store);
}

export async function clearCollectionRange(store: string, prefix: string): Promise<void> {
  console.log(`[IDB] Clearing range in ${store} with prefix: ${prefix}`);
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    
    const range = IDBKeyRange.bound(`${prefix}__`, `${prefix}__\uffff`);
    os.delete(range);

    tx.oncomplete = () => {
      console.log(`[IDB] Range clear complete for ${prefix}`);
      resolve();
    };
    tx.onerror = () => {
      console.error("[IDB] Range clear failed", tx.error);
      reject(tx.error);
    };
  });
  
  notifyListeners(store);
}

export async function addDoc(colRef: CollectionReference, data: Record<string, any>): Promise<DocumentReference> {
  const id = Math.random().toString(36).slice(2, 11);
  const ref = doc(colRef, id);
  await setDoc(ref, data);
  return ref;
}

export function onSnapshot(target: CollectionReference | Query, callback: (snapshot: QuerySnapshot) => void): () => void {
  const colRef = target instanceof Query ? target._colRef : target;
  let store = '';
  try { store = parsePath([...colRef._segments, '__ph__']).store; } catch (_) {}

  const run = async () => {
    const snap = await getDocs(target);
    callback(snap);
  };

  if (store) {
    if (!listeners.has(store)) listeners.set(store, new Set());
    listeners.get(store)!.add(run);
  }

  run();
  
  return () => {
    if (store) listeners.get(store)?.delete(run);
  };
}

export const db = {};

// ---------------------------------------------------------------------------
// Freesound Cache — raw Blob-safe operations (bypass JSON serialisation)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Sound Folder Browser — raw FileSystemDirectoryHandle storage (structured
// clone, bypasses JSON serialisation since handles aren't JSON-safe)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Startup Migrations
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
