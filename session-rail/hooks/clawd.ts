// Clawd, the critter of Claude Code's welcome banner, as pixels: four to a terminal
// cell, each cell a quadrant block, so he moves a cell at a time.

import type { EngineInterface, Timer } from 'claude-code'

import type { Pose, ThemeName } from '../types'

// Pixel art: a row of letters each, a color for each letter in `colors`, `.` for
// none, placed at `x`, `y`. On Clawd (a costume) that is from the top left of his
// 18 by 5 pixels; in the scene (a prop, a background frame), of the canvas.
type Art = { rows: string[]; colors: Record<string, string>; x: number; y: number }

// A glyph of the background in a cell of its own, drawn only where nothing else is.
type Mark = { text: string; column: number; row: number; color: string }

// What moves in a scene at one beat: arts drawn among the props, marks over the gaps.
type Scenery = { arts?: Art[]; marks?: Mark[] }

// A theme: his body's color, what he wears, and the scene around him. A costume
// that `trails` swings behind him as he turns; the background is what moves at each
// beat, Claude working or not.
export type Theme = {
  body: string
  width: number
  height: number
  restX: number
  restY: number
  costume?: (Art & { trails?: boolean })[]
  props?: Art[]
  background?: (beat: number) => Scenery
}

// Every art keeps its colors from meeting a gap in a cell: a cell is one color, or
// two that fill it, the one the background of the other. So each sits on even
// pixels and Clawd moves two at a time.

const SANTA: Art & { trails: true } = {
  rows: ['........RRRR..WW..', '......RRRRRRRRWW..', '....RRRRRRRRRR....', '..WWWWWWWWWWWWWW..'],
  colors: { R: '#E03C3C', W: '#F4F4F4' },
  x: 0,
  y: -4,
  trails: true,
}

const TREE: Art = {
  rows: [
    '....YY....',
    '..........',
    '....GG....',
    '...GGGG...',
    '...GGGG...',
    '..GGGRGG..',
    '..GGGGGG..',
    '.GYGGGGRG.',
    '....TT....',
    '....TT....',
  ],
  colors: { Y: '#F2C94C', G: '#3FA34D', R: '#E03C3C', T: '#8B5A2B' },
  x: 0,
  y: 2,
}

const SNOW = '#F4F4F4'
// Flakes falling a row a frame, each from where it starts, round to the top again.
const FLAKES = [
  [5, 0],
  [17, 1],
  [19, 3],
  [6, 3],
  [11, 5],
  [1, 4],
]

// How many beats a slow background (snow, fireworks) holds each frame.
const SLOW = 3

const snowAt = (frame: number): Mark[] =>
  FLAKES.map(([column, row], i) => ({ text: i % 2 === 0 ? '·' : '*', column: column!, row: (row! + frame) % 6, color: SNOW }))

const BAT_WINGS = [
  ['P..PP..P', 'PPPPPPPP', '..PPPP..'],
  ['..PPPP..', 'PPPPPPPP', 'P......P'],
]
const BAT_COLOR = '#8A5CC8'
const BAT_RIGHTMOST = 32

// A bat's flight across the top and back: a pixel or two a beat, dipping and
// rising as it flutters, now and then darting back, its wings beating each beat.
// The same flight every time, from a fixed seed.
export const FLIGHT = ((): { x: number; y: number }[] => {
  let seed = 7
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  const path: { x: number; y: number }[] = []
  let [x, y, way] = [0, 1, 1]
  for (;;) {
    path.push({ x, y })
    x = random() < 0.15 ? x - way : x + way * (1 + Math.floor(random() * 2))
    y = Math.max(0, Math.min(3, y + Math.floor(random() * 3) - 1))
    if (x >= BAT_RIGHTMOST) [x, way] = [BAT_RIGHTMOST, -1]
    if (way === -1 && x <= 0) return path
    x = Math.max(0, x)
  }
})()

const batAt = (beat: number): Art => {
  const { x, y } = FLIGHT[beat % FLIGHT.length]!
  return { rows: BAT_WINGS[beat % 2]!, colors: { P: BAT_COLOR }, x, y }
}

