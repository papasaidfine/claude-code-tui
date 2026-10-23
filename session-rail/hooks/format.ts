const CELLS = 5

export function splitPath(cwd: string, home: string | undefined): { dir: string; parent: string } {
  if (home && cwd === home) return { dir: '~', parent: '' }
  if (cwd === '/') return { dir: '/', parent: '' }
  const cut = cwd.lastIndexOf('/')
  const dir = cwd.slice(cut + 1)
  const parent = cwd.slice(0, cut) || '/'
  if (home && (parent === home || parent.startsWith(`${home}/`))) {
    return { dir, parent: `~${parent.slice(home.length)}` }
  }
  return { dir, parent }
}

export type BarGlyphs = { fill: string; empty: string }

export const THIN: BarGlyphs = { fill: '━', empty: '─' }
export const SHADE: BarGlyphs = { fill: '▓', empty: '░' }

export function bar(percent: number | null, glyphs: BarGlyphs = THIN): { filled: string; empty: string } {
  const filled = percent === null ? 0 : Math.min(CELLS, Math.round((percent / 100) * CELLS))
  return { filled: glyphs.fill.repeat(filled), empty: glyphs.empty.repeat(CELLS - filled) }
}

export function tokens(n: number): string {
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`
  if (n >= 1000) return `${trim(n / 1000)}k`
  return String(n)
}

function trim(x: number): string {
  return x >= 100 ? String(Math.round(x)) : String(Math.round(x * 10) / 10)
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function until(resetsAt: string, now: number): string | undefined {
  const at = Date.parse(resetsAt)
  if (Number.isNaN(at)) return undefined
  const left = at - now
  if (left <= 0) return 'now'
  if (left < HOUR) return `${Math.ceil(left / MINUTE)}m`
  if (left < DAY) return `${Math.floor(left / HOUR)}h${Math.floor((left % HOUR) / MINUTE)}m`
  return `${Math.floor(left / DAY)}d${Math.floor((left % DAY) / HOUR)}h`
}

const WINDOWS: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'spend' }

export function windowLabel(kind: string): string {
  return WINDOWS[kind] ?? kind
}

export function level(percent: number): 'warning' | 'error' | undefined {
  if (percent >= 95) return 'error'
  if (percent >= 80) return 'warning'
  return undefined
}
