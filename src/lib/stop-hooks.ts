/**
 * stop-hooks.ts — what every Stop All stops besides the apps it knows (useGlobalTransportControls).
 *
 * An engine registers itself when it starts (the Rig's capture clips), so the transport
 * controls need not import it (and all it loads).
 */
const hooks = new Set<() => void>()

/** Run `fn` on every Stop All; returns the unregister. */
export function onStopAll(fn: () => void): () => void {
  hooks.add(fn)
  return () => { hooks.delete(fn) }
}

export function runStopHooks(): void {
  for (const fn of hooks) { try { fn() } catch (e) { console.error('[StopAll] hook', e) } }
}
