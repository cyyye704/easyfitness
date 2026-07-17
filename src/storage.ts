import type { DailyRecord } from './types'
import { createEmptyRecord, isDateKey, roundToOneDecimal } from './utils.ts'

const STORAGE_KEY = 'easyfitness.records.v1'

type StoredRecords = {
  version: 1
  records: Record<string, DailyRecord>
}

export type LoadRecordsResult = {
  records: Record<string, DailyRecord>
  warning: string | null
}

export type SaveRecordsResult = {
  ok: boolean
  error: string | null
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object'

const normalizeNullableNumber = (
  value: unknown,
  minimum: number,
  maximum = Number.POSITIVE_INFINITY,
) => {
  if (value === null || value === '') {
    return null
  }

  const number = Number(value)
  return Number.isFinite(number) && number >= minimum && number <= maximum
    ? number
    : null
}

export const loadRecords = (): LoadRecordsResult => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return { records: {}, warning: null }
    }

    const parsed: unknown = JSON.parse(raw)

    if (
      !isObject(parsed) ||
      parsed.version !== 1 ||
      !isObject(parsed.records)
    ) {
      return {
        records: {},
        warning: '本地记录格式或版本无法识别，原数据未被自动覆盖。',
      }
    }

    const records: Record<string, DailyRecord> = {}
    let ignoredInvalidContent = false

    Object.entries(parsed.records).forEach(([date, value]) => {
      if (!isDateKey(date) || !isObject(value)) {
        ignoredInvalidContent = true
        return
      }

      const foods = Array.isArray(value.foods)
        ? value.foods.flatMap((food, index) => {
            if (!isObject(food)) {
              ignoredInvalidContent = true
              return []
            }

            const name = typeof food.name === 'string' ? food.name.trim() : ''
            const calories = normalizeNullableNumber(food.calories, 0)
            const protein = normalizeNullableNumber(food.protein, 0)

            if (!name || calories === null || protein === null) {
              ignoredInvalidContent = true
              return []
            }

            return [
              {
                id:
                  typeof food.id === 'string' && food.id
                    ? food.id
                    : `legacy-${date}-${index}`,
                name,
                calories: Math.round(calories),
                protein: roundToOneDecimal(protein),
              },
            ]
          })
        : []

      if (!Array.isArray(value.foods)) {
        ignoredInvalidContent = true
      }

      const weightKg = normalizeNullableNumber(value.weightKg, 0)
      const sleepHours = normalizeNullableNumber(value.sleepHours, 0, 24)

      if (
        (value.weightKg !== null && weightKg === null) ||
        (value.sleepHours !== null && sleepHours === null)
      ) {
        ignoredInvalidContent = true
      }

      records[date] = {
        ...createEmptyRecord(date),
        weightKg,
        sleepHours,
        training: typeof value.training === 'string' ? value.training : '',
        foods,
      }

      if (typeof value.training !== 'string') {
        ignoredInvalidContent = true
      }
    })

    return {
      records,
      warning: ignoredInvalidContent
        ? '部分本地记录格式异常，已忽略异常内容并保留其他记录。'
        : null,
    }
  } catch {
    return {
      records: {},
      warning: '无法读取本地记录，原数据未被自动覆盖。',
    }
  }
}

export const saveRecords = (
  records: Record<string, DailyRecord>,
): SaveRecordsResult => {
  try {
    const payload: StoredRecords = {
      version: 1,
      records,
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    return { ok: true, error: null }
  } catch {
    return {
      ok: false,
      error: '本地保存失败，请检查浏览器存储权限或剩余空间。',
    }
  }
}
