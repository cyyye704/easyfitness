import assert from 'node:assert/strict'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { test, type TestContext } from 'node:test'
import { createCorosHandler } from '../api/_lib/coros/handler.ts'
import { getCorosConfig, officialUrl } from '../api/_lib/coros/config.ts'
import { readCookie, sealCookie } from '../api/_lib/coros/cookies.ts'
import { CorosError } from '../api/_lib/coros/http.ts'
import { CorosMcpError } from '../api/_lib/coros/mcp.ts'
import { startAuthorization, type CorosConnection } from '../api/_lib/coros/oauth.ts'

const origin = 'https://easyfitness.example'
const issuer = 'https://mcpcn.coros.com'
const privateAccess = 'private-COROS-access'
const privateRefresh = 'private-COROS-refresh'
const supabaseToken = 'private-supabase-session'
const metadata = {
  issuer,
  authorization_endpoint: `${issuer}/oauth2/authorize`,
  token_endpoint: `${issuer}/oauth2/token`,
  registration_endpoint: `${issuer}/connect/register`,
  revocation_endpoint: `${issuer}/oauth2/revoke`,
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none'],
}

const configure = (context: TestContext) => {
  const userId = randomUUID()
  for (const [key, value] of Object.entries({
    COROS_APP_ORIGIN: origin,
    COROS_COOKIE_SECRET: randomBytes(32).toString('base64'),
    COROS_CLIENT_ID: 'public-test-client',
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  })) {
    const previous = process.env[key]
    process.env[key] = value
    context.after(() => {
      if (previous === undefined) delete process.env[key]
      else process.env[key] = previous
    })
  }
  return userId
}

const post = (action: string, cookie?: string, extra: Record<string, unknown> = {}, userToken = supabaseToken) => new Request(`${origin}/api/coros`, {
  method: 'POST', headers: {
    'Content-Type': 'application/json', Origin: origin,
    ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
  }, body: JSON.stringify({ action, ...extra }),
})
const cookieHeader = (values: string[]) => values.map((value) => value.split(';')[0]).join('; ')
const responseCookies = (response: Response) => cookieHeader(response.headers.getSetCookie())
const connection = (userId: string, expiresAt = Date.now() + 3600_000): CorosConnection => ({
  userId, clientId: 'public-test-client', endpoint: `${issuer}/mcp`,
  tokenEndpoint: `${issuer}/oauth2/token`, revocationEndpoint: `${issuer}/oauth2/revoke`,
  region: 'cn', accessToken: privateAccess, refreshToken: privateRefresh, expiresAt,
})
const connectionCookie = (userId: string, expiresAt?: number) =>
  cookieHeader(sealCookie('connection', connection(userId, expiresAt), getCorosConfig(), 3600))

test('COROS fails closed before provider calls without verified Supabase login', async (context) => {
  configure(context)
  const upstream = context.mock.method(globalThis, 'fetch', async () => assert.fail('must not send unauthenticated traffic'))
  const handler = createCorosHandler(async () => assert.fail('must not read private data'))
  const response = await handler(post('preview', undefined, {}, ''))
  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { code: 'AUTH_REQUIRED', error: '请先登录后再连接 COROS。' })
  assert.equal(upstream.mock.callCount(), 0)
})

test('COROS status reports unconfigured service without contacting COROS', async (context) => {
  const userId = configure(context)
  delete process.env.COROS_COOKIE_SECRET
  context.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(String(url), 'https://project.supabase.co/auth/v1/user')
    return Response.json({ id: userId })
  })
  const handler = createCorosHandler()
  const status = await handler(post('status'))
  assert.deepEqual(await status.json(), { configured: false, connected: false })
  const connect = await handler(post('connect'))
  assert.equal(connect.status, 503)
  assert.equal((await connect.json()).code, 'COROS_NOT_CONFIGURED')
})

test('COROS validates request origin, method, size and region before provider traffic', async (context) => {
  const userId = configure(context)
  context.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(String(url), 'https://project.supabase.co/auth/v1/user')
    return Response.json({ id: userId })
  })
  const handler = createCorosHandler()
  for (const request of [
    new Request(`${origin}/api/coros`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{"action":"connect"}' }),
    post('connect', undefined, { region: 'https://evil.example' }),
    post('connect', undefined, { text: 'a'.repeat(2048) }),
    new Request(`${origin}/api/coros`, { method: 'DELETE' }),
  ]) {
    const response = await handler(request)
    assert.ok([400, 403, 405].includes(response.status))
  }
})

test('COROS OAuth uses PKCE, signed browser state, fixed redirect and account-bound sealed cookies', async (context) => {
  const userId = configure(context)
  let codeExchange: URLSearchParams | undefined
  const logs: unknown[] = []
  for (const method of ['info', 'warn', 'error'] as const) context.mock.method(console, method, (...args: unknown[]) => logs.push(args))
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).includes('/auth/v1/user')) return Response.json({ id: userId })
    assert.equal(options?.redirect, 'error')
    if (String(url).includes('/.well-known/')) return Response.json(metadata)
    assert.equal(String(url), `${issuer}/oauth2/token`)
    codeExchange = new URLSearchParams(String(options?.body))
    return Response.json({ access_token: privateAccess, refresh_token: privateRefresh, token_type: 'Bearer', expires_in: 3600 })
  })
  const handler = createCorosHandler(async ({ accessToken }) => {
    assert.equal(accessToken, privateAccess)
    return { days: [], warnings: [] }
  })
  const start = await handler(post('connect', undefined, { region: 'cn' }))
  assert.equal(start.status, 200)
  const data = await start.json()
  const authorization = new URL(data.authorizationUrl)
  assert.equal(authorization.origin, issuer)
  assert.equal(authorization.searchParams.get('redirect_uri'), `${origin}/api/coros`)
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(authorization.searchParams.get('resource'), `${issuer}/mcp`)
  const cookie = responseCookies(start)
  assert.ok(start.headers.getSetCookie().every((item) => item.includes('HttpOnly') && item.includes('Secure') && item.includes('SameSite=Lax')))
  assert.ok(!cookie.includes(userId))
  const callback = await handler(new Request(`${origin}/api/coros?code=private-code&state=${authorization.searchParams.get('state')}`, { headers: { Cookie: cookie } }))
  assert.equal(callback.status, 303)
  assert.equal(callback.headers.get('Location'), `${origin}/?coros=connected`)
  assert.equal(callback.headers.get('Referrer-Policy'), 'no-referrer')
  assert.equal(codeExchange?.get('code'), 'private-code')
  assert.equal(codeExchange?.get('client_id'), 'public-test-client')
  const verifier = codeExchange?.get('code_verifier')
  assert.ok(verifier)
  assert.equal(createHash('sha256').update(verifier).digest('base64url'), authorization.searchParams.get('code_challenge'))
  const saved = responseCookies(callback)
  assert.ok(!saved.includes(privateAccess) && !saved.includes(privateRefresh))
  assert.deepEqual(await (await handler(post('status', saved))).json(), { configured: true, connected: true, region: 'cn' })
  assert.deepEqual(await (await handler(post('preview', saved))).json(), { days: [], warnings: [] })
  assert.deepEqual(logs, [])
})

test('COROS callback rejects invalid state without exchanging authorization codes', async (context) => {
  configure(context)
  const upstream = context.mock.method(globalThis, 'fetch', async () => assert.fail('invalid flow cannot call provider'))
  const handler = createCorosHandler()
  const response = await handler(new Request(`${origin}/api/coros?code=SECRET&state=attacker`))
  assert.equal(response.status, 303)
  assert.equal(response.headers.get('Location'), `${origin}/?coros=error`)
  assert.ok(!JSON.stringify([...response.headers]).includes('SECRET'))
  assert.equal(upstream.mock.callCount(), 0)
})

test('COROS encrypted connections cannot cross accounts or be altered', async (context) => {
  const userId = configure(context)
  context.mock.method(globalThis, 'fetch', async (url) => {
    assert.ok(String(url).endsWith('/auth/v1/user'))
    return Response.json({ id: userId })
  })
  const handler = createCorosHandler(async () => assert.fail('no private read for wrong account'))
  const otherCookie = connectionCookie('other-user')
  const status = await handler(post('status', otherCookie))
  assert.deepEqual(await status.json(), { configured: true, connected: false })
  assert.equal((await handler(post('preview', otherCookie))).status, 401)
  const own = connectionCookie(userId)
  const tampered = own.replace(/=./, '=!')
  assert.equal((await handler(post('preview', tampered))).status, 401)
})

test('COROS refresh rotates cookies even when the subsequent data request fails', async (context) => {
  const userId = configure(context)
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: userId })
    assert.equal(String(url), `${issuer}/oauth2/token`)
    const fields = new URLSearchParams(String(options?.body))
    assert.equal(fields.get('grant_type'), 'refresh_token')
    assert.equal(fields.get('refresh_token'), privateRefresh)
    return Response.json({ access_token: 'rotated-access', refresh_token: 'rotated-refresh', token_type: 'Bearer', expires_in: 3600 })
  })
  const handler = createCorosHandler(async ({ accessToken }) => {
    assert.equal(accessToken, 'rotated-access')
    throw new Error('private-upstream-details')
  })
  const response = await handler(post('preview', connectionCookie(userId, Date.now() - 10)))
  assert.equal(response.status, 502)
  const payload = await response.json()
  assert.ok(!JSON.stringify(payload).includes('private'))
  const saved = readCookie('connection', post('status', responseCookies(response)), getCorosConfig())
  assert.equal(saved?.refreshToken, 'rotated-refresh')
})

test('COROS clears expired authorization after token refresh is rejected', async (context) => {
  const userId = configure(context)
  context.mock.method(globalThis, 'fetch', async (url) => String(url).endsWith('/auth/v1/user')
    ? Response.json({ id: userId }) : Response.json({ error: privateRefresh }, { status: 400 }))
  const handler = createCorosHandler(async () => assert.fail('must not call MCP with a rejected refresh'))
  const response = await handler(post('preview', connectionCookie(userId, Date.now() - 10)))
  assert.equal(response.status, 401)
  assert.equal((await response.json()).code, 'COROS_RECONNECT_REQUIRED')
  assert.ok(response.headers.getSetCookie().every((cookie) => cookie.includes('Max-Age=0')))
})

test('COROS disconnect revokes the provider grant and clears only integration cookies', async (context) => {
  const userId = configure(context)
  let revoked = false
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: userId })
    assert.equal(String(url), `${issuer}/oauth2/revoke`)
    assert.equal(new URLSearchParams(String(options?.body)).get('token'), privateRefresh)
    revoked = true
    return new Response(null, { status: 200 })
  })
  const response = await createCorosHandler()(post('disconnect', connectionCookie(userId)))
  assert.equal(response.status, 200)
  assert.equal(revoked, true)
  assert.ok(response.headers.getSetCookie().every((cookie) => cookie.includes('ef-coros-') && cookie.includes('Max-Age=0')))
})

test('COROS discovery cannot redirect OAuth credentials to untrusted origins or paths', async (context) => {
  const userId = configure(context)
  for (const token_endpoint of ['https://evil.example/oauth2/token', `${issuer}/redirect`, `https://mcpcn.coros.com.evil.example/oauth2/token`]) {
    context.mock.method(globalThis, 'fetch', async () => Response.json({ ...metadata, token_endpoint }))
    await assert.rejects(startAuthorization(userId, 'cn', getCorosConfig(), new AbortController().signal), CorosError)
  }
  for (const url of ['http://mcpcn.coros.com/mcp', 'https://name:secret@mcpcn.coros.com/mcp', `${issuer}/mcp?token=secret`, `${issuer}:8443/mcp`]) {
    assert.throws(() => officialUrl(url, '/mcp'), CorosError)
  }
})

test('COROS public dynamic registration uses only the configured callback', async (context) => {
  const userId = configure(context)
  delete process.env.COROS_CLIENT_ID
  // Keep this origin unique so module-local DCR caching cannot hide the registration request.
  process.env.COROS_APP_ORIGIN = `https://${randomUUID()}.example`
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).includes('/.well-known/')) return Response.json(metadata)
    assert.equal(String(url), `${issuer}/connect/register`)
    const body = JSON.parse(String(options?.body))
    assert.deepEqual(body.redirect_uris, [`${process.env.COROS_APP_ORIGIN}/api/coros`])
    assert.equal(body.token_endpoint_auth_method, 'none')
    return Response.json({ client_id: 'dynamically-registered', token_endpoint_auth_method: 'none' })
  })
  const result = await startAuthorization(userId, 'auto', getCorosConfig(), new AbortController().signal)
  assert.equal(result.flow.clientId, 'dynamically-registered')
  assert.equal(result.flow.region, 'cn')
})

test('COROS cookie chunking supports large tokens and rejects expired or cross-origin cookies', (context) => {
  const userId = configure(context)
  const config = getCorosConfig()
  const payload = { ...connection(userId), accessToken: 'a'.repeat(4_000), refreshToken: 'b'.repeat(2_000) }
  const cookie = cookieHeader(sealCookie('connection', payload, config, 60))
  assert.equal(readCookie('connection', post('status', cookie), config)?.accessToken, payload.accessToken)
  assert.equal(readCookie('connection', post('status', cookie), { ...config, origin: 'https://another.example' }), null)
  const expired = cookieHeader(sealCookie('connection', payload, config, -1))
  assert.equal(readCookie('connection', post('status', expired), config), null)
})

test('COROS preview calls are rate limited per verified user', async (context) => {
  const userId = configure(context)
  context.mock.method(globalThis, 'fetch', async () => Response.json({ id: userId }))
  let reads = 0
  const handler = createCorosHandler(async () => { reads += 1; return { days: [], warnings: [] } })
  const cookie = connectionCookie(userId)
  for (let index = 0; index < 12; index += 1) assert.equal((await handler(post('preview', cookie))).status, 200)
  const response = await handler(post('preview', cookie))
  assert.equal(response.status, 429)
  assert.equal(reads, 12)
})

test('COROS upstream authentication errors clear the sealed connection', async (context) => {
  const userId = configure(context)
  context.mock.method(globalThis, 'fetch', async () => Response.json({ id: userId }))
  const handler = createCorosHandler(async () => {
    throw new CorosMcpError('COROS_RECONNECT_REQUIRED', 'COROS 授权已失效，请重新连接。')
  })
  const response = await handler(post('preview', connectionCookie(userId)))
  assert.equal(response.status, 401)
  assert.ok(response.headers.getSetCookie().every((cookie) => cookie.includes('Max-Age=0')))
})
