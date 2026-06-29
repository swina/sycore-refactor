/**
 * idb.ts — Compatibility shim.
 *
 * Re-exports everything from the modular persistence layer.
 * All existing imports from '@/lib/idb' continue to work unchanged.
 */
export * from './db/index';