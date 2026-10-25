// Clawd, the critter of Claude Code's welcome banner, as pixels: four to a terminal
// cell, each cell a quadrant block, so he moves by half a cell.

import type { EngineInterface, Timer } from 'claude-code'

import type { Pose } from '../types'

// The banner's body color.
export const CLAWD_COLOR = '#D77757'

// One frame's time, in milliseconds.
export const TICK = 150

// The canvas: 13 cells by 4, room to walk four pixels either way and hop two.
const WIDTH = 26
const HEIGHT = 8
const REST_X = 4
const REST_Y = 2

export const REST: Pose = { dx: 0, dy: 0, eyes: 'open', arms: [0, 0], stride: false }

const EYES: Record<Pose['eyes'], number[]> = { open: [5, 12], left: [4, 11], right: [6, 13], shut: [] }

// Row by row, true where he is drawn. His body spans x 3-14 and y 0-3, the arms
// stick out on row 2 and the four legs stand on row 4, as in the banner.
export function pixels(pose: Pose): boolean[][] {
  const grid = Array.from({ length: HEIGHT }, () => Array<boolean>(WIDTH).fill(false))
  const x0 = REST_X + pose.dx
  const y0 = REST_Y - pose.dy
  const set = (x: number, y: number, on: boolean) => {
    const row = grid[y0 + y]
    if (row !== undefined && x0 + x >= 0 && x0 + x < WIDTH) row[x0 + x] = on
  }
  for (let y = 0; y < 4; y++) for (let x = 3; x <= 14; x++) set(x, y, true)
  for (const x of EYES[pose.eyes]) set(x, 1, false)
  const [left, right] = pose.arms
  for (const x of [1, 2]) set(x, 2 - left, true)
  for (const x of [15, 16]) set(x, 2 - right, true)
  for (const x of pose.stride ? [3, 5, 12, 14] : [4, 6, 11, 13]) set(x, 4, true)
  return grid
}

// Indexed by the filled quadrants: top left 1, top right 2, bottom left 4, bottom right 8.
const QUADRANTS = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█'

export function cells(pose: Pose): string[] {
  const grid = pixels(pose)
  const at = (x: number, y: number) => (grid[y]?.[x] ? 1 : 0)
  const rows: string[] = []
  for (let y = 0; y < HEIGHT; y += 2) {
    let row = ''
    for (let x = 0; x < WIDTH; x += 2)
      row += QUADRANTS[at(x, y) | (at(x + 1, y) << 1) | (at(x, y + 1) << 2) | (at(x + 1, y + 1) << 3)]
    rows.push(row)
  }
  return rows
}

// A pixel is half a cell each way, so twice as tall as wide, as the terminal draws him.
const PIXEL = { width: 3, height: 6 }
export const SVG_SIZE = { width: WIDTH * PIXEL.width, height: HEIGHT * PIXEL.height }

export function clawdSvg(pose: Pose): string {
  const runs: string[] = []
  pixels(pose).forEach((row, y) => {
    for (let x = 0; x < WIDTH; x++) {
      if (!row[x]) continue
      const start = x
      while (row[x + 1]) x++
      runs.push(
        `<rect x="${start * PIXEL.width}" y="${y * PIXEL.height}" width="${(x - start + 1) * PIXEL.width}" height="${PIXEL.height}"/>`,
      )
    }
  })
  const { width, height } = SVG_SIZE
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ` +
    `fill="${CLAWD_COLOR}" shape-rendering="crispEdges">${runs.join('')}</svg>`
  )
}

const pose = (changes: Partial<Pose>): Pose => ({ ...REST, ...changes })
const hold = (frame: Pose, ticks: number): Pose[] => Array.from({ length: ticks }, () => frame)

// Four pixels right, eight back left, four right again, legs alternating, eyes ahead.
const WALK = [1, 2, 3, 4, 3, 2, 1, 0, -1, -2, -3, -4, -3, -2, -1, 0]

// What he does while Claude works, one picked at random after another.
export const ANIMATIONS: Record<string, Pose[]> = {
  blink: [pose({ eyes: 'shut' }), REST, pose({ eyes: 'shut' })],
  look: [...hold(pose({ eyes: 'left' }), 5), ...hold(REST, 2), ...hold(pose({ eyes: 'right' }), 5)],
  hop: [2, 2, 2, 0, 0, 2, 2, 2].map(dy => pose({ dy, arms: dy > 0 ? [1, 1] : [0, 0] })),
  walk: WALK.map((dx, i) => {
    const before = WALK[i - 1] ?? 0
    return pose({ dx, stride: i % 2 === 0, eyes: dx > before ? 'right' : 'left' })
  }),
  wave: [1, 2, 1, 2, 1, 2, 1].map(up => pose({ arms: [0, up], eyes: 'right' })),
  type: Array.from({ length: 10 }, (_, i) => pose({ arms: i % 2 === 0 ? [-1, 0] : [0, -1] })),
}

export const BLINK = [pose({ eyes: 'shut' })]

const between = (random: () => number, low: number, high: number) => low + Math.floor(random() * (high - low + 1))

// Plays Clawd: at rest with a blink every few seconds, and while `working(true)`
// one animation after another, a short rest between, never the same one twice running.
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
    timer = $.clock.after(between(random, 3000, 7000), () => play(BLINK, rest))
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