// A jack-o'-lantern, lit: its eyes go dark for a double blink every six seconds.
const PUMPKIN = [
  '.....G....',
  '....G.....',
  '.OOOOOOOO.',
  'OOOOOOOOOO',
  'OOYYOOYYOO',
  'OOOOOOOOOO',
  'OOYYYYYYOO',
  '.OOOOOOOO.',
]
const pumpkinAt = (beat: number): Art => {
  const isBlinking = beat % 30 === 0 || beat % 30 === 2
  return {
    rows: PUMPKIN.map((row, y) => (y === 4 && isBlinking ? row.replace(/Y/g, 'O') : row)),
    colors: { G: '#5FA040', O: '#E8833A', Y: '#F2C94C' },
    x: 30,
    y: 6,
  }
}

const BELT: Art = { rows: ['....YYYYYYYYYY....'], colors: { Y: '#E8B739' }, x: 0, y: 3 }

const lantern = (x: number): Art => ({
  rows: ['..C...', '..C...', '.RRRR.', 'RRYYRR', 'RRRRRR', '.RRRR.', '..YY..', '..YY..'],
  colors: { C: '#C9A227', R: '#D93A2F', Y: '#E8B739' },
  x,
  y: 0,
})

// Two bursts over his head in turn: a spark, a star with sparks round it, the
// sparks flying out.
const GOLD = '#F2C94C'
const RED = '#FF6B5A'
const burst = (column: number, row: number, color: string): Mark[][] => [
  [{ text: '·', column, row, color }],
  [
    { text: '✦', column, row, color },
    { text: '·', column: column - 1, row, color },
    { text: '·', column: column + 1, row, color },
    { text: '·', column, row: row + 1, color },
  ],
  [
    { text: '·', column: column - 1, row: row + 1, color },
    { text: '·', column: column + 1, row: row + 1, color },
  ],
]
const [GOLD_BURST, RED_BURST] = [burst(5, 1, GOLD), burst(14, 0, RED)]
const FIREWORKS: Mark[][] = [
  [],
  GOLD_BURST[0]!,
  GOLD_BURST[1]!,
  [...GOLD_BURST[2]!, ...RED_BURST[0]!],
  RED_BURST[1]!,
  RED_BURST[2]!,
]

