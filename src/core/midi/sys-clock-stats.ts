/**
 * sys-clock-stats.ts — counters for the CLK SYS diagnostics (transport sync panel,
 * Copy diagnostics), collected per one-second window:
 *
 *   late steps  — steps a StepScheduler found later than its tolerance (a stalled page)
 *                 and passed silently, per app. The steps skipped on purpose at a late
 *                 start (Live's bar already under way) are not counted.
 *   send delay  — how late the Worker-timed queue (midi-service) really sent a message,
 *                 against the time it was due: the main-thread delay a CLK SYS note gets.
 *   start       — how late each app's first tick came against its step 0 (+ = late): the
 *                 start delay after Live's Start, per app.
 *   flush gap   — longest time between two runs of the queue while it held messages: the
 *                 page busy (any task, also under 50 ms) when a note was due.
 *   send cost   — time spent inside the sends themselves, per destination (a virtual
 *                 instrument plays in JS on its note-on), top two.
 *   long tasks  — main-thread tasks over 50 ms (PerformanceObserver 'longtask', Chromium):
 *                 what blocks the page, hence the send delay.
 *   worst frame — the longest animation frame of the window (PerformanceObserver
 *                 'long-animation-frame', Chrome 123+) and the script that took most of
 *                 it: function, file, what invoked it — who blocks the page.
 */

const lateSteps = new Map<string, number>();
const startLate = new Map<string, number>();

/** An app's first tick came `ms` after its step 0 (negative: before). */
export function countStartLate(app: string, ms: number): void {
  startLate.set(app, ms);
}
let delayCount = 0;
let delaySum = 0;
let delayMax = 0;
let longCount = 0;
let longTotal = 0;
let longMax = 0;
let longObserver: PerformanceObserver | null = null;
let flushGapMax = 0;
const sendCost = new Map<string, number>();

/** Time between two queue runs while it held messages. */
export function countFlushGap(ms: number): void {
  if (ms > flushGapMax) flushGapMax = ms;
}

/** Time spent in one send to `dest`. */
export function countSendCost(dest: string, ms: number): void {
  if (ms > 0) sendCost.set(dest, (sendCost.get(dest) ?? 0) + ms);
}

let loafObserver: PerformanceObserver | null = null;
let worstFrame: { ms: number; script: string } | null = null;

/** The part of a long animation frame's script attribution we use (not in lib.dom yet). */
interface LoafScript { duration: number; invoker?: string; sourceFunctionName?: string; sourceURL?: string }

/** Start counting long tasks and attributing long frames (once; no-op where unsupported). */
export function observeLongTasks(): void {
  if (typeof PerformanceObserver === 'undefined') return;
  const types = PerformanceObserver.supportedEntryTypes ?? [];
  if (!longObserver && types.includes('longtask')) {
    longObserver = new PerformanceObserver(list => {
      for (const e of list.getEntries()) countLongTask(e.duration);
    });
    longObserver.observe({ type: 'longtask', buffered: false });
  }
  if (!loafObserver && types.includes('long-animation-frame')) {
    loafObserver = new PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        const scripts = ((e as unknown as { scripts?: LoafScript[] }).scripts ?? []);
        countLongFrame(e.duration, scripts);
      }
    });
    loafObserver.observe({ type: 'long-animation-frame', buffered: false });
  }
}

/** A long animation frame: keep the window's worst, described by its heaviest script. */
export function countLongFrame(ms: number, scripts: LoafScript[]): void {
  if (worstFrame && worstFrame.ms >= ms) return;
  const top = [...scripts].sort((a, b) => b.duration - a.duration)[0];
  let script = 'no script (style/layout/render)';
  if (top) {
    const file = (top.sourceURL ?? '').split('?')[0].split('/').pop() || '?';
    const fn = top.sourceFunctionName || 'anonymous';
    script = `${fn} @ ${file} ${Math.round(top.duration)} ms via ${top.invoker ?? '?'}`;
  }
  worstFrame = { ms, script };
}

/** A main-thread task lasted `ms` (over 50). */
export function countLongTask(ms: number): void {
  longCount++;
  longTotal += ms;
  if (ms > longMax) longMax = ms;
}

/** A step passed silently because it was found too late. */
export function countLateStep(app: string): void {
  lateSteps.set(app, (lateSteps.get(app) ?? 0) + 1);
}

/** A Worker-timed send went out `lateMs` after it was due (negative counts as 0). */
export function countSendDelay(lateMs: number): void {
  const ms = lateMs > 0 ? lateMs : 0;
  delayCount++;
  delaySum += ms;
  if (ms > delayMax) delayMax = ms;
}

/** The window's counters as a diagnostics fragment ('' when nothing happened), then reset. */
export function takeSysClockStats(): string {
  const parts: string[] = [];
  if (startLate.size > 0) {
    parts.push(`CLK SYS start ${[...startLate.entries()].map(([app, ms]) => `${app} ${ms >= 0 ? '+' : ''}${Math.round(ms)}`).join(', ')} ms`);
  }
  if (lateSteps.size > 0) {
    parts.push(`CLK SYS late steps ${[...lateSteps.entries()].map(([app, n]) => `${app} ${n}`).join(', ')}`);
  }
  if (delayCount > 0) {
    parts.push(`send delay avg ${(delaySum / delayCount).toFixed(1)} / max ${Math.round(delayMax)} ms (${delayCount} msgs)`);
  }
  if (flushGapMax > 0) parts.push(`flush gap max ${Math.round(flushGapMax)} ms`);
  const costTotal = [...sendCost.values()].reduce((a, b) => a + b, 0);
  if (costTotal >= 1) {
    const top = [...sendCost.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)
      .map(([d, ms]) => `${d} ${Math.round(ms)}`).join(', ');
    parts.push(`send cost ${Math.round(costTotal)} ms (${top})`);
  }
  if (worstFrame) parts.push(`worst frame ${Math.round(worstFrame.ms)} ms: ${worstFrame.script}`);
  if (longCount > 0) {
    parts.push(`long tasks ${longCount} / max ${Math.round(longMax)} / total ${Math.round(longTotal)} ms`);
  }
  resetSysClockStats();
  return parts.join(' · ');
}

export function resetSysClockStats(): void {
  lateSteps.clear();
  startLate.clear();
  delayCount = 0;
  delaySum = 0;
  delayMax = 0;
  longCount = 0;
  longTotal = 0;
  longMax = 0;
  flushGapMax = 0;
  sendCost.clear();
  worstFrame = null;
}
