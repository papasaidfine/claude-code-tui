# Session Rail: Cost by Model — Design

Adds a **Cost** card to the session-rail pane: the session's US-dollar spend,
broken down by model, as `/cost`'s "Usage by model" lists it.

## Scope

In: the current session only, one row per model, a total and an "Other" row.

Out: spend across sessions (daily, monthly), per-model token counts, live
pricing lookups.

## Why a price table

The engine exposes only the session total (`$.session.usage().cost.usd`), not
the per-model figures `/cost` prints. `$.command.run({ command: 'cost' })` would
give them, but every run prints its output in the transcript, so it cannot back
an automatic refresh.

What the engine does give per model is tokens: each `turn.step` result carries
`usage: TurnUsage | null`, the four token counts and the `model` that answered,
on the main loop and in subagent runs alike. The mod prices them itself.

Checked against a real `/cost`: Opus 5.5 at 28 input, 5.4k output, 481.4k cache
read, 33.5k cache write, priced at $4 / $20 / $0.20 / $8 per MTok (1h cache
write, 2× input), comes to $0.4724; `/cost` printed $0.4718 (its token counts
are rounded). At the 5-minute write rate (1.25×) it would be $0.372, so the
main thread writes 1h entries.

## Card

```
╭──────────────────────────╮
│ Cost ▾           $0.4719 │
│ opus-5-5         $0.4718 │
│ haiku-5-5        $0.0001 │
│ Other            $0.0000 │
╰──────────────────────────╯
```

- Placed after the Usage card. Title row: the engine's total, right-aligned,
  the same figure `/cost` prints; `—` before the engine has one.
- Opened (the default, `isCostOpen: true`): one row per priced model, most
  expensive first, the label the model id without its `claude-` prefix.
- "Other" row: engine total minus the sum of the model rows, shown only when it
  is at least $0.005. It holds what the mod could not price: models missing
  from the table, requests made before the mod loaded, and requests that do not
  pass through `turn.step` (title generation and similar side calls).
- No rows yet and no Other: `No spend yet` (distinct from the Usage card's `No data yet`).
- Amounts: `$` and 4 decimals below $1, 2 decimals from $1 up.

## Pricing (`hooks/pricing.ts`)

A table keyed by model id prefix, longest prefix first so `claude-opus-5-5`
does not match `claude-opus-5`. Rates in USD per million tokens:

| Prefix              | Input | Output | Cache read |
| ------------------- | ----- | ------ | ---------- |
| `claude-fable-5-1`  | 10    | 50     | 0.25       |
| `claude-fable-5`    | 10    | 50     | 1.00       |
| `claude-opus-5-5`   | 4     | 20     | 0.20       |
| `claude-opus-5`     | 5     | 25     | 0.50       |
| `claude-opus-4-8`   | 5     | 25     | 0.50       |
| `claude-opus-4-7`   | 5     | 25     | 0.50       |
| `claude-opus-4-6`   | 5     | 25     | 0.50       |
| `claude-sonnet-5-5` | 2     | 10     | 0.20       |
| `claude-sonnet-5`   | 2     | 10     | 0.20       |
| `claude-sonnet-4-6` | 3     | 15     | 0.30       |
| `claude-haiku-5-5`  | 0.10  | 0.50   | 0.01       |
| `claude-haiku-4-5`  | 1     | 5      | 0.10       |

- Cache read: the published rate for Fable 5.1, Fable 5, Opus 5.5 and
  Sonnet 5.5; 0.1× input for the rest, the general rule.
- Cache write: 2× input for every model. `TurnUsage` does not split writes by
  TTL; the main thread writes 1h entries, so 5-minute writes (if a subagent
  makes them) are overestimated by 0.75× input per token.
- Claude Haiku 5.5 above 100K prompt tokens (input + cache read + cache write
  of the one response): $0.50 / $2.50, cache read $0.05.
- `price(usage: TurnUsage): number | null`, `null` for a model the table lacks.

## State

Added to `PluginState['session-rail']`:

- `cost`: `{ total: number | null; since: number | null; models: { model: string; usd: number }[] }`
  — `total` the engine's `cost.usd`; `since` the `usage.startedAt` the
  model sums count from.
- `isCostOpen` (default true).

## Data flow

- A `turn.step` hook (an async generator) passes the stream through with
  `const r = yield* next(e)`, prices `r.usage` when it is not null, and adds
  it to that model's row. It then reads `$.session.usage()` (no breakdown,
  costs nothing) for `total` and `startedAt`.
- If `startedAt` differs from `since` (`/clear` started the session's count
  over), the model rows are emptied before adding.
- The existing `refresh` also writes `total` from the `cost` its
  `$.session.usage` call already returns.
- `$.state` keeps the rows across hot reloads; a new session starts empty.

## Testing

- `tests/pricing.test.ts`: the Opus 5.5 figures above price to about $0.472;
  Haiku 5.5 switches tiers above 100K prompt tokens; `claude-opus-5-5` does not
  take `claude-opus-5`'s rates; an unknown model prices to `null`.
- `tests/format.test.ts`: `usd()` decimals below and above $1.
- `tests/rail.test.tsx`: two `turn.step` results on different models fill two
  rows, most expensive first; an engine total above their sum adds Other; a
  changed `startedAt` empties the rows.
