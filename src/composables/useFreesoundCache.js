import { ref, readonly } from 'vue'
import { idbCachePut, idbCacheGet, idbCacheDelete, idbCacheGetAllKeys } from '@/lib/idb'

// Module-level singletons — state survives component mount/unmount cycles.
const cachedIds   = ref(new Set())   // reactive Set<string> of 'freesound_N' ids
const downloading = ref(new Set())   // reactive Set<string> currently in-flight
const blobUrls    = new Map()        // string → blob: URL (in-memory per session)

let _initPromise = null
function ensureInit() {
  if (_initPromise) return _initPromise
  _initPromise = idbCacheGetAllKeys()
    .then(keys => keys.forEach(k => cachedIds.value.add(k)))
    .catch(e => console.warn('[FreesoundCache] index load failed', e))
  return _initPromise
}

// Called at module load so the first render already knows what's cached.
ensureInit()

export function useFreesoundCache() {
  function isDownloaded(soundId) {
    return cachedIds.value.has(soundId)
  }

  function isDownloading(soundId) {
    return downloading.value.has(soundId)
  }

  // Returns a blob: URL for a cached sound, loading from IDB if needed.
  // Returns null if the sound is not cached.
  async function getCachedUrl(soundId) {
    if (blobUrls.has(soundId)) return blobUrls.get(soundId)
    if (!cachedIds.value.has(soundId)) return null
    try {
      const entry = await idbCacheGet(soundId)
      if (!entry?.blob) return null
      const url = URL.createObjectURL(entry.blob)
      blobUrls.set(soundId, url)
      return url
    } catch {
      return null
    }
  }

  // Fetches the preview MP3, stores the Blob in IDB, and creates a blob: URL.
  async function downloadSound(sound) {
    const key = sound.id  // 'freesound_123'
    if (downloading.value.has(key)) return
    downloading.value.add(key)
    try {
      const previewUrl = sound.previews?.['preview-hq-mp3'] || sound.previews?.['preview-lq-mp3'] || sound.url
      const res = await fetch(previewUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      await idbCachePut({
        id: key,
        blob,
        name: sound.label,
        author: sound.author,
        duration: sound.duration,
        downloadedAt: new Date().toISOString(),
        size: blob.size,
      })
      const url = URL.createObjectURL(blob)
      blobUrls.set(key, url)
      cachedIds.value.add(key)
    } finally {
      downloading.value.delete(key)
    }
  }

  // Removes the cache entry from IDB and revokes the blob: URL.
  async function deleteCache(soundId) {
    if (blobUrls.has(soundId)) {
      URL.revokeObjectURL(blobUrls.get(soundId))
      blobUrls.delete(soundId)
    }
    await idbCacheDelete(soundId)
    cachedIds.value.delete(soundId)
  }

  // Returns a cached blob: URL if available, otherwise the original streaming URL.
  async function resolveUrl(soundId, fallbackUrl) {
    const cached = await getCachedUrl(soundId)
    return cached ?? fallbackUrl
  }

  return {
    cachedIds:   readonly(cachedIds),
    downloading: readonly(downloading),
    isDownloaded,
    isDownloading,
    getCachedUrl,
    downloadSound,
    deleteCache,
    resolveUrl,
  }
}
