import assert from 'node:assert/strict'
import test from 'node:test'
import { buildImportPlan, getImportWrites } from '../src/data/importPlan.ts'
import { CloudDataError } from '../src/data/types.ts'
import { parseDailyRecord, parseUserProfile } from '../src/data/validation.ts'
import { createEmptyProfileDraft, createUserProfile } from '../src/profile/validation.ts'
import { createEmptyRecord } from '../src/utils.ts'

const first = { ...createEmptyRecord('2026-10-26'), weightKg: 70 }
const second = { ...createEmptyRecord('2026-10-27'), weightKg: 71 }
const third = { ...createEmptyRecord('2026-10-28'), weightKg: 72 }
const profile = createUserProfile(createEmptyProfileDraft(), [], [])

test('migration classifies missing, same and conflicting records without mutating either source', () => {
  const local = { [first.date]: first, [second.date]: second, [third.date]: third }
  const cloud = {
    records: {
      // Object key order is not a data conflict.
      [second.date]: {
        data: {
          weightKg: second.weightKg, date: second.date, training: second.training,
          trainingStatus: second.trainingStatus, nutritionComplete: second.nutritionComplete,
          sleepHours: second.sleepHours, foods: second.foods, unestimatedMeals: second.unestimatedMeals,
        },
        revision: 3,
      },
      [third.date]: { data: { ...third, weightKg: 80 }, revision: 7 },
    },
    profile: { data: { ...profile, id: 'different-profile' }, revision: 9 },
  }
  const before = JSON.stringify({ local, cloud })
  const plan = buildImportPlan(local, profile, cloud)
  assert.deepEqual(plan.records.map(({ status }) => status), ['missing', 'same', 'conflict'])
  assert.equal(plan.profile?.status, 'conflict')
  assert.deepEqual(getImportWrites(plan), {
    records: [{ record: first, expectedRevision: null }],
    profile: null,
  })
  assert.equal(JSON.stringify({ local, cloud }), before)
})

test('only explicitly selected conflicts become writes with the inspected cloud revision', () => {
  const plan = buildImportPlan({ [third.date]: third }, profile, {
    records: { [third.date]: { data: { ...third, weightKg: 80 }, revision: 7 } },
    profile: { data: { ...profile, id: 'different-profile' }, revision: 9 },
  })
  assert.deepEqual(getImportWrites(plan, { recordDates: ['unrelated-date'] }), { records: [], profile: null })
  assert.deepEqual(getImportWrites(plan, { recordDates: [third.date], profile: true }), {
    records: [{ record: third, expectedRevision: 7 }],
    profile: { profile, expectedRevision: 9 },
  })
})

test('missing profiles are insert-only and identical data can be imported again without writes', () => {
  const missing = buildImportPlan({}, profile, { records: {}, profile: null })
  assert.deepEqual(getImportWrites(missing).profile, { profile, expectedRevision: null })
  const same = buildImportPlan({ [first.date]: first }, profile, {
    records: { [first.date]: { data: first, revision: 12 } },
    profile: { data: profile, revision: 20 },
  })
  assert.deepEqual(getImportWrites(same, { recordDates: [first.date], profile: true }), {
    records: [], profile: null,
  })
})

test('cloud daily-record parsing rejects missing, coercible or invalid fields and duplicate food IDs', () => {
  const invalid = (callback: () => unknown) => assert.throws(callback, CloudDataError)
  invalid(() => parseDailyRecord({ ...first, date: '2026-02-30' }))
  invalid(() => parseDailyRecord({ ...first, weightKg: '70' }))
  invalid(() => parseDailyRecord({ ...first, sleepHours: undefined }))
  invalid(() => parseDailyRecord({ ...first, foods: [{ id: 'a', name: 'Rice', calories: -1, protein: 3 }] }))
  invalid(() => parseDailyRecord({
    ...first,
    foods: Array.from({ length: 2 }, () => ({ id: 'same', name: 'Rice', calories: 100, protein: 3 })),
  }))
  invalid(() => buildImportPlan({ '2026-10-25': first }, null, { records: {}, profile: null }))
  assert.deepEqual(parseDailyRecord({ ...first, derivedModel: { bmi: 23 } }), first)
})

test('cloud profile parsing requires confirmed shape and excludes derived or draft data', () => {
  assert.throws(() => parseUserProfile({ ...profile, facts: {} }), CloudDataError)
  assert.throws(() => parseUserProfile({ ...profile, estimates: {} }), CloudDataError)
  assert.throws(() => parseUserProfile({ ...profile, onboarding: { ...profile.onboarding, completed: false } }), CloudDataError)
  assert.throws(() => parseUserProfile({ ...profile, facts: { ...profile.facts, heightCm: 5 } }), CloudDataError)
  assert.deepEqual(parseUserProfile({ ...profile, bodyModel: { bmi: 23 }, rawText: 'private draft' }), profile)
})
