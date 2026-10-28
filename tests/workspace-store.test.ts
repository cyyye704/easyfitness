import assert from 'node:assert/strict'
import test from 'node:test'
import { WorkspaceStore } from '../src/data/workspaceStore.ts'
import { CloudDataError } from '../src/data/types.ts'
import type { DataRepository, Versioned, WorkspaceSnapshot } from '../src/data/types.ts'
import { buildImportPlan, getImportWrites } from '../src/data/importPlan.ts'
import type { DailyRecord } from '../src/types.ts'
import { createEmptyRecord } from '../src/utils.ts'
import { createEmptyProfileDraft, createUserProfile } from '../src/profile/validation.ts'

const first = { ...createEmptyRecord('2026-10-27'), weightKg: 70 }
const second = { ...createEmptyRecord('2026-10-28'), weightKg: 71 }
const profile = createUserProfile(createEmptyProfileDraft(), [], [])
const initial = (): WorkspaceSnapshot => ({
  records: { [first.date]: { data: first, revision: 5 } },
  profile: { data: profile, revision: 8 },
})

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const repository = (overrides: Partial<DataRepository> = {}): DataRepository => ({
  mode: 'cloud',
  load: async () => initial(),
  saveRecord: async (data, revision) => ({ data, revision: (revision ?? 0) + 1 }),
  saveProfile: async (data, revision) => ({ data, revision: (revision ?? 0) + 1 }),
  deleteProfile: async () => undefined,
  ...overrides,
})

const settle = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

const start = async (store: WorkspaceStore) => {
  store.start()
  await settle()
  assert.equal(store.getSnapshot().loading, false)
}

test('a delayed save response never replaces a newer edit and the next write uses its revision', async (t) => {
  const firstWrite = deferred<Versioned<DailyRecord>>()
  const secondWrite = deferred<Versioned<DailyRecord>>()
  const calls: { data: DailyRecord; revision: number | null }[] = []
  const store = new WorkspaceStore(repository({
    saveRecord: (data, revision) => {
      calls.push({ data, revision })
      return calls.length === 1 ? firstWrite.promise : secondWrite.promise
    },
  }), 60_000)
  t.after(store.stop)
  await start(store)
  const edit1 = { ...first, weightKg: 72 }
  const edit2 = { ...first, weightKg: 73 }
  store.updateRecord(edit1)
  const saving = store.flush()
  store.updateRecord(edit2)
  firstWrite.resolve({ data: edit1, revision: 10 })
  await settle()

  assert.equal(store.getSnapshot().records[first.date].weightKg, 73)
  assert.deepEqual(calls, [{ data: edit1, revision: 5 }, { data: edit2, revision: 10 }])
  assert.equal(store.getSnapshot().pending, 1)
  secondWrite.resolve({ data: edit2, revision: 14 })
  await saving
  assert.equal(store.getSnapshot().pending, 0)
  assert.equal(store.getCloudSnapshot().records[first.date].revision, 14)
})

test('a failed in-flight save retains the latest pending edit and retries with the acknowledged revision', async (t) => {
  const firstWrite = deferred<Versioned<DailyRecord>>()
  const calls: { data: DailyRecord; revision: number | null }[] = []
  const store = new WorkspaceStore(repository({
    saveRecord: async (data, revision) => {
      calls.push({ data, revision })
      return calls.length === 1 ? firstWrite.promise : { data, revision: 11 }
    },
  }), 60_000)
  t.after(store.stop)
  await start(store)
  store.updateRecord({ ...first, weightKg: 72 })
  const saving = store.flush()
  const latest = { ...first, weightKg: 74 }
  store.updateRecord(latest)
  firstWrite.reject(new CloudDataError('network'))
  await saving
  assert.equal(store.getSnapshot().pending, 1)
  assert.ok(store.getSnapshot().saveError)
  assert.equal(store.getSnapshot().records[first.date].weightKg, 74)
  assert.equal(store.getCloudSnapshot().records[first.date].revision, 5)
  await store.flush()
  assert.deepEqual(calls.at(-1), { data: latest, revision: 5 })
  assert.equal(store.getSnapshot().saveError, null)
  assert.equal(store.getSnapshot().pending, 0)
})

