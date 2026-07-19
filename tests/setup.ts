// Node 22+ defines an experimental global `localStorage` that shadows
// happy-dom's implementation and throws without a `--localstorage-file`
// flag. Stores (useUiStore, etc.) read localStorage at module-setup time, so
// tests need a working stub regardless of which global wins. In-memory,
// per-process — reset between test files but not between tests in the same
// file (matches how a real browser tab persists localStorage across a test
// run).
class MemoryStorage implements Storage {
  private store = new Map<string, string>()
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null }
  setItem(key: string, value: string) { this.store.set(key, String(value)) }
  removeItem(key: string) { this.store.delete(key) }
  clear() { this.store.clear() }
  key(index: number) { return Array.from(this.store.keys())[index] ?? null }
  get length() { return this.store.size }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  writable: true,
  configurable: true,
})