export const THEMES: Record<Exclude<ThemeName, 'seasonal'>, Theme> = {
  classic: { body: '#D77757', width: 26, height: 8, restX: 4, restY: 2 },
  christmas: {
    body: '#9FD3F2',
    width: 40,
    height: 12,
    restX: 16,
    restY: 6,
    costume: [SANTA],
    props: [TREE],
    background: beat => ({ marks: snowAt(Math.floor(beat / SLOW)) }),
  },
  halloween: {
    body: '#F2F2F2',
    width: 40,
    height: 14,
    restX: 6,
    restY: 8,
    background: beat => ({ arts: [pumpkinAt(beat), batAt(beat)] }),
  },
  'lunar-new-year': {
    body: '#E5483B',
    width: 40,
    height: 12,
    restX: 12,
    restY: 6,
    costume: [BELT],
    props: [lantern(2), lantern(32)],
    background: beat => ({ marks: FIREWORKS[Math.floor(beat / SLOW) % FIREWORKS.length] }),
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

// One frame's time, in milliseconds; the background steps a beat every BEAT.
export const TICK = 150
export const BEAT = 200

export const REST: Pose = { dx: 0, dy: 0, eyes: 'open', arms: [0, 0], stride: false, zs: 0 }

// The holes of his eyes as he looks: a pixel aside, or none shut, for a blink or a doze.
const eyeHoles = (pose: Pose): number[] => {
  if (pose.eyes === 'shut') return []
  const shift = pose.eyes === 'left' ? -1 : pose.eyes === 'right' ? 1 : 0
  return [5 + shift, 12 + shift]
}

const backgroundAt = (theme: Theme, beat: number): Scenery => theme.background?.(beat) ?? {}

// Row by row, the color of each pixel, undefined where none: the props and the
// background, then Clawd over them. His body spans x 3-14 and y 0-3, the arms stick
// out on row 2 and the four legs stand on row 4, as in the banner.
export function pixels(pose: Pose, theme: Theme = THEMES.classic, beat = 0): (string | undefined)[][] {
  const grid = Array.from({ length: theme.height }, () => Array<string | undefined>(theme.width).fill(undefined))
  const put = (x: number, y: number, color: string | undefined) => {
    const row = grid[y]
    if (row !== undefined && x >= 0 && x < theme.width) row[x] = color
  }
  const paint = (art: Art, at: (x: number, y: number) => [number, number]) =>
    art.rows.forEach((row, y) =>
      [...row].forEach((key, x) => {
        const color = art.colors[key]
        if (color) put(...at(art.x + x, art.y + y), color)
      }),
    )
  for (const art of [...(theme.props ?? []), ...(backgroundAt(theme, beat).arts ?? [])]) paint(art, (x, y) => [x, y])

  const x0 = theme.restX + pose.dx
  const y0 = theme.restY - pose.dy
  const set = (x: number, y: number, color: string | undefined) => put(x0 + x, y0 + y, color)
  for (let y = 0; y < 4; y++) for (let x = 3; x <= 14; x++) set(x, y, theme.body)
  for (const x of eyeHoles(pose)) set(x, 1, undefined)
  const [left, right] = pose.arms
  for (const x of [1, 2]) set(x, 2 - left, theme.body)
  for (const x of [15, 16]) set(x, 2 - right, theme.body)
  for (const x of pose.stride ? [3, 5, 12, 14] : [4, 6, 11, 13]) set(x, 4, theme.body)
  // A trailing costume as drawn while he faces left or ahead, mirrored as he faces right.
  for (const art of theme.costume ?? []) {
    const mirror = art.trails === true && pose.eyes === 'right'
    paint(art, (x, y) => [x0 + (mirror ? 17 - x : x), y0 + y])
  }
  return grid
}

// Indexed by the filled quadrants: top left 1, top right 2, bottom left 4, bottom right 8.
const QUADRANTS = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█'

// Where his z's float as he dozes, in cells from the one his right arm is in.
const ZS = [
  { text: 'z', dx: 1, dy: 0 },
  { text: 'Z', dx: 2, dy: -1 },
]
const Z_COLOR = '#8a8a8a'

// The glyphs over the pixels: the background's marks where no pixel is, and his z's.
function marks(pose: Pose, theme: Theme, grid: (string | undefined)[][], beat: number): Mark[] {
  const isEmpty = (m: Mark) => [0, 1].every(dy => [0, 1].every(dx => grid[m.row * 2 + dy]?.[m.column * 2 + dx] === undefined))
  const right = (theme.restX + pose.dx + 16) / 2
  const head = (theme.restY - pose.dy) / 2
  const zs = ZS.slice(0, pose.zs).map(z => ({ text: z.text, column: right + z.dx, row: head + z.dy, color: Z_COLOR }))
  return [...(backgroundAt(theme, beat).marks ?? []).filter(isEmpty), ...zs].filter(
    m => m.column >= 0 && m.column < theme.width / 2 && m.row >= 0 && m.row < theme.height / 2,
  )
}

// A row's text in runs of one style: `color` the quadrants', `background` the rest
// of a cell two colors fill.
export type Run = { text: string; color?: string; background?: string }

function cell(colors: (string | undefined)[]): Run {
  const [first] = colors.filter((c): c is string => c !== undefined)
  if (first === undefined) return { text: ' ' }
  const mask = colors.reduce((m, c, i) => (c === first ? m | (1 << i) : m), 0)
  const other = colors.find(c => c !== undefined && c !== first)
  return { text: QUADRANTS[mask]!, color: first, ...(other && { background: other }) }
}

export function cells(pose: Pose, theme: Theme = THEMES.classic, beat = 0): Run[][] {
  const grid = pixels(pose, theme, beat)
  const rows: Run[][] = []
  for (let y = 0; y < grid.length; y += 2) {
    const row: Run[] = []
    for (let x = 0; x < theme.width; x += 2)
      row.push(cell([grid[y]?.[x], grid[y]?.[x + 1], grid[y + 1]?.[x], grid[y + 1]?.[x + 1]]))
    rows.push(row)
  }
  for (const mark of marks(pose, theme, grid, beat)) rows[mark.row]![mark.column] = { text: mark.text, color: mark.color }
  return rows.map(merge)
}

const same = (a: Run, b: Run) => a.color === b.color && a.background === b.background

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

export function svgSize(theme: Theme = THEMES.classic): { width: number; height: number } {
  return { width: theme.width * PIXEL.width, height: theme.height * PIXEL.height }
}

// One path a color, each run of pixels a rectangle in it, so the gaps between
// them (his eyes) keep their width at any scale; separate shapes snapped to the
// screen's pixels drew one eye wider than the other.
export function clawdSvg(pose: Pose, theme: Theme = THEMES.classic, beat = 0): string {
  const grid = pixels(pose, theme, beat)
  const paths = new Map<string, string>()
  grid.forEach((row, y) => {
    for (let x = 0; x < theme.width; x++) {
      const color = row[x]
      if (color === undefined) continue
      const start = x
      while (row[x + 1] === color) x++
      const width = (x - start + 1) * PIXEL.width
      const run = `M${start * PIXEL.width} ${y * PIXEL.height}h${width}v${PIXEL.height}h-${width}z`
      paths.set(color, (paths.get(color) ?? '') + run)
    }
  })
  const shapes = [...paths].map(([color, d]) => `<path d="${d}" fill="${color}"/>`)
  for (const mark of marks(pose, theme, grid, beat)) {
    const x = mark.column * 2 * PIXEL.width
    const y = (mark.row + 1) * 2 * PIXEL.height
    shapes.push(`<text x="${x}" y="${y}" font-family="monospace" font-size="11" fill="${mark.color}">${mark.text}</text>`)
  }
  const { width, height } = svgSize(theme)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${shapes.join('')}</svg>`
  )
}

const pose = (changes: Partial<Pose>): Pose => ({ ...REST, ...changes })
const hold = (frame: Pose, ticks: number): Pose[] => Array.from({ length: ticks }, () => frame)

// A cell right, two, back past where he started to two cells left, and home, legs
// alternating, eyes ahead. A cell a step keeps his colors on their cells.
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

// Eyes shut, arms down, z's rising five times over (some nine seconds); then a
// stretch as he wakes.
const asleep = pose({ eyes: 'shut', arms: [-1, -1] })
export const DOZE = [
  ...Array.from({ length: 5 }, () => [0, 1, 2].flatMap(zs => hold({ ...asleep, zs }, 4))).flat(),
  ...hold(pose({ arms: [2, 2] }), 3),
]

// One rest in this many ends in a doze rather than a blink.
const DOZE_ODDS = 0.25

const between = (random: () => number, low: number, high: number) => low + Math.floor(random() * (high - low + 1))

// Plays Clawd: at rest, blinking or now and then dozing off every few seconds, and
// while `working(true)` one animation after another, a short rest between, never
// the same one twice running. The scene's background steps on each BEAT throughout.
export function animate($: EngineInterface, show: { pose: (frame: Pose) => void; beat: (n: number) => void }, random = Math.random) {
  let timer: Timer | undefined
  let isWorking = false
  let last: string | undefined

  // Shows the frames, one a tick, the first at once; then `done`.
  const play = (frames: Pose[], done: () => void) => {
    timer?.cancel()
    let next = 1
    show.pose(frames[0] ?? REST)
    const own = $.clock.every(TICK, () => {
      const frame = frames[next++]
      if (frame !== undefined) return show.pose(frame)
      own.cancel()
      done()
    })
    timer = own
  }

  const rest = () => {
    timer?.cancel()
    show.pose(REST)
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
    start() {
      let beat = 0
      $.clock.every(BEAT, () => show.beat(++beat))
      rest()
    },
    working(now: boolean) {
      if (now === isWorking) return
      isWorking = now
      if (now) work()
      else rest()
    },
  }
}