test('conflicts do not retry automatically and explicit overwrite refreshes revisions first', async (t) => {
  let loads = 0
  const calls: (number | null)[] = []
  const latestCloud = {
    records: {
      [first.date]: { data: { ...first, weightKg: 80 }, revision: 20 },
      [second.date]: { data: second, revision: 21 },
    },
    profile: null,
  }
  const store = new WorkspaceStore(repository({
    load: async () => ++loads === 1 ? initial() : latestCloud,
    saveRecord: async (data, revision) => {
      calls.push(revision)
      if (calls.length === 1) throw new CloudDataError('conflict')
      return { data, revision: 25 }
    },
  }), 60_000)
  t.after(store.stop)
  await start(store)
  store.updateRecord({ ...first, weightKg: 75 })
  await store.flush()
  assert.equal(store.getSnapshot().conflict, true)
  assert.equal(store.getSnapshot().pending, 1)
  await store.flush()
  assert.deepEqual(calls, [5])
  assert.equal(loads, 1)
  await store.overwritePending()
  assert.deepEqual(calls, [5, 20])
  assert.equal(loads, 2)
  assert.equal(store.getSnapshot().records[first.date].weightKg, 75)
  assert.deepEqual(store.getSnapshot().records[second.date], second)
  assert.deepEqual(store.getSnapshot().profile, profile, 'daily conflict resolution preserves the profile editor snapshot')
  assert.equal(store.getCloudSnapshot().profile?.revision, 8)
  assert.equal(store.getSnapshot().conflict, false)
  assert.equal(store.getSnapshot().pending, 0)
})

test('stopping an account ignores the old write response and prevents saving the next queued date', async (t) => {
  const delayed = deferred<Versioned<DailyRecord>>()
  const dates: string[] = []
  const store = new WorkspaceStore(repository({
    saveRecord: async (data) => { dates.push(data.date); return delayed.promise },
  }), 60_000)
  t.after(store.stop)
  await start(store)
  const changed = { ...first, weightKg: 76 }
  store.updateRecord(changed)
  store.updateRecord(second)
  const saving = store.flush()
  store.stop()
  delayed.resolve({ data: changed, revision: 30 })
  await saving
  assert.deepEqual(dates, [first.date])
  assert.equal(store.getCloudSnapshot().records[first.date].revision, 5)
})

test('resuming after a failed sign-out retains edits and retries with a new live signal', async (t) => {
  const delayed = deferred<Versioned<DailyRecord>>()
  const signals: AbortSignal[] = []
  const store = new WorkspaceStore(repository({
    saveRecord: async (data, _revision, signal) => {
      signals.push(signal!)
      return signals.length === 1 ? delayed.promise : { data, revision: 40 }
    },
  }), 60_000)
  t.after(store.stop)
  await start(store)
  store.updateRecord({ ...first, weightKg: 77 })
  const saving = store.flush()
  store.stop()
  assert.equal(signals[0].aborted, true)
  delayed.reject(new DOMException('Aborted', 'AbortError'))
  await saving
  store.resume()
  await settle()
  assert.equal(signals.length, 2)
  assert.equal(signals[1].aborted, false)
  assert.equal(store.getSnapshot().records[first.date].weightKg, 77)
  assert.equal(store.getSnapshot().pending, 0)
})

test('resuming after sign-out fails during initial loading restarts that load', async (t) => {
  const delayed = deferred<WorkspaceSnapshot>()
  let loads = 0
  const store = new WorkspaceStore(repository({
    load: async () => ++loads === 1 ? delayed.promise : initial(),
  }), 60_000)
  t.after(() => { store.stop(); delayed.resolve(initial()) })
  store.start()
  store.stop()
  store.resume()
  await settle()
  assert.equal(loads, 2)
  assert.equal(store.getSnapshot().loading, false)
  assert.equal(store.getSnapshot().records[first.date].weightKg, 70)
})

