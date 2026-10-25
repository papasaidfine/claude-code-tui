import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const PANE = {
  plugin: 'session-rail',
  component: 'Pane',
  requestId: 'session-rail',
  props: {
    title: 'Session',
    isFocused: false,
    bodyColumns: 32,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const SURFACES = ['terminal', 'desktop'] as const

// An Svg is found by its alt, the words it stands for.
const svgAlt = async (ui: { findAll: (q: { type: 'Svg' }) => Promise<{ props: Record<string, unknown> }[]> }, re: RegExp) =>
  (await ui.findAll({ type: 'Svg' })).map(svg => String(svg.props.alt)).find(alt => re.test(alt))

type Limit = { kind: string; percentUsed: number; resetsAt?: string }
type Usage = {
  model: string
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}
type Opts = {
  isRepo: boolean
  isDirty?: boolean
  percent?: number
  host?: string
  opened?: string[]
  registered?: unknown[]
  limits?: Limit[]
  cost?: number
  startedAt?: number
  step?: Usage
  isUsageDenied?: boolean
  requests?: number
}

const NOW = Date.parse('2026-10-23T10:00:00Z')

const run = (exitCode: number, stdout = '') => ({
  value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

// Each hook here stands for the engine beneath the plugin.
async function start($: Parameters<TestBody>[0], on: Parameters<TestBody>[1], opts: Opts) {
  on('command.register', (_, e) => {
    opts.registered?.push(e)
    return { value: { command: 'rail' } }
  })
  const up = new Set<string>()
  on('ui.open', (_, e) => {
    opts.opened?.push(e.id)
    up.add(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    up.delete(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: [...up].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: NOW }))
  on('session.cwd', () => ({ value: '/home/u/src/proj' }))
  on('env.get', () => ({ value: '/home/u' }))
  on('process.run', (_, e) => {
    const cmd = e.argv.join(' ')
    if (cmd === 'hostname') return opts.host ? run(0, `${opts.host}\n`) : run(1)
    if (!opts.isRepo) return run(128)
    if (cmd === 'git branch --show-current') return run(0, 'main\n')
    if (cmd === 'git status --porcelain') return run(0, opts.isDirty ? ' M a.ts\n' : '')
    return run(1)
  })
  on('session.usage', (_, e) => opts.isUsageDenied ? { deny: 'not now' } : ({
    value: {
      startedAt: opts.startedAt ?? 0,
      cost: opts.cost === undefined ? undefined : { usd: opts.cost },
      rateLimits: opts.limits ?? [],
      context: {
        window: 200000,
        percent: opts.percent,
        breakdown: e.breakdown
          ? ({
              categories: [
                { name: 'Messages', tokens: 30200, color: 'x', isDeferred: false, kind: 'used' },
                { name: 'MCP tools', tokens: 900, color: 'x', isDeferred: true, kind: 'deferred' },
                { name: 'Free space', tokens: 150000, color: 'x', isDeferred: false, kind: 'free' },
              ],
            } as never)
          : undefined,
      },
    },
  }))
  on('turn.step', async function* (_, e) {
    opts.requests = (opts.requests ?? 0) + 1
    yield { kind: 'text' as const, index: 0, text: 'hi' }
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: opts.step ?? null,
    }
  })
  await $.session.start({ cwd: '/home/u/src/proj', surface: 'terminal', isInteractive: true })
}

const text = async (ui: { find: (t: { type: 'Text'; text: RegExp }) => Promise<{ text?: string } | undefined> }, re: RegExp) =>
  (await ui.find({ type: 'Text', text: re }))?.text

const usage = (model: string, input: number, output: number, read = 0, write = 0): Usage => ({
  model,
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: write,
})

// One model response, read to its end as the engine reads it.
async function step($: Parameters<TestBody>[0], opts: Opts, answered: Usage) {
  opts.step = answered
  const stream = $.turn.step({ turnId: 't1', index: 0, model: answered.model, messageCount: 1 })
  const chunks: unknown[] = []
  // Read by hand: the generator's return value is the step's result.
  let read = await stream.next()
  for (; !read.done; read = await stream.next()) chunks.push(read.value)
  return { chunks, result: read.value }
}

const texts = async (ui: { findAll: (q: { type: 'Text' }) => Promise<{ text?: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(t => t.text ?? '')

test('the pane shows host, folder, dirty branch and context percent', async ($, on) => {
  await start($, on, { isRepo: true, isDirty: true, percent: 24, host: 'box' })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await text(ui, /box/)).toContain('box')
    expect(await text(ui, /proj/)).toContain('~/src')
    expect(await text(ui, /main/)).toContain('*')
    expect(await text(ui, /24%/)).toBeDefined()
    if (surface === 'terminal') {
      expect(await text(ui, /24%/)).toContain('━────')
      expect(await text(ui, /\u{F0322}/u)).toContain('box')
    } else {
      expect(await svgAlt(ui, /Context/)).toBe('Context 24% used')
      expect(await svgAlt(ui, /computer/)).toBe('computer')
    }
    await ui.unmount()
  }
})

test('outside a repo, no hostname and no usage yet', async ($, on) => {
  await start($, on, { isRepo: false })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await text(ui, /This computer/)).toBeDefined()
    expect(await text(ui, /main/)).toBeUndefined()
    expect(await text(ui, /—/)).toBeDefined()
    if (surface === 'terminal') expect(await text(ui, /—/)).toContain('─────')
    else expect(await svgAlt(ui, /Context/)).toBe('Context no data')
    await ui.unmount()
  }
})

test('opening the context card lists its categories, deferred left out', async ($, on) => {
  await start($, on, { isRepo: true, percent: 24, host: 'box' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await text(ui, /Messages/)).toBeUndefined()

  await ui.press({ key: 'context' })
  expect(await text(ui, /30\.2k/)).toBe('30.2k')
  expect(await text(ui, /Free space/)).toBeDefined()
  expect(await text(ui, /MCP tools/)).toBeUndefined()
  await ui.unmount()
})

test('closing the environment card hides its rows', async ($, on) => {
  await start($, on, { isRepo: true, percent: 24, host: 'box' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await ui.press({ key: 'env' })
  expect(await text(ui, /box/)).toBeUndefined()
  await ui.unmount()
})

test('the pane stays closed until /rail opens it', async ($, on) => {
  const opened: string[] = []
  await start($, on, { isRepo: false, opened })
  expect(opened).toEqual([])

  const result = await $.command.run({
    command: 'rail',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 160 },
  })
  expect(opened).toContain('session-rail')
  expect(result.text).toBe('Session pane opened.')
})

test('with openOnStart, the pane opens as the session starts, and /rail still closes it', { options: { openOnStart: true } }, async ($, on) => {
  const opened: string[] = []
  await start($, on, { isRepo: false, opened })
  expect(opened).toEqual(['session-rail'])

  const result = await $.command.run({
    command: 'rail',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 160 },
  })
  expect(result.text).toBe('Session pane closed.')
})

test('/rail closes the pane it opened', async ($, on) => {
  const opened: string[] = []
  await start($, on, { isRepo: false, opened })
  const rail = () =>
    $.command.run({
      command: 'rail',
      args: '',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: true, columns: 160 },
    })

  await rail()
  expect((await rail()).text).toBe('Session pane closed.')
  expect((await rail()).text).toBe('Session pane opened.')
  expect(opened).toEqual(['session-rail', 'session-rail'])
})

test('/rail is registered to run at once, even mid-turn', async ($, on) => {
  const registered: unknown[] = []
  await start($, on, { isRepo: false, registered })

  expect(registered).toEqual([expect.objectContaining({ name: 'rail', immediate: true })])
})

test('the usage card shows each window with its reset', async ($, on) => {
  await start($, on, {
    isRepo: false,
    limits: [
      { kind: 'five_hour', percentUsed: 23.4, resetsAt: '2026-10-23T12:14:00Z' },
      { kind: 'seven_day', percentUsed: 96, resetsAt: '2026-10-26T15:30:00Z' },
    ],
  })
  // The terminal's monospace lines the columns up with spaces.
  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await text(terminal, /^5h/)).toContain('23%')
  expect(await text(terminal, /^7d/)).toContain('96%')
  expect(await text(terminal, /^5h/)).toContain('━────')
  expect(await text(terminal, /resets 2h14m/)).toBeDefined()
  expect(await text(terminal, /resets 3d5h/)).toBeDefined()
  await terminal.unmount()
  // Elsewhere spaces are narrower than digits: the window and its reset on the left,
  // the percent and meter on the right, as the context card's title row.
  for (const surface of ['desktop', 'vscode'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await text(ui, /^5h/)).toBe('5h · resets 2h14m')
    expect(await text(ui, /^7d/)).toBe('7d · resets 3d5h')
    expect(await text(ui, /^23%$/)).toBe('23%')
    expect(await text(ui, /^96%$/)).toBe('96%')
    expect(await svgAlt(ui, /5h/)).toBe('5h 23% used')
    await ui.unmount()
  }
})

test('the usage card before any reading, and closed', async ($, on) => {
  await start($, on, { isRepo: false })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await text(ui, /No data yet/)).toBeDefined()

  await ui.press({ key: 'usage' })
  expect(await text(ui, /No data yet/)).toBeUndefined()
  await ui.unmount()
})

test('cards are spaced apart where borders are drawn by the surface, not on the terminal', async ($, on) => {
  await start($, on, { isRepo: false })
  for (const surface of ['desktop', 'vscode'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ key: 'cards' }))?.props.gap).toBe(1)
    await ui.unmount()
  }
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ key: 'cards' }))?.props.gap).toBeUndefined()
  await ui.unmount()
})

