import { expect, test } from 'claude-code/testing'

import { ANIMATIONS, BLINK, CLAWD_COLOR, cells, clawdSvg, pixels, REST } from '../hooks/clawd'

const filled = (grid: boolean[][]) => grid.flat().filter(Boolean).length

test('at rest Clawd is the welcome banner, in a canvas with room around him', () => {
  expect(cells(REST)).toEqual([
    '             ',
    '   ▐▛███▜▌   ',
    '  ▝▜█████▛▘  ',
    '    ▘▘ ▝▝    ',
  ])
})

test('no frame runs him off the canvas', () => {
  // A body of 12 by 4, two eye holes when they show, two arms and four legs of two pixels and one.
  for (const frame of [...Object.values(ANIMATIONS).flat(), ...BLINK]) {
    const eyes = frame.eyes === 'shut' ? 0 : 2
    expect(filled(pixels(frame))).toBe(48 - eyes + 4 + 4)
    expect(cells(frame).every(row => row.length === 13)).toBe(true)
  }
})

test('every animation starts off his resting frame', () => {
  for (const frames of Object.values(ANIMATIONS)) expect(cells(frames[0]!)).not.toEqual(cells(REST))
})

test('the svg draws his pixels in his color', () => {
  const svg = clawdSvg(REST)
  expect(svg.startsWith('<svg')).toBe(true)
  expect(svg).toContain(`fill="${CLAWD_COLOR}"`)
  // One rect per run of pixels: his top row, the row of eyes in three, arms and body, the last body row, four legs.
  expect(svg.split('<rect').length - 1).toBe(1 + 3 + 1 + 1 + 4)
})
