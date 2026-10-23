import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { ContextInfo, Env, Limit } from '../types'
import { readEnv, readUsage } from './collect'
import { bar, level, tokens } from './format'
import { COLOR, ICON_ALT, ICON_SVG, meterSvg } from './svg'

const PANE = 'session-rail'
const TITLE = 'Session'

// Nerd Font glyphs: md-laptop, fa-folder_o, dev-git_branch.
const ICON = { host: '\u{F0322}', folder: '\uF114', branch: '\uE725' }

const env = atom({ plugin: 'session-rail', key: 'env' } as const, { host: '', dir: '', parent: '' } as Env)
const context = atom({ plugin: 'session-rail', key: 'context' } as const, { percent: null, rows: [] } as ContextInfo)
const limits = atom({ plugin: 'session-rail', key: 'limits' } as const, [] as Limit[])
const isEnvOpen = atom({ plugin: 'session-rail', key: 'isEnvOpen' } as const, true)
const isContextOpen = atom({ plugin: 'session-rail', key: 'isContextOpen' } as const, false)
const isUsageOpen = atom({ plugin: 'session-rail', key: 'isUsageOpen' } as const, true)

// A source that fails keeps its last good value.
async function refresh($: EngineInterface): Promise<void> {
  const withBreakdown = await read($, isContextOpen)
  const [nextEnv, nextUsage] = await Promise.allSettled([readEnv($), readUsage($, withBreakdown)])
  if (nextEnv.status === 'fulfilled') await update($, env, () => nextEnv.value)
  if (nextUsage.status === 'fulfilled') {
    await update($, context, () => nextUsage.value.context)
    await update($, limits, () => nextUsage.value.limits)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'rail', description: 'Open the Session pane (environment, context and usage limits)' })
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

  // The branch or the working tree may have changed.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    void refresh($)

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const [envNow, contextNow, limitsNow, envOpen, contextOpen, usageOpen] = await Promise.all([
      read($, env),
      read($, context),
      read($, limits),
      read($, isEnvOpen),
      read($, isContextOpen),
      read($, isUsageOpen),
    ])
    const percent = contextNow.percent === null ? '—' : `${Math.round(contextNow.percent)}%`
    // Every surface but the terminal has Svg: drawn icons and meters there, since its
    // font may lack the Nerd Font glyphs and thins out box-drawing bars.
    const isTerminal = e.surface === 'terminal'
    const Svg = !isTerminal && 'Svg' in ui ? ui.Svg : undefined
    const labelWidth = Math.max(0, ...limitsNow.map(limit => limit.label.length))

    // The terminal's box-drawing borders already leave half a cell between cards and
    // draw dim well; a surface that draws borders itself needs both spelled out.
    const spacing = isTerminal ? {} : { gap: 1 }
    const border = isTerminal ? { borderDimColor: true } : { borderColor: 'inactive' }

    // A desktop draws every Button natively, padding and all, so only the arrow is one:
    // the title stays text, in line with the card's rows.
    const title = (name: string, key: string, isOpen: boolean, onPress: () => unknown) => (
      <Box flexDirection="row" gap={1}>
        <Text bold>{name}</Text>
        <Button key={key} plain onPress={onPress}>
          {isOpen ? '▾' : '▸'}
        </Button>
      </Box>
    )

    const iconRow = (name: keyof typeof ICON, line: RenderChildren) =>
      Svg ? (
        <Box flexDirection="row" gap={1} alignItems="center">
          <Svg source={ICON_SVG[name]} alt={ICON_ALT[name]} width={14} height={14} />
          <Text wrap="truncate-middle">{line}</Text>
        </Box>
      ) : (
        <Text wrap="truncate-middle">
          {ICON[name]} {line}
        </Text>
      )

    // A meter after `lead` (and before `trail`): one Text of glyphs on the terminal,
    // a row of Text and Svg elsewhere.
    const meter = (label: string, percent: number | null, lead: RenderChildren, trail?: RenderChildren) => {
      const warn = percent === null ? undefined : level(percent)
      if (Svg) {
        const color = warn ? COLOR[warn] : COLOR.fill
        const alt = percent === null ? `${label} no data` : `${label} ${Math.round(percent)}% used`
        return (
          <Box flexDirection="row" gap={1} alignItems="center">
            <Text>{lead}</Text>
            <Svg source={meterSvg(percent, color)} alt={alt} width={40} height={6} />
            {trail !== undefined && <Text dimColor>{trail}</Text>}
          </Box>
        )
      }
      const cells = bar(percent)
      return (
        <Text>
          {lead} <Text color={warn ?? 'blue'}>{cells.filled}</Text>
          <Text dimColor>{cells.empty}</Text>
          {trail !== undefined && <Text dimColor> {trail}</Text>}
        </Text>
      )
    }

    return (
      <Box key="cards" flexDirection="column" {...spacing}>
        <Box key="env-card" flexDirection="column" borderStyle="round" {...border} paddingX={1}>
          {title('Environment', 'env', envOpen, () => update($, isEnvOpen, open => !open))}
          {envOpen && (
            <Box flexDirection="column">
              {iconRow('host', envNow.host)}
              {iconRow('folder', [envNow.dir, envNow.parent && <Text dimColor> · {envNow.parent}</Text>])}
              {envNow.branch !== undefined &&
                iconRow('branch', [envNow.branch, envNow.isDirty === true && <Text color="yellow"> *</Text>])}
            </Box>
          )}
        </Box>
        <Box key="context-card" flexDirection="column" borderStyle="round" {...border} paddingX={1}>
          <Box flexDirection="row" justifyContent="space-between">
            {title('Context', 'context', contextOpen, async () => {
              await update($, isContextOpen, open => !open)
              await refresh($)
            })}
            {meter('Context', contextNow.percent, percent)}
          </Box>
          {contextOpen &&
            contextNow.rows.map(row => (
              <Box flexDirection="row" justifyContent="space-between">
                <Text dimColor>{row.label}</Text>
                <Text>{tokens(row.tokens)}</Text>
              </Box>
            ))}
        </Box>
        <Box key="usage-card" flexDirection="column" borderStyle="round" {...border} paddingX={1}>
          {title('Usage', 'usage', usageOpen, () => update($, isUsageOpen, open => !open))}
          {usageOpen && limitsNow.length === 0 && <Text dimColor>No data yet</Text>}
          {usageOpen &&
            limitsNow.map(limit =>
              meter(
                limit.label,
                limit.percent,
                [
                  `${limit.label.padEnd(labelWidth)} `,
                  <Text color={level(limit.percent)}>{`${Math.round(limit.percent)}%`.padStart(4)}</Text>,
                ],
                limit.resetsIn && `resets ${limit.resetsIn}`,
              ),
            )}
        </Box>
      </Box>
    )
  })
}
