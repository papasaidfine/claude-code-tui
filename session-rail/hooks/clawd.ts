// Clawd, the critter of Claude Code's welcome banner, as pixels: four to a terminal
// cell, each cell a quadrant block, so he moves a cell at a time.

import type { EngineInterface, Timer } from 'claude-code'

import type { Pose, ThemeName } from '../types'

// What he wears: a hat drawn over the four pixel rows above his head, each row over
// his 18 pixel columns, a letter for each color in `colors` and `.` for none.
export type Theme = { body: string; hat?: { rows: string[]; colors: Record<string, string> } }

// A hat's colors meet only where a cell is full, so a cell is one color, or two
// with one the background: no cell holds two colors and a gap.
export const THEMES: Record<Exclude<ThemeName, 'seasonal'>, Theme> = {
  classic: { body: '#D77757' },
  christmas: {
    body: '#9FD3F2',
    hat: {
      rows: [
        '........RRRR..WW..',
        '......RRRRRRRRWW..',
        '....RRRRRRRRRR....',
        '..WWWWWWWWWWWWWW..',
      ],
      colors: { R: '#E03C3C', W: '#F4F4F4' },
    },
  },
  halloween: {
    body: '#D77757',
    hat: {
      rows: [
        '..........PP......',
        '........PPPP......',
        '......GGGGGG......',
        '..PPPPPPPPPPPPPP..',
      ],
      colors: { P: '#8A5CC8', G: '#6BBF59' },
    },
  },
  'lunar-new-year': {
    body: '#E5483B',
    hat: {
      rows: [
        '..................',
        '........RR........',
        '......YYYYYY......',
        '....YYYYYYYYYY....',
      ],
      colors: { Y: '#E8B739', R: '#B8231A' },
    },
  },
}

// Lunar New Year's Day: the theme runs from a week before to the Lantern Festival.
const LUNAR_NEW_YEAR = ['2027-02-06', '2028-01-26', '2029-02-13', '2030-02-03', '2031-01-23', '2032-02-11']
const DAY = 24 * 60 * 60 * 1000

// The theme for a day: Christmas through Dec 26, Halloween's last two weeks of
// October, Lunar New Year's festival; classic otherwise.
export function themeOn(now: number): Exclude<ThemeName, 'seasonal'> {
  const date = new Date(now)
  const month = date.getMonth() + 1
  const day = date.getDate()
  if (month === 12 && day <= 26) return 'christmas'
  if (month === 10 && day >= 17) return 'halloween'
  const today = Date.UTC(date.getFullYear(), month - 1, day)
  const isFestival = LUNAR_NEW_YEAR.some(start => {
    const first = Date.parse(start)
    return today >= first - 7 * DAY && today <= first + 14 * DAY
  })
  return isFestival ? 'lunar-new-year' : 'classic'
}

// One frame's time, in milliseconds.
export const TICK = 150

const WIDTH = 26
const REST_X = 4

// 13 cells across, room to walk four pixels either way; four rows, two more under
// a hat, so he can hop two pixels with it on.
function canvas(theme: Theme): { height: number; restY: number } {
  return theme.hat ? { height: 12, restY: 6 } : { height: 8, restY: 2 }
}

export const REST: Pose = { dx: 0, dy: 0, eyes: 'open', arms: [0, 0], stride: false, zs: 0 }

// The holes of his eyes on row 1: shut for a blink they are gone, closed in sleep
// they are lids, a slit two pixels wide.
const EYES: Record<Pose['eyes'], number[]> = {
  open: [5, 12],
  left: [4, 11],
  right: [6, 13],
  shut: [],
  closed: [4, 5, 12, 13],
}

// Row by row, the color of each pixel, undefined where none. His body spans x 3-14
// and y 0-3, the arms stick out on row 2 and the four legs stand on row 4, as in
// the banner; a hat sits on rows -4 to -1.
export function pixels(pose: Pose, theme: Theme = THEMES.classic): (string | undefined)[][] {
  const { height, restY } = canvas(theme)
  const grid = Array.from({ length: height }, () => Array<string | undefined>(WIDTH).fill(undefined))
  const x0 = REST_X + pose.dx
  const y0 = restY - pose.dy
  const set = (x: number, y: number, color: string | undefined) => {
    const row = grid[y0 + y]
    if (row !== undefined && x0 + x >= 0 && x0 + x < WIDTH) row[x0 + x] = color
  }
  for (let y = 0; y < 4; y++) for (let x = 3; x <= 14; x++) set(x, y, theme.body)
  for (const x of EYES[pose.eyes]) set(x, 1, undefined)
  const [left, right] = pose.arms
  for (const x of [1, 2]) set(x, 2 - left, theme.body)
  for (const x of [15, 16]) set(x, 2 - right, theme.body)
  for (const x of pose.stride ? [3, 5, 12, 14] : [4, 6, 11, 13]) set(x, 4, theme.body)
  theme.hat?.rows.forEach((row, i) =>
    [...row].forEach((key, x) => {
      const color = theme.hat?.colors[key]
      if (color) set(x, i - 4, color)
    }),
  )
  return grid
}

// Indexed by the filled quadrants: top left 1, top right 2, bottom left 4, bottom right 8.
const QUADRANTS = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█'

// Where his z's float as he dozes, in cells from the one his right arm is in.
const ZS = [
  { text: 'z', dx: 1, dy: 0 },
  { text: 'Z', dx: 2, dy: -1 },
]

const zCells = (pose: Pose, theme: Theme) => {
  const right = (REST_X + pose.dx + 16) / 2
  const head = (canvas(theme).restY - pose.dy) / 2
  return ZS.slice(0, pose.zs).map(z => ({ text: z.text, column: right + z.dx, row: head + z.dy }))
}

// A row's text in runs of one style: `color` the quadrants', `background` the rest
// of a cell two colors fill, `dim` for his z's.
export type Run = { text: string; color?: string; background?: string; dim?: boolean }

function cell(colors: (string | undefined)[]): Run {
  const [first] = colors.filter((c): c is string => c !== undefined)
  if (first === undefined) return { text: ' ' }
  const mask = colors.reduce((m, c, i) => (c === first ? m | (1 << i) : m), 0)
  const other = colors.find(c => c !== undefined && c !== first)
  return { text: QUADRANTS[mask]!, color: first, ...(other && { background: other }) }
}

export function cells(pose: Pose, theme: Theme = THEMES.classic): Run[][] {
  const grid = pixels(pose, theme)
  const rows: Run[][] = []
  for (let y = 0; y < grid.length; y += 2) {
    const row: Run[] = []
    for (let x = 0; x < WIDTH; x += 2)
      row.push(cell([grid[y]?.[x], grid[y]?.[x + 1], grid[y + 1]?.[x], grid[y + 1]?.[x + 1]]))
    rows.push(row)
  }
  for (const z of zCells(pose, theme)) {
    const row = rows[z.row]
    if (row && z.column < row.length) row[z.column] = { text: z.text, dim: true }
  }
  return rows.map(merge)
}

const same = (a: Run, b: Run) => a.color === b.color && a.background === b.background && a.dim === b.dim

function merge(row: Run[]): Run[] {
  return row.reduce<Run[]>((runs, run) => {
    const last = runs[runs.length - 1]
    if (last && same(last, run)) last.text += run.text
    else runs.push({ ...run })
    return runs
  }, [])
}

export const text = (rows: Run[][]) => rows.map(row => row.map(run => run.text).join(''))

// A pixel is half a cell each way, so twice as tall as wide, as the terminal draws him.
const PIXEL = { width: 3, height: 6 }
const Z_COLOR = '#8a8a8a'

export function svgSize(theme: Theme = THEMES.classic): { width: number; height: number } {
  return { width: WIDTH * PIXEL.width, height: canvas(theme).height * PIXEL.height }
}

