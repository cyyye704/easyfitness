import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { loadRecords, saveRecords } from '../src/storage.ts'

const STORAGE_KEY = 'easyfitness.records.v1'
const originalLocalStorage = globalThis.localStorage

class MemoryStorage implements Storage {
  #data = new Map<string, string>()

  get length() {
    return this.#data.size
  }

  clear() {
    this.#data.clear()
  }

  getItem(key: string) {
    return this.#data.get(key) ?? null
  }

  key(index: number) {
    return [...this.#data.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.#data.delete(key)
  }

  setItem(key: string, value: string) {
    this.#data.set(key, value)
  }
}

afterEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: originalLocalStorage,
  })
})

test('loadRecords keeps valid records when another food entry is malformed', () => {
  const storage = new MemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  })
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 1,
      records: {
        '2026-07-17': {
          date: 'wrong-date-is-ignored',
          weightKg: 70,
          sleepHours: 8,
          training: '力量训练',
          foods: [
            { id: 'valid', name: '鸡胸肉', calories: 165, protein: 31 },
            null,
          ],
        },
        invalid: null,
      },
    }),
  )

  const result = loadRecords()

  assert.equal(result.records['2026-07-17'].date, '2026-07-17')
  assert.equal(result.records['2026-07-17'].foods.length, 1)
  assert.deepEqual(result.records['2026-07-17'].unestimatedMeals, [])
  assert.match(result.warning ?? '', /部分本地记录格式异常/)
})

test('loadRecords keeps valid unestimated meals and supports legacy records', () => {
  const storage = new MemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  })
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 1,
      records: {
        '2026-07-16': {
          weightKg: null,
          sleepHours: null,
          training: '',
          foods: [],
        },
        '2026-07-17': {
          weightKg: null,
          sleepHours: null,
          training: '',
          foods: [],
          unestimatedMeals: [
            {
              id: 'meal-1',
              description: '海底捞聚餐，消费约 500 元',
              reason: '菜品不详，不计入营养汇总',
            },
          ],
        },
      },
    }),
  )

  const result = loadRecords()

  assert.deepEqual(result.records['2026-07-16'].unestimatedMeals, [])
  assert.equal(result.records['2026-07-17'].unestimatedMeals[0].id, 'meal-1')
  assert.equal(result.warning, null)
})

test('loadRecords leaves unreadable source data untouched', () => {
  const storage = new MemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  })
  storage.setItem(STORAGE_KEY, '{invalid json')

  const result = loadRecords()

  assert.deepEqual(result.records, {})
  assert.match(result.warning ?? '', /无法读取/)
  assert.equal(storage.getItem(STORAGE_KEY), '{invalid json')
})

test('saveRecords reports storage failures without throwing', () => {
  const storage = new MemoryStorage()
  storage.setItem = () => {
    throw new DOMException('Quota exceeded', 'QuotaExceededError')
  }
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  })

  const result = saveRecords({})

  assert.equal(result.ok, false)
  assert.match(result.error ?? '', /本地保存失败/)
})
