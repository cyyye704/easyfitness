import assert from 'node:assert/strict'
import test from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { parseDailyRecord } from '../src/data/validation.ts'
import { buildImportPlan, getImportWrites } from '../src/data/importPlan.ts'
import { createCloudRepository } from '../src/data/repository.ts'
import { CloudDataError } from '../src/data/types.ts'
import { loadFoodTemplates, saveFoodTemplates } from '../src/food/templateStorage.ts'
import { loadRecords, saveRecords } from '../src/storage.ts'
import { createEmptyRecord, evaluateRecord } from '../src/utils.ts'
import { calculatePeriodSummary } from '../src/periodSummary/calculatePeriodSummary.ts'
import { calculateWeightTrend } from '../src/periodSummary/weightTrend.ts'
import { mergeAiDraft } from '../src/ai/mergeAiDraft.ts'
import type { AiDailyDraft } from '../src/ai/types.ts'
import type { DailyRecord } from '../src/types.ts'

const date = '2026-10-28'
const account = '11111111-1111-4111-8111-111111111111'
const confirmed: DailyRecord = {
  ...createEmptyRecord(date),
  weightKg: 70, sleepHours: 8, trainingStatus: 'trained', nutritionComplete: true,
  foods: [{ id: 'rice', name: 'Rice', calories: 1500, protein: 80, meal: 'lunch' }],
}

const installStorage = (t: { after: (callback: () => void) => void }) => {
  const previous = globalThis.localStorage
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } })
  t.after(() => Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previous }))
  return values
}

test('production record fields survive local reload, import planning and cloud parsing', (t) => {
  installStorage(t)
  assert.equal(saveRecords({ [date]: confirmed }).ok, true)
  const local = loadRecords().records
  assert.deepEqual(local[date], confirmed)
  const writes = getImportWrites(buildImportPlan(local, null, { records: {}, profile: null }))
  assert.deepEqual(writes.records, [{ record: confirmed, expectedRevision: null }])
  assert.deepEqual(parseDailyRecord(writes.records[0].record), confirmed)
})

test('a real Supabase request preserves meal and confirmation fields in both directions', async () => {
  let requestBody: { user_id: string; date: string; data: DailyRecord } | null = null
  const client = createClient('https://features.example.invalid', 'public-test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (_input, options) => {
      requestBody = JSON.parse(String(options?.body))
      return Response.json([{ ...requestBody, revision: 12 }], { status: 201 })
    } },
  })
  const saved = await createCloudRepository(client, account).saveRecord(confirmed, null)
  assert.deepEqual(requestBody, { user_id: account, date, data: confirmed })
  assert.deepEqual(saved, { data: confirmed, revision: 12 })
})

test('legacy records gain unconfirmed defaults without treating training notes as confirmed', () => {
  const legacy = {
    date, weightKg: 70, sleepHours: 8, training: '跑步',
    foods: [{ id: 'rice', name: 'Rice', calories: 1500, protein: 80 }],
    unestimatedMeals: [],
  }
  const parsed = parseDailyRecord(legacy)
  assert.equal(parsed.trainingStatus, 'unrecorded')
  assert.equal(parsed.nutritionComplete, false)
  assert.equal(parsed.foods[0].meal, 'unspecified')
  assert.equal(evaluateRecord(parsed).rating, '待补充')
  const plan = buildImportPlan({ [date]: parsed }, null, {
    records: { [date]: { data: legacy as DailyRecord, revision: 3 } }, profile: null,
  })
  assert.equal(plan.records[0].status, 'same')
  assert.deepEqual(getImportWrites(plan).records, [])
})

test('invalid new fields are rejected instead of being silently stripped', () => {
  for (const trainingStatus of [null, 'finished', ['trained'], 1]) {
    assert.throws(() => parseDailyRecord({ ...confirmed, trainingStatus }), CloudDataError)
  }
  for (const nutritionComplete of [null, 'true', 1]) {
    assert.throws(() => parseDailyRecord({ ...confirmed, nutritionComplete }), CloudDataError)
  }
  assert.throws(() => parseDailyRecord({
    ...confirmed, foods: [{ ...confirmed.foods[0], meal: 'midnight' }],
  }), CloudDataError)
  assert.throws(() => parseDailyRecord({
    ...confirmed, unestimatedMeals: [{ id: 'unknown', description: 'Dinner', reason: 'Unknown portion' }],
  }), CloudDataError)
})

