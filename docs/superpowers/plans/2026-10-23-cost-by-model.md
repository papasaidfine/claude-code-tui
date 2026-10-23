# Cost by Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Cost card in the session-rail pane: the session's USD total (the engine's, as `/cost` prints it) and its split by model.

**Architecture:** A `turn.step` hook prices each response's `usage` with a built-in price table (`hooks/pricing.ts`) and adds it to that model's row in `$.state`; the total comes from `$.session.usage().cost.usd`, and what the rows do not cover shows as "Other". `usage.startedAt` changing (a `/clear`) empties the rows.

**Tech Stack:** Claude Code mod (function hooks, TSX against `$.ui.resolve`), `claude plugin test` (bun-style `expect`), `claude plugin validate`.

Spec: `docs/superpowers/specs/2026-10-23-cost-by-model-design.md`.

All commands run from `session-rail/`.

---

## File map

- Create `session-rail/hooks/pricing.ts`: the price table, `price()`, and the pure row helpers `settle()`, `addSpend()`, `costRows()`.
- Create `session-rail/tests/pricing.test.ts`.
- Modify `session-rail/hooks/format.ts`: add `usd()`.
- Modify `session-rail/tests/format.test.ts`: test `usd()`.
- Modify `session-rail/types/index.d.ts`: `ModelCost`, `CostInfo`, state keys `cost`, `isCostOpen`.
- Modify `session-rail/hooks/collect.ts`: `readUsage` also returns `spent: { usd, startedAt }`.
- Modify `session-rail/hooks/register.tsx`: atoms, `refresh` writes the total, `turn.step` hook, Cost card.
- Modify `session-rail/tests/rail.test.tsx`: mock `cost`/`startedAt`/`turn.step`, Cost card tests.
- Modify `README.md`, `session-rail/.claude-plugin/plugin.json` (0.4.0), the spec (empty-state wording).

---

### Task 1: `price()` and the price table

**Files:**
- Create: `session-rail/hooks/pricing.ts`
- Test: `session-rail/tests/pricing.test.ts`

- [ ] **Step 1: Write the failing test**

`session-rail/tests/pricing.test.ts`:

```ts
import { expect, test } from 'claude-code/testing'

import { price } from '../hooks/pricing'

const usage = (model: string, input: number, output: number, read = 0, write = 0) => ({
  model,
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: write,
})

test('price matches /cost for an Opus 5.5 session, cache writes at the 1h rate', async () => {
  // 28 × $4 + 5.4k × $20 + 481.4k × $0.20 + 33.5k × $8, per million.
  expect(price(usage('claude-opus-5-5', 28, 5400, 481_400, 33_500))).toBeCloseTo(0.472392, 6)
})

test('a longer prefix wins: Opus 5.5 does not take Opus 5 rates', async () => {
  expect(price(usage('claude-opus-5-5', 1_000_000, 0))).toBeCloseTo(4, 6)
  expect(price(usage('claude-opus-5', 1_000_000, 0))).toBeCloseTo(5, 6)
  expect(price(usage('claude-haiku-4-5-20251001', 1_000_000, 0))).toBeCloseTo(1, 6)
})

test('Haiku 5.5 bills a prompt above 100K tokens at the higher tier', async () => {
  expect(price(usage('claude-haiku-5-5', 1200, 20))).toBeCloseTo(0.00013, 8)
  // 150k × $0.50 + 1k × $2.50, per million.
  expect(price(usage('claude-haiku-5-5', 150_000, 1000))).toBeCloseTo(0.0775, 8)
  // The tier counts cached input too: 60k read + 50k written is 110k.
  expect(price(usage('claude-haiku-5-5', 0, 0, 60_000, 50_000))).toBeCloseTo(0.053, 8)
})

test('a model the table lacks has no price', async () => {
  expect(price(usage('claude-sonnet-9', 1000, 1000))).toBeNull()
  expect(price(usage('claude-opus-55', 1000, 1000))).toBeNull()
})
```

