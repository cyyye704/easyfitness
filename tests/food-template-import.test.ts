import assert from 'node:assert/strict'
import test from 'node:test'
import { buildFoodTemplateImport } from '../src/food/templateStorage.ts'
import type { FoodTemplate } from '../src/food/foodUtils.ts'

const template = (id: string, name: string, calories = 100): FoodTemplate => ({
  id, name, foods: [{ name: 'Rice', calories, protein: 4, meal: 'lunch' }],
})

test('template import preserves current names, imports only the first legacy duplicate and gives new IDs', () => {
  const current = [template('shared-id', ' Breakfast ', 200)]
  const legacy = [
    template('old-breakfast', 'breakfast'),
    template('shared-id', ' Lunch ', 300),
    template('duplicate-lunch', 'LUNCH', 400),
    template('old-dinner', 'Dinner', 500),
  ]
  const plan = buildFoodTemplateImport(current, legacy)
  assert.equal(plan.imported, 2)
  assert.equal(plan.skipped, 2)
  assert.deepEqual(plan.templates.map((entry) => entry.name), [' Breakfast ', 'Lunch', 'Dinner'])
  assert.deepEqual(plan.templates[0], current[0])
  assert.equal(plan.templates[1].foods[0].calories, 300)
  assert.equal(plan.templates[1].foods[0].meal, 'lunch')
  assert.equal(new Set(plan.templates.map((entry) => entry.id)).size, 3)
  const oldIds = new Set([...current, ...legacy].map((entry) => entry.id))
  assert.ok(plan.templates.slice(1).every((entry) => !oldIds.has(entry.id)))
  assert.equal(buildFoodTemplateImport(plan.templates, legacy).imported, 0)
})

test('template import does not read or write storage, mutate inputs or share imported food objects', (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => {
    throw new Error('Import planning must not access storage')
  } })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  })
  const current = [template('current', 'Breakfast')]
  const legacy = [template('old', ' Lunch ')]
  const before = structuredClone({ current, legacy })
  const plan = buildFoodTemplateImport(current, legacy)
  assert.deepEqual({ current, legacy }, before)
  assert.notEqual(plan.templates, current)
  assert.notEqual(plan.templates[1], legacy[0])
  assert.notEqual(plan.templates[1].foods, legacy[0].foods)
  assert.notEqual(plan.templates[1].foods[0], legacy[0].foods[0])
  plan.templates[1].foods[0].name = 'Changed after confirmation'
  assert.deepEqual({ current, legacy }, before)
})
