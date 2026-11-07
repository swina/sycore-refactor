import { describe, it, expect, beforeEach } from 'vitest'
import { StepScheduler } from '@/core/midi/step-scheduler'
import { countSendDelay, countLongTask, countFlushGap, countSendCost, countLongFrame, takeSysClockStats, resetSysClockStats } from '@/core/midi/sys-clock-stats'

describe('CLK SYS diagnostics counters', () => {
  beforeEach(() => resetSysClockStats())

  it('nothing happened: empty fragment', () => {
    expect(takeSysClockStats()).toBe('')
  })

  it('counts a stall\'s late steps per app, not the steps skipped at a late start', () => {
    const s = new StepScheduler(() => {}, { lookaheadMs: 100, lateToleranceMs: 60, name: 'DRUM' })
    s.start(1000, 120)  // a 16th = 125 ms
    s.tick(1300)        // late start: steps 0, 1 late (skipped on purpose); 2 (1250), 3 (1375) on time
    expect(takeSysClockStats()).toBe('CLK SYS start DRUM +300 ms')
    s.tick(1800)        // stall: steps 4 (1500), 5 (1625) late; 6 (1750), 7 (1875) on time
    expect(takeSysClockStats()).toBe('CLK SYS late steps DRUM 2')
  })

  it('send delay: average and max, negative as 0, reset after take', () => {
    countSendDelay(2); countSendDelay(-1); countSendDelay(10)
    expect(takeSysClockStats()).toBe('send delay avg 4.0 / max 10 ms (3 msgs)')
    expect(takeSysClockStats()).toBe('')
  })

  it('long tasks: count, max, total', () => {
    countLongTask(80); countLongTask(120.4)
    expect(takeSysClockStats()).toBe('long tasks 2 / max 120 / total 200 ms')
  })

  it('flush gap max and send cost per destination (top two, under 1 ms total omitted)', () => {
    countFlushGap(4); countFlushGap(31.6)
    countSendCost('SYC OUT A', 0.4); countSendCost('Synth', 6.2); countSendCost('Synth', 3); countSendCost('WORLDE', 0.2)
    expect(takeSysClockStats()).toBe('flush gap max 32 ms · send cost 10 ms (Synth 9, SYC OUT A 0)')
    countSendCost('SYC OUT A', 0.3)
    expect(takeSysClockStats()).toBe('')
  })

  it('worst frame: the longest of the window, by its heaviest script', () => {
    countLongFrame(70, [])
    countLongFrame(82, [
      { duration: 12, invoker: 'Worker.onmessage', sourceFunctionName: 'flushTimed', sourceURL: 'http://x/src/core/midi/midi-service.ts?t=1' },
      { duration: 64, invoker: 'Worker.onmessage', sourceFunctionName: 'tickCb', sourceURL: 'http://x/src/components/ChordProgSequencer.vue?vue&t=2' },
    ])
    countLongFrame(60, [{ duration: 50, sourceFunctionName: 'x', sourceURL: 'y.ts' }])
    expect(takeSysClockStats()).toBe('worst frame 82 ms: tickCb @ ChordProgSequencer.vue 64 ms via Worker.onmessage')
    countLongFrame(55, [])
    expect(takeSysClockStats()).toBe('worst frame 55 ms: no script (style/layout/render)')
  })
})