test('changes only to meal, nutrition completeness or training status are import conflicts', () => {
  for (const changed of [
    { ...confirmed, trainingStatus: 'rest' as const },
    { ...confirmed, nutritionComplete: false },
    { ...confirmed, foods: [{ ...confirmed.foods[0], meal: 'dinner' as const }] },
  ]) {
    const plan = buildImportPlan({ [date]: confirmed }, null, {
      records: { [date]: { data: changed, revision: 9 } }, profile: null,
    })
    assert.equal(plan.records[0].status, 'conflict')
    assert.deepEqual(getImportWrites(plan).records, [])
    assert.deepEqual(getImportWrites(plan, { recordDates: [date] }).records, [
      { record: confirmed, expectedRevision: 9 },
    ])
  }
})

test('local and two signed-in accounts keep separate food templates without automatic migration', (t) => {
  const values = installStorage(t)
  const local = [{ id: 'local', name: '本机旧收藏', foods: confirmed.foods }]
  const alice = [{ id: 'alice', name: '账号A收藏', foods: confirmed.foods }]
  const bob = [{ id: 'bob', name: '账号B收藏', foods: confirmed.foods }]
  assert.equal(saveFoodTemplates(local), null)
  const legacyRaw = values.get('easyfitness.food-templates.v1')
  assert.deepEqual(loadFoodTemplates('alice').templates, [])
  assert.deepEqual(loadFoodTemplates('bob').templates, [])
  assert.equal(saveFoodTemplates(alice, 'alice'), null)
  assert.equal(saveFoodTemplates(bob, 'bob'), null)
  assert.equal(loadFoodTemplates().templates[0].id, 'local')
  assert.equal(loadFoodTemplates('alice').templates[0].id, 'alice')
  assert.equal(loadFoodTemplates('bob').templates[0].id, 'bob')
  assert.equal(values.get('easyfitness.food-templates.v1'), legacyRaw)
  assert.equal(loadFoodTemplates('alice').templates[0].foods[0].meal, 'lunch')
})

test('cloud round-tripped records retain complete-day averages, confirmed training and weight trends', () => {
  const previous = parseDailyRecord({
    ...confirmed, date: '2026-10-27', weightKg: 72,
    nutritionComplete: false, trainingStatus: 'rest',
    foods: [{ ...confirmed.foods[0], calories: 500, protein: 20 }],
  })
  const today = parseDailyRecord(confirmed)
  const records = { [previous.date]: previous, [today.date]: today }
  const metrics = calculatePeriodSummary(records, previous.date, today.date)!
  assert.equal(metrics.nutrition.completeDays, 1)
  assert.equal(metrics.nutrition.completeAverageCalories, 1500)
  assert.equal(metrics.nutrition.averageCalories, 1000)
  assert.equal(metrics.training.days, 1)
  assert.equal(evaluateRecord(today).rating, '加分')
  assert.equal(evaluateRecord(previous).rating, '待补充')
  assert.deepEqual(calculateWeightTrend(records, today.date, today.date), [
    { date: today.date, weightKg: 70, averageKg: 71, sampleCount: 2 },
  ])
})

test('AI merges preserve existing meal labels and reset only affected confirmation flags', () => {
  const draft: AiDailyDraft = {
    date, weightKg: 69, sleepHours: null, training: '', foods: [], unestimatedMeals: [],
    unknowns: [], feedback: '',
  }
  const scalar = mergeAiDraft(confirmed, draft, { replaceWeight: true, replaceSleep: false })
  assert.equal(scalar.nutritionComplete, true)
  assert.equal(scalar.trainingStatus, 'trained')
  assert.equal(scalar.foods[0].meal, 'lunch')
  const changed = mergeAiDraft(confirmed, {
    ...draft, training: '新的训练内容',
    foods: [{
      id: 'draft-food', name: 'Milk', amountText: '1 cup', caloriesRange: null,
      proteinRange: null, calories: 100, protein: 8, confidence: 'medium',
    }],
  }, { replaceWeight: false, replaceSleep: false })
  const normalized = parseDailyRecord(changed)
  assert.equal(normalized.nutritionComplete, false)
  assert.equal(normalized.trainingStatus, 'unrecorded')
  assert.equal(normalized.foods[0].meal, 'unspecified')
  assert.equal(normalized.foods[1].meal, 'lunch')
})
