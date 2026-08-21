import { ref } from 'vue'
import { favoriteChordsRepo, type FavoriteChord } from '@/lib/db/repositories/favorite-chords-repo'
import { useAuthStore } from '@/stores/useAuthStore'

const favoriteChords = ref<FavoriteChord[]>([])

export function useFavoriteChords() {
  const authStore = useAuthStore()

  async function loadFavorites() {
    if (!authStore.user) return
    favoriteChords.value = await favoriteChordsRepo.getAll(authStore.user.uid)
  }

  async function addFavorite(name: string, root: number, notes: number[], octave: number) {
    if (!authStore.user) return
    const id = `fav_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    const chord: FavoriteChord = {
      id,
      name,
      root,
      notes: [...notes],
      octave,
      createdAt: new Date().toISOString(),
    }
    await favoriteChordsRepo.save(authStore.user.uid, chord)
    await loadFavorites()
  }

  async function removeFavorite(id: string) {
    if (!authStore.user) return
    await favoriteChordsRepo.delete(authStore.user.uid, id)
    await loadFavorites()
  }

  return {
    favoriteChords,
    loadFavorites,
    addFavorite,
    removeFavorite,
  }
}