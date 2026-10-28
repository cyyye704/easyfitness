import assert from 'node:assert/strict'
import test from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { createCloudRepository } from '../src/data/repository.ts'
import { CloudDataError } from '../src/data/types.ts'
import { createEmptyProfileDraft, createUserProfile } from '../src/profile/validation.ts'
import { createEmptyRecord } from '../src/utils.ts'
import { shiftDateKey } from '../src/periodSummary/calculatePeriodSummary.ts'

const userId = '11111111-1111-4111-8111-111111111111'
const otherUserId = '22222222-2222-4222-8222-222222222222'
const record = { ...createEmptyRecord('2026-10-28'), weightKg: 70 }
const profile = createUserProfile(createEmptyProfileDraft(), [], [])

type CapturedRequest = { url: URL; init: RequestInit }
const makeRepository = (handle: (request: CapturedRequest) => Response | Promise<Response>) => {
  const requests: CapturedRequest[] = []
  const client = createClient('https://easyfitness-cloud.example.invalid', 'public-test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input, init = {}) => {
        const request = { url: new URL(String(input)), init }
        requests.push(request)
        return handle(request)
      },
    },
  })
  return { repository: createCloudRepository(client, userId), requests }
}

const hasKind = (kind: CloudDataError['kind']) => (error: unknown) =>
  error instanceof CloudDataError && error.kind === kind

test('cloud load filters both tables by account and loads more than 1000 records', async () => {
  const rows = Array.from({ length: 1005 }, (_, index) => {
    const date = shiftDateKey('2020-01-01', index)
    return { user_id: userId, date, data: createEmptyRecord(date), revision: index + 1 }
  })
  const { repository, requests } = makeRepository(({ url }) => {
    assert.equal(url.searchParams.get('user_id'), `eq.${userId}`)
    if (url.pathname.endsWith('/user_profiles')) {
      return Response.json([{ user_id: userId, data: profile, revision: 2000 }])
    }
    assert.equal(url.searchParams.get('order'), 'date.asc')
    const after = url.searchParams.get('date')?.slice(3)
    // A project with a lower server page cap must still load all records.
    return Response.json(rows.filter((row) => !after || row.date > after).slice(0, 200))
  })

  const snapshot = await repository.load()
  assert.equal(Object.keys(snapshot.records).length, 1005)
  assert.deepEqual(snapshot.records[rows.at(-1)!.date], { data: rows.at(-1)!.data, revision: 1005 })
  assert.equal(snapshot.profile?.revision, 2000)
  assert.equal(requests.filter(({ url }) => url.pathname.endsWith('/daily_records')).length, 7)
})

test('inserts never upsert and updates carry account, date and expected revision', async () => {
  const { repository, requests } = makeRepository(({ url, init }) => {
    const body = JSON.parse(String(init.body))
    assert.equal(new Headers(init.headers).get('Prefer'), 'return=representation')
    assert.equal('revision' in body, false)
    assert.equal('updated_at' in body, false)
    if (init.method === 'POST') {
      assert.equal(body.user_id, userId)
      assert.equal(body.date, record.date)
      return Response.json([{ ...body, revision: 10 }], { status: 201 })
    }
    assert.equal(init.method, 'PATCH')
    assert.equal(url.searchParams.get('user_id'), `eq.${userId}`)
    assert.equal(url.searchParams.get('date'), `eq.${record.date}`)
    assert.equal(url.searchParams.get('revision'), 'eq.10')
    assert.deepEqual(Object.keys(body), ['data'])
    return Response.json([{ user_id: userId, date: record.date, data: body.data, revision: 12 }])
  })

  assert.equal((await repository.saveRecord(record, null)).revision, 10)
  assert.equal((await repository.saveRecord({ ...record, weightKg: 71 }, 10)).revision, 12)
  assert.equal(requests.length, 2)
})

