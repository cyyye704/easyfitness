import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createClient } from '@supabase/supabase-js'
import {
  clearPendingEmailVerification, getEmailVerificationError, isEmailVerificationRequested,
  readPendingEmailVerification, resendEmailVerification, savePendingEmailVerification,
  verifyEmailCode, type EmailVerificationAuth, type PendingEmailVerification,
} from '../src/auth/emailVerification.ts'
import { EmailVerificationPanel } from '../src/components/EmailVerificationPanel.tsx'
import { AuthPanel } from '../src/components/AuthPanel.tsx'

const mockWindow = (context: TestContext, href = 'https://fitness.example/?view=day#/account') => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const values = new Map<string, string>()
  const location = { href }
  const browser = {
    location,
    sessionStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
    },
    history: { state: { preserved: true }, replaceState: (state: unknown, _title: string, next: string) => {
      assert.deepEqual(state, { preserved: true })
      location.href = next
    } },
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browser })
  context.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else Reflect.deleteProperty(globalThis, 'window')
  })
  return { browser, values, location }
}

test('pending verification stores only email and send time and preserves app navigation', (context) => {
  const { values, location } = mockWindow(context)
  const sentAt = Date.now() - 1_000
  const input = { email: ' test@example.com ', sentAt, password: 'private-password', token: '01234567', access_token: 'private-session' }
  savePendingEmailVerification(input as PendingEmailVerification)
  assert.equal(values.size, 1)
  assert.match([...values.keys()][0], /:v1$/)
  assert.deepEqual(JSON.parse([...values.values()][0]), { email: 'test@example.com', sentAt })
  assert.deepEqual(readPendingEmailVerification(), { email: 'test@example.com', sentAt })
  assert.equal(isEmailVerificationRequested(), true)
  assert.equal(location.href, 'https://fitness.example/?view=day&auth=verify#/account')
  assert.doesNotMatch([...values.values()][0], /private|01234567|password|token/)
  clearPendingEmailVerification()
  assert.equal(values.size, 0)
  assert.equal(location.href, 'https://fitness.example/?view=day#/account')
})

test('changing the email clears the old pending address while retaining the verification entry point', (context) => {
  const { location } = mockWindow(context)
  savePendingEmailVerification({ email: 'old@example.com', sentAt: Date.now() })
  savePendingEmailVerification({ email: '', sentAt: null })
  assert.equal(readPendingEmailVerification(), null)
  assert.equal(isEmailVerificationRequested(), true)
  assert.equal(new URL(location.href).searchParams.get('view'), 'day')
})

test('clearing verification leaves password recovery parameters intact', (context) => {
  const { location } = mockWindow(context, 'https://fitness.example/?auth=recovery&view=day#/account')
  clearPendingEmailVerification()
  assert.equal(location.href, 'https://fitness.example/?auth=recovery&view=day#/account')
  assert.equal(isEmailVerificationRequested(), false)
})

test('invalid or unavailable pending storage never blocks verification', (context) => {
  const { browser, values } = mockWindow(context)
  savePendingEmailVerification({ email: 'test@example.com', sentAt: null })
  const key = [...values.keys()][0]
  for (const raw of ['not-json', 'null', '[]', '{"email":"invalid"}', '{"email":42}']) {
    values.set(key, raw)
    assert.equal(readPendingEmailVerification(), null)
  }
  values.set(key, JSON.stringify({ email: 'test@example.com', sentAt: Date.now() + 100_000 }))
  assert.deepEqual(readPendingEmailVerification(), { email: 'test@example.com', sentAt: null })
  browser.sessionStorage.getItem = () => { throw new Error('storage disabled') }
  browser.sessionStorage.setItem = () => { throw new Error('storage disabled') }
  browser.sessionStorage.removeItem = () => { throw new Error('storage disabled') }
  assert.equal(readPendingEmailVerification(), null)
  assert.doesNotThrow(() => savePendingEmailVerification({ email: 'test@example.com', sentAt: null }))
  assert.equal(isEmailVerificationRequested(), true)
  assert.doesNotThrow(clearPendingEmailVerification)
})

test('verification helpers are safe without a browser', () => {
  assert.equal(typeof window, 'undefined')
  assert.equal(readPendingEmailVerification(), null)
  assert.equal(isEmailVerificationRequested(), false)
  assert.doesNotThrow(() => savePendingEmailVerification({ email: 'test@example.com', sentAt: null }))
  assert.doesNotThrow(clearPendingEmailVerification)
})

const stubAuth = (): EmailVerificationAuth => ({
  verifyOtp: async () => ({ data: { session: {} }, error: null }),
  resend: async () => ({ error: null }),
})

test('verification preserves leading zeroes and sends email OTP parameters only', async () => {
  const auth = stubAuth()
  let calls = 0
  auth.verifyOtp = async (input) => {
    calls += 1
    assert.deepEqual(input, { email: 'test@example.com', token: '00123456', type: 'email' })
    return { data: { session: {} }, error: null }
  }
  await verifyEmailCode(auth, ' test@example.com ', '0012 3456')
  assert.equal(calls, 1)
})

test('invalid email and malformed OTPs are rejected before sending a verification request', async () => {
  const auth = stubAuth()
  auth.verifyOtp = async () => assert.fail('must not request with invalid inputs')
  await assert.rejects(verifyEmailCode(auth, 'invalid', '12345678'), { code: 'verification_email_invalid' })
  for (const code of ['', '12345', '12345678901', '1234567x', '１２３４５６７８']) {
    await assert.rejects(verifyEmailCode(auth, 'test@example.com', code), { code: 'verification_code_invalid' })
  }
})

test('verification errors remain retryable and a missing session is not treated as success', async () => {
  const auth = stubAuth()
  let attempts = 0
  auth.verifyOtp = async () => ++attempts === 1
    ? { data: { session: null }, error: { code: 'otp_expired', message: 'private token' } }
    : { data: { session: {} }, error: null }
  await assert.rejects(verifyEmailCode(auth, 'test@example.com', '12345678'), { code: 'otp_expired' })
  await verifyEmailCode(auth, 'test@example.com', '87654321')
  assert.equal(attempts, 2)
  auth.verifyOtp = async () => ({ data: { session: null }, error: null })
  await assert.rejects(verifyEmailCode(auth, 'test@example.com', '12345678'), { code: 'verification_session_missing' })
})

test('resend uses signup confirmation and failures do not create successful pending state', async (context) => {
  const { values } = mockWindow(context)
  const auth = stubAuth()
  auth.resend = async (input) => {
    assert.deepEqual(input, { email: 'test@example.com', type: 'signup' })
    return { error: { code: 'over_email_send_rate_limit', message: 'private provider details' } }
  }
  await assert.rejects(resendEmailVerification(auth, ' test@example.com '), { code: 'over_email_send_rate_limit' })
  assert.equal(values.size, 0)
  auth.resend = async () => ({ error: null })
  await resendEmailVerification(auth, 'test@example.com')
})

test('verification and resend errors are translated without exposing provider text', () => {
  assert.match(getEmailVerificationError({ code: 'otp_expired', message: 'private-token' }, 'verify'), /验证码.*过期/)
  assert.match(getEmailVerificationError({ code: 'over_email_send_rate_limit' }, 'resend'), /发送过于频繁/)
  assert.match(getEmailVerificationError({ status: 429 }, 'verify'), /过于频繁/)
  for (const error of [{ code: '__proto__', message: 'private-token' }, new Error('private-token'), null]) {
    assert.equal(getEmailVerificationError(error, 'verify'), '暂时无法验证邮箱，请检查网络后重试。')
    assert.equal(getEmailVerificationError(error, 'resend'), '验证码未能发送，请检查网络后重试。')
  }
})

test('verification and resend distinguish service failures while preserving specific errors', () => {
  const providerDetails = {
    message: 'SMTP secret-token at https://private.example/',
    error_description: 'access_token=private-access',
  }
  for (const action of ['verify', 'resend'] as const) {
    const serviceError = action === 'verify'
      ? '邮箱验证服务暂时异常，请稍后重试。'
      : '邮件服务暂时异常，请稍后重新发送验证码。'
    const fallback = getEmailVerificationError(null, action)
    assert.equal(getEmailVerificationError({ ...providerDetails, code: 'unexpected_failure' }, action), serviceError)
    for (const status of [500, 502, 503, 599]) {
      assert.equal(getEmailVerificationError({ ...providerDetails, code: 'unknown_code', status }, action), serviceError)
    }
    assert.match(getEmailVerificationError({ ...providerDetails, code: 'otp_expired', status: 500 }, action), /验证码.*过期/)
    assert.match(getEmailVerificationError({ ...providerDetails, code: 'over_email_send_rate_limit', status: 503 }, action), /发送过于频繁/)
    assert.match(getEmailVerificationError({ ...providerDetails, status: 429 }, action), /过于频繁/)
    for (const status of [400, 401, 403, 499, 600, '500', 500.5, Number.NaN]) {
      assert.equal(getEmailVerificationError({ ...providerDetails, code: 'unknown_code', status }, action), fallback)
    }
  }
})

test('the PKCE-configured SDK verifies an email code without a saved browser verifier', async () => {
  let called = false
  const client = createClient('https://project.supabase.co', 'sb_publishable_test', {
    auth: { flowType: 'pkce', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      assert.equal(String(url), 'https://project.supabase.co/auth/v1/verify')
      const body = JSON.parse(String(init?.body))
      assert.equal(body.email, 'test@example.com')
      assert.equal(body.token, '00123456')
      assert.equal(body.type, 'email')
      assert.equal('code_verifier' in body, false)
      assert.equal('code_challenge' in body, false)
      called = true
      return Response.json({ access_token: 'synthetic-access', refresh_token: 'synthetic-refresh',
        token_type: 'bearer', expires_in: 3600, user: { id: 'synthetic-user', email: 'test@example.com' } })
    } },
  })
  const events: string[] = []
  const { data: { subscription } } = client.auth.onAuthStateChange((event) => { events.push(event) })
  await verifyEmailCode(client.auth, 'test@example.com', '00123456')
  assert.equal(called, true)
  assert.ok(events.includes('SIGNED_IN'))
  subscription.unsubscribe()
})

test('verification page presents a code field and cross-browser guidance without a password form', () => {
  const markup = renderToStaticMarkup(createElement(EmailVerificationPanel, {
    initialEmail: 'test@example.com', sentAt: null, onBack: () => {},
  }))
  assert.match(markup, /验证邮箱/)
  assert.match(markup, /autoComplete="one-time-code"/)
  assert.match(markup, /inputMode="numeric"/)
  assert.match(markup, /无需点击邮件链接/)
  assert.match(markup, /其他浏览器/)
  assert.match(markup, /垃圾邮件/)
  assert.doesNotMatch(markup, /type="password"/)
})

test('an old pending signup never hides a recovery form or a callback failure', (context) => {
  mockWindow(context)
  savePendingEmailVerification({ email: 'pending@example.com', sentAt: Date.now() })
  const failedCallback = renderToStaticMarkup(createElement(AuthPanel, {
    recovering: false, hasCallbackError: true, onRecovered: () => {},
  }))
  assert.match(failedCallback, /登录 EasyFitness/)
  assert.doesNotMatch(failedCallback, /id="auth-verification-title"/)
  const recovery = renderToStaticMarkup(createElement(AuthPanel, {
    recovering: true, onRecovered: () => {},
  }))
  assert.match(recovery, /设置新密码/)
  assert.doesNotMatch(recovery, /id="auth-verification-title"/)
})
