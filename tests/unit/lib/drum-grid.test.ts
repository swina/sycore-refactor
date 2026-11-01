import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { parseAiDrumPattern, DRUM_AI_SYSTEM_PROMPT } from '@/lib/drum-grid'

describe('Drum Machine AI prompt: grids with dynamics', () => {
  it('reads the grid characters, track aliases and swing', () => {
    const p = parseAiDrumPattern('```json\n{ "kick": "X...x...X...x.x.", "Snare": "....X..g....X..g", "hihat": "xoxoxoxo3oxoxox-", "swing": 25 }\n```')!
    expect(p.swing).toBe(25)
    expect(p.rows[0]![0]).toMatchObject({ active: true, accent: true })
    expect(p.rows[1]![7].velocity).toBeLessThan(p.rows[1]![4].velocity)   // ghost < accent
    expect(p.rows[2]![8]).toMatchObject({ active: true, ratchet: 3 })
    expect(p.rows[2]![14].tie).toBe(1)
    expect(p.rows[2]![1].velocity).toBeLessThan(p.rows[2]![0].velocity)   // soft < hit
    expect(p.rows[3]).toBeNull()                                          // Open HH not given
    expect(p.bassline).toBeNull()
  })

  it('still reads the older 0 / 1 arrays and a bassline', () => {
    const p = parseAiDrumPattern(JSON.stringify({ Kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], Bassline: [36, 0, 0, 0, 43] }))!
    expect(p.rows[0]!.filter(s => s.active)).toHaveLength(4)
    expect(p.bassline).toEqual([36, 0, 0, 0, 43])
    expect(p.swing).toBeNull()
  })

  it('null without JSON or tracks; the prompt explains the characters', () => {
    expect(parseAiDrumPattern('sorry')).toBeNull()
    expect(parseAiDrumPattern('{ "tempo": 120 }')).toBeNull()
    expect(DRUM_AI_SYSTEM_PROMPT).toContain('"g" ghost note')
  })
})

describe('Drum Machine store: applyAiPattern', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

  it('writes the steps with their dynamics, clears tracks left out, sets swing', async () => {
    const { useDrumMachineStore } = await import('@/stores/useDrumMachineStore')
    const dm = useDrumMachineStore()
    dm.sequences[dm.activeSequence][3].steps[0].active = true      // Open HH had a hit
    expect(await dm.applyAiPattern('{ "Kick": "X...x...", "Snare": "....X..g", "swing": 30 }')).toBe(true)
    const seq = dm.sequences[dm.activeSequence]
    expect(seq[0].steps[0]).toMatchObject({ active: true, accent: true })
    expect(seq[1].steps[7].velocity).toBeLessThan(60)
    expect(seq[3].steps.some(s => s.active)).toBe(false)
    expect(dm.swing).toBe(30)
    expect(await dm.applyAiPattern('nothing')).toBe(false)
  })
})