test('duplicate insert, stale update and stale profile deletion are conflicts', async () => {
  const { repository } = makeRepository(({ init }) => init.method === 'POST'
    ? Response.json({ code: '23505', message: 'duplicate key' }, { status: 409 })
    : Response.json([]))
  await assert.rejects(repository.saveRecord(record, null), hasKind('conflict'))
  await assert.rejects(repository.saveRecord(record, 1), hasKind('conflict'))
  await assert.rejects(repository.saveProfile(profile, null), hasKind('conflict'))
  await assert.rejects(repository.saveProfile(profile, 1), hasKind('conflict'))
  await assert.rejects(repository.deleteProfile(1), hasKind('conflict'))
})

test('profile writes and deletion preserve optimistic concurrency and account filters', async () => {
  const { repository } = makeRepository(({ url, init }) => {
    assert.ok(url.pathname.endsWith('/user_profiles'))
    if (init.method === 'POST') {
      const body = JSON.parse(String(init.body))
      assert.equal(body.user_id, userId)
      return Response.json([{ ...body, revision: 2 }], { status: 201 })
    }
    assert.equal(url.searchParams.get('user_id'), `eq.${userId}`)
    assert.equal(url.searchParams.get('revision'), init.method === 'PATCH' ? 'eq.2' : 'eq.8')
    if (init.method === 'PATCH') {
      const body = JSON.parse(String(init.body))
      assert.deepEqual(Object.keys(body), ['data'])
      return Response.json([{ user_id: userId, data: body.data, revision: 8 }])
    }
    assert.equal(init.method, 'DELETE')
    return Response.json([{ user_id: userId, revision: 8 }])
  })
  assert.equal((await repository.saveProfile(profile, null)).revision, 2)
  assert.equal((await repository.saveProfile(profile, 2)).revision, 8)
  await repository.deleteProfile(8)
})

test('cloud failures are classified without exposing service error details', async () => {
  for (const [status, code, kind] of [
    [401, 'PGRST301', 'auth'], [403, '42501', 'auth'],
    [400, '23514', 'invalid'], [500, 'XX000', 'unknown'],
  ] as const) {
    const { repository } = makeRepository(() =>
      Response.json({ code, message: 'private service details' }, { status }),
    )
    await assert.rejects(repository.saveRecord(record, null), (error: unknown) => {
      assert.ok(error instanceof CloudDataError)
      assert.equal(error.kind, kind)
      assert.doesNotMatch(error.message, /private service details/)
      return true
    })
  }
  const { repository } = makeRepository(() => { throw new TypeError('fetch failed') })
  await assert.rejects(repository.saveRecord(record, null), hasKind('network'))
})

test('malformed and cross-account cloud rows fail instead of silently losing content', async () => {
  for (const bad of [
    { user_id: otherUserId, date: record.date, data: record, revision: 1 },
    { user_id: userId, date: record.date, data: { ...record, sleepHours: 30 }, revision: 1 },
    { user_id: userId, date: record.date, data: record, revision: 0 },
  ]) {
    const { repository } = makeRepository(({ url }) =>
      Response.json(url.pathname.endsWith('/daily_records') ? [bad] : []),
    )
    await assert.rejects(repository.load(), hasKind('invalid'))
  }
})

test('input validation rejects bad records, profiles and revisions before making a request', async () => {
  const { repository, requests } = makeRepository(() => Response.json([]))
  await assert.rejects(repository.saveRecord({ ...record, weightKg: Number.NaN }, null), hasKind('invalid'))
  await assert.rejects(repository.saveRecord(record, 0), hasKind('invalid'))
  await assert.rejects(repository.saveProfile({ ...profile, facts: undefined } as unknown as typeof profile, null), hasKind('invalid'))
  await assert.rejects(repository.deleteProfile(-1), hasKind('invalid'))
  assert.equal(requests.length, 0)
})

test('aborted requests preserve cancellation and pre-aborted requests never reach fetch', async () => {
  const preAborted = new AbortController()
  preAborted.abort()
  const { repository, requests } = makeRepository(() => Response.json([]))
  await assert.rejects(repository.load(preAborted.signal), { name: 'AbortError' })
  assert.equal(requests.length, 0)

  const controller = new AbortController()
  const aborted = makeRepository(() => {
    controller.abort()
    return Response.json([{ user_id: userId, date: record.date, data: record, revision: 1 }])
  })
  await assert.rejects(aborted.repository.saveRecord(record, null, controller.signal), { name: 'AbortError' })
})
