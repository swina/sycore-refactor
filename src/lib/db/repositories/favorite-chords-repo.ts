import { db, doc, getDoc, setDoc, getDocs, collection, deleteDoc } from '../firestore-api';

export interface FavoriteChord {
  id: string
  name: string
  root: number
  notes: number[]
  octave: number
  createdAt: string
}

export class FavoriteChordsRepository {
  private colRef(uid: string) {
    return collection(db, 'users', uid, 'favorite_chords')
  }

  private docRef(uid: string, id: string) {
    return doc(db, 'users', uid, 'favorite_chords', id)
  }

  async getAll(uid: string): Promise<FavoriteChord[]> {
    const snap = await getDocs(this.colRef(uid))
    return snap.docs
      .map(d => d.data() as FavoriteChord)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
  }

  async save(uid: string, chord: FavoriteChord): Promise<void> {
    await setDoc(this.docRef(uid, chord.id), chord as any)
  }

  async delete(uid: string, id: string): Promise<void> {
    await deleteDoc(this.docRef(uid, id))
  }
}

export const favoriteChordsRepo = new FavoriteChordsRepository()