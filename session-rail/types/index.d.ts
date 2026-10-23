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

declare module 'claude-code' {
  interface PluginState {
    'session-rail': {
      env: Env
      context: ContextInfo
      limits: Limit[]
      isEnvOpen: boolean
      isContextOpen: boolean
      isUsageOpen: boolean
    }
  }
}
