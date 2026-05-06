/**
 * firebase.ts — compatibility shim.
 * Re-exports the local IndexedDB/auth layer using the same names
 * that were previously used with Firebase so that existing imports
 * from './lib/firebase' continue to work without changes.
 */

export { db } from './idb';
export { auth } from './auth';

export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
    providerInfo: { providerId: string; displayName: string; email: string; }[];
  };
}

export function handleFirestoreError(
  error: any,
  operationType: FirestoreErrorInfo['operationType'],
  path: string | null = null
): never {
  const errorInfo: FirestoreErrorInfo = {
    error: error?.message || 'Unknown DB error',
    operationType,
    path,
    authInfo: {
      userId: 'local',
      email: 'none',
      emailVerified: false,
      isAnonymous: true,
      providerInfo: []
    }
  };
  throw new Error(JSON.stringify(errorInfo));
}
