import { expect, test } from 'claude-code/testing'

import { addSpend, costRows, price, settle } from '../hooks/pricing'

// The kit's expect has no toBeCloseTo: compare at a fixed number of decimals.
const round = (n: number | null, digits: number) => (n === null ? null : Number(n.toFixed(digits)))

const usage = (model: string, input: number, output: number, read = 0, write = 0) => ({
  model,
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: write,
})

test('price matches /cost for an Opus 5.5 session, cache writes at the 1h rate', async () => {
  // 28 × $4 + 5.4k × $20 + 481.4k × $0.20 + 33.5k × $8, per million.
  expect(round(price(usage('claude-opus-5-5', 28, 5400, 481_400, 33_500)), 6)).toBe(0.472392)
})

test('a dated snapshot takes its model rates, and Opus 5.5 is not Opus 5', async () => {
  expect(round(price(usage('claude-opus-5-5', 1_000_000, 0)), 6)).toBe(4)
  expect(round(price(usage('claude-opus-5', 1_000_000, 0)), 6)).toBe(5)
  expect(round(price(usage('claude-haiku-4-5-20251001', 1_000_000, 0)), 6)).toBe(1)
})

test('Haiku 5.5 bills a prompt above 100K tokens at the higher tier', async () => {
  expect(round(price(usage('claude-haiku-5-5', 1200, 20)), 8)).toBe(0.00013)
  // 150k × $0.50 + 1k × $2.50, per million.
  expect(round(price(usage('claude-haiku-5-5', 150_000, 1000)), 8)).toBe(0.0775)
  // The tier counts cached input too: 60k read + 50k written is 110k.
  expect(round(price(usage('claude-haiku-5-5', 0, 0, 60_000, 50_000)), 8)).toBe(0.053)
})

test('a model the table lacks has no price', async () => {
  expect(price(usage('claude-sonnet-9', 1000, 1000))).toBeNull()
  expect(price(usage('claude-opus-55', 1000, 1000))).toBeNull()
  // A newer point release is not an older one with a suffix: it waits for the table.
  expect(price(usage('claude-opus-5-6', 1000, 1000))).toBeNull()
  expect(price(usage('claude-fable-5-2', 1000, 1000))).toBeNull()
})

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
  const modelRows = [
    { label: 'opus-5-5', usd: 0.4718 },
    { label: 'haiku-5-5', usd: 0.0001 },
  ]
  expect(costRows({ total: 0.4719, since: 0, models })).toEqual(modelRows)
  const rows = costRows({ total: 0.5, since: 0, models })
  expect(rows.slice(0, 2)).toEqual(modelRows)
  expect(rows[2]?.label).toBe('Other')
  expect(round(rows[2]?.usd ?? null, 8)).toBe(0.0281)
  // Below half a cent the gap is rounding, or a step not yet in the total.
  expect(costRows({ total: 0.476, since: 0, models })).toHaveLength(2)
  expect(costRows({ total: 0.3, since: 0, models })).toHaveLength(2)
  expect(costRows({ total: 0.2, since: 0, models: [] })).toEqual([{ label: 'Other', usd: 0.2 }])
  expect(costRows(EMPTY)).toEqual([])
})
