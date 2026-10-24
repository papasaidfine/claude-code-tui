import type { TurnUsage } from 'claude-code'

import type { CostInfo, ModelCost } from '../types'
import { modelName } from './format'

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

export function price(usage: TurnUsage): number | null {
  // A dated snapshot takes its model's rates; any other suffix is a model the table lacks.
  const name = usage.model.replace(/-\d{8}$/, '')
  const base = RATES[name]
  if (base === undefined) return null
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
    .map(row => ({ label: modelName(row.model), usd: row.usd }))
  const other = (cost.total ?? 0) - cost.models.reduce((sum, row) => sum + row.usd, 0)
  return other >= OTHER_MIN ? [...rows, { label: 'Other', usd: other }] : rows
}
