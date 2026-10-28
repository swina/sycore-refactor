import { describe, it, expect, beforeEach } from 'vitest'
import {
  recordScheduledHit, recordMidiIngress, recordStall,
  getDiagnosticsSnapshot, resetDiagnostics, seriesAvg,
  recordLongFrameScripts, getTopHogs, shortSource,
  callerFromStack, recordDrawRun, attributeDrawScript, getDrawByCaller,
} from '@/lib/audio-diagnostics'

describe('audio-diagnostics', () => {
  beforeEach(() => resetDiagnostics())

  it('counts hits scheduled in the past as late, with the worst lateness', () => {
    recordScheduledHit(10.1, 10.0)   // 100 ms ahead
    recordScheduledHit(10.0, 10.02)  // 20 ms late
    recordScheduledHit(10.0, 10.005) // 5 ms late
    const s = getDiagnosticsSnapshot()
    expect(s.hitMarginMs.count).toBe(3)
    expect(s.lateHits).toBe(2)
    expect(s.maxLateMs).toBeCloseTo(20)
    expect(s.hitMarginMs.min).toBeCloseTo(-20)
    expect(s.hitMarginMs.max).toBeCloseTo(100)
  })

  it('ignores negative / non-finite MIDI ingress delays', () => {
    recordMidiIngress(2)
    recordMidiIngress(6)
    recordMidiIngress(-1)
    recordMidiIngress(NaN)
    const s = getDiagnosticsSnapshot()
    expect(s.midiIngressMs.count).toBe(2)
    expect(seriesAvg(s.midiIngressMs)).toBe(4)
    expect(s.midiIngressMs.max).toBe(6)
  })

  it('tracks stalls and resets everything', () => {
    recordStall(150)
    expect(getDiagnosticsSnapshot().stallMs.max).toBe(150)
    resetDiagnostics()
    const s = getDiagnosticsSnapshot()
    expect(s.stallMs.count).toBe(0)
    expect(s.lateHits).toBe(0)
    expect(seriesAvg(s.hitMarginMs)).toBeNull()
  })

  it('returns snapshots that do not alias the live counters', () => {
    recordStall(10)
    const s = getDiagnosticsSnapshot()
    recordStall(500)
    expect(s.stallMs.max).toBe(10)
  })
})

describe('audio-diagnostics main-thread hogs', () => {
  beforeEach(() => resetDiagnostics())

  it('shortens source URLs to the app/dependency path', () => {
    expect(shortSource('http://localhost:3999/src/components/Foo.vue?t=1')).toBe('components/Foo.vue')
    expect(shortSource('http://localhost:3999/node_modules/.vite/deps/tone.js?v=abc')).toBe('tone.js')
    expect(shortSource('')).toBe('(anonymous)')
  })

  it('groups scripts by invoker+function+file and ranks by total time', () => {
    recordLongFrameScripts([
      { invoker: 'MIDIInput.onmidimessage', sourceFunctionName: 'handleIngress', sourceURL: 'http://h/src/core/midi/midi-service.ts', duration: 30 },
      { invoker: 'TimerHandler:setInterval', sourceFunctionName: 'poll', sourceURL: 'http://h/src/components/X.vue', duration: 80 },
    ])
    recordLongFrameScripts([
      { invoker: 'MIDIInput.onmidimessage', sourceFunctionName: 'handleIngress', sourceURL: 'http://h/src/core/midi/midi-service.ts?t=2', duration: 70 },
    ])
    const top = getTopHogs()
    expect(top).toHaveLength(2)
    expect(top[0]).toMatchObject({ fn: 'handleIngress', file: 'core/midi/midi-service.ts', count: 2, totalMs: 100, maxMs: 70 })
    expect(top[1].fn).toBe('poll')
    resetDiagnostics()
    expect(getTopHogs()).toHaveLength(0)
  })
})

describe('audio-diagnostics Tone.Draw attribution', () => {
  beforeEach(() => resetDiagnostics())

  it('picks the first app frame, skipping diagnostics code and deps', () => {
    const stack = [
      'Error',
      '    at Draw.schedule (http://localhost:3999/src/components/AudioDiagnosticsPanel.vue?t=1:120:5)',
      '    at http://localhost:3999/node_modules/.vite/deps/tone.js?v=1:9:9',
      '    at _scheduleCallback (http://localhost:3999/src/components/DrumMachine.vue?t=2:490:17)',
    ].join('\n')
    expect(callerFromStack(stack)).toBe('components/DrumMachine.vue:490')
    expect(callerFromStack('Error\n    at x (http://h/node_modules/a.js:1:1)')).toBe('(unknown)')
  })

  it('splits a long _drawLoop script across the callers that ran inside it', () => {
    recordDrawRun(100, 'components/DrumMachine.vue:490')
    recordDrawRun(101, 'components/ChordProgSequencer.vue:362')
    recordDrawRun(500, 'components/Sequencer.vue:1468') // outside the window
    attributeDrawScript(99, 80)
    attributeDrawScript(1000, 20) // nothing ran in it
    const rows = getDrawByCaller()
    const byCaller = Object.fromEntries(rows.map(r => [r.caller, r]))
    expect(byCaller['components/DrumMachine.vue:490'].totalMs).toBe(40)
    expect(byCaller['components/ChordProgSequencer.vue:362'].totalMs).toBe(40)
    expect(byCaller['(unknown)'].totalMs).toBe(20)
    expect(byCaller['components/Sequencer.vue:1468'].frames).toBe(0)
  })

  it('sums the synchronous time of each callback run', () => {
    recordDrawRun(1, 'a.vue:1', 2)
    recordDrawRun(2, 'a.vue:1', 6)
    const [row] = getDrawByCaller()
    expect(row).toMatchObject({ runs: 2, syncMs: 8, syncMaxMs: 6 })
  })
})
