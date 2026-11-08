import assert from 'node:assert/strict'
import test from 'node:test'
import { AUTH_LINK_ERROR, getAuthErrorMessage } from '../src/auth/errors.ts'
import { buildAuthRedirectUrl, cleanAuthUrl, readAuthRedirect } from '../src/auth/redirect.ts'

test('auth callback errors are translated without displaying provider text or URL credentials', () => {
  const callback = 'https://fitness.example/?auth=recovery#error=access_denied&error_code=otp_expired&error_description=access_token%3Dprivate-synthetic&refresh_token=private-refresh'
  const result = readAuthRedirect(callback)
  assert.equal(result.recovering, true)
  assert.equal(result.hasCallback, true)
  assert.match(result.error ?? '', /失效/)
  assert.equal(result.error?.includes('private'), false)
  assert.equal(cleanAuthUrl(callback), 'https://fitness.example/')
  assert.equal(readAuthRedirect('https://fitness.example/?error_description=private-token').error, AUTH_LINK_ERROR)
  assert.equal(getAuthErrorMessage({ code: '__proto__', message: 'private-token' }, 'safe'), 'safe')
  assert.equal(getAuthErrorMessage({ message: 'private-token' }, 'safe'), 'safe')
})

test('auth distinguishes server failures from unknown client errors without exposing provider details', () => {
  const providerDetails = {
    message: 'SMTP secret-token at https://private.example/',
    error_description: 'access_token=private-access',
  }
  const serviceError = '账户服务暂时异常，请稍后重试。'
  assert.equal(getAuthErrorMessage({ ...providerDetails, code: 'unexpected_failure' }), serviceError)
  for (const status of [500, 502, 503, 599]) {
    assert.equal(getAuthErrorMessage({ ...providerDetails, code: 'unknown_code', status }, 'safe fallback'), serviceError)
  }
  assert.match(getAuthErrorMessage({ ...providerDetails, code: 'email_address_not_authorized', status: 500 }), /无法向此邮箱发送邮件/)
  assert.match(getAuthErrorMessage({ ...providerDetails, code: 'over_email_send_rate_limit', status: 503 }), /发送过于频繁/)
  assert.match(getAuthErrorMessage({ ...providerDetails, status: 429 }), /过于频繁/)
  for (const status of [400, 401, 403, 499, 600, '500', 500.5, Number.NaN]) {
    assert.equal(getAuthErrorMessage({ ...providerDetails, code: 'unknown_code', status }, 'safe fallback'), 'safe fallback')
  }
})

test('PKCE cleanup removes all callback credentials while preserving normal URL state', () => {
  const callback = 'https://fitness.example/app?date=2026-10-28&code=private-code&sb_flow_id=private-flow&auth=recovery#section'
  assert.deepEqual(readAuthRedirect(callback), { recovering: true, hasCallback: true, hasCode: true, error: null })
  assert.equal(cleanAuthUrl(callback, true), 'https://fitness.example/app?date=2026-10-28&auth=recovery#section')
  assert.equal(cleanAuthUrl(callback), 'https://fitness.example/app?date=2026-10-28#section')
  assert.equal(cleanAuthUrl('https://fitness.example/?tab=history#overview'), 'https://fitness.example/?tab=history#overview')
  assert.equal(cleanAuthUrl('https://fitness.example/#auth=recovery'), 'https://fitness.example/')
})

test('legacy token fragments are detected as recovery then removed without deleting unrelated parameters', () => {
  const callback = 'https://fitness.example/?view=day#access_token=private-access&refresh_token=private-refresh&type=recovery&expires_in=3600&token_type=bearer'
  assert.equal(readAuthRedirect(callback).recovering, true)
  assert.equal(cleanAuthUrl(callback, true), 'https://fitness.example/?view=day&auth=recovery')
})

test('email return URLs use the current app path and never forward query or fragment credentials', () => {
  const href = 'https://fitness.example/app?next=https://other.example&code=private#access_token=private'
  assert.equal(buildAuthRedirectUrl(href), 'https://fitness.example/app')
  assert.equal(buildAuthRedirectUrl(href, true), 'https://fitness.example/app?auth=recovery')
})
