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

// One frame of Clawd, in his pixels from where he rests: `dx` right, `dy` up, each
// arm (left, right) raised a pixel per step (lowered below 0), and `stride` his legs
// set wide, as midway through a step; `zs` the z's beside him as he dozes.
export type Pose = {
  dx: number
  dy: number
  eyes: 'open' | 'shut' | 'left' | 'right'
  arms: [number, number]
  stride: boolean
  zs: number
}

// What Clawd wears, as the `theme` option names it; `seasonal` picks by the date.
export type ThemeName = 'classic' | 'seasonal' | 'christmas' | 'halloween' | 'lunar-new-year'

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
      pose: Pose
      theme: Exclude<ThemeName, 'seasonal'>
    }
  }
}
