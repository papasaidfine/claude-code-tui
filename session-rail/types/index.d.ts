export type Env = {
  host: string
  dir: string
  parent: string
  branch?: string
  isDirty?: boolean
}

export type ContextRow = { label: string; tokens: number }

export type ContextInfo = {
  percent: number | null
  rows: ContextRow[]
}

export type Limit = {
  label: string
  percent: number
  resetsIn?: string
}

export type ModelCost = { model: string; usd: number }

// `total` is the engine's (/cost's); `models` are summed since `since`, the
// session usage's `startedAt` when they began counting.
export type CostInfo = {
  total: number | null
  since: number | null
  models: ModelCost[]
}

declare module 'claude-code' {
  interface PluginState {
    'session-rail': {
      env: Env
      context: ContextInfo
      limits: Limit[]
      cost: CostInfo
      isEnvOpen: boolean
      isContextOpen: boolean
      isUsageOpen: boolean
      isCostOpen: boolean
    }
  }
}
