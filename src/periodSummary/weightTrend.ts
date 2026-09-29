import type { DailyRecord } from '../types.ts'
import { isDateKey, roundToOneDecimal } from '../utils.ts'
import { countPeriodDays, getPeriodRangeError, shiftDateKey } from './calculatePeriodSummary.ts'

export type WeightPoint = { date: string; weightKg: number | null; averageKg: number | null; sampleCount: number }

export const calculateWeightTrend = (records: Record<string, DailyRecord>, startDate: string, endDate: string): WeightPoint[] => {
  if (getPeriodRangeError(startDate, endDate)) return []
  const readings = new Map(Object.values(records).flatMap((record) =>
    isDateKey(record.date) && record.weightKg !== null && Number.isFinite(record.weightKg) && record.weightKg > 0
      ? [[record.date, record.weightKg] as const] : [],
  ))
  return Array.from({ length: countPeriodDays(startDate, endDate) }, (_, index) => {
    const date = shiftDateKey(startDate, index)
    const samples = Array.from({ length: 7 }, (_, offset) => readings.get(shiftDateKey(date, -offset)))
      .filter((weight): weight is number => weight !== undefined)
    return { date, weightKg: readings.get(date) ?? null, sampleCount: samples.length,
      averageKg: samples.length ? roundToOneDecimal(samples.reduce((sum, weight) => sum + weight, 0) / samples.length) : null }
  })
}
