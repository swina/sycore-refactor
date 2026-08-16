/**
 * User & Role types for SY.CORE
 *
 * Drawn from src/lib/auth.ts and src/lib/roles.ts
 */

/** Local user shape stored in IndexedDB (mirrors FirebaseUser subset) */
export interface LocalUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  isAnonymous: boolean;
  displayName: string | null;
  providerData: { providerId: string; displayName: string; email: string }[];
  __passwordHash?: string;
}

/** User profile as stored in the 'users' collection */
export interface UserProfile {
  id: string;
  uid: string;
  email: string;
  role: UserRole;
  generationsCount: number;
  __passwordHash?: string;
  createdAt: string;
  freesoundApiKey?: string;
  aiApiKey?: string;
}

/** Available user roles */
export type UserRole = 'admin' | 'demo' | 'basic' | 'producer';

/** Feature flags per role */
export interface RoleFeatures {
  midiOut: boolean;
  midiLearn: boolean;
  aiPrompt: boolean;
  bankExport: boolean;
  cloudSync: boolean;
  favorites: boolean;
  seqSteps: number;
  support: boolean;
  midiLogger: boolean;
  copySound: boolean;
  abSound: boolean;
  seqPreviewMagic: boolean;
  importBank: boolean;
  seqGen: boolean;
  seqParam2: boolean;
  seqGlobalTranspose: boolean;
  seqSyncTrack: boolean;
}

/** Capability limits and features for one role */
export interface RoleConfig {
  slots: number;
  gens: number;
  features: RoleFeatures;
}

/** All role definitions */
export interface RolesConfig {
  demo: RoleConfig;
  basic: RoleConfig;
  producer: RoleConfig;
}

/** Type alias for backward compatibility with auth.ts */
export type User = LocalUser;