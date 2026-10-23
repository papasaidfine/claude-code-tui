# Session Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Claude Code CLI mod that docks a "Session" pane with two collapsible cards, Environment and Context, mirroring Claude Desktop's session rail.

**Architecture:** A function-hooks plugin. Pure formatting helpers (`format.ts`), data collection through `$` (`collect.ts`), and the hooks module (`register.tsx`) that refreshes `$.state` atoms on `session.start` / `turn.complete` / after `Bash`, and draws the pane from them.

**Tech Stack:** Claude Code 2.1.308 plugin API (`claude-code`, `claude-code/testing`), TSX against global `h`, `claude plugin validate|test`, `tsc`.

Spec: `docs/superpowers/specs/2026-10-23-session-rail-design.md`

**Paths used below**

- `MOD` = the mod folder (`session-rail/` in this repository; during development, the session's dev-mods folder)
- `TYPES` = the `claude-code.d.ts` the plugin-authoring skill writes when it loads (its path is printed by the skill)
- `TSC` = `/tmp/session-rail-tsc` (a tsconfig kept outside the mod folder, used until the engine lays `MOD/.claude-plugin/types/`)

Neither folder is a git repository: there are no commit steps.

---

### Task 1: Scaffold

**Files:**
- Create: `MOD/.claude-plugin/plugin.json`
- Create: `MOD/hooks/hooks.json`
- Create: `MOD/types/index.d.ts`
- Create: `MOD/hooks/register.tsx` (stub, replaced in Task 4)
- Create: `TSC/tsconfig.json`

- [ ] **Step 1: Manifest**

```json
{
  "name": "session-rail",
  "version": "0.1.0",
  "description": "A Session pane beside the chat: environment and context usage, like Claude Desktop's session rail",
  "types": "./types/index.d.ts"
}
```

- [ ] **Step 2: hooks.json**

```json
{ "modules": ["./register.tsx"] }
```

- [ ] **Step 3: State contract `types/index.d.ts`**

```ts
export type Env = {
  host: string
  dir: string
  parent: string
  branch?: string
  isDirty?: boolean
}

export type ContextRow = { label: string; tokens: number }

export type ContextInfo = {
  percent: number | null
  rows: ContextRow[]
}

declare module 'claude-code' {
  interface PluginState {
    'session-rail': {
      env: Env
      context: ContextInfo
      isEnvOpen: boolean
      isContextOpen: boolean
    }
  }
}
```

- [ ] **Step 4: Stub `hooks/register.tsx`**

```tsx
import type { Register } from 'claude-code'

export const register: Register = () => {}
```

- [ ] **Step 5: `TSC/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es2023", "lib": ["es2023"], "types": [],
    "module": "esnext", "moduleResolution": "bundler",
    "strict": true, "noUncheckedIndexedAccess": true,
    "noEmit": true, "skipLibCheck": true,
    "jsx": "react", "jsxFactory": "h", "jsxFragmentFactory": "Fragment"
  },
  "include": [
    "<TYPES>",
    "<MOD>/hooks",
    "<MOD>/types",
    "<MOD>/tests"
  ]
}
```

(`<TYPES>` and `<MOD>` written out as the absolute paths above.)

- [ ] **Step 6: Validate**

Run: `claude plugin validate MOD && pnpm dlx --package=typescript tsc -p TSC`
Expected: validate reports no refusals; tsc prints nothing.

---

### Task 2: Formatting helpers

**Files:**
- Create: `MOD/hooks/format.ts`
- Test: `MOD/tests/format.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { expect, test } from 'claude-code/testing'

import { bar, splitPath, tokens } from '../hooks/format'

test('splitPath names the folder and its parent under ~', async () => {
  expect(splitPath('/home/u/src/proj', '/home/u')).toEqual({ dir: 'proj', parent: '~/src' })
  expect(splitPath('/home/u/proj', '/home/u')).toEqual({ dir: 'proj', parent: '~' })
  expect(splitPath('/home/u', '/home/u')).toEqual({ dir: '~', parent: '' })
  expect(splitPath('/srv/app', '/home/u')).toEqual({ dir: 'app', parent: '/srv' })
  expect(splitPath('/', undefined)).toEqual({ dir: '/', parent: '' })
})

test('bar fills five cells by percent', async () => {
  expect(bar(null)).toBe('░░░░░')
  expect(bar(0)).toBe('░░░░░')
  expect(bar(24)).toBe('▓░░░░')
  expect(bar(50)).toBe('▓▓▓░░')
  expect(bar(130)).toBe('▓▓▓▓▓')
})

test('tokens abbreviates thousands', async () => {
  expect(tokens(950)).toBe('950')
  expect(tokens(3140)).toBe('3.1k')
  expect(tokens(154300)).toBe('154k')
  expect(tokens(1_200_000)).toBe('1.2M')
})
```

- [ ] **Step 2: Run, expect failure**

Run: `claude plugin test MOD`
Expected: FAIL, `../hooks/format` not found.

- [ ] **Step 3: Implement `hooks/format.ts`**

```ts
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

export function bar(percent: number | null): string {
  const filled = percent === null ? 0 : Math.min(CELLS, Math.round((percent / 100) * CELLS))
  return '▓'.repeat(filled) + '░'.repeat(CELLS - filled)
}

export function tokens(n: number): string {
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`
  if (n >= 1000) return `${trim(n / 1000)}k`
  return String(n)
}

function trim(x: number): string {
  return x >= 100 ? String(Math.round(x)) : String(Math.round(x * 10) / 10)
}
```

Note `bar(24)`: 24% of 5 = 1.2, rounds to 1 cell; `bar(50)` = 2.5 rounds to 3.

- [ ] **Step 4: Run, expect pass**

Run: `claude plugin test MOD`
Expected: the three `format` tests pass.

---

### Task 3: Data collection

**Files:**
- Create: `MOD/hooks/collect.ts`
- Test: `MOD/tests/collect.test.ts`

- [ ] **Step 1: Failing test**

Engine calls are stubbed with `on(<call>, ...)` answering `{ value }`.

```ts
import { expect, test } from 'claude-code/testing'

import { readContext, readEnv } from '../hooks/collect'

type Run = { exitCode: number; stdout: string; stderr: string; isStdoutTruncated: boolean; isStderrTruncated: boolean }
const ok = (stdout: string): Run => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
const fail: Run = { exitCode: 128, stdout: '', stderr: 'not a git repository', isStdoutTruncated: false, isStderrTruncated: false }

test('readEnv reads host, folder and a dirty branch', async ($, on) => {
  on('session.cwd', () => ({ value: '/home/u/src/proj' }))
  on('env.get', () => ({ value: '/home/u' }))
  on('process.run', (_, e) => {
    const cmd = e.argv.join(' ')
    if (cmd === 'hostname') return { value: ok('box\n') }
    if (cmd === 'git branch --show-current') return { value: ok('main\n') }
    if (cmd === 'git status --porcelain') return { value: ok(' M a.ts\n') }
    return { value: fail }
  })

  expect(await readEnv($)).toEqual({ host: 'box', dir: 'proj', parent: '~/src', branch: 'main', isDirty: true })
})

test('readEnv outside a repo and without hostname', async ($, on) => {
  on('session.cwd', () => ({ value: '/srv/app' }))
  on('env.get', () => ({ value: undefined }))
  on('process.run', () => ({ value: fail }))

  expect(await readEnv($)).toEqual({ host: 'This computer', dir: 'app', parent: '/srv' })
})

test('readContext without breakdown reads the percent alone', async ($, on) => {
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200000, tokens: 48000, percent: 24 }, rateLimits: [] },
  }))

  expect(await readContext($, false)).toEqual({ percent: 24, rows: [] })
})

test('readContext with breakdown lists used and free categories', async ($, on) => {
  on('session.usage', (_, e) => ({
    value: {
      startedAt: 0,
      rateLimits: [],
      context: {
        window: 200000,
        tokens: 48000,
        percent: 24,
        breakdown: e.breakdown
          ? {
              categories: [
                { name: 'System prompt', tokens: 3100, color: 'x', isDeferred: false, kind: 'used' },
                { name: 'MCP tools', tokens: 900, color: 'x', isDeferred: true, kind: 'deferred' },
                { name: 'Free space', tokens: 150000, color: 'x', isDeferred: false, kind: 'free' },
              ],
            }
          : undefined,
      },
    },
  }))

  expect(await readContext($, true)).toEqual({
    percent: 24,
    rows: [
      { label: 'System prompt', tokens: 3100 },
      { label: 'Free space', tokens: 150000 },
    ],
  })
})

test('readContext before the first response has no percent', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))

  expect(await readContext($, false)).toEqual({ percent: null, rows: [] })
})
```

(The stubbed `breakdown` omits fields the code never reads; cast with `as never` if tsc refuses the partial shape.)

- [ ] **Step 2: Run, expect failure**

Run: `claude plugin test MOD`
Expected: FAIL, `../hooks/collect` not found.

- [ ] **Step 3: Implement `hooks/collect.ts`**

Deferred categories are skipped (they are not in the window); the compaction buffer is kept, as `/context` lists it.

```ts
import type { EngineInterface } from 'claude-code'

import type { ContextInfo, Env } from '../types'
import { splitPath } from './format'

async function run($: EngineInterface, argv: string[]): Promise<string | null> {
  try {
    const { exitCode, stdout } = await $.process.run(argv, { timeoutMs: 5000 })
    return exitCode === 0 ? stdout.trim() : null
  } catch {
    return null
  }
}

export async function readEnv($: EngineInterface): Promise<Env> {
  const [cwd, home, host, branch, status] = await Promise.all([
    $.session.cwd(),
    $.env.get('HOME'),
    run($, ['hostname']),
    run($, ['git', 'branch', '--show-current']),
    run($, ['git', 'status', '--porcelain']),
  ])
  const env: Env = { host: host || 'This computer', ...splitPath(cwd, home) }
  if (branch !== null) {
    env.branch = branch || '(detached)'
    env.isDirty = !!status
  }
  return env
}

export async function readContext($: EngineInterface, withBreakdown: boolean): Promise<ContextInfo> {
  const { context } = await $.session.usage(withBreakdown ? { breakdown: 'summary' } : undefined)
  const rows = (context.breakdown?.categories ?? [])
    .filter(c => c.kind !== 'deferred')
    .map(c => ({ label: c.name, tokens: c.tokens }))
  return { percent: context.percent ?? null, rows }
}
```

- [ ] **Step 4: Run, expect pass**

Run: `claude plugin test MOD`
Expected: all `format` and `collect` tests pass.

---

### Task 4: Hooks and pane

**Files:**
- Modify: `MOD/hooks/register.tsx` (replace the stub)
- Test: `MOD/tests/rail.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'session-rail',
  component: 'Pane',
  requestId: 'session-rail',
  surface: 'terminal',
  props: {
    title: 'Session',
    isFocused: false,
    bodyColumns: 32,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const ok = (stdout: string) => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
const fail = { exitCode: 128, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }

function engine(on: Parameters<Parameters<typeof test>[1]>[1], opts: { isRepo: boolean; percent?: number }) {
  on('command.register', () => ({ value: { command: 'rail' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/home/u/src/proj' }))
  on('env.get', () => ({ value: '/home/u' }))
  on('process.run', (_, e) => {
    const cmd = e.argv.join(' ')
    if (cmd === 'hostname') return { value: ok('box\n') }
    if (!opts.isRepo) return { value: fail }
    if (cmd === 'git branch --show-current') return { value: ok('main\n') }
    return { value: ok('') }
  })
  on('session.usage', (_, e) => ({
    value: {
      startedAt: 0,
      rateLimits: [],
      context: {
        window: 200000,
        percent: opts.percent,
        breakdown: e.breakdown
          ? { categories: [{ name: 'Messages', tokens: 30200, color: 'x', isDeferred: false, kind: 'used' }] }
          : undefined,
      },
    },
  }))
}

test('the pane shows environment and context', async ($, on) => {
  engine(on, { isRepo: true, percent: 24 })
  await $.session.start({ cwd: '/home/u/src/proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(PANE)

  expect((await ui.find({ type: 'Text', text: /box/ }))?.text).toContain('box')
  expect((await ui.find({ type: 'Text', text: /proj/ }))?.text).toContain('~/src')
  expect((await ui.find({ type: 'Text', text: /main/ }))?.text).toContain('main')
  expect((await ui.find({ type: 'Text', text: /24%/ }))?.text).toContain('▓░░░░')
  await ui.unmount()
})

test('opening the context card lists its categories', async ($, on) => {
  engine(on, { isRepo: true, percent: 24 })
  await $.session.start({ cwd: '/home/u/src/proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(PANE)

  expect(await ui.find({ type: 'Text', text: /Messages/ })).toBeUndefined()
  await ui.press({ key: 'context' })
  expect((await ui.find({ type: 'Text', text: /Messages/ }))?.text).toContain('30.2k')
  await ui.unmount()
})

test('closing the environment card hides its rows', async ($, on) => {
  engine(on, { isRepo: true, percent: 24 })
  await $.session.start({ cwd: '/home/u/src/proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(PANE)

  await ui.press({ key: 'env' })
  expect(await ui.find({ type: 'Text', text: /box/ })).toBeUndefined()
  await ui.unmount()
})

test('outside a repo there is no branch row; no usage yet shows a dash', async ($, on) => {
  engine(on, { isRepo: false })
  await $.session.start({ cwd: '/home/u/src/proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(PANE)

  expect(await ui.find({ type: 'Text', text: /⎇/ })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /—/ }))?.text).toContain('░░░░░')
  await ui.unmount()
})
```

- [ ] **Step 2: Run, expect failure**

Run: `claude plugin test MOD`
Expected: the four `rail` tests fail (the stub draws nothing).

- [ ] **Step 3: Implement `hooks/register.tsx`**

```tsx
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ContextInfo, Env } from '../types'
import { readContext, readEnv } from './collect'
import { bar, tokens } from './format'

const PANE = 'session-rail'
const TITLE = 'Session'

const env = atom({ plugin: 'session-rail', key: 'env' } as const, { host: '', dir: '', parent: '' } as Env)
const context = atom({ plugin: 'session-rail', key: 'context' } as const, { percent: null, rows: [] } as ContextInfo)
const isEnvOpen = atom({ plugin: 'session-rail', key: 'isEnvOpen' } as const, true)
const isContextOpen = atom({ plugin: 'session-rail', key: 'isContextOpen' } as const, false)

async function refresh($: EngineInterface): Promise<void> {
  const withBreakdown = await read($, isContextOpen)
  const [nextEnv, nextContext] = await Promise.allSettled([readEnv($), readContext($, withBreakdown)])
  if (nextEnv.status === 'fulfilled') await update($, env, () => nextEnv.value)
  if (nextContext.status === 'fulfilled') await update($, context, () => nextContext.value)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'rail', description: 'Open the Session pane (environment and context)' })
    void $.ui.open({ id: PANE, title: TITLE })
    await refresh($)

    return started
  })

  on('command.run', { command: 'rail' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Session pane opened.' }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    void refresh($)

    return done
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    void refresh($)

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const [envNow, contextNow, envOpen, contextOpen] = await Promise.all([
      read($, env),
      read($, context),
      read($, isEnvOpen),
      read($, isContextOpen),
    ])
    const percent = contextNow.percent === null ? '—' : `${Math.round(contextNow.percent)}%`

    return (
      <Box flexDirection="column">
        <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
          <Button key="env" plain onPress={() => update($, isEnvOpen, open => !open)}>
            <Text bold>Environment {envOpen ? '▾' : '▸'}</Text>
          </Button>
          {envOpen && (
            <Box flexDirection="column">
              <Text>💻 {envNow.host}</Text>
              <Text wrap="truncate-middle">
                📁 {envNow.dir}
                {envNow.parent && <Text dimColor> · {envNow.parent}</Text>}
              </Text>
              {envNow.branch !== undefined && (
                <Text>
                  ⎇ {envNow.branch}
                  {envNow.isDirty && <Text color="yellow"> *</Text>}
                </Text>
              )}
            </Box>
          )}
        </Box>
        <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
          <Box flexDirection="row" justifyContent="space-between">
            <Button
              key="context"
              plain
              onPress={async () => {
                await update($, isContextOpen, open => !open)
                await refresh($)
              }}
            >
              <Text bold>Context {contextOpen ? '▾' : '▸'}</Text>
            </Button>
            <Text>
              {percent} <Text color="blue">{bar(contextNow.percent)}</Text>
            </Text>
          </Box>
          {contextOpen &&
            contextNow.rows.map(row => (
              <Box flexDirection="row" justifyContent="space-between">
                <Text dimColor>{row.label}</Text>
                <Text>{tokens(row.tokens)}</Text>
              </Box>
            ))}
        </Box>
      </Box>
    )
  })
}
```

- [ ] **Step 4: Run, expect pass**

Run: `claude plugin test MOD`
Expected: all tests pass (format 3, collect 5, rail 4).

---

### Task 5: Verify and load

- [ ] **Step 1: Static checks**

Run: `claude plugin validate MOD && pnpm dlx --package=typescript tsc -p TSC`
Expected: no refusals; tsc prints nothing.

- [ ] **Step 2: Load in this session**

The first write under the dev-mods folder raised "Turn on the mods Claude writes in this session?". Once answered `Turn them on`, the mod loads when the turn ends. Confirm in the terminal: the Session pane docks on the right (terminal ≥ 144 columns) or opens with `/rail`; run a Bash command that switches branch or edits a file and see the branch / `*` update; open Context and see category rows.

- [ ] **Step 3: Type-check against the laid types**

After the first load, `MOD/.claude-plugin/types/tsconfig.json` exists. Run: `pnpm dlx --package=typescript tsc -p MOD`
Expected: prints nothing.

---

## Deviations during execution

- **Task 3 test dropped.** A test's `$` is the testing kit's `Engine` (it raises events: `$.session.start`, `$.ui.mount`, `$.command.run`), not a plugin's `EngineInterface`, so `readEnv($)` / `readContext($)` cannot be called from a test (tsc flags it: `Type 'Engine' is missing ... from type 'EngineInterface'`). Their cases (dirty branch, no repo, no hostname, no usage yet, deferred categories left out) moved into `tests/rail.test.tsx`, which drives them through the plugin's own `$` with `on(...)` answering each engine call.
- **Test hooks register first.** The kit refuses `on(...)` after the test's first call on `$`, so the `/rail` test records `ui.open` through the `start()` helper's `opened` option.
- **`/rail` test** passes `origin` and `presentation`, which `CommandRunInput` requires.
- Result: 8 tests (format 3, rail 5) pass; `tsc` clean; `claude plugin validate` passes (README/LICENSE/icon warnings only matter for directory submission).
