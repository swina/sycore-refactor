/**
 * auth.ts — Local authentication using IndexedDB.
 * Replaces Firebase Auth with a simple credential store.
 * The FIRST user registered automatically becomes 'admin'.
 * Subsequent users get 'demo' role (can be promoted via AdminPanel).
 */

import { db as idb, setDoc, getDoc, getDocs, doc, collection } from './idb';

// ---------------------------------------------------------------------------
// Types (mirrors FirebaseUser shape)
// ---------------------------------------------------------------------------
export interface LocalUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  isAnonymous: boolean;
  displayName: string | null;
  providerData: { providerId: string; displayName: string; email: string }[];
  // internal
  __passwordHash?: string;
}

type AuthStateListener = (user: LocalUser | null) => void;

// The first user registered in the local DB automatically becomes admin.
// This is correct for an offline-first single-owner app.

// ---------------------------------------------------------------------------
// Simple hash (not crypto-secure, only for local offline use)
// ---------------------------------------------------------------------------
async function simpleHash(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 's1core_salt_2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const SESSION_KEY = 's1core_session';
let _currentUser: LocalUser | null = null;
const _listeners: Set<AuthStateListener> = new Set();

function notify(user: LocalUser | null) {
  _listeners.forEach(fn => fn(user));
}

// Restore session from localStorage on module load
(function restoreSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      const u = JSON.parse(raw) as LocalUser;
      _currentUser = u;
      // Defer notification to next tick so listeners can be added first
      setTimeout(() => notify(_currentUser), 0);
    } else {
      setTimeout(() => notify(null), 0);
    }
  } catch (_) {
    setTimeout(() => notify(null), 0);
  }
})();

// ---------------------------------------------------------------------------
// Public auth object (mirrors firebase/auth exports)
// ---------------------------------------------------------------------------
export const auth = {
  get currentUser(): LocalUser | null { return _currentUser; },

  signOut(): Promise<void> {
    _currentUser = null;
    localStorage.removeItem(SESSION_KEY);
    notify(null);
    return Promise.resolve();
  }
};

// ---------------------------------------------------------------------------
// Auth functions (mirrors firebase/auth)
// ---------------------------------------------------------------------------
export function onAuthStateChanged(
  _auth: typeof auth,
  callback: (user: LocalUser | null) => void
): () => void {
  _listeners.add(callback);
  // Immediately call with current state
  callback(_currentUser);
  return () => { _listeners.delete(callback); };
}

export async function signInWithEmailAndPassword(
  _auth: typeof auth,
  email: string,
  password: string
): Promise<{ user: LocalUser }> {
  const uid = btoa(email.toLowerCase()).replace(/=/g, '');
  const ref = doc(null as any, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const err: any = new Error('Invalid email or password.');
    err.code = 'auth/user-not-found';
    throw err;
  }
  const userData = snap.data()!;
  const hash = await simpleHash(password);
  if (userData.__passwordHash && userData.__passwordHash !== hash) {
    const err: any = new Error('Invalid email or password.');
    err.code = 'auth/wrong-password';
    throw err;
  }
  // Always read the stored role from the profile (may have been updated)
  const user = buildUser(uid, email, userData);
  _currentUser = user;
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  notify(user);
  return { user };
}

export async function createUserWithEmailAndPassword(
  _auth: typeof auth,
  email: string,
  password: string
): Promise<{ user: LocalUser }> {
  const uid = btoa(email.toLowerCase()).replace(/=/g, '');
  const ref = doc(null as any, 'users', uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const err: any = new Error('Email already in use.');
    err.code = 'auth/email-already-in-use';
    throw err;
  }
  const hash = await simpleHash(password);

  // The first registered user in the local DB gets 'admin' role.
  // Subsequent users get 'demo'. Role can be changed later via AdminPanel.
  const existingUsers = await getDocs(collection(null as any, 'users'));
  const isFirstUser = existingUsers.docs.length === 0;
  const role = isFirstUser ? 'admin' : 'demo';

  const profile = {
    id: uid,
    uid,
    email,
    role,
    generationsCount: 0,
    __passwordHash: hash,
    createdAt: new Date().toISOString()
  };
  await setDoc(ref, profile);
  const user = buildUser(uid, email, profile);
  _currentUser = user;
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  notify(user);
  return { user };
}

// Google sign-in is replaced by a simple "guest" login or skipped
export class GoogleAuthProvider {}
export async function signInWithPopup(
  _auth: typeof auth,
  _provider: any
): Promise<{ user: LocalUser }> {
  const err: any = new Error('Google Sign-In is not available in offline mode. Please use Email/Password.');
  err.code = 'auth/operation-not-allowed';
  throw err;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function buildUser(uid: string, email: string, data: any): LocalUser {
  return {
    uid,
    email,
    emailVerified: true,
    isAnonymous: false,
    displayName: data.displayName || null,
    providerData: [{ providerId: 'password', displayName: data.displayName || '', email }],
    __passwordHash: data.__passwordHash
  };
}

// Type alias for compatibility
export type User = LocalUser;
