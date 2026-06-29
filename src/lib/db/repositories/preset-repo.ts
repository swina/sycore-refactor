/**
 * preset-repo.ts — Preset repository wrapping the Firestore-API layer.
 *
 * Provides typed CRUD for presets stored under users/{uid}/presets.
 * Currently a thin wrapper; can be extended with caching, pagination, etc.
 */

import { db, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, orderBy } from '../firestore-api';
import type { Preset } from '@/types/preset';

export class PresetRepository {
  private presetsCol(uid: string) {
    return collection(db, 'users', uid, 'presets');
  }

  private presetRef(uid: string, presetId: string) {
    return doc(db, 'users', uid, 'presets', presetId);
  }

  async findByUser(uid: string): Promise<Preset[]> {
    const q = query(this.presetsCol(uid), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Preset);
  }

  async getById(uid: string, presetId: string): Promise<Preset | null> {
    const snap = await getDoc(this.presetRef(uid, presetId));
    return snap.exists() ? (snap.data() as Preset) : null;
  }

  async save(uid: string, preset: Preset): Promise<void> {
    await setDoc(this.presetRef(uid, preset.id), preset as any);
  }

  async update(uid: string, presetId: string, data: Partial<Preset>): Promise<void> {
    await updateDoc(this.presetRef(uid, presetId), data as any);
  }

  async delete(uid: string, presetId: string): Promise<void> {
    await deleteDoc(this.presetRef(uid, presetId));
  }

  async toggleFavorite(uid: string, presetId: string, favorite: boolean): Promise<void> {
    await updateDoc(this.presetRef(uid, presetId), { isFavorite: favorite } as any);
  }
}

export const presetRepo = new PresetRepository();