import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/lib/ai-service', () => ({ sendAiPrompt: vi.fn() }))
vi.mock('@/stores/useAiAgentStore', () => ({
  useAiAgentStore: () => ({ isConfigured: true, selectedProvider: 'x', endpoint: '', model: 'm', apiKey: 'k' }),
}))

import { sendAiPrompt } from '@/lib/ai-service'
import { useStepSequencerStore } from '@/stores/useStepSequencerStore'

const answer = (n: number) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ active: i % 2 === 0, notes: [60 + i], velocity: 100, gate: 75 })))

describe('Sequencer AI generation: LENGTH follows the generated steps', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); vi.mocked(sendAiPrompt).mockReset() })

  it('an 8-step answer on a 16-step bank makes an 8-step bank', async () => {
    const sq = useStepSequencerStore()
    expect(sq.activeBank.numSteps).toBe(16)
    vi.mocked(sendAiPrompt).mockResolvedValue({ success: true, data: answer(8) } as any)
    expect(await sq.generateFromAiPrompt('8 step acid line')).toBe(true)
    expect(sq.activeBank.numSteps).toBe(8)
    expect(sq.activeBank.basePatternLength).toBe(8)
    expect(sq.activeBank.steps).toHaveLength(8)
    expect(sq.playbackSteps.numSteps).toBe(8)
  })

  it('a longer answer grows the bank (max 64)', async () => {
    const sq = useStepSequencerStore()
    vi.mocked(sendAiPrompt).mockResolvedValue({ success: true, data: answer(80) } as any)
    await sq.generateFromAiPrompt('long')
    expect(sq.activeBank.numSteps).toBe(64)
    expect(sq.activeBank.steps).toHaveLength(64)
  })
})