export function clawdSvg(pose: Pose, theme: Theme = THEMES.classic): string {
  const shapes: string[] = []
  pixels(pose, theme).forEach((row, y) => {
    for (let x = 0; x < WIDTH; x++) {
      const color = row[x]
      if (color === undefined) continue
      const start = x
      while (row[x + 1] === color) x++
      shapes.push(
        `<rect x="${start * PIXEL.width}" y="${y * PIXEL.height}" width="${(x - start + 1) * PIXEL.width}" height="${PIXEL.height}" fill="${color}"/>`,
      )
    }
  })
  for (const z of zCells(pose, theme)) {
    const x = z.column * 2 * PIXEL.width
    const y = (z.row + 1) * 2 * PIXEL.height
    shapes.push(`<text x="${x}" y="${y}" font-family="monospace" font-size="11" fill="${Z_COLOR}">${z.text}</text>`)
  }
  const { width, height } = svgSize(theme)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ` +
    `shape-rendering="crispEdges">${shapes.join('')}</svg>`
  )
}

const pose = (changes: Partial<Pose>): Pose => ({ ...REST, ...changes })
const hold = (frame: Pose, ticks: number): Pose[] => Array.from({ length: ticks }, () => frame)

// A cell right, two, back past where he started to two cells left, and home, legs
// alternating, eyes ahead. A cell a step keeps a hat's colors on their cells.
const WALK = [2, 4, 4, 2, 0, -2, -4, -4, -2, 0]

// What he does while Claude works, one picked at random after another.
export const ANIMATIONS: Record<string, Pose[]> = {
  blink: [pose({ eyes: 'shut' }), REST, pose({ eyes: 'shut' })],
  look: [...hold(pose({ eyes: 'left' }), 5), ...hold(REST, 2), ...hold(pose({ eyes: 'right' }), 5)],
  hop: [2, 2, 2, 0, 0, 2, 2, 2].map(dy => pose({ dy, arms: dy > 0 ? [1, 1] : [0, 0] })),
  walk: WALK.map((dx, i) => {
    const before = WALK[i - 1] ?? 0
    const ahead = dx === before ? (WALK[i + 1] ?? 0) - dx : dx - before
    return pose({ dx, stride: i % 2 === 0, eyes: ahead > 0 ? 'right' : 'left' })
  }),
  wave: [1, 2, 1, 2, 1, 2, 1].map(up => pose({ arms: [0, up], eyes: 'right' })),
  type: Array.from({ length: 10 }, (_, i) => pose({ arms: i % 2 === 0 ? [-1, 0] : [0, -1] })),
}

export const BLINK = [pose({ eyes: 'shut' })]

// Eyes closed, arms down, z's rising five times over (some nine seconds); then a
// stretch as he wakes.
const asleep = pose({ eyes: 'closed', arms: [-1, -1] })
export const DOZE = [
  ...Array.from({ length: 5 }, () => [0, 1, 2].flatMap(zs => hold({ ...asleep, zs }, 4))).flat(),
  ...hold(pose({ arms: [2, 2] }), 3),
]

// One rest in this many ends in a doze rather than a blink.
const DOZE_ODDS = 0.25

const between = (random: () => number, low: number, high: number) => low + Math.floor(random() * (high - low + 1))

// Plays Clawd: at rest, blinking or now and then dozing off every few seconds, and
// while `working(true)` one animation after another, a short rest between, never
// the same one twice running.
export function animate($: EngineInterface, show: (frame: Pose) => void, random = Math.random) {
  let timer: Timer | undefined
  let isWorking = false
  let last: string | undefined

  // Shows the frames, one a tick, the first at once; then `done`.
  const play = (frames: Pose[], done: () => void) => {
    timer?.cancel()
    let next = 1
    show(frames[0] ?? REST)
    const own = $.clock.every(TICK, () => {
      const frame = frames[next++]
      if (frame !== undefined) return show(frame)
      own.cancel()
      done()
    })
    timer = own
  }

  const rest = () => {
    timer?.cancel()
    show(REST)
    timer = $.clock.after(between(random, 3000, 7000), () => play(random() < DOZE_ODDS ? DOZE : BLINK, rest))
  }

  const work = () => {
    const names = Object.keys(ANIMATIONS).filter(name => name !== last)
    const name = names[Math.floor(random() * names.length)] ?? 'blink'
    last = name
    const frames = [...(ANIMATIONS[name] ?? []), ...hold(REST, between(random, 3, 6))]
    play(frames, () => (isWorking ? work() : rest()))
  }

  return {
    start: rest,
    working(now: boolean) {
      if (now === isWorking) return
      isWorking = now
      if (now) work()
      else rest()
    },
  }
}
