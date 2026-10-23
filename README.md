# claude-code-tui

Mods that bring pieces of Claude Desktop's Claude Code UI to the Claude Code CLI.

| Mod | What it adds |
|---|---|
| [session-rail](#session-rail) | A **Session** pane beside the chat: environment, context usage and rate limits |

## Requirements

- Claude Code CLI 2.1.308 or newer (mods use the function-hooks plugin API, which is in early access)
- A [Nerd Font](https://www.nerdfonts.com/) in your terminal, for the icons
- For the pane to dock beside the chat: the fullscreen layout and a terminal at least 110 columns wide. Narrower, or on the main screen, `/rail` opens it above the prompt.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install session-rail --marketplace papasaidfine/claude-code-tui
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session). The mod is active right away, no restart needed.

From a shell:

```
claude plugin install session-rail --marketplace papasaidfine/claude-code-tui
```

## session-rail

<img src="docs/images/session-rail.png" alt="The Session pane: Environment, Context (unfolded) and Usage cards" width="343">

The pane opens by itself when a session starts, if the terminal is wide enough. Type `/rail` to open it at any time.

Click a card's title (or Tab to it and press Enter while the pane has focus) to fold or unfold it.

### Environment

- The machine's hostname
- The working folder, with its parent (`~` for your home folder)
- The git branch, with `*` when there are uncommitted changes. Hidden outside a git repository.

### Context

How full the context window is. Unfold it to see the breakdown by category (system prompt, tools, messages, free space, ...), the same categories `/context` shows. The breakdown is estimated locally and costs no API request.

Shows `—` until the session has made its first request.

### Usage

Your 5-hour and 7-day rate-limit windows: percent used and time until reset. The percent turns yellow from 80% and red from 95%. A gateway spend limit, if you have one, shows as `spend`.

Rate limits are reported for Claude subscription accounts. With an API key there may be none, and the card shows `No data yet`.

### When it updates

At session start, after every turn, and after every Bash command (so a branch switch or a new change shows up). The reset countdown is as fresh as the last update.

### The pane background

The docked pane's background is drawn by Claude Code, not the mod, using the theme color `composerSidebarBackground`. To change it, create a custom theme at `~/.claude/themes/<name>.json`:

```json
{
  "name": "Dark (custom sidebar)",
  "base": "dark",
  "overrides": { "composerSidebarBackground": "#2e3440" }
}
```

and pick it with `/theme`. Colors must be `#rrggbb`, `rgb(r, g, b)`, `ansi256(n)` or `ansi:<name>`; there is no transparent value.

## License

[MIT](LICENSE)