test('a failed reload blocks all editing until an authoritative snapshot is loaded', async (t) => {
  let loads = 0
  let writes = 0
  const store = new WorkspaceStore(repository({
    load: async () => {
      if (++loads > 1) throw new CloudDataError('network')
      return initial()
    },
    saveRecord: async (data) => { writes += 1; return { data, revision: 50 } },
    saveProfile: async (data) => { writes += 1; return { data, revision: 50 } },
    deleteProfile: async () => { writes += 1 },
  }), 60_000)
  t.after(store.stop)
  await start(store)
  await store.reload()
  assert.ok(store.getSnapshot().loadError)
  store.updateRecord({ ...first, weightKg: 78 })
  assert.equal(store.getSnapshot().records[first.date].weightKg, 70)
  assert.equal(typeof await store.saveProfile(profile), 'string')
  assert.equal(typeof await store.deleteProfile(), 'string')
  assert.equal(typeof await store.importData({ records: [{ record: second, expectedRevision: null }], profile: null }), 'string')
  assert.equal(writes, 0)
})

test('stopping during an import acknowledgement prevents the next date and profile writes', async (t) => {
  const dates: string[] = []
  let profileWrites = 0
  const store = new WorkspaceStore(repository({
    load: async () => ({ records: {}, profile: null }),
    saveRecord: async (data) => { dates.push(data.date); return { data, revision: 60 } },
    saveProfile: async (data) => { profileWrites += 1; return { data, revision: 61 } },
  }), 60_000)
  t.after(store.stop)
  await start(store)
  const unsubscribe = store.subscribe(() => {
    if (store.getSnapshot().records[first.date]) store.stop()
  })
  t.after(unsubscribe)
  const result = await store.importData({
    records: [{ record: first, expectedRevision: null }, { record: second, expectedRevision: null }],
    profile: { profile, expectedRevision: null },
  })
  assert.ok(result)
  assert.deepEqual(dates, [first.date])
  assert.equal(profileWrites, 0)
})

test('partial imports preserve successful rows and a fresh plan skips them on retry', async (t) => {
  let calls = 0
  const store = new WorkspaceStore(repository({
    load: async () => ({ records: {}, profile: null }),
    saveRecord: async (data) => {
      if (++calls === 2) throw new CloudDataError('network')
      return { data, revision: 70 }
    },
  }), 60_000)
  t.after(store.stop)
  await start(store)
  const local = { [first.date]: first, [second.date]: second }
  const writes = getImportWrites(buildImportPlan(local, null, store.getCloudSnapshot()))
  const error = await store.importData(writes)
  assert.match(error ?? '', /成功导入的部分会保留/)
  assert.deepEqual(store.getSnapshot().records[first.date], first)
  assert.equal(store.getSnapshot().records[second.date], undefined)
  const retry = getImportWrites(buildImportPlan(local, null, store.getCloudSnapshot()))
  assert.deepEqual(retry.records, [{ record: second, expectedRevision: null }])
  assert.equal(store.getSnapshot().busy, false)
})

test('profile delete failure preserves the profile; successful retry leaves daily records intact', async (t) => {
  const revisions: number[] = []
  const store = new WorkspaceStore(repository({
    deleteProfile: async (revision) => {
      revisions.push(revision)
      if (revisions.length === 1) throw new CloudDataError('network')
    },
  }), 60_000)
  t.after(store.stop)
  await start(store)
  assert.equal(typeof await store.deleteProfile(), 'string')
  assert.deepEqual(store.getSnapshot().profile, profile)
  assert.equal(await store.deleteProfile(), null)
  assert.deepEqual(revisions, [8, 8])
  assert.equal(store.getSnapshot().profile, null)
  assert.deepEqual(store.getSnapshot().records[first.date], first)
})
