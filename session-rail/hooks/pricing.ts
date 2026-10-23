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
