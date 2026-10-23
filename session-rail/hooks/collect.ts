import type { EngineInterface } from 'claude-code'

import type { ContextInfo, Env, Limit } from '../types'
import { splitPath, until, windowLabel } from './format'

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

// Deferred categories are not in the window; the compaction buffer is, as /context lists it.
export async function readUsage(
  $: EngineInterface,
  withBreakdown: boolean,
): Promise<{ context: ContextInfo; limits: Limit[] }> {
  const [{ context, rateLimits }, now] = await Promise.all([
    $.session.usage(withBreakdown ? { breakdown: 'summary' } : undefined),
    $.clock.now(),
  ])
  const rows = (context.breakdown?.categories ?? [])
    .filter(c => c.kind !== 'deferred')
    .map(c => ({ label: c.name, tokens: c.tokens }))
  const limits = rateLimits.map(limit => ({
    label: windowLabel(limit.kind),
    percent: limit.percentUsed,
    resetsIn: limit.resetsAt ? until(limit.resetsAt, now) : undefined,
  }))
  return { context: { percent: context.percent ?? null, rows }, limits }
}
