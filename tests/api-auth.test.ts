import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import { requireAuthenticatedUser } from '../api/_lib/auth.ts'
import { HttpRequestError } from '../api/_lib/http.ts'
import dailyHandler from '../api/ai/parse-daily-log.ts'
import profileHandler from '../api/ai/parse-profile.ts'
import periodHandler from '../api/ai/summarize-period.ts'
import { calculatePeriodSummary } from '../src/periodSummary/calculatePeriodSummary.ts'

const authUrl = 'https://project.supabase.co/auth/v1/user'
const publishableKey = 'sb_publishable_test'
const token = 'forged-but-well-formed.jwt.signature'
const privateInput = 'private-user-description'
const privateEmail = 'private@example.com'
const user = { id: 'verified-user-id', is_anonymous: false, email: privateEmail }

const routes = [
  {
    name: 'parse-daily-log',
    handler: dailyHandler,
    input: { text: privateInput, targetDate: '2026-07-17' },
  },
  { name: 'parse-profile', handler: profileHandler, input: { text: privateInput } },
  {
    name: 'summarize-period',
    handler: periodHandler,
    input: { metrics: calculatePeriodSummary({}, '2026-07-11', '2026-07-17') },
  },
]

const request = (
  route = routes[0],
  authorization: string | null = `Bearer ${token}`,
  signal?: AbortSignal,
) => new Request(`https://easyfitness.example/api/ai/${route.name}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(authorization === null ? {} : { Authorization: authorization }),
  },
  body: JSON.stringify(route.input),
  signal,
})

const configure = (
  context: TestContext,
  overrides: Record<string, string | undefined> = {},
) => {
  for (const [name, value] of Object.entries({
    AI_FEATURE_ENABLED: 'true',
    DEEPSEEK_API_KEY: 'test-only-deepseek-key',
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
    ...overrides,
  })) {
    const previous = process.env[name]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
    context.after(() => {
      if (previous === undefined) delete process.env[name]
      else process.env[name] = previous
    })
  }
  const logs: unknown[] = []
  for (const method of ['info', 'warn', 'error'] as const) {
    context.mock.method(console, method, (...args: unknown[]) => logs.push(args))
  }
  return logs
}

const hasError = (status: number, code: string) => (error: unknown) =>
  error instanceof HttpRequestError && error.status === status && error.code === code

const assertPrivate = (payload: unknown) => {
  const text = JSON.stringify(payload)
  for (const value of [token, privateInput, privateEmail, 'test-only-deepseek-key']) {
    assert.ok(!text.includes(value), 'sensitive data must not reach errors or logs')
  }
}

for (const route of routes) {
  test(`${route.name} requires a token before calling either upstream`, async (context) => {
    const logs = configure(context)
    const upstream = context.mock.method(globalThis, 'fetch', async () => {
      assert.fail('unauthenticated request must not reach an upstream')
    })
    const response = await route.handler.fetch(request(route, null))
    assert.equal(response.status, 401)
    assert.equal(response.headers.get('Cache-Control'), 'no-store')
    assert.deepEqual(await response.json(), {
      code: 'AUTH_REQUIRED', error: '请先登录后再使用 AI 功能。',
    })
    assert.equal(upstream.mock.callCount(), 0)
    assertPrivate(logs)
  })

  test(`${route.name} verifies a forged token remotely and does not call DeepSeek`, async (context) => {
    const logs = configure(context)
    const upstream = context.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.equal(String(url), authUrl)
      assert.equal(options?.method, 'GET')
      assert.equal(options?.body, undefined)
      const headers = new Headers(options?.headers)
      assert.equal(headers.get('Authorization'), `Bearer ${token}`)
      assert.equal(headers.get('apikey'), publishableKey)
      assert.equal(options?.redirect, 'error')
      assert.equal(options?.cache, 'no-store')
      return Response.json({ error: `${token}: ${privateEmail}` }, { status: 401 })
    })
    const response = await route.handler.fetch(request(route))
    const body = await response.json()
    assert.equal(response.status, 401)
    assert.equal(body.code, 'AUTH_REQUIRED')
    assert.equal(upstream.mock.callCount(), 1)
    assertPrivate({ body, logs })
  })

  test(`${route.name} fails closed with absent or partial server auth configuration`, async (context) => {
    const logs = configure(context)
    const upstream = context.mock.method(globalThis, 'fetch', async () => {
      assert.fail('unconfigured authentication must not call an upstream')
    })
    for (const [url, key] of [[undefined, undefined], ['https://project.supabase.co', undefined], [undefined, publishableKey]]) {
      if (url === undefined) delete process.env.SUPABASE_URL
      else process.env.SUPABASE_URL = url
      if (key === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY
      else process.env.SUPABASE_PUBLISHABLE_KEY = key
      const response = await route.handler.fetch(request(route))
      assert.equal(response.status, 503)
      assert.equal((await response.json()).code, 'AUTH_NOT_CONFIGURED')
      assert.equal(response.headers.get('Cache-Control'), 'no-store')
    }
    assert.equal(upstream.mock.callCount(), 0)
    assertPrivate(logs)
  })
}

test('auth accepts only a remotely verified non-anonymous user without forwarding request content', async (context) => {
  const logs = configure(context)
  const upstream = context.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(String(url), authUrl)
    assert.equal(options?.body, undefined)
    return Response.json(user)
  })
  const incoming = new Request('https://untrusted-host.example/api/ai/parse-daily-log', {
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: 'https://untrusted-origin.example',
      'X-Forwarded-Host': 'untrusted-forwarded-host.example',
      'X-Supabase-Url': 'https://untrusted-supabase.example',
    },
  })
  await requireAuthenticatedUser(incoming)
  assert.equal(upstream.mock.callCount(), 1)
  assert.deepEqual(logs, [])
})

test('auth rejects anonymous users and malformed Bearer headers', async (context) => {
  configure(context)
  const upstream = context.mock.method(globalThis, 'fetch', async () =>
    Response.json({ ...user, is_anonymous: true }))
  await assert.rejects(requireAuthenticatedUser(request()), hasError(401, 'AUTH_REQUIRED'))
  for (const header of ['', 'Basic secret', 'Bearer', 'Bearer token extra', 'Bearer token,other']) {
    await assert.rejects(requireAuthenticatedUser(request(routes[0], header)), hasError(401, 'AUTH_REQUIRED'))
  }
  assert.equal(upstream.mock.callCount(), 1)
})

test('auth does not treat service failures or malformed user responses as expired sessions', async (context) => {
  const logs = configure(context)
  const responses = [
    () => Response.json({}, { status: 500 }),
    () => Response.json({}, { status: 429 }),
    () => new Response('invalid-json'),
    () => Response.json({}),
    () => Response.json({ id: '', is_anonymous: false }),
    () => Response.json({ id: 'id', is_anonymous: 'false' }),
  ]
  for (const response of responses) {
    context.mock.method(globalThis, 'fetch', async () => response())
    await assert.rejects(requireAuthenticatedUser(request()), hasError(503, 'AUTH_UNAVAILABLE'))
  }
  context.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError(`${token}: ${privateEmail}`)
  })
  const response = await dailyHandler.fetch(request())
  const body = await response.json()
  assert.equal(response.status, 503)
  assert.equal(body.code, 'AUTH_UNAVAILABLE')
  assertPrivate({ body, logs })
})

test('auth rejects unsafe or secret configuration before making requests', async (context) => {
  configure(context)
  const upstream = context.mock.method(globalThis, 'fetch', async () => {
    assert.fail('invalid configuration must not send a token')
  })
  for (const baseUrl of ['not-a-url', 'http://external.example', 'https://name:password@example.com', 'https://example.com?url=other', 'https://example.com#other']) {
    process.env.SUPABASE_URL = baseUrl
    await assert.rejects(requireAuthenticatedUser(request()), hasError(503, 'AUTH_NOT_CONFIGURED'))
  }
  process.env.SUPABASE_URL = 'https://project.supabase.co'
  for (const key of ['sb_secret_do-not-use', 'legacy-service-role.jwt.key', ' ']) {
    process.env.SUPABASE_PUBLISHABLE_KEY = key
    await assert.rejects(requireAuthenticatedUser(request()), hasError(503, 'AUTH_NOT_CONFIGURED'))
  }
  assert.equal(upstream.mock.callCount(), 0)
})

for (const phase of ['fetch', 'body'] as const) {
  test(`auth times out during ${phase} without reporting an invalid session`, async (context) => {
    configure(context)
    context.mock.timers.enable({ apis: ['setTimeout'] })
    let signal: AbortSignal | undefined
    const waitForAbort = () => new Promise<never>((_resolve, reject) => {
      assert.ok(signal)
      if (signal.aborted) reject(signal.reason)
      else signal.addEventListener('abort', () => reject(signal?.reason), { once: true })
    })
    context.mock.method(globalThis, 'fetch', async (_url, options) => {
      signal = options?.signal ?? undefined
      if (phase === 'fetch') return waitForAbort()
      const response = new Response()
      context.mock.method(response, 'json', waitForAbort)
      return response
    })
    const validation = requireAuthenticatedUser(request())
    const rejected = assert.rejects(validation, hasError(503, 'AUTH_UNAVAILABLE'))
    context.mock.timers.tick(5_000)
    await rejected
    assert.equal(signal?.aborted, true)
  })

  test(`auth forwards cancellation during ${phase} and stops before AI execution`, async (context) => {
    configure(context)
    const controller = new AbortController()
    context.mock.method(globalThis, 'fetch', async (_url, options) => {
      const cancel = async () => {
        controller.abort()
        assert.equal(options?.signal?.aborted, true)
        throw new DOMException('Aborted', 'AbortError')
      }
      if (phase === 'fetch') return cancel()
      const response = new Response()
      context.mock.method(response, 'json', cancel)
      return response
    })
    await assert.rejects(
      requireAuthenticatedUser(request(routes[0], `Bearer ${token}`, controller.signal)),
      hasError(499, 'AUTH_UNAVAILABLE'),
    )
  })
}

test('auth does not call Supabase for a request that was already cancelled', async (context) => {
  configure(context)
  const upstream = context.mock.method(globalThis, 'fetch', async () => {
    assert.fail('cancelled request must not call auth')
  })
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    requireAuthenticatedUser(request(routes[0], `Bearer ${token}`, controller.signal)),
    hasError(499, 'AUTH_UNAVAILABLE'),
  )
  assert.equal(upstream.mock.callCount(), 0)
})
