/**
 * user-repo.ts — User repository wrapping the Firestore-API layer.
 */

import { db, doc, getDoc, setDoc, getDocs, collection } from '../firestore-api';
import type { UserProfile } from '@/types/user';

export class UserRepository {
  private userRef(uid: string) {
    return doc(db, 'users', uid);
  }

  async getProfile(uid: string): Promise<UserProfile | null> {
    const snap = await getDoc(this.userRef(uid));
    return snap.exists() ? (snap.data() as UserProfile) : null;
  }

  async saveProfile(uid: string, profile: UserProfile): Promise<void> {
    await setDoc(this.userRef(uid), profile as any);
  }

  async getAllUsers(): Promise<UserProfile[]> {
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs.map(d => d.data() as UserProfile);
  }
}

export const userRepo = new UserRepository();