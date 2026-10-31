import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { buildSongPrompt, composeSong, songToModules, applySongPlan, undoSongPlan, type AiSend } from '@/lib/song-composer'
import { validateSongPlan, type SongPlan } from '@/lib/song-plan'
import { useChordProgStore } from '@/stores/useChordProgStore'
import { useDrumMachineStore } from '@/stores/useDrumMachineStore'
import { useArpStore } from '@/stores/useArpStore'
import { midiService } from '@/core/midi/midi-service'

const rawPlan = {
  title: 'Night Drive',
  key: { root: 'A', mode: 'minor' },
  bpm: 118,
  style: { summary: 'French house', drumStyle: 'House' },
  sections: [
    { id: 'intro', name: 'Intro', bars: 4, energy: 2, chords: [{ symbol: 'Am7', beats: 8 }, { symbol: 'Fmaj7', beats: 8 }],
      drums: { Kick: 'x...x...x...x...' } },
    { id: 'chorus', name: 'Chorus', bars: 8, energy: 5, chords: ['Am', 'F', 'C', 'G'], playMode: 'arp' },
  ],
  form: ['intro', 'chorus', 'chorus'],
}
const plan = (): SongPlan => validateSongPlan(rawPlan).plan!
const ok = (data: string) => ({ success: true, data })

describe('song composer: prompt + AI', () => {
  it('puts key, style, tempo and the modules\' limits in the prompt', () => {
    const { system, user } = buildSongPrompt({ root: 'A', mode: 'minor', style: 'like Daft Punk', bpm: 118, bars: 48 })
    expect(user).toContain('A natural minor')
    expect(user).toContain('like Daft Punk')
    expect(user).toContain('118 BPM')
    expect(user).toContain('48 bars')
    expect(system).toContain('"Closed HH"')
    expect(system).toContain('"House"')
    expect(system).toMatch(/up to 8 distinct sections/)
  })

  it('returns a validated plan', async () => {
    const send: AiSend = vi.fn(async () => ok('```json\n' + JSON.stringify(rawPlan) + '\n```'))
    const r = await composeSong({ root: 'A', mode: 'minor', style: 'house', bpm: 118 }, send)
    expect(r.error).toBeUndefined()
    expect(r.plan?.sections).toHaveLength(2)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('asks again once, with the problems, when the answer is unusable', async () => {
    const send = vi.fn<AiSend>()
      .mockResolvedValueOnce(ok('Sorry, here is a song: verse, chorus.'))
      .mockResolvedValueOnce(ok(JSON.stringify(rawPlan)))
    const r = await composeSong({ root: 'A', mode: 'minor', style: 'house', bpm: 118 }, send)
    expect(r.plan).not.toBeNull()
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[1][1]).toContain('could not be used')
    expect(send.mock.calls[1][1]).toContain('No JSON')
  })

  it('gives up after the retry, and without AI settings', async () => {
    const send = vi.fn<AiSend>().mockResolvedValue(ok('{"key":"C","sections":[]}'))
    const r = await composeSong({ root: 'C', mode: 'major', style: '', bpm: 120 }, send)
    expect(r.plan).toBeNull()
    expect(r.error).toBeDefined()
    expect(send).toHaveBeenCalledTimes(2)
    expect((await composeSong({ root: 'C', mode: 'major', style: '', bpm: 120 }, null)).error).toMatch(/not configured/)
    const failing = vi.fn<AiSend>().mockResolvedValue({ success: false, error: 'API error 401' })
    expect((await composeSong({ root: 'C', mode: 'major', style: '', bpm: 120 }, failing)).error).toBe('API error 401')
  })
})

describe('song composer: plan → modules', () => {
  it('fills each section\'s bars by repeating its chord cycle, voiced and timed', () => {
    const d = songToModules(plan())
    const intro = d.chordSlots[0]
    expect(intro.numSteps).toBe(2)                         // 2 chords × 8 beats = 4 bars
    expect(intro.steps.slice(0, 2).map(s => [s.chordName, s.duration])).toEqual([['Am7', '2m'], ['Fmaj7', '2m']])
    expect(intro.steps).toHaveLength(16)
    expect(intro.steps[2].active).toBe(false)
    const chorus = d.chordSlots[1]
    expect(chorus.numSteps).toBe(8)                        // 4 chords × 4 beats, repeated twice = 8 bars
    expect(chorus.playMode).toBe('arp')
    expect(chorus.steps[0].notes.every(n => n >= 50 && n <= 72)).toBe(true)
    expect(chorus.steps[0].velocity).toBeGreaterThan(intro.steps[0].velocity)   // energy 5 > 2
    expect(d.chain.slice(0, 4)).toEqual([0, 1, 1, -1])
    expect(d.chain).toHaveLength(16)
  })

  it('turns drum grids into Drum Machine rows; null when a section has none', () => {
    const d = songToModules(plan())
    const kick = d.drums.A![0]
    expect(kick.map(s => s.active)).toEqual('x...x...x...x...'.split('').map(c => c === 'x'))
    expect(d.drums.A![1].every(s => !s.active)).toBe(true)  // snare not given
    expect(d.drums.B).toBeNull()
  })

  it('warns when durations or bars can\'t be matched', () => {
    const p = validateSongPlan({ ...rawPlan, sections: [{ name: 'Odd', bars: 3, chords: [{ symbol: 'C', beats: 5 }] }, { name: 'Long', bars: 3, chords: [{ symbol: 'G', beats: 8 }] }] }).plan!
    const d = songToModules(p)
    expect(d.issues.some(i => /5 beats played as 4/.test(i.message))).toBe(true)
    expect(d.issues.some(i => /Long plays 4 bars instead of 3/.test(i.message))).toBe(true)
    expect(d.issues.some(i => /Odd plays/.test(i.message))).toBe(false)   // 3 × 4 beats = 3 bars
  })
})

describe('song composer: apply / undo', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.spyOn(midiService, 'setBpm').mockImplementation(() => {})
  })

  it('loads slots, chain, drums and tempo, and undo puts everything back', () => {
    const cp = useChordProgStore()
    const dm = useDrumMachineStore()
    cp.slots[0].steps[0] = { ...cp.slots[0].steps[0], chordName: 'MINE', active: true }
    cp.slotLoad(0)
    const kickBefore = JSON.stringify(dm.sequences.A[0].steps)
    const bpmBefore = useArpStore().arpBpm

    const fallback = vi.fn(() => Array.from({ length: 11 }, () => Array.from({ length: 16 }, (_, i) => ({ active: i % 4 === 0, velocity: 100, accent: false, ratchet: 1, tie: 0 }))))
    const { before, issues } = applySongPlan(plan(), { drumStyleFallback: fallback })

    expect(cp.slots[0].steps[0].chordName).toBe('Am7')
    expect(cp.slots[1].numSteps).toBe(8)
    expect(cp.chain.slice(0, 3)).toEqual([0, 1, 1])
    expect(cp.chainEnabled).toBe(true)
    expect(cp.drumFollow).toBe(true)
    expect(dm.sequences.A[0].steps.filter(s => s.active)).toHaveLength(4)
    expect(fallback).toHaveBeenCalledWith('House')          // the chorus had no grid
    expect(issues.some(i => /House pattern used/.test(i.message))).toBe(true)
    expect(dm.sequences.B[0].steps.filter(s => s.active)).toHaveLength(4)
    expect(dm.chainEnabled).toBe(false)
    expect(dm.activeSequence).toBe('A')
    expect(useArpStore().arpBpm).toBe(118)

    undoSongPlan(before)
    expect(cp.slots[0].steps[0].chordName).toBe('MINE')
    expect(JSON.stringify(dm.sequences.A[0].steps)).toBe(kickBefore)
    expect(cp.drumFollow).toBe(false)
    expect(useArpStore().arpBpm).toBe(bpmBefore)
  })
})

describe('song composer: dynamics and the Sequencer', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

  const dyn = () => validateSongPlan({
    key: 'A minor', bpm: 120,
    sections: [
      { id: 'v', name: 'Verse', bars: 2, energy: 3, playMode: 'chord',
        chords: [{ symbol: 'Am', beats: 4, velocity: 112, strum: 'down' }, { symbol: 'F', beats: 2, velocity: 70, mode: 'arp', arpMode: 'up-down', arpRate: '16t' }, { symbol: 'G', beats: 2 }],
        sequence: { role: 'riff', steps: ['A3!', '-', 'C4', '.', 'E4', '.', 'A3', '.', 'F3', '-', 'A3', '.', 'C4', '.', 'G3', 'B3',
                                          'A3!', '-', 'C4', '.', 'E4', '.', 'A3', '.', 'F3', '-', 'A3', '.', 'G3', '.', 'B3', 'D4'] } },
      { id: 'c', name: 'Chorus', bars: 1, energy: 5, chords: [{ symbol: 'C', beats: 4 }],
        bass: { pattern: 'X...x...x...x...', tones: ['root', 'fifth'] } },
    ],
    form: ['v', 'c'],
  }).plan!

  it('carries per-chord velocity, length and chord/arp into the Chord Prog steps', () => {
    const [slot] = songToModules(dyn()).chordSlots
    expect(slot.steps.slice(0, 3).map(s => s.duration)).toEqual(['1m', '2n', '2n'])
    expect(slot.steps[0]).toMatchObject({ velocity: 112, chordMode: 'down' })
    expect(slot.steps[0].stepMode).toBeUndefined()        // same as the section's playMode
    expect(slot.steps[1]).toMatchObject({ velocity: 70, stepMode: 'arp', arpMode: 'up-down', arpRate: '16t' })
    expect(slot.steps[2].velocity).toBe(70 + 3 * 10)      // no velocity: the section's energy
  })

  it('makes Sequencer banks from sequences, and from an older bass pattern', () => {
    const { seqBanks } = songToModules(dyn())
    const v = seqBanks.A!
    expect(v.numSteps).toBe(32)
    expect(v.steps[0]).toMatchObject({ active: true, notes: [57], tieSteps: 1, edited: true })
    expect(v.steps[0].velocity).toBeGreaterThan(v.steps[2].velocity)   // accent
    expect(v.steps[1].active).toBe(false)
    const c = seqBanks.B!
    expect(c.role).toBe('bass')
    expect(c.steps.filter(s => s.active).map(s => s.notes[0])).toEqual([36, 43, 36, 43])   // C2 G2 C2 G2
  })

  it('loads the banks into the Sequencer and undo puts them back', async () => {
    const { useStepSequencerStore } = await import('@/stores/useStepSequencerStore')
    const sq = useStepSequencerStore()
    const before = JSON.stringify(sq.banks)
    sq.chainEnabled = true
    const reloaded = vi.fn()
    window.addEventListener('seq-banks-reloaded', reloaded)
    const { before: snap } = applySongPlan(dyn(), { drumStyleFallback: () => null })
    expect(sq.banks[0].numSteps).toBe(32)
    expect(sq.banks[0].selectedKey).toBe('A')
    expect(sq.banks[1].steps[0].notes).toEqual([36])
    expect(sq.chainEnabled).toBe(false)
    expect(sq.activeBankIndex).toBe(0)
    undoSongPlan(snap)
    expect(JSON.stringify(sq.banks)).toBe(before)
    expect(sq.chainEnabled).toBe(true)
    expect(reloaded).toHaveBeenCalledTimes(2)
    window.removeEventListener('seq-banks-reloaded', reloaded)
  })
})

describe('song composer: last generation', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

  it('is kept with its request, plan, issues and AI answer; loading / undo marks it', async () => {
    const { saveLastGeneration, loadLastGeneration, markLastGenerationApplied } = await import('@/lib/song-composer')
    expect(loadLastGeneration()).toBeNull()
    const input = { root: 'A', mode: 'minor' as const, style: 'house', bpm: 118, bars: 32 }
    saveLastGeneration({ at: '2026-10-31T18:00:00.000Z', input, plan: plan(), issues: [], raw: '{"title":"Night Drive"}' })
    const g = loadLastGeneration()!
    expect(g.input).toEqual(input)
    expect(g.plan?.title).toBe('Night Drive')
    expect(g.raw).toContain('Night Drive')
    expect(g.appliedAt).toBeUndefined()
    markLastGenerationApplied(true)
    expect(loadLastGeneration()!.appliedAt).toBeTruthy()
    markLastGenerationApplied(false)
    expect(loadLastGeneration()!.appliedAt).toBeUndefined()
  })
})

describe('song composer: presets', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

  const withSounds = () => validateSongPlan({
    key: 'C', bpm: 120,
    sections: [
      { id: 'i', name: 'Intro', bars: 1, chords: ['C'], sounds: { chords: 'Pad' }, sequence: { role: 'bass', steps: ['C2'] } },
      { id: 'c', name: 'Chorus', bars: 1, chords: ['F'], sounds: { chords: 'Strings', seq: 'Lead' } },
      { id: 'o', name: 'Outro', bars: 1, chords: ['G'] },
    ],
    form: ['i', 'c', 'o'],
    sounds: { chords: 'Keys', bass: 'Bass', lead: 'Pluck' },
  }).plan!

  it('a section\'s sounds over the song\'s; the Sequencer\'s from its role', async () => {
    const { planPresetChanges } = await import('@/lib/song-composer')
    expect(planPresetChanges(withSounds(), 'keep')).toEqual({ atLoad: {}, bySlot: {} })
    expect(planPresetChanges(withSounds(), 'once')).toEqual({ atLoad: { chords: 'Pad', seq: 'Bass' }, bySlot: {} })
    expect(planPresetChanges(withSounds(), 'section').bySlot).toEqual({
      0: { chords: 'Pad', seq: 'Bass' }, 1: { chords: 'Strings', seq: 'Lead' }, 2: { chords: 'Keys', seq: 'Pluck' },
    })
  })

  it('sends the categories to the devices the parts are wired to, and stores per-slot presets', async () => {
    const { useMidiStore } = await import('@/stores/useMidiStore')
    const { MidiSource } = await import('@/core/midi/midi-service')
    const midi = useMidiStore()
    midi.routingMatrix[MidiSource.CHORD_PROG] = ['Synth A']
    midi.routingConfig.registrations['Synth A'] = { name: 'Synth A', outChannel: 2 } as any
    const sent: any[] = []
    const on = (e: Event) => sent.push((e as CustomEvent).detail)
    window.addEventListener('device-pc-category-select', on)
    const { issues } = applySongPlan(withSounds(), { drumStyleFallback: () => null, presets: 'section' })
    window.removeEventListener('device-pc-category-select', on)
    expect(sent).toEqual([{ deviceName: 'Synth A', channel: 2, category: 'Pad' }])
    expect(issues.some(i => i.message.includes("Sequencer isn't wired"))).toBe(true)
    expect(useChordProgStore().slotPresets[1]).toEqual({ chords: 'Strings', seq: 'Lead' })
  })

  it('keep: nothing sent, no per-slot presets', () => {
    const sent = vi.fn()
    window.addEventListener('device-pc-category-select', sent)
    applySongPlan(withSounds(), { drumStyleFallback: () => null })
    window.removeEventListener('device-pc-category-select', sent)
    expect(sent).not.toHaveBeenCalled()
    expect(useChordProgStore().slotPresets).toEqual({})
  })

  it('the prompt lists the devices\' categories', () => {
    const { system } = buildSongPrompt({ root: 'C', mode: 'major', style: '', bpm: 120, presets: 'section', categories: { chords: ['Pad', 'Keys'] } })
    expect(system).toContain('one of "Pad", "Keys"')
    expect(system).toMatch(/in each section, optional "sounds"/)
  })
})

