/**
 * debounce.ts — trailing-edge debounce with flush/cancel, plus a registry
 * that flushes every debounced call on page unload.
 *
 * Built for localStorage persistence writes that were firing synchronously
 * on every MIDI CC tick (e.g. a controller-mapped fader) — each write
 * blocks the main JS thread just long enough to disrupt Tone.js Transport
 * scheduling, causing audible drum-machine/sequencer stutter. Debouncing
 * the write (while keeping the in-memory state update and MIDI send
 * synchronous) removes that blocking without changing behavior otherwise.
 */

type Debounced<A extends unknown[]> = ((...args: A) => void) & {
  flush: () => void;
  cancel: () => void;
};

const pendingFlushes = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    pendingFlushes.forEach(flush => flush());
  });
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: A | null = null;

  const flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (lastArgs) {
      const args = lastArgs;
      lastArgs = null;
      fn(...args);
    }
  };

  const debounced = ((...args: A) => {
    lastArgs = args;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(flush, wait);
  }) as Debounced<A>;

  debounced.flush = flush;
  debounced.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    lastArgs = null;
  };

  pendingFlushes.add(debounced.flush);

  return debounced;
}
