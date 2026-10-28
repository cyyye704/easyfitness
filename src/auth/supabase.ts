import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readSupabaseConfiguration } from './config'
import { readAuthRedirect } from './redirect'

// Capture the callback before the SDK exchanges its code and cleans the URL.
export const initialAuthRedirect = readAuthRedirect(typeof window === 'undefined' ? 'http://localhost/' : window.location.href)
const environment = (import.meta as ImportMeta & {
  readonly env?: Record<string, string | boolean | undefined>
}).env ?? {}
const configuration = readSupabaseConfiguration(
  environment.VITE_SUPABASE_URL,
  environment.VITE_SUPABASE_PUBLISHABLE_KEY,
)

let client: SupabaseClient | null = null
let configurationError = configuration.error
if (configuration.config) {
  try {
    client = createClient(configuration.config.url, configuration.config.publishableKey, {
      auth: {
        flowType: 'pkce',
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  } catch {
    configurationError = '登录服务初始化失败，请检查 Supabase 配置后重新加载。'
  }
}

export const supabase = client
export const supabaseConfigError = configurationError
