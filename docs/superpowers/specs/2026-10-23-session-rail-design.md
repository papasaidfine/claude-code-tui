# Session Rail — Design

Replicates the right-hand "session rail" of Claude Desktop's Claude Code inside the
Claude Code CLI (2.1.308+), as a mod (function-hooks plugin).

## Scope

In: three cards, **Environment**, **Context** and **Usage**.

Out: Remote Control toggle (not a CLI feature), Connectors (the CLI uses MCP
servers, with no status API), Outputs, model name, cost.

## Shape

A pane (`$.ui.open({ id: 'session-rail', title: 'Session' })`) drawn by a
`ui.render` hook on `{ component: 'Pane', requestId: 'session-rail' }`.

- Never opened unasked: `/rail` (registered in `session.start`, answered by
  `command.run`) opens the pane, at any width. The data is refreshed at
  `session.start` regardless, so the pane is filled when it opens.
- The pane's background is the engine's: the docked sidebar is painted with the
  theme key `composerSidebarBackground`, which a mod cannot change. A custom theme
  (`~/.claude/themes/<name>.json`) can override it with a solid color.

## Cards

```
╭ Environment ▾ ───────────────╮
│ 󰌢 <hostname>                 │
│  <dir name> · <parent>      │
│  <branch> [*]               │
╰──────────────────────────────╯
╭ Context ▸          24% ━──── ╮
╰──────────────────────────────╯
╭ Usage ▾ ─────────────────────╮
│ 5h  23%  ━────  resets 2h14m │
│ 7d  61%  ━━━──  resets 3d5h  │
╰──────────────────────────────╯
```

Each card header is a plain `Button` that toggles the card open/closed. Icons are
Nerd Font glyphs (`md-laptop`, `fa-folder_o`, `dev-git_branch`), so the terminal
font must be a Nerd Font.

Bars are 5 cells: filled `━` in color, empty `─` dimmed.

### Environment (open by default)

| Row | Source | Fallback |
|---|---|---|
| Host | `$.process.run(['hostname'])` stdout, trimmed | `This computer` |
| Folder | `$.session.cwd()`: basename, then parent with `$HOME` shown as `~` | — |
| Branch | `$.process.run(['git', 'branch', '--show-current'])` in the cwd; `*` when `git status --porcelain` prints anything | row omitted outside a git repo (non-zero exit) |

### Context (closed by default)

- Header: `context.percent` from `$.session.usage()` as `NN%` plus a bar. Before
  the first API response the percent is absent: show `—` and an empty bar.
- Opened: one row per `context.breakdown.categories` entry with its token count
  (`3.1k`), deferred categories left out, from
  `$.session.usage({ breakdown: 'summary' })`, which estimates locally and sends
  no API request.

### Usage (open by default)

- One row per `rateLimits` entry of the same `$.session.usage()` call: the window
  (`five_hour` → `5h`, `seven_day` → `7d`, `spend_limit` → `spend`), the percent
  used, a bar, and the time until `resetsAt` relative to `$.clock.now()` (`45m`,
  `2h14m`, `3d5h`).
- Percent and bar turn the theme's `warning` color from 80% and `error` from 95%.
- No rate-limit reading yet (or an account without one): `No data yet`.
- The relative time is computed at refresh, so it is as fresh as the last refresh.

## State

Declared in `types/index.d.ts` under `PluginState['session-rail']`:

- `env`: `{ host; dir; parent; branch?; isDirty? }`
- `context`: `{ percent: number | null; rows: { label; tokens }[] }`
- `limits`: `{ label; percent; resetsIn? }[]`
- `isEnvOpen` (default true), `isContextOpen` (default false), `isUsageOpen`
  (default true)

The render hook only reads state; refreshes write it, which redraws the pane.
Open/closed state survives hot reloads via `$.state`.

## Refresh triggers

A single `refresh($)` recomputes `env`, `context` and `limits` (the breakdown only
when the Context card is open), on:

- `session.start`
- `turn.complete`
- after each `Bash` tool call (the branch or dirty state may have changed)
- opening the Context card (to fetch the breakdown)

No polling timer.

## Error handling

Each data source fails independently to its fallback above; a failed refresh
keeps the last good values. Nothing throws out of a hook.

## Testing

- `claude plugin validate` and `tsc -p` on the mod folder.
- `claude plugin test`: formatting helpers (path split, bar, token and reset
  formatting, warning levels) and the pane through the plugin's own `$`, with the
  test's `on(...)` hooks answering each engine call: all three cards, toggling,
  outside a git repo, no hostname, no usage yet, deferred categories left out,
  the pane staying closed until `/rail`.

## Location

`session-rail/` in this repository, listed in `.claude-plugin/marketplace.json`.
During development: `claude --plugin-dir session-rail`.
