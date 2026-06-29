/**
 * midi-monitor.ts — MIDI Monitor ring buffer.
 *
 * Self-contained: manages a 500-entry ring buffer of MidiMonitorEntry
 * objects and notifies listeners when new entries arrive.
 */

import type { MidiMonitorEntry } from '@/types/midi';

export class MidiMonitor {
  private seq = 0;
  private buffer: MidiMonitorEntry[] = [];
  private listeners: ((entry: MidiMonitorEntry) => void)[] = [];

  /** Append a new entry (fills in id if omitted) */
  append(entry: MidiMonitorEntry): void {
    if (!entry.id) entry.id = ++this.seq;
    if (this.buffer.length >= 500) this.buffer.shift();
    this.buffer.push(entry);
    this.listeners.forEach(l => l(entry));
  }

  /** Return a copy of the current buffer */
  getBuffer(): MidiMonitorEntry[] {
    return this.buffer;
  }

  /** Clear all entries */
  clear(): void {
    this.buffer = [];
  }

  /** Register a listener; returns unsubscribe function */
  addListener(cb: (entry: MidiMonitorEntry) => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter(l => l !== cb);
    };
  }
}