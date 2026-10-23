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

type Limit = { kind: string; percentUsed: number; resetsAt?: string }
type Opts = { isRepo: boolean; isDirty?: boolean; percent?: number; host?: string; opened?: string[]; limits?: Limit[] }

const NOW = Date.parse('2026-10-23T10:00:00Z')

const run = (exitCode: number, stdout = '') => ({
  value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

// Each hook here stands for the engine beneath the plugin.
async function start($: Parameters<TestBody>[0], on: Parameters<TestBody>[1], opts: Opts) {
  on('command.register', () => ({ value: { command: 'rail' } }))
  on('ui.open', (_, e) => {
    opts.opened?.push(e.id)
    return { value: { isPlaced: true } }
  })
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
  on('session.usage', (_, e) => ({
    value: {
      startedAt: 0,
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
  await $.session.start({ cwd: '/home/u/src/proj', surface: 'terminal', isInteractive: true })
}

const text = async (ui: { find: (t: { type: 'Text'; text: RegExp }) => Promise<{ text?: string } | undefined> }, re: RegExp) =>
  (await ui.find({ type: 'Text', text: re }))?.text

test('the pane shows host, folder, dirty branch and context percent', async ($, on) => {
  await start($, on, { isRepo: true, isDirty: true, percent: 24, host: 'box' })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await text(ui, /box/)).toContain('box')
    expect(await text(ui, /proj/)).toContain('~/src')
    expect(await text(ui, /main/)).toContain('*')
    expect(await text(ui, /24%/)).toContain('━────')
    await ui.unmount()
  }
})

test('outside a repo, no hostname and no usage yet', async ($, on) => {
  await start($, on, { isRepo: false })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await text(ui, /This computer/)).toBeDefined()
    expect(await text(ui, /\uE725/)).toBeUndefined()
    expect(await text(ui, /—/)).toContain('─────')
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

test('/rail opens the pane', async ($, on) => {
  const opened: string[] = []
  await start($, on, { isRepo: false, opened })
  opened.length = 0

  const result = await $.command.run({
    command: 'rail',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 160 },
  })
  expect(opened).toContain('session-rail')
  expect(result.text).toBe('Session pane opened.')
})

test('the usage card shows each window with its reset', async ($, on) => {
  await start($, on, {
    isRepo: false,
    limits: [
      { kind: 'five_hour', percentUsed: 23.4, resetsAt: '2026-10-23T12:14:00Z' },
      { kind: 'seven_day', percentUsed: 96, resetsAt: '2026-10-26T15:30:00Z' },
    ],
  })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const five = await text(ui, /^5h/)
    expect(five).toContain('23%')
    expect(five).toContain('━────')
    expect(five).toContain('resets 2h14m')
    const seven = await text(ui, /^7d/)
    expect(seven).toContain('96%')
    expect(seven).toContain('resets 3d5h')
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
