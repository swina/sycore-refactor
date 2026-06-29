/**
 * db/index.ts — Barrel export for the persistence layer.
 *
 * Re-exports the full Firestore-compatible API so that all existing
 * imports from '@/lib/idb' continue to work unchanged.
 *
 * Also exports the connection module, repository singletons, and
 * cache functions for direct use by new code.
 */

// Firestore API (the primary public API — mirrors original idb.ts exports)
export {
  // Classes
  DocumentReference,
  CollectionReference,
  Query,
  DocumentSnapshot,
  QuerySnapshot,
  // Factory functions
  doc,
  collection,
  query,
  orderBy,
  where,
  limit,
  // Read
  getDoc,
  getDocs,
  // Write
  setDoc,
  updateDoc,
  deleteDoc,
  deleteDocs,
  clearCollectionRange,
  addDoc,
  // Real-time
  onSnapshot,
  // Field values (functions only; FieldValue type is re-exported separately)
  serverTimestamp,
  increment,
  deleteField,
  // Sentry object
  db,
} from './firestore-api';

export type { FieldValue } from './firestore-api';

// Connection + migrations
export {
  openDb,
  resetDb,
  DB_NAME,
  DB_VERSION,
  STORES,
  runStartupMigrations,
} from './connection';

// Repositories
export { presetRepo, PresetRepository } from './repositories/preset-repo';
export { userRepo, UserRepository } from './repositories/user-repo';
export { settingsRepo, SettingsRepository } from './repositories/settings-repo';

// Cache modules
export {
  idbCachePut,
  idbCacheGet,
  idbCacheDelete,
  idbCacheGetAllKeys,
  idbCacheGetAll,
} from './cache/freesound-cache';

export {
  idbHandlePut,
  idbHandleGet,
} from './cache/handle-storage';

export {
  idbTimelineAudioPut,
  idbTimelineAudioGet,
  idbTimelineAudioDelete,
} from './cache/timeline-audio-cache';