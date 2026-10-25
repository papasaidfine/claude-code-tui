import { expect, test } from 'claude-code/testing'

import { ANIMATIONS, BLINK, cells, clawdSvg, DOZE, lidColor, pixels, REST, svgSize, text, THEMES, themeOn } from '../hooks/clawd'

const FRAMES = [REST, ...Object.values(ANIMATIONS).flat(), ...BLINK, ...DOZE]
const filled = (grid: (string | undefined)[][]) => grid.flat().filter(Boolean).length
const hatPixels = (theme: (typeof THEMES)[keyof typeof THEMES]) =>
  (theme.hat?.rows.join('') ?? '').replace(/\./g, '').length

test('at rest Clawd is the welcome banner, in a canvas with room around him', () => {
  expect(text(cells(REST))).toEqual([
    '             ',
    '   ▐▛███▜▌   ',
    '  ▝▜█████▛▘  ',
    '    ▘▘ ▝▝    ',
  ])
})

test('no frame runs him or his hat off the canvas', () => {
  // A body of 12 by 4, two eye holes open, none shut or closed; two arms of two pixels and four legs.
  for (const theme of Object.values(THEMES))
    for (const frame of FRAMES) {
      const eyes = frame.eyes === 'shut' || frame.eyes === 'closed' ? 0 : 2
      expect(filled(pixels(frame, theme))).toBe(48 - eyes + 4 + 4 + hatPixels(theme))
      expect(text(cells(frame, theme)).every(row => row.length === 13)).toBe(true)
    }
})

test('a cell is one color, or two that fill it, so the terminal can draw it exactly', () => {
  for (const theme of Object.values(THEMES))
    for (const frame of FRAMES) {
      const grid = pixels(frame, theme)
      for (let y = 0; y < grid.length; y += 2)
        for (let x = 0; x < 26; x += 2) {
          const quad = [grid[y]?.[x], grid[y]?.[x + 1], grid[y + 1]?.[x], grid[y + 1]?.[x + 1]]
          const colors = new Set(quad.filter(Boolean))
          if (colors.size > 1) expect(quad.every(Boolean)).toBe(true)
          expect(colors.size).toBeLessThanOrEqual(2)
        }
    }
})

test('every animation starts off his resting frame', () => {
  for (const frames of Object.values(ANIMATIONS)) expect(text(cells(frames[0]!))).not.toEqual(text(cells(REST)))
})

test('the Christmas Clawd is light blue under a red hat with a white brim and pom-pom', () => {
  const rows = cells(REST, THEMES.christmas)
  const runs = rows.flat()
  expect(text(rows)).toEqual([
    '             ',
    '     ▄██▄█   ',
    '   ▄▀▀▀▀▀▄   ',
    '   ▐▛███▜▌   ',
    '  ▝▜█████▛▘  ',
    '    ▘▘ ▝▝    ',
  ])
  expect(runs.some(run => run.color === '#9FD3F2' && run.text.includes('█'))).toBe(true)
  expect(runs.some(run => run.color === '#E03C3C' && run.background === '#F4F4F4')).toBe(true)
})

test('dozing, his eyes closed and z s rise beside his head', () => {
  const dozing = DOZE.filter(frame => frame.zs === 2)
  expect(dozing.length).toBeGreaterThan(0)
  for (const theme of Object.values(THEMES)) {
    const rows = text(cells(dozing[0]!, theme))
    expect(rows.join('')).toContain('z')
    expect(rows.join('')).toContain('Z')
  }
  expect(DOZE.slice(0, -3).every(frame => frame.eyes === 'closed')).toBe(true)
})

test('seasonal dresses him by the date', () => {
  const on = (iso: string) => themeOn(new Date(`${iso}T12:00:00`).getTime())
  expect(on('2026-12-24')).toBe('christmas')
  expect(on('2026-12-27')).toBe('classic')
  expect(on('2026-10-25')).toBe('halloween')
  expect(on('2026-10-16')).toBe('classic')
  expect(on('2027-02-01')).toBe('lunar-new-year')
  expect(on('2027-02-20')).toBe('lunar-new-year')
  expect(on('2027-02-21')).toBe('classic')
  expect(on('2026-07-01')).toBe('classic')
})

test('the svg draws each pixel in its own color, a hat making it taller', () => {
  const svg = clawdSvg(REST, THEMES.christmas)
  expect(svg.startsWith('<svg')).toBe(true)
  for (const color of ['#9FD3F2', '#E03C3C', '#F4F4F4']) expect(svg).toContain(`fill="${color}"`)
  expect(svgSize(THEMES.christmas).height).toBeGreaterThan(svgSize(THEMES.classic).height)
  expect(clawdSvg({ ...REST, zs: 2 })).toContain('>Z</text>')
})

test('a blink takes his eyes away; asleep they are thin lids, no bigger than open eyes', () => {
  expect(text(cells(BLINK[0]!))[1]).toBe('   ▐█████▌   ')
  const asleep = cells(DOZE[0]!)
  expect(text(asleep)[1]).toBe('   ▐╶███╴▌   ')
  const lid = asleep[1]!.find(run => run.text === '╶')
  expect(lid).toEqual({ text: '╶', color: lidColor(THEMES.classic), background: THEMES.classic.body })
  expect(lidColor(THEMES.classic)).toBe('#563023')
  expect(clawdSvg(DOZE[0]!)).toContain('height="1.5"')
})

test('a hat tip trails behind him: it swings left as he faces right', () => {
  const facing = (eyes: 'left' | 'right') => text(cells({ ...REST, eyes }, THEMES.christmas))
  expect(facing('left')[1]).toBe('     ▄██▄█   ')
  expect(facing('right')[1]).toBe('   █▄██▄     ')
  expect(facing('right')[2]).toBe(facing('left')[2])
  expect(text(cells({ ...REST, eyes: 'right' }, THEMES.halloween))[1]).toBe('     █▄      ')
})
