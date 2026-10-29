import { describe, it, expect, beforeEach } from 'vitest'
import { fm1Lcd, fm1LcdWanted, setFm1Poster, watchFm1Lcd, rgb565ToRgba, fm1InChannels, fm1RemapChannel } from '@/lib/fm1-bridge'
import { fm1Parts } from '@/lib/fm1-firmwares'

describe('fm1-bridge', () => {
  let posted: any[]
  beforeEach(() => {
    posted = []
    setFm1Poster(m => posted.push(m))
  })

  it('asks the page for the LCD once for any number of watchers, stops after the last', () => {
    const a = watchFm1Lcd()
    const b = watchFm1Lcd()
    expect(posted).toEqual([{ type: 'sycore-lcd', on: true }])
    expect(fm1LcdWanted()).toBe(true)

    fm1Lcd.value = new Uint16Array(4)
    a()
    a()   // a second call is a no-op
    expect(posted).toHaveLength(1)
    b()
    expect(posted[1]).toEqual({ type: 'sycore-lcd', on: false })
    expect(fm1LcdWanted()).toBe(false)
    expect(fm1Lcd.value).toBeNull()
  })

  it('converts RGB565 to RGBA with full-range channels', () => {
    const out = new Uint8ClampedArray(12)
    rgb565ToRgba(new Uint16Array([0xf800, 0x07e0, 0xffff]), out)
    expect(Array.from(out)).toEqual([255, 0, 0, 255, 0, 255, 0, 255, 255, 255, 255, 255])
  })
})

describe('fm1Parts', () => {
  it('knows the multi-timbral and fixed-channel firmwares, channel 1 otherwise', () => {
    expect(fm1Parts('felucca')).toEqual([0, 1, 2, 3])
    expect(fm1Parts('mvave')).toEqual([1])
    expect(fm1Parts('chipbox')).toEqual([0])
  })
})

describe('FM-1 MIDI Ch In', () => {
  it('collects the channel filters of the cables into FM-1 only', () => {
    expect(fm1InChannels({
      'CHORD_PROG→FM-1 Emulator': { channels: [4, 2] },
      'Launchkey→FM-1 Emulator': { channels: [2] },
      'Launchkey→S-1': { channels: [7] },
      'DRUM→FM-1 Emulator': {},
    })).toEqual([2, 4])
    expect(fm1InChannels({})).toEqual([])
  })

  it('moves channel messages onto a single-part firmware channel', () => {
    expect(fm1RemapChannel([0x92, 60, 100], [1])).toEqual([0x91, 60, 100])
    expect(fm1RemapChannel([0xb2, 7, 90], [1])).toEqual([0xb1, 7, 90])
  })

  it('leaves multi-part firmwares and system messages as sent', () => {
    expect(fm1RemapChannel([0x92, 60, 100], [0, 1, 2, 3])).toEqual([0x92, 60, 100])
    expect(fm1RemapChannel([0xf8], [1])).toEqual([0xf8])
  })
})