(The last Haiku case: 60k × $0.05 + 50k × $1.00 = 3000 + 50000 per million = $0.053.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `claude plugin test .`
Expected: FAIL in `pricing.test.ts`, cannot resolve `../hooks/pricing`.

- [ ] **Step 3: Write the implementation**

`session-rail/hooks/pricing.ts`:

```ts
import type { TurnUsage } from 'claude-code'

// USD per million tokens. Cache reads are the published rate where one is listed,
// else 0.1× input; cache writes are priced at the 1h rate, 2× input, which the
// main thread uses (TurnUsage does not split writes by TTL).
type Rates = { input: number; output: number; read: number }

const RATES: Record<string, Rates> = {
  'claude-fable-5-1': { input: 10, output: 50, read: 0.25 },
  'claude-fable-5': { input: 10, output: 50, read: 1 },
  'claude-opus-5-5': { input: 4, output: 20, read: 0.2 },
  'claude-opus-5': { input: 5, output: 25, read: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, read: 0.5 },
  'claude-opus-4-7': { input: 5, output: 25, read: 0.5 },
  'claude-opus-4-6': { input: 5, output: 25, read: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, read: 0.2 },
  'claude-sonnet-5': { input: 2, output: 10, read: 0.2 },
  'claude-sonnet-4-6': { input: 3, output: 15, read: 0.3 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, read: 0.01 },
  'claude-haiku-4-5': { input: 1, output: 5, read: 0.1 },
}

// Haiku 5.5 bills a prompt above 100K tokens at a higher tier.
const LONG_PROMPT = 100_000
const LONG_RATES: Record<string, Rates> = {
  'claude-haiku-5-5': { input: 0.5, output: 2.5, read: 0.05 },
}

// Longest first, so claude-opus-5-5 is not read as claude-opus-5.
const FAMILIES = Object.entries(RATES).sort(([a], [b]) => b.length - a.length)

export function price(usage: TurnUsage): number | null {
  const found = FAMILIES.find(([prefix]) => usage.model === prefix || usage.model.startsWith(`${prefix}-`))
  if (found === undefined) return null
  const [name, base] = found
  const prompt = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
  const rates = (prompt > LONG_PROMPT && LONG_RATES[name]) || base
  return (
    (usage.input_tokens * rates.input +
      usage.output_tokens * rates.output +
      usage.cache_read_input_tokens * rates.read +
      usage.cache_creation_input_tokens * rates.input * 2) /
    1_000_000
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `claude plugin test .`
Expected: all pass (21 existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add hooks/pricing.ts tests/pricing.test.ts
git commit -m "session-rail: price a response's usage by model"
```

---

### Task 2: Row helpers `settle`, `addSpend`, `costRows`

**Files:**
- Modify: `session-rail/types/index.d.ts`
- Modify: `session-rail/hooks/pricing.ts`
- Test: `session-rail/tests/pricing.test.ts`

- [ ] **Step 1: Add the types**

In `session-rail/types/index.d.ts`, after the `Limit` type:

```ts
export type ModelCost = { model: string; usd: number }

// `total` is the engine's (/cost's); `models` are summed since `since`, the
// session usage's `startedAt` when they began counting.
export type CostInfo = {
  total: number | null
  since: number | null
  models: ModelCost[]
}
```

and in `PluginState['session-rail']`, after `limits: Limit[]`:

```ts
      cost: CostInfo
```

and after `isUsageOpen: boolean`:

```ts
      isCostOpen: boolean
```

- [ ] **Step 2: Write the failing tests**

Append to `session-rail/tests/pricing.test.ts`, and change its import line to:

```ts
import { addSpend, costRows, price, settle } from '../hooks/pricing'
```

```ts
const EMPTY = { total: null, since: null, models: [] }

test('settle keeps the rows while the session count is the same, empties them when it starts over', async () => {
  const counted = { total: 0.4, since: 0, models: [{ model: 'claude-opus-5-5', usd: 0.4 }] }
  expect(settle(counted, 0.5, 0)).toEqual({ total: 0.5, since: 0, models: counted.models })
  expect(settle(counted, 0.01, 9000)).toEqual({ total: 0.01, since: 9000, models: [] })
  expect(settle(EMPTY, null, 0)).toEqual({ total: null, since: 0, models: [] })
})

test('addSpend adds to the model row, or starts one', async () => {
  const one = addSpend([], 'claude-opus-5-5', 0.25)
  expect(one).toEqual([{ model: 'claude-opus-5-5', usd: 0.25 }])
  const two = addSpend(one, 'claude-haiku-5-5', 0.01)
  expect(addSpend(two, 'claude-opus-5-5', 0.5)).toEqual([
    { model: 'claude-opus-5-5', usd: 0.75 },
    { model: 'claude-haiku-5-5', usd: 0.01 },
  ])
})

test('costRows: most expensive first, claude- dropped, Other for what the rows miss', async () => {
  const models = [
    { model: 'claude-haiku-5-5', usd: 0.0001 },
    { model: 'claude-opus-5-5', usd: 0.4718 },
  ]
  expect(costRows({ total: 0.4719, since: 0, models })).toEqual([
    { label: 'opus-5-5', usd: 0.4718 },
    { label: 'haiku-5-5', usd: 0.0001 },
  ])
  expect(costRows({ total: 0.5, since: 0, models })).toEqual([
    { label: 'opus-5-5', usd: 0.4718 },
    { label: 'haiku-5-5', usd: 0.0001 },
    { label: 'Other', usd: expect.closeTo(0.0281, 8) },
  ])
  // Below half a cent the gap is rounding, or a step not yet in the total.
  expect(costRows({ total: 0.476, since: 0, models })).toHaveLength(2)
  expect(costRows({ total: 0.3, since: 0, models })).toHaveLength(2)
  expect(costRows({ total: 0.2, since: 0, models: [] })).toEqual([{ label: 'Other', usd: 0.2 }])
  expect(costRows(EMPTY)).toEqual([])
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `claude plugin test .`
Expected: FAIL, `settle` / `addSpend` / `costRows` not exported.

- [ ] **Step 4: Write the implementation**

In `session-rail/hooks/pricing.ts`, add to the imports:

```ts
import type { CostInfo, ModelCost } from '../types'
```

and append:

```ts
// The engine's total and where its count began; a new start (a /clear) empties
// the rows, which counted the old one.
export function settle(now: CostInfo, total: number | null, startedAt: number): CostInfo {
  const isSame = now.since === null || now.since === startedAt
  return { total, since: startedAt, models: isSame ? now.models : [] }
}

export function addSpend(models: ModelCost[], model: string, usd: number): ModelCost[] {
  if (!models.some(row => row.model === model)) return [...models, { model, usd }]
  return models.map(row => (row.model === model ? { model, usd: row.usd + usd } : row))
}

// Below half a cent a gap is rounding, or a step the engine has not totalled yet.
const OTHER_MIN = 0.005

export function costRows(cost: CostInfo): { label: string; usd: number }[] {
  const rows = [...cost.models]
    .sort((a, b) => b.usd - a.usd)
    .map(row => ({ label: row.model.replace(/^claude-/, ''), usd: row.usd }))
  const other = (cost.total ?? 0) - cost.models.reduce((sum, row) => sum + row.usd, 0)
  return other >= OTHER_MIN ? [...rows, { label: 'Other', usd: other }] : rows
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `claude plugin test .`
Expected: all pass. If `expect.closeTo` is not supported by the kit's `expect`, replace that `toEqual` with three asserts: `toHaveLength(3)`, `rows[2].label` is `'Other'`, `rows[2].usd` `toBeCloseTo(0.0281, 8)`.

- [ ] **Step 6: Commit**

```bash
git add types/index.d.ts hooks/pricing.ts tests/pricing.test.ts
git commit -m "session-rail: cost rows by model with an Other remainder"
```

---

### Task 3: `usd()` formatting

**Files:**
- Modify: `session-rail/hooks/format.ts`
- Test: `session-rail/tests/format.test.ts`

- [ ] **Step 1: Write the failing test**

In `session-rail/tests/format.test.ts`, add `usd` to the import from `'../hooks/format'` and append:

```ts
test('usd keeps four decimals below a dollar, two from a dollar up', async () => {
  expect(usd(0)).toBe('$0.0000')
  expect(usd(0.00013)).toBe('$0.0001')
  expect(usd(0.4719)).toBe('$0.4719')
  expect(usd(1)).toBe('$1.00')
  expect(usd(12.345)).toBe('$12.35')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `claude plugin test .`
Expected: FAIL, `usd` not exported.

- [ ] **Step 3: Write the implementation**

Append to `session-rail/hooks/format.ts`:

```ts
// As /cost prints it: four decimals below a dollar.
export function usd(n: number): string {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `claude plugin test .`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add hooks/format.ts tests/format.test.ts
git commit -m "session-rail: format dollar amounts"
```

---

### Task 4: Collect, hook and draw the Cost card

**Files:**
- Modify: `session-rail/hooks/collect.ts` (`readUsage`)
- Modify: `session-rail/hooks/register.tsx`
- Test: `session-rail/tests/rail.test.tsx`

- [ ] **Step 1: Extend the test's engine mock**

In `session-rail/tests/rail.test.tsx`:

Replace the `Opts` type with:

```ts
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
}
```

In `start`, replace `startedAt: 0,` in the `session.usage` mock with:

```ts
      startedAt: opts.startedAt ?? 0,
      cost: opts.cost === undefined ? undefined : { usd: opts.cost },
```

and, before `await $.session.start(...)`, add the engine's side of a step:

```ts
  on('turn.step', async function* (_, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: opts.step ?? null,
    }
  })
```

After the `text` helper, add:

```ts
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
  for await (const _ of stream) {
  }
  return stream.result
}

