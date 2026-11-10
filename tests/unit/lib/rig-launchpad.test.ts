import { describe, it, expect } from 'vitest'
import { muteOtherSenders, unmuteOtherSenders, rigSend, ledMessage, ledDiff, parseLaunchpadInput, colorVelocity, LP_LED_COUNT, isLaunchpadName } from '@/lib/rig-launchpad'

describe('rig-launchpad LEDs', () => {
  it('maps LED slots to grid notes, side notes and top CCs (XY layout)', () => {
    expect(ledMessage(0, 60)).toEqual([0x90, 0, 60])
    expect(ledMessage(8 * 2 + 5, 60)).toEqual([0x90, 16 * 2 + 5, 60]) // row 2, col 5
    expect(ledMessage(64 + 3, 63)).toEqual([0x90, 16 * 3 + 8, 63]) // side, row 3
    expect(ledMessage(72 + 7, 15)).toEqual([0xB0, 111, 15]) // top, last
  })

  it('sends everything the first time, then only what changed', () => {
    const a = Array(LP_LED_COUNT).fill(12)
    expect(ledDiff(null, a)).toHaveLength(LP_LED_COUNT)
    const b = a.slice(); b[1] = 60; b[72] = 63
    expect(ledDiff(a, b)).toEqual([[0x90, 1, 60], [0xB0, 104, 63]])
    expect(ledDiff(b, b)).toEqual([])
  })

  it('colors: steady with Copy + Clear flags, the queued amber flashes', () => {
    expect(colorVelocity('off')).toBe(12)
    expect(colorVelocity('green') & 12).toBe(12)
    expect(colorVelocity('amber') & 12).toBe(12)
    expect(colorVelocity('red') & 12).toBe(12)
    expect(colorVelocity('amberFlash') & 12).toBe(8)
  })
})

describe('rig-launchpad input', () => {
  it('parses pads, side buttons and top buttons, press and release', () => {
    expect(parseLaunchpadInput([0x90, 16 * 4 + 2, 127])).toEqual({ kind: 'pad', row: 4, col: 2, down: true })
    expect(parseLaunchpadInput([0x90, 16 * 4 + 2, 0])).toEqual({ kind: 'pad', row: 4, col: 2, down: false })
    expect(parseLaunchpadInput([0x80, 16 * 4 + 2, 64])).toEqual({ kind: 'pad', row: 4, col: 2, down: false })
    expect(parseLaunchpadInput([0x90, 16 * 6 + 8, 127])).toEqual({ kind: 'side', row: 6, down: true })
    expect(parseLaunchpadInput([0xB0, 111, 127])).toEqual({ kind: 'top', index: 7, down: true })
    expect(parseLaunchpadInput([0xB0, 111, 0])).toEqual({ kind: 'top', index: 7, down: false })
    expect(parseLaunchpadInput([0xB0, 7, 100])).toBeNull()
    expect(parseLaunchpadInput([0x90, 16 * 2 + 12, 127])).toBeNull()
  })

  it('recognises the Launchpad by its port name', () => {
    expect(isLaunchpadName('Launchpad Mini')).toBe(true)
    expect(isLaunchpadName('MIDIIN2 (Launchpad Mini)')).toBe(true)
    expect(isLaunchpadName('MIDI Mix')).toBe(false)
  })
})

describe('rig-launchpad muting', () => {
  it("other senders are dropped while muted, the rig's go through; unmute restores the port", () => {
    const sent: number[][] = []
    class Port { send(d: number[]) { sent.push(d) } }
    const port = new Port()
    muteOtherSenders(port)
    port.send([0x90, 0, 0])          // e.g. a MIDI Learn LED
    rigSend(port, [0x90, 0, 60])     // the rig
    expect(sent).toEqual([[0x90, 0, 60]])
    unmuteOtherSenders()
    port.send([0x90, 1, 63])
    expect(sent).toEqual([[0x90, 0, 60], [0x90, 1, 63]])
  })
})