describe('song composer: Chord Prog chords mode', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

  const mixed = () => validateSongPlan({
    key: 'C', bpm: 120,
    sections: [
      { name: 'A', bars: 1, playMode: 'arp', chords: [{ symbol: 'C', beats: 2, strum: 'up', arpMode: 'down', arpRate: '8n' }, { symbol: 'F', beats: 2, mode: 'chord' }] },
      { name: 'B', bars: 1, playMode: 'chord', chords: [{ symbol: 'G', beats: 4, mode: 'arp' }] },
    ],
  }).plan!

  it('chord: block chords everywhere (strums kept, no arp settings)', () => {
    const { chordSlots } = songToModules(mixed(), { chordsMode: 'chord' })
    expect(chordSlots.map(s => s.playMode)).toEqual(['chord', 'chord'])
    const steps = chordSlots.flatMap(s => s.steps.slice(0, s.numSteps))
    expect(steps.every(st => st.stepMode === undefined && st.arpMode === 'up' && st.arpRate === undefined)).toBe(true)   // 'up' = the step default, unused in chord mode
    expect(chordSlots[0].steps[0].chordMode).toBe('up')
  })

  it('arp: arpeggiated everywhere; mixed: as written', () => {
    const arp = songToModules(mixed(), { chordsMode: 'arp' }).chordSlots
    expect(arp.map(s => s.playMode)).toEqual(['arp', 'arp'])
    expect(arp[0].steps[0]).toMatchObject({ arpMode: 'down', arpRate: '8n' })
    expect(arp[0].steps[0].chordMode).toBeUndefined()
    expect(arp[0].steps[1].stepMode).toBeUndefined()
    const mix = songToModules(mixed(), { chordsMode: 'mixed' }).chordSlots
    expect(mix.map(s => s.playMode)).toEqual(['arp', 'chord'])
    expect(mix[0].steps[1].stepMode).toBe('chord')
    expect(mix[1].steps[0].stepMode).toBe('arp')
  })

  it('the prompt asks for block chords only by default', () => {
    expect(buildSongPrompt({ root: 'C', mode: 'major', style: '', bpm: 120 }).system).toMatch(/block chords only/)
    expect(buildSongPrompt({ root: 'C', mode: 'major', style: '', bpm: 120, chordsMode: 'arp' }).system).toMatch(/played arpeggiated/)
  })

  it('in the chain each slot plays its own mode', () => {
    const cp = useChordProgStore()
    applySongPlan(mixed(), { drumStyleFallback: () => null, chordsMode: 'mixed' })
    const { steps, slotIndices } = cp.getChainSteps()
    const modeOf = (slot: number) => steps.filter((_, i) => slotIndices[i] === slot).map(s => s.stepMode)
    expect(modeOf(0)).toEqual(['arp', 'chord'])   // slot arp, F's own 'chord' kept
    expect(modeOf(1)).toEqual(['arp'])            // slot chord, G's own 'arp' kept
    applySongPlan(mixed(), { drumStyleFallback: () => null, chordsMode: 'chord' })
    expect(cp.getChainSteps().steps.every(s => s.stepMode === 'chord')).toBe(true)
  })
})

describe('song composer: drum feel', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

  it('grid cells become velocity / accent / ratchet / tie', async () => {
    const { drumGridToSteps } = await import('@/lib/song-composer')
    const st = drumGridToSteps('X.gx3.o-x--.x...', 3)
    expect(st[0]).toMatchObject({ active: true, accent: true })
    expect(st[2].velocity).toBeLessThan(st[3].velocity)           // ghost < hit
    expect(st[4]).toMatchObject({ active: true, ratchet: 3 })
    expect(st[6]).toMatchObject({ active: true, tie: 1 })         // 'o-'
    expect(st[6].velocity).toBeLessThan(st[8].velocity)           // soft < hit
    expect(st[8].tie).toBe(2)                                     // 'x--'
    expect(st[7].active).toBe(false)
    expect(st[0].velocity).toBeGreaterThan(st[12].velocity)       // accent > hit on the beat
    // on the beat louder than the 16th in between, same result every time
    const hats = drumGridToSteps('xxxxxxxxxxxxxxxx', 3)
    expect(hats[0].velocity).toBeGreaterThan(hats[1].velocity)
    expect(drumGridToSteps('xxxxxxxxxxxxxxxx', 3)).toEqual(hats)
  })

  it('loads swing into the Drum Machine and undo puts it back', () => {
    const dm = useDrumMachineStore()
    dm.swing = 5
    const p = validateSongPlan({ key: 'C', style: { swing: 30 }, sections: [{ name: 'A', chords: ['C'], drums: { Snare: '....X..g....X...' } }] }).plan!
    const { before } = applySongPlan(p, { drumStyleFallback: () => null })
    expect(dm.swing).toBe(30)
    expect(dm.sequences.A[1].steps[7]).toMatchObject({ active: true, accent: false })
    expect(dm.sequences.A[1].steps[7].velocity).toBeLessThan(60)
    undoSongPlan(before)
    expect(dm.swing).toBe(5)
  })

  it('the prompt explains the grid characters and swing', () => {
    const { system } = buildSongPrompt({ root: 'C', mode: 'major', style: '', bpm: 120 })
    expect(system).toContain('"g" ghost note')
    expect(system).toContain('"swing"')
  })
})
