import { expect, test } from 'claude-code/testing'

import { price } from '../hooks/pricing'

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

test('a longer prefix wins: Opus 5.5 does not take Opus 5 rates', async () => {
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
})
