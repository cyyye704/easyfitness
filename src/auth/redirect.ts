import { AUTH_LINK_ERROR, getAuthErrorMessage } from './errors.ts'

const callbackKeys = [
  'code', 'access_token', 'refresh_token', 'provider_token', 'provider_refresh_token',
  'token_hash', 'token_type', 'expires_in', 'expires_at', 'error', 'error_code',
  'error_description', 'flow_id', 'sb_flow_id',
]

export const readAuthRedirect = (href: string) => {
  const url = new URL(href)
  const hash = new URLSearchParams(url.hash.slice(1))
  const value = (key: string) => url.searchParams.get(key) ?? hash.get(key)
  const hasCallback = callbackKeys.some((key) => url.searchParams.has(key) || hash.has(key))
  const hasError = ['error', 'error_code', 'error_description'].some(
    (key) => url.searchParams.has(key) || hash.has(key),
  )
  return {
    recovering: value('auth') === 'recovery' || value('type') === 'recovery',
    hasCallback,
    hasCode: Boolean(value('code')),
    error: hasError ? getAuthErrorMessage({ code: value('error_code') }, AUTH_LINK_ERROR) : null,
  }
}

export const cleanAuthUrl = (href: string, keepRecovery = false) => {
  const url = new URL(href)
  const hash = new URLSearchParams(url.hash.slice(1))
  const authHash = callbackKeys.some((key) => hash.has(key)) ||
    hash.get('type') === 'recovery' || hash.get('auth') === 'recovery'
  for (const key of callbackKeys) {
    url.searchParams.delete(key)
    hash.delete(key)
  }
  if (readAuthRedirect(href).hasCallback || url.searchParams.get('type') === 'recovery') {
    url.searchParams.delete('type')
  }
  if (authHash) {
    hash.delete('type')
    hash.delete('auth')
    url.hash = hash.toString()
  }
  if (keepRecovery) url.searchParams.set('auth', 'recovery')
  else if (url.searchParams.get('auth') === 'recovery') url.searchParams.delete('auth')
  return url.toString()
}

export const buildAuthRedirectUrl = (href: string, recovering = false) => {
  const url = new URL(href)
  url.search = ''
  url.hash = ''
  if (recovering) url.searchParams.set('auth', 'recovery')
  return url.toString()
}