test('titles are text beside a one-glyph toggle, so they line up with the rows', async ($, on) => {
  await start($, on, { isRepo: false })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ key: 'env' }))?.text).toBe('▾')
    expect((await ui.find({ key: 'context' }))?.text).toBe('▸')
    expect(await text(ui, /^Environment$/)).toBe('Environment')
    await ui.unmount()
  }
})

test('card borders are dim on the terminal and the inactive color elsewhere', async ($, on) => {
  await start($, on, { isRepo: false })
  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await terminal.find({ key: 'env-card' }))?.props.borderDimColor).toBe(true)
  await terminal.unmount()
  for (const surface of ['desktop', 'vscode'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ key: 'env-card' }))?.props.borderColor).toBe('inactive')
    await ui.unmount()
  }
})

test('cards in VS Code have half a line of room above and below their rows', async ($, on) => {
  await start($, on, { isRepo: false })
  const vscode = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect((await vscode.find({ key: 'env-card' }))?.props.paddingY).toBe(0.5)
  await vscode.unmount()
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ key: 'env-card' }))?.props.paddingY).toBeUndefined()
    await ui.unmount()
  }
})

test('the toggle is a plain Button, save in VS Code, where it is a bare link', async ($, on) => {
  await start($, on, { isRepo: true, percent: 24, host: 'box' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const toggle = await ui.find({ key: 'env' })
    expect(toggle?.type).toBe('Button')
    expect(toggle?.props.plain).toBe(true)
    await ui.unmount()
  }
  // VS Code draws every Button filled or bordered; a link the plugin answers, bare.
  const vscode = await $.ui.mount({ ...PANE, surface: 'vscode' })
  const href = 'https://session-rail.invalid/env'
  const toggle = await vscode.find({ key: 'env' })
  expect(toggle?.type).toBe('Markdown')
  expect(toggle?.props.text).toBe(`[▾](${href})`)
  expect(toggle?.props.pressableLinks).toEqual([href])
  expect(await text(vscode, /box/)).toBeDefined()
  await vscode.press({ key: 'env', link: { href } })
  expect(await text(vscode, /box/)).toBeUndefined()
  expect((await vscode.find({ key: 'env' }))?.props.text).toBe('[▸](https://session-rail.invalid/env)')
  await vscode.unmount()
})

test('the cost card splits the total by model, most expensive first', async ($, on) => {
  const opts: Opts = { isRepo: false }
  await start($, on, opts)
  opts.cost = 0.4724
  await step($, opts, usage('claude-opus-5-5', 28, 5400, 481_400, 33_500))
  await step($, opts, usage('claude-haiku-5-5', 1200, 20))
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const all = await texts(ui)
    expect(all).toContain('$0.4724')
    expect(all.indexOf('Opus 5.5')).toBeGreaterThan(-1)
    expect(all.indexOf('Opus 5.5')).toBeLessThan(all.indexOf('Haiku 5.5'))
    expect(all).toContain('$0.0001')
    expect(all).not.toContain('Other')
    await ui.unmount()
  }
})

test('what the rows miss shows as Other, a model without a price among it', async ($, on) => {
  const opts: Opts = { isRepo: false }
  await start($, on, opts)
  opts.cost = 0.6
  await step($, opts, usage('claude-opus-5-5', 28, 5400, 481_400, 33_500))
  await step($, opts, usage('claude-sonnet-9', 1000, 1000))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const all = await texts(ui)
  expect(all).toContain('Other')
  expect(all).toContain('$0.1276')
  expect(all).not.toContain('sonnet-9')
  await ui.unmount()
})

test('a session count that starts over empties the model rows', async ($, on) => {
  const opts: Opts = { isRepo: false }
  await start($, on, opts)
  opts.cost = 0.4724
  await step($, opts, usage('claude-opus-5-5', 28, 5400, 481_400, 33_500))
  opts.startedAt = 9000
  opts.cost = 0.0001
  await step($, opts, usage('claude-haiku-5-5', 1200, 20))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const all = await texts(ui)
  expect(all).not.toContain('Opus 5.5')
  expect(all).toContain('Haiku 5.5')
  await ui.unmount()
})

test('the cost card before any spend, and closed', async ($, on) => {
  const opts: Opts = { isRepo: false }
  await start($, on, opts)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ key: 'cost' }))?.text).toBe('▾')
  expect(await text(ui, /No spend yet/)).toBeDefined()

  await ui.press({ key: 'cost' })
  expect(await text(ui, /No spend yet/)).toBeUndefined()
  await ui.unmount()
})

test('a step passes through whole, its chunks and result as the engine gave them', async ($, on) => {
  const opts: Opts = { isRepo: false }
  await start($, on, opts)
  const { chunks, result } = await step($, opts, usage('claude-opus-5-5', 10, 10))
  expect(chunks).toEqual([expect.objectContaining({ kind: 'text', text: 'hi' })])
  expect(result.usage?.model).toBe('claude-opus-5-5')
})

// A failed hook is run past with next(e): on turn.step, a second model request.
test('a step whose cost cannot be read is not requested again', async ($, on) => {
  const opts: Opts = { isRepo: false }
  await start($, on, opts)
  opts.isUsageDenied = true
  const { result } = await step($, opts, usage('claude-opus-5-5', 10, 10))
  expect(result.stopReason).toBe('end_turn')
  expect(opts.requests).toBe(1)
})
