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
        result[k] = base + (fv as any).n;
      } else if (fv.__type === 'deleteField') {
        // skip — field is removed
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
const DB_VERSION = 1;

const STORES: Record<string, string | null> = {
  // key → IDBKeyPath  (null = out-of-line key)
  users: 'id',
  user_presets: 'id',   // composite id = uid + '__' + docId
  system: 'id',
  settings: 'id',
  backing_tracks: 'id',
  support_tickets: 'id',
};

let _db: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      for (const [storeName, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(storeName)) {
          if (keyPath) {
            db.createObjectStore(storeName, { keyPath });
          } else {
            db.createObjectStore(storeName);
          }
        }
      }
    };
    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
type PathSegments = string[]; // ['users', uid] | ['system', 'roles_config'] | ['users', uid, 'presets', pid]

function parsePath(segments: PathSegments): { store: string; key: string } {
  if (segments.length === 2) {
    // top-level doc: e.g. ['users', uid]
    const [col, id] = segments;
    const storeMap: Record<string, string> = {
      users: 'users',
      system: 'system',
      settings: 'settings',
      backing_tracks: 'backing_tracks',
      support_tickets: 'support_tickets',
    };
    return { store: storeMap[col] || col, key: id };
  }
  if (segments.length === 4) {
    // sub-collection doc: e.g. ['users', uid, 'presets', pid]
    const [, uid, , pid] = segments;
    return { store: 'user_presets', key: `${uid}__${pid}` };
  }
  throw new Error(`Unsupported path depth: ${segments.join('/')}`);
}

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
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAll(store: string): Promise<any[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// Snapshot listeners (simple polling / event-based)
// ---------------------------------------------------------------------------
const listeners: Map<string, Set<() => void>> = new Map();

function notifyListeners(storeKey: string) {
  (listeners.get(storeKey) || new Set()).forEach(fn => fn());
}

// ---------------------------------------------------------------------------
// DocumentReference
// ---------------------------------------------------------------------------
export class DocumentReference {
  _segments: PathSegments;
  id: string;

  constructor(segments: PathSegments) {
    this._segments = segments;
    this.id = segments[segments.length - 1];
  }

  get path(): string { return this._segments.join('/'); }
}

// ---------------------------------------------------------------------------
// CollectionReference
// ---------------------------------------------------------------------------
export class CollectionReference {
  _segments: PathSegments; // path up to collection name

  constructor(segments: PathSegments) {
    this._segments = segments;
  }
}

// ---------------------------------------------------------------------------
// DocumentSnapshot
// ---------------------------------------------------------------------------
export class DocumentSnapshot {
  _data: any;
  id: string;
  exists: () => boolean;

  constructor(id: string, rawData: any) {
    this.id = id;
    this._data = rawData;
    this.exists = () => rawData !== undefined && rawData !== null;
  }

  data(): any {
    if (!this.exists()) return undefined;
    // Remove internal __store_key if present
    const { __store_key, ...rest } = this._data || {};
    return rest;
  }
}

// ---------------------------------------------------------------------------
// QuerySnapshot
// ---------------------------------------------------------------------------
export class QuerySnapshot {
  docs: DocumentSnapshot[];

  constructor(docs: DocumentSnapshot[]) {
    this.docs = docs;
  }

  forEach(fn: (doc: DocumentSnapshot) => void) {
    this.docs.forEach(fn);
  }
}

// ---------------------------------------------------------------------------
// Query (for collection queries)
// ---------------------------------------------------------------------------
export class Query {
  _colRef: CollectionReference;
  _orderField?: string;
  _orderDir?: 'asc' | 'desc';
  _limit?: number;

  constructor(colRef: CollectionReference) {
    this._colRef = colRef;
  }
}

// ---------------------------------------------------------------------------
// Public API — mirroring Firestore
// ---------------------------------------------------------------------------

export function doc(dbOrCol: any, ...pathSegments: string[]): DocumentReference {
  // Supports: doc(db, 'users', uid) | doc(db, 'users', uid, 'presets', pid) | doc(colRef, id)
  if (dbOrCol instanceof CollectionReference) {
    return new DocumentReference([...dbOrCol._segments, pathSegments[0]]);
  }
  // dbOrCol is the 'db' placeholder — we don't actually use it
  return new DocumentReference(pathSegments);
}

export function collection(dbOrDoc: any, ...pathSegments: string[]): CollectionReference {
  if (dbOrDoc instanceof DocumentReference) {
    return new CollectionReference([...dbOrDoc._segments, ...pathSegments]);
  }
  return new CollectionReference(pathSegments);
}

export function query(colRef: CollectionReference, ...constraints: any[]): Query {
  const q = new Query(colRef);
  for (const c of constraints) {
    if (c.__type === 'orderBy') { q._orderField = c.field; q._orderDir = c.dir; }
    if (c.__type === 'limit') { q._limit = c.n; }
  }
  return q;
}

export function orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
  return { __type: 'orderBy', field, dir };
}

export function limit(n: number) {
  return { __type: 'limit', n };
}

export async function getDoc(ref: DocumentReference): Promise<DocumentSnapshot> {
  const { store, key } = parsePath(ref._segments);
  const raw = await idbGet(store, key);
  return new DocumentSnapshot(ref.id, raw);
}

