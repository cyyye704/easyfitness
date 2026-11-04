import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildCorosImport, corosAlreadyRecorded, createCorosChoices } from '../src/coros/import.ts'
import { parseCorosAuthorization, parseCorosPreview } from '../src/coros/validation.ts'
import { createEmptyRecord, summarizeNutrition } from '../src/utils.ts'
import type { CorosDailyData } from '../src/types.ts'

const day: CorosDailyData = {
  sourceDate: '2026-11-03', sleepHours: 7.95, activeCaloriesKcal: 435,
  syncedAt: '2026-11-04T04:00:00.000Z',
}

test('COROS import fills missing sleep without changing food intake or training', () => {
  const record = { ...createEmptyRecord(day.sourceDate), training: '跑步', trainingStatus: 'trained' as const,
    foods: [{ id: 'lunch', name: '午餐', calories: 600, protein: 30 }], weightKg: 70 }
  const records = { [record.date]: record }
  const writes = buildCorosImport([day], records, createCorosChoices([day], records))
  assert.equal(writes[0].sleepHours, 7.95)
  assert.equal(writes[0].coros?.activeCaloriesKcal, 435)
  assert.equal(writes[0].training, '跑步')
  assert.equal(writes[0].weightKg, 70)
  assert.equal(summarizeNutrition(writes[0].foods).totalCalories, 600)
  assert.equal(record.sleepHours, null)
})

test('existing manual sleep stays unless explicitly chosen for replacement', () => {
  const record = { ...createEmptyRecord(day.sourceDate), sleepHours: 8 }
  const records = { [record.date]: record }
  const choices = createCorosChoices([day], records)
  assert.equal(choices[record.date].useSleep, false)
  assert.equal(buildCorosImport([day], records, choices)[0].sleepHours, 8)
  choices[record.date].useSleep = true
  assert.equal(buildCorosImport([day], records, choices)[0].sleepHours, day.sleepHours)
})

test('repeated COROS previews default to keeping prior records and never accumulate calories', () => {
  const record = { ...createEmptyRecord(day.sourceDate), coros: day, sleepHours: day.sleepHours }
  const records = { [record.date]: record }
  const next = { ...day, activeCaloriesKcal: 500 }
  const choices = createCorosChoices([next], records)
  assert.deepEqual(buildCorosImport([next], records, choices), [])
  choices[record.date].selected = true
  assert.equal(buildCorosImport([next], records, choices)[0].coros?.activeCaloriesKcal, 500)
  assert.equal(corosAlreadyRecorded(record, day), true)
  assert.equal(corosAlreadyRecorded(record, next), false)
})

test('missing metrics preserve prior source values instead of overwriting with zero or null', () => {
  const record = { ...createEmptyRecord(day.sourceDate), coros: day, sleepHours: 8 }
  const records = { [record.date]: record }
  const partial = { ...day, sleepHours: null, activeCaloriesKcal: 0 }
  const choices = createCorosChoices([partial], records)
  choices[record.date].selected = true
  choices[record.date].useSleep = true
  const [result] = buildCorosImport([partial], records, choices)
  assert.equal(result.sleepHours, 8)
  assert.equal(result.coros?.sleepHours, 7.95)
  assert.equal(result.coros?.activeCaloriesKcal, 0)
})

test('stale previews fail atomically for source or sleep changes, while other edits are preserved', () => {
  const first = createEmptyRecord(day.sourceDate)
  const secondDay = { ...day, sourceDate: '2026-11-02' }
  const records = { [first.date]: first }
  const choices = createCorosChoices([day, secondDay], records)
  assert.throws(() => buildCorosImport([secondDay, day], {
    [first.date]: { ...first, sleepHours: 5 },
  }, choices), /发生变化/)
  assert.throws(() => buildCorosImport([day], { [first.date]: { ...first, coros: day } }, choices), /发生变化/)
  const [merged] = buildCorosImport([day], { [first.date]: { ...first, training: '新训练' } }, choices)
  assert.equal(merged.training, '新训练')
})

test('preview validates bounded unique daily values and rejects unknown fields', () => {
  assert.deepEqual(parseCorosPreview({ days: [day], warnings: [] }), { days: [day], warnings: [] })
  for (const invalid of [
    { days: [day, day], warnings: [] },
    { days: [{ ...day, sleepHours: 25 }], warnings: [] },
    { days: [{ ...day, activeCaloriesKcal: -1 }], warnings: [] },
    { days: [{ ...day, sourceDate: '2026-02-30' }], warnings: [] },
    { days: [{ ...day, syncedAt: '2026-11-04T24:00:00Z' }], warnings: [] },
    { days: [{ ...day, token: 'should-not-be-here' }], warnings: [] },
    { days: [day], warnings: [3] },
  ]) assert.throws(() => parseCorosPreview(invalid))
})

test('authorization redirects only to the exact official OAuth hosts and path', () => {
  assert.equal(parseCorosAuthorization({ authorizationUrl: 'https://mcpcn.coros.com/oauth2/authorize?state=test' }),
    'https://mcpcn.coros.com/oauth2/authorize?state=test')
  for (const url of ['javascript:alert(1)', 'https://evil.test/oauth2/authorize',
    'https://mcpcn.coros.com.evil.test/oauth2/authorize', 'https://mcpcn.coros.com/redirect',
    'https://x@mcpcn.coros.com/oauth2/authorize', 'https://mcpcn.coros.com:444/oauth2/authorize']) {
    assert.throws(() => parseCorosAuthorization({ authorizationUrl: url }))
  }
})
