/**
 * big-storage.ts — large per-user data in IndexedDB instead of localStorage (whose ~5 MB per site
 * filled up: preset banks and Drum Machine presets took 3.7 MB, and every other save — MIDI Flow's
 * routing, the Sequencer's state — then failed with QuotaExceededError, silently).
 *
 * Key-value, out-of-line keys (store `kv_large`), the same key as the localStorage one it replaces
 * (userKey(...)). bigLoad migrates a value still in localStorage: written to IndexedDB, read back,
 * and only then removed from localStorage. Without IndexedDB (old browsers, tests without it) it
 * falls back to localStorage.
 */
import { openDb } from '@/lib/db/connection'

const STORE = 'kv_large'
const hasIdb = () => typeof indexedDB !== 'undefined'

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

/** The value under `key`: IndexedDB, else (first run) migrated from localStorage, else `fallback`. */
export async function bigLoad<T>(key: string, fallback: T): Promise<T> {
  const raw = (() => { try { return localStorage.getItem(key) } catch { return null } })()
  if (!hasIdb()) {
    try { return raw != null ? JSON.parse(raw) : fallback } catch { return fallback }
  }
  try {
    const v = await idbGet<T>(key)
    if (v !== undefined) {
      // migrated before: a copy left in localStorage is stale — free its space
      if (raw != null) { try { localStorage.removeItem(key) } catch {} }
      return v
    }
    if (raw == null) return fallback
    const parsed = JSON.parse(raw) as T
    await idbPut(key, parsed)
    const back = await idbGet<T>(key)
    if (back !== undefined) { try { localStorage.removeItem(key) } catch {} }
    return parsed
  } catch (e) {
    console.warn(`[big-storage] ${key}: IndexedDB unavailable, staying on localStorage`, e)
    try { return raw != null ? JSON.parse(raw) : fallback } catch { return fallback }
  }
}

/** Save `value` under `key` (IndexedDB; localStorage without it). */
export async function bigSave(key: string, value: unknown): Promise<void> {
  const plain = JSON.parse(JSON.stringify(value ?? null))
  if (hasIdb()) {
    try { await idbPut(key, plain); return } catch (e) { console.warn(`[big-storage] ${key}: IndexedDB write failed`, e) }
  }
  try { localStorage.setItem(key, JSON.stringify(plain)) } catch (e) { reportQuota(e, key) }
}

/** A save that didn't fit: said once on the console and as a 'storage-quota' event (the UI shows it). */
let _quotaSaid = false
export function reportQuota(e: unknown, key: string): void {
  if ((e as any)?.name !== 'QuotaExceededError') return
  console.error(`[storage] ${key} not saved: the browser storage for SY.CORE is full`)
  if (_quotaSaid) return
  _quotaSaid = true
  try { window.dispatchEvent(new CustomEvent('storage-quota', { detail: { key } })) } catch {}
}
