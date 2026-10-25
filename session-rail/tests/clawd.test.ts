import { expect, test } from 'claude-code/testing'

import { ANIMATIONS, BLINK, cells, clawdSvg, DOZE, pixels, REST, svgSize, text, THEMES, themeOn } from '../hooks/clawd'
import type { Theme } from '../hooks/clawd'

const FRAMES = [REST, ...Object.values(ANIMATIONS).flat(), ...BLINK, ...DOZE]
const BEATS = [0, 1, 2, 3, 4, 5]
const SCENES = Object.entries(THEMES) as [string, Theme][]
const drawn = (grid: (string | undefined)[][]) => grid.flat().filter(c => c !== undefined).length

test('at rest, classic Clawd is the welcome banner, in a canvas with room around him', () => {
  expect(text(cells(REST))).toEqual([
    '             ',
    '   ▐▛███▜▌   ',
    '  ▝▜█████▛▘  ',
    '    ▘▘ ▝▝    ',
  ])
})

test('a cell is one color, or two that fill it, so the terminal can draw it exactly', () => {
  for (const [name, theme] of SCENES)
    for (const beat of BEATS)
      for (const frame of FRAMES) {
        const grid = pixels(frame, theme, beat)
        for (let y = 0; y < theme.height; y += 2)
          for (let x = 0; x < theme.width; x += 2) {
            const quad = [grid[y]?.[x], grid[y]?.[x + 1], grid[y + 1]?.[x], grid[y + 1]?.[x + 1]]
            const colors = new Set(quad.filter(Boolean))
            if (colors.size > 2 || (colors.size === 2 && !quad.every(Boolean)))
              throw new Error(`${name}, beat ${beat}, ${JSON.stringify(frame)}: cell ${x / 2},${y / 2}`)
          }
      }
})

test('nothing he does runs him off the canvas, or into a prop or the background', () => {
  for (const [name, theme] of SCENES) {
    const alone: Theme = { ...theme, props: [], background: [] }
    // The same Clawd on a canvas with room to spare all round.
    const roomy: Theme = { ...alone, width: theme.width + 40, height: theme.height + 8, restX: theme.restX + 20, restY: theme.restY + 4 }
    for (const frame of FRAMES) {
      const him = pixels(frame, alone)
      expect(drawn(him)).toBe(drawn(pixels(frame, roomy)))
      for (const beat of BEATS) {
        const scene = pixels({ ...frame, dx: 999 }, theme, beat)
        him.forEach((row, y) =>
          row.forEach((color, x) => {
            if (color !== undefined && scene[y]?.[x] !== undefined) throw new Error(`${name}, beat ${beat}: he meets the scene at ${x},${y}`)
          }),
        )
        expect(text(cells(frame, theme, beat)).every(row => row.length === theme.width / 2)).toBe(true)
      }
    }
  }
})

test('every animation starts off his resting frame', () => {
  for (const frames of Object.values(ANIMATIONS)) expect(text(cells(frames[0]!))).not.toEqual(text(cells(REST)))
})

test('a blink or a doze takes his eyes away', () => {
  expect(text(cells(BLINK[0]!))[1]).toBe('   ▐█████▌   ')
  expect(text(cells(DOZE[0]!))[1]).toBe('   ▐█████▌   ')
})

test('dozing, z s rise beside his head in every scene', () => {
  const dozing = DOZE.find(frame => frame.zs === 2)!
  for (const [, theme] of SCENES) {
    const rows = text(cells(dozing, theme)).join('')
    expect(rows).toContain('z')
    expect(rows).toContain('Z')
  }
})

test('Christmas: a tree beside him, a Santa hat, and snow falling a row a beat', () => {
  const at = (beat: number) => text(cells(REST, THEMES.christmas, beat))
  expect(at(0)).toEqual([
    '     ·              ',
    '  ▀        ▄██▄█ *  ',
    ' ▗█▖     ▄▀▀▀▀▀▄    ',
    ' ▟▛▙  *  ▐▛███▜▌   ·',
    '▗▜█▛▖   ▝▜█████▛▘   ',
    '  █       ▘▘ ▝▝     ',
  ])
  expect(at(1)[1]![5]).toBe('·')
  const runs = cells(REST, THEMES.christmas).flat()
  expect(runs.some(run => run.color === '#9FD3F2')).toBe(true)
  expect(runs.some(run => run.color === '#E03C3C' && run.background === '#F4F4F4')).toBe(true)
  expect(runs.some(run => run.color === '#3FA34D')).toBe(true)
})

test('Halloween: a white Clawd, a bat that flaps and a ghost that bobs', () => {
  const at = (beat: number) => text(cells(REST, THEMES.halloween, beat))
  expect(at(0)[3]).toContain('▐▛███▜▌')
  expect(cells(REST, THEMES.halloween).flat().some(run => run.color === '#F2F2F2')).toBe(true)
  expect(at(0)[1]).not.toEqual(at(1)[1])
  expect(at(0).slice(3)).not.toEqual(at(2).slice(3))
})

test('Lunar New Year: lanterns either side, a gold belt, fireworks bursting in turn', () => {
  const at = (beat: number) => text(cells(REST, THEMES['lunar-new-year'], beat))
  expect(at(0).join('')).not.toContain('✦')
  expect(at(2).join('')).toContain('✦')
  expect(at(4).join('')).toContain('✦')
  const runs = cells(REST, THEMES['lunar-new-year']).flat()
  expect(runs.some(run => run.color === '#D93A2F')).toBe(true)
  expect(runs.some(run => run.color === '#E8B739' || run.background === '#E8B739')).toBe(true)
})

test('a trailing costume swings behind him as he turns', () => {
  const facing = (eyes: 'left' | 'right') => text(cells({ ...REST, eyes }, THEMES.christmas))
  expect(facing('left')[1]).not.toEqual(facing('right')[1])
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

test('the svg is one path a color, unsnapped, so his eyes keep one width at any scale', () => {
  const svg = clawdSvg(REST)
  expect(svg).not.toContain('crispEdges')
  expect(svg.split('<path').length - 1).toBe(1)
  expect(svg).toContain('M21 18h6v6h-6zM30 18h18v6h-18zM51 18h6v6h-6z')
  const scene = clawdSvg(REST, THEMES.christmas, 0)
  for (const color of ['#9FD3F2', '#E03C3C', '#F4F4F4', '#3FA34D']) expect(scene).toContain(`fill="${color}"`)
  expect(scene).toContain('>·</text>')
  expect(svgSize(THEMES.christmas).width).toBeGreaterThan(svgSize(THEMES.classic).width)
})
