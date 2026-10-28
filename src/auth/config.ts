export type SupabaseConfiguration = {
  url: string
  publishableKey: string
}

export const readSupabaseConfiguration = (
  rawUrl: unknown,
  rawKey: unknown,
): { config: SupabaseConfiguration | null; error: string | null } => {
  const url = typeof rawUrl === 'string' ? rawUrl.trim() : ''
  const publishableKey = typeof rawKey === 'string' ? rawKey.trim() : ''
  if (!url && !publishableKey) {
    return { config: null, error: null }
  }
  if (!url || !publishableKey) {
    return { config: null, error: '登录配置不完整，请同时设置 Supabase 项目 URL 和公开发布密钥。' }
  }
  try {
    const parsed = new URL(url)
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
    if (
      (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) ||
      parsed.username || parsed.password || parsed.search || parsed.hash ||
      parsed.pathname !== '/'
    ) {
      throw new Error('Invalid project URL')
    }
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
      return { config: null, error: '登录配置需要 sb_publishable_ 开头的公开发布密钥，不能使用 secret 或 service_role 密钥。' }
    }
    return { config: { url: parsed.origin, publishableKey }, error: null }
  } catch {
    return { config: null, error: 'Supabase 项目 URL 无效，请使用项目的 HTTPS 地址。' }
  }
}
