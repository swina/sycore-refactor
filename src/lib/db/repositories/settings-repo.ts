/**
 * settings-repo.ts — Settings repository wrapping the Firestore-API layer.
 */

import { db, doc, getDoc, setDoc } from '../firestore-api';

export class SettingsRepository {
  private settingsRef(id: string) {
    return doc(db, 'system', id);
  }

  async get<T = any>(id: string): Promise<T | null> {
    const snap = await getDoc(this.settingsRef(id));
    return snap.exists() ? (snap.data() as T) : null;
  }

  async set(id: string, data: Record<string, any>): Promise<void> {
    await setDoc(this.settingsRef(id), data);
  }
}

export const settingsRepo = new SettingsRepository();