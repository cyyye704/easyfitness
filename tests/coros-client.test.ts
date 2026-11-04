import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCorosClient } from '../src/coros/client.ts'

const session = { user: { id: 'user-a' }, access_token: 'supabase-session-token' }
const status = { configured: true, connected: true, region: 'cn' }

test('COROS client requires the intended logged-in account before sending any request', async () => {
  for (const current of [null, { ...session, user: { id: 'user-b' } }]) {
    let called = false
    const client = createCorosClient({ getSession: async () => current,
      fetcher: async () => { called = true; return Response.json(status) } })
    await assert.rejects(client.status('user-a', new AbortController().signal), /登录状态/)
    assert.equal(called, false)
  }
})

test('COROS client sends only Supabase credentials and same-origin cookies', async () => {
  const client = createCorosClient({ getSession: async () => session, fetcher: async (url, init) => {
    assert.equal(url, '/api/coros')
    assert.equal(init?.credentials, 'same-origin')
    assert.equal(init?.cache, 'no-store')
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer supabase-session-token')
    assert.deepEqual(JSON.parse(String(init?.body)), { action: 'status' })
    return Response.json(status)
  } })
  assert.deepEqual(await client.status('user-a', new AbortController().signal), status)
})

test('late COROS responses are rejected after account switch or sign-out', async () => {
  let current: typeof session | null = session
  const client = createCorosClient({ getSession: async () => current, fetcher: async () => {
    current = null
    return Response.json(status)
  } })
  await assert.rejects(client.status('user-a', new AbortController().signal), /登录状态/)
})

test('COROS client never exposes arbitrary server bodies and preserves cancellation', async () => {
  const client = createCorosClient({ getSession: async () => session,
    fetcher: async () => Response.json({ code: 'COROS_UPSTREAM_UNAVAILABLE', error: 'secret upstream payload' }, { status: 502 }) })
  await assert.rejects(client.status('user-a', new AbortController().signal), /暂时无法连接 COROS/)
  const controller = new AbortController()
  const cancelled = createCorosClient({ getSession: async () => session, fetcher: async () => {
    controller.abort()
    return Response.json(status)
  } })
  await assert.rejects(cancelled.status('user-a', controller.signal), { name: 'AbortError' })
})

test('COROS reconnect errors retain their code for the connection UI', async () => {
  const client = createCorosClient({ getSession: async () => session,
    fetcher: async () => Response.json({ code: 'COROS_RECONNECT_REQUIRED' }, { status: 401 }) })
  await assert.rejects(client.preview('user-a', new AbortController().signal),
    { name: 'CorosRequestError', code: 'COROS_RECONNECT_REQUIRED' })
})