const texts = async (ui: { findAll: (q: { type: 'Text' }) => Promise<{ text?: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(t => t.text ?? '')
```

- [ ] **Step 2: Write the failing tests**

Append to `session-rail/tests/rail.test.tsx`:

```ts
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
    expect(all.indexOf('opus-5-5')).toBeGreaterThan(-1)
    expect(all.indexOf('opus-5-5')).toBeLessThan(all.indexOf('haiku-5-5'))
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
  expect(all).not.toContain('opus-5-5')
  expect(all).toContain('haiku-5-5')
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
```

(Other in the second test: $0.6 − $0.472392 = $0.127608, shown `$0.1276`.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `claude plugin test .`
Expected: the four new tests FAIL (no Cost card); the 21 + 7 earlier ones pass.

- [ ] **Step 4: Return the engine's cost from `readUsage`**

In `session-rail/hooks/collect.ts`, change `readUsage`'s return type and body:

```ts
export async function readUsage(
  $: EngineInterface,
  withBreakdown: boolean,
): Promise<{ context: ContextInfo; limits: Limit[]; spent: { usd: number | null; startedAt: number } }> {
  const [{ context, rateLimits, cost, startedAt }, now] = await Promise.all([
    $.session.usage(withBreakdown ? { breakdown: 'summary' } : undefined),
    $.clock.now(),
  ])
```

and its last line:

```ts
  return {
    context: { percent: context.percent ?? null, rows },
    limits,
    spent: { usd: cost?.usd ?? null, startedAt },
  }
```

- [ ] **Step 5: State, refresh and the `turn.step` hook**

In `session-rail/hooks/register.tsx`:

Imports become:

```ts
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren, TurnUsage } from 'claude-code'

import type { ContextInfo, CostInfo, Env, Limit } from '../types'
import { readEnv, readUsage } from './collect'
import { bar, level, tokens, usd } from './format'
import { addSpend, costRows, price, settle } from './pricing'
import { COLOR, ICON_ALT, ICON_SVG, meterSvg } from './svg'
```

After the `limits` atom:

```ts
const cost = atom({ plugin: 'session-rail', key: 'cost' } as const, { total: null, since: null, models: [] } as CostInfo)
```

After the `isUsageOpen` atom:

```ts
const isCostOpen = atom({ plugin: 'session-rail', key: 'isCostOpen' } as const, true)
```

In `refresh`, inside `if (nextUsage.status === 'fulfilled') { ... }`, add:

```ts
    const { spent } = nextUsage.value
    await update($, cost, now => settle(now, spent.usd, spent.startedAt))
```

After `refresh`, add:

```ts
// Prices one response by its model; reads the engine's total beside it.
async function record($: EngineInterface, usage: TurnUsage): Promise<void> {
  const usd = price(usage)
  const { cost: spent, startedAt } = await $.session.usage()
  await update($, cost, now => {
    const settled = settle(now, spent?.usd ?? now.total, startedAt)
    return usd === null ? settled : { ...settled, models: addSpend(settled.models, usage.model, usd) }
  })
}
```

In `register`, after the `turn.complete` hook:

```ts
  // Each model response, on the main loop and in subagents, with its model's usage.
  on('turn.step', async function* ($, e, next) {
    const step = yield* next(e)
    if (step.usage) await record($, step.usage)

    return step
  })
```

- [ ] **Step 6: Draw the Cost card**

In the `ui.render` hook, extend the reads:

```ts
    const [envNow, contextNow, limitsNow, costNow, envOpen, contextOpen, usageOpen, costOpen] = await Promise.all([
      read($, env),
      read($, context),
      read($, limits),
      read($, cost),
      read($, isEnvOpen),
      read($, isContextOpen),
      read($, isUsageOpen),
      read($, isCostOpen),
    ])
```

After `const labelWidth = ...`:

```ts
    const spend = costRows(costNow)
```

After the closing `</Box>` of `usage-card`, before the outer `</Box>`:

```tsx
        <Box key="cost-card" flexDirection="column" borderStyle="round" {...border} paddingX={1}>
          <Box flexDirection="row" justifyContent="space-between">
            {title('Cost', 'cost', costOpen, () => update($, isCostOpen, open => !open))}
            <Text>{costNow.total === null ? '—' : usd(costNow.total)}</Text>
          </Box>
          {costOpen && spend.length === 0 && <Text dimColor>No spend yet</Text>}
          {costOpen &&
            spend.map(row => (
              <Box flexDirection="row" justifyContent="space-between">
                <Text dimColor>{row.label}</Text>
                <Text>{usd(row.usd)}</Text>
              </Box>
            ))}
        </Box>
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `claude plugin test .`
Expected: all pass (32). If the kit's `$.turn.step` mock hook rejects the `async function*` shape or the result's fields, read `TurnStepResult` in `.claude-plugin/types/claude-code/index.d.ts` and add the fields it requires; do not change the plugin's hook to fit.

- [ ] **Step 8: Validate and type-check**

Run: `claude plugin validate .`
Expected: no errors; `cost` and `isCostOpen` accepted against the contract.

Run: `pnpm dlx -p typescript tsc -p . --noEmit`
Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add hooks/collect.ts hooks/register.tsx tests/rail.test.tsx
git commit -m "session-rail: Cost card with the session's spend by model"
```

---

### Task 5: Docs and version

**Files:**
- Modify: `README.md` (repo root)
- Modify: `session-rail/.claude-plugin/plugin.json`
- Modify: `docs/superpowers/specs/2026-10-23-cost-by-model-design.md`

- [ ] **Step 1: Fix the spec's empty-state wording**

In the spec's Card section, replace ``No rows yet and no Other: `No data yet`, as the Usage card does.`` with ``No rows yet and no Other: `No spend yet` (distinct from the Usage card's `No data yet`).``

- [ ] **Step 2: README**

Invoke the `user-oriented-docs` skill, then add a **Cost** section after the README's Usage section, in its voice. Content to cover: the title row is the session's total as `/cost` prints it; unfolded, one row per model, most expensive first; the per-model figures are estimated from token counts at list prices, with cache writes at the 1-hour rate; "Other" is spend the rows do not cover (requests before the mod loaded, models it has no price for, small side requests such as title generation). Update the README's one-line description of the pane if it lists the cards.

- [ ] **Step 3: Version and description**

`session-rail/.claude-plugin/plugin.json`: `"version": "0.4.0"`, `"description": "A Session pane beside the chat: environment, context, usage limits and cost by model, like Claude Desktop's session rail"`.

Also update the `/rail` command description in `register.tsx` to `'Open or close the Session pane (environment, context, usage limits and cost)'`.

- [ ] **Step 4: Full check**

Run: `claude plugin test . && claude plugin validate .`
Expected: all pass, no errors.

- [ ] **Step 5: Commit**

```bash
git add ../README.md .claude-plugin/plugin.json hooks/register.tsx ../docs/superpowers/specs/2026-10-23-cost-by-model-design.md
git commit -m "session-rail 0.4.0: cost by model"
```

---

### Task 6: Check it in a real session

- [ ] **Step 1:** Ask the person to start `claude --plugin-dir /home/lchen/src/claude-code-tui/session-rail` (the installed copy comes from GitHub and does not have the change), run a prompt or two, `/rail`, then `/cost`, and compare: the Cost title equals `/cost`'s Total cost; each model row is within a cent of `/cost`'s per-model `$`.
- [ ] **Step 2:** If a model row is off by more than rounding, compare its token counts with `/cost`'s line for that model to tell a pricing error (same tokens, different `$`) from a counting gap (different tokens).
