import { ref, readonly } from 'vue'
import { idbCachePut, idbCacheGet, idbCacheDelete, idbCacheGetAllKeys, idbCacheGetAll } from '@/lib/idb'
import { useAuthStore } from '@/stores/useAuthStore'

// Per-uid state — reset when user changes.
const _state = {
  uid:         null,
  cachedIds:   ref(new Set()),
  downloading: ref(new Set()),
  blobUrls:    new Map(),
  initPromise: null,
}

function _pre(uid) { return uid ? `${uid}__` : 'anon__' }
function _idbKey(uid, id) { return `${_pre(uid)}${id}` }

function ensureInit(uid) {
  if (_state.uid === uid && _state.initPromise) return _state.initPromise
  // User changed — reset in-memory state
  _state.uid = uid
  _state.cachedIds.value = new Set()
  _state.blobUrls.clear()
  const pre = _pre(uid)
  _state.initPromise = idbCacheGetAllKeys()
    .then(keys => keys
      .filter(k => k.startsWith(pre))
      .forEach(k => _state.cachedIds.value.add(k.slice(pre.length)))
    )
    .catch(e => console.warn('[FreesoundCache] index load failed', e))
  return _state.initPromise
}

export function useFreesoundCache() {
  const authStore = useAuthStore()
  const uid = () => authStore.user?.uid || null

  function isDownloaded(soundId) {
    ensureInit(uid())
    return _state.cachedIds.value.has(soundId)
  }

  function isDownloading(soundId) {
    return _state.downloading.value.has(soundId)
  }

  async function getCachedUrl(soundId) {
    const currentUid = uid()
    await ensureInit(currentUid)
    if (_state.blobUrls.has(soundId)) return _state.blobUrls.get(soundId)
    if (!_state.cachedIds.value.has(soundId)) return null
    try {
      const entry = await idbCacheGet(_idbKey(currentUid, soundId))
      if (!entry?.blob) return null
      const url = URL.createObjectURL(entry.blob)
      _state.blobUrls.set(soundId, url)
      return url
    } catch {
      return null
    }
  }

  async function downloadSound(sound) {
    const currentUid = uid()
    const soundId = sound.id
    if (_state.downloading.value.has(soundId)) return
    _state.downloading.value.add(soundId)
    try {
      const previewUrl = sound.previews?.['preview-hq-mp3'] || sound.previews?.['preview-lq-mp3'] || sound.url
      const res = await fetch(previewUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      await idbCachePut({
        id: _idbKey(currentUid, soundId),
        blob,
        name: sound.label,
        author: sound.author,
        duration: sound.duration,
        downloadedAt: new Date().toISOString(),
        size: blob.size,
      })
      const url = URL.createObjectURL(blob)
      _state.blobUrls.set(soundId, url)
      _state.cachedIds.value.add(soundId)
    } finally {
      _state.downloading.value.delete(soundId)
    }
  }

  async function deleteCache(soundId) {
    const currentUid = uid()
    if (_state.blobUrls.has(soundId)) {
      URL.revokeObjectURL(_state.blobUrls.get(soundId))
      _state.blobUrls.delete(soundId)
    }
    await idbCacheDelete(_idbKey(currentUid, soundId))
    _state.cachedIds.value.delete(soundId)
  }

  async function resolveUrl(soundId, fallbackUrl) {
    const cached = await getCachedUrl(soundId)
    return cached ?? fallbackUrl
  }

  async function getCachedSounds() {
    const currentUid = uid()
    const pre = _pre(currentUid)
    const entries = await idbCacheGetAll()
    return entries
      .filter(e => e.id?.startsWith(pre))
      .map(e => {
        const bareId = e.id.slice(pre.length)
        return {
          id:           bareId,
          freesoundId:  bareId.startsWith('freesound_') ? Number(bareId.replace('freesound_', '')) : null,
          label:        e.name  || bareId,
          author:       e.author || '',
          duration:     e.duration || 0,
          genre:        'Freesound',
          url:          '',
          tags:         [],
          license:      '',
          previews:     {},
          bpm:          null,
          isLoop:       false,
          downloadedAt: e.downloadedAt || null,
          size:         e.size || 0,
        }
      })
  }

  async function cacheFileBlob(id, name, blob, { author = '', duration = 0 } = {}) {
    const currentUid = uid()
    await idbCachePut({
      id: _idbKey(currentUid, id),
      blob,
      name,
      author,
      duration,
      downloadedAt: new Date().toISOString(),
      size: blob.size,
    })
    const url = URL.createObjectURL(blob)
    _state.blobUrls.set(id, url)
    _state.cachedIds.value.add(id)
    return url
  }

  return {
    cachedIds:   readonly(_state.cachedIds),
    downloading: readonly(_state.downloading),
    isDownloaded,
    isDownloading,
    getCachedUrl,
    getCachedSounds,
    downloadSound,
    deleteCache,
    resolveUrl,
    cacheFileBlob,
  }
}
