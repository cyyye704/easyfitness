import type { DailyRecord } from './types'
import { createEmptyRecord } from './utils'

const STORAGE_KEY = 'easyfitness.records.v1'

type StoredRecords = {
  version: 1
  records: Record<string, DailyRecord>
}

const isRecord = (value: unknown): value is DailyRecord => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as DailyRecord
  return (
    typeof record.date === 'string' &&
    Array.isArray(record.foods) &&
    typeof record.training === 'string'
  )
}

export const loadRecords = (): Record<string, DailyRecord> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw) as Partial<StoredRecords>

    if (!parsed.records || typeof parsed.records !== 'object') {
      return {}
    }

    return Object.entries(parsed.records).reduce<Record<string, DailyRecord>>(
      (records, [date, record]) => {
        if (isRecord(record)) {
          records[date] = {
            ...createEmptyRecord(date),
            ...record,
            foods: record.foods.map((food) => ({
              id: String(food.id),
              name: String(food.name),
              calories: Number(food.calories) || 0,
              protein: Number(food.protein) || 0,
            })),
          }
        }

        return records
      },
      {},
    )
  } catch {
    return {}
  }
}

export const saveRecords = (records: Record<string, DailyRecord>) => {
  const payload: StoredRecords = {
    version: 1,
    records,
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}