export async function getDocs(q: Query | CollectionReference): Promise<QuerySnapshot> {
  const colRef = q instanceof Query ? q._colRef : q;
  const { store, key: _prefix } = parsePath([...colRef._segments, '__placeholder__']);

  let all = await idbGetAll(store);

  // Filter for sub-collections using uid prefix
  if (colRef._segments.length === 3) {
    // e.g. users/{uid}/presets
    const uid = colRef._segments[1];
    all = all.filter((r: any) => r.id?.startsWith(`${uid}__`));
  }

  // Apply orderBy
  if (q instanceof Query && q._orderField) {
    const field = q._orderField;
    const dir = q._orderDir === 'desc' ? -1 : 1;
    all.sort((a: any, b: any) => {
      const av = a[field] ?? '';
      const bv = b[field] ?? '';
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return 0;
    });
  }

  // Apply limit
  if (q instanceof Query && q._limit !== undefined) {
    all = all.slice(0, q._limit);
  }

  const docs = all.map((raw: any) => {
    const id = colRef._segments.length === 3
      ? raw.id?.replace(/^[^_]+__/, '') // strip uid prefix
      : raw.id;
    return new DocumentSnapshot(id, raw);
  });

  return new QuerySnapshot(docs);
}

export async function setDoc(
  ref: DocumentReference,
  data: Record<string, any>,
  options?: { merge?: boolean }
): Promise<void> {
  const { store, key } = parsePath(ref._segments);
  let existing: any = undefined;
  if (options?.merge) {
    existing = await idbGet(store, key);
  }
  const resolved = resolveFieldValues(data, existing);
  const toWrite = options?.merge
    ? { ...(existing || {}), ...resolved, id: key }
    : { ...resolved, id: key };
  await idbPut(store, toWrite);
  notifyListeners(store);
}

export async function updateDoc(
  ref: DocumentReference,
  data: Record<string, any>
): Promise<void> {
  const { store, key } = parsePath(ref._segments);
  const existing = await idbGet(store, key) || {};
  const resolved = resolveFieldValues(data, existing);
  // Handle dotted paths like 'midiSettings.channel'
  const merged: Record<string, any> = { ...existing };
  for (const [k, v] of Object.entries(resolved)) {
    if (k.includes('.')) {
      const parts = k.split('.');
      let obj = merged;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]] || typeof obj[parts[i]] !== 'object') obj[parts[i]] = {};
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = v;
    } else {
      merged[k] = v;
    }
  }
  // Handle deleteField (keys not in resolved but that were FieldValue.deleteField)
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && (v as any).__type === 'deleteField') {
      delete merged[k];
    }
  }
  await idbPut(store, { ...merged, id: key });
  notifyListeners(store);
}

export async function deleteDoc(ref: DocumentReference): Promise<void> {
  const { store, key } = parsePath(ref._segments);
  await idbDelete(store, key);
  notifyListeners(store);
}

export async function addDoc(
  colRef: CollectionReference,
  data: Record<string, any>
): Promise<DocumentReference> {
  const id = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const docRef = doc(colRef, id);
  await setDoc(docRef, data);
  return docRef;
}

// ---------------------------------------------------------------------------
// onSnapshot — real-time listener (polling every 2 seconds for sub-collections,
// immediate for top-level docs)
// ---------------------------------------------------------------------------
export function onSnapshot(
  target: DocumentReference,
  callback: (snap: DocumentSnapshot) => void,
  onError?: (error: any) => void
): () => void;
export function onSnapshot(
  target: Query | CollectionReference,
  callback: (snap: QuerySnapshot) => void,
  onError?: (error: any) => void
): () => void;
export function onSnapshot(
  target: DocumentReference | Query | CollectionReference,
  callback: ((snap: DocumentSnapshot) => void) & ((snap: QuerySnapshot) => void),
  onError?: (error: any) => void
): () => void {
  let cancelled = false;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const run = async () => {
    if (cancelled) return;
    try {
      if (target instanceof DocumentReference) {
        const snap = await getDoc(target);
        if (!cancelled) (callback as (s: DocumentSnapshot) => void)(snap);
      } else {
        const snap = await getDocs(target as Query | CollectionReference);
        if (!cancelled) (callback as (s: QuerySnapshot) => void)(snap);
      }
    } catch (err) {
      if (!cancelled && onError) onError(err);
    }
  };

  // Initial fetch
  run();

  // Determine store to watch
  let store = '';
  if (target instanceof DocumentReference) {
    try { store = parsePath(target._segments).store; } catch (_) {}
  } else {
    const colRef = target instanceof Query ? target._colRef : target;
    try { store = parsePath([...colRef._segments, '__ph__']).store; } catch (_) {}
  }

  // Register listener
  if (store) {
    if (!listeners.has(store)) listeners.set(store, new Set());
    const fn = () => run();
    listeners.get(store)!.add(fn);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      listeners.get(store)?.delete(fn);
    };
  }

  // Fallback polling
  intervalId = setInterval(run, 3000);
  return () => {
    cancelled = true;
    if (intervalId) clearInterval(intervalId);
  };
}

// ---------------------------------------------------------------------------
// "db" placeholder (we don't need a real Firestore instance)
// ---------------------------------------------------------------------------
export const db = { __idb: true };
