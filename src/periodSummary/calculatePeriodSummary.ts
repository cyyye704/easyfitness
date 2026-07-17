import type { DailyRecord } from '../types.js'
import {
  hasRecordContent,
  isDateKey,
  roundToOneDecimal,
  summarizeNutrition,
} from '../utils.js'
import type { PeriodSummaryMetrics } from './types.js'

const DAY_MS = 24 * 60 * 60 * 1000
export const MAX_PERIOD_DAYS = 90

const dateKeyToTime = (date: string) => Date.parse(`${date}T00:00:00Z`)

export const shiftDateKey = (date: string, dayOffset: number) => {
  if (!isDateKey(date) || !Number.isInteger(dayOffset)) {
    return date
  }
  return new Date(dateKeyToTime(date) + dayOffset * DAY_MS)
    .toISOString()
    .slice(0, 10)
}

export const countPeriodDays = (startDate: string, endDate: string) => {
  if (!isDateKey(startDate) || !isDateKey(endDate)) {
    return 0
  }
  return Math.floor((dateKeyToTime(endDate) - dateKeyToTime(startDate)) / DAY_MS) + 1
}

export const getPeriodRangeError = (startDate: string, endDate: string) => {
  if (!isDateKey(startDate) || !isDateKey(endDate)) {
    return '请选择有效的开始和结束日期。'
  }
  const totalDays = countPeriodDays(startDate, endDate)
  if (totalDays < 1) {
    return '结束日期不能早于开始日期。'
  }
  if (totalDays > MAX_PERIOD_DAYS) {
    return `阶段总结最多支持 ${MAX_PERIOD_DAYS} 天。`
  }
  return null
}

const average = (values: number[]) =>
  values.reduce((total, value) => total + value, 0) / values.length

const nullableAverage = (values: number[]) =>
  values.length > 0 ? roundToOneDecimal(average(values)) : null

export const calculatePeriodSummary = (
  records: Record<string, DailyRecord>,
  startDate: string,
  endDate: string,
): PeriodSummaryMetrics | null => {
  if (getPeriodRangeError(startDate, endDate)) {
    return null
  }

  const totalDays = countPeriodDays(startDate, endDate)
  const selectedRecords = Object.values(records)
    .filter(
      (record) =>
        isDateKey(record.date) &&
        record.date >= startDate &&
        record.date <= endDate &&
        hasRecordContent(record),
    )
    .sort((first, second) => first.date.localeCompare(second.date))

  const weightReadings = selectedRecords.flatMap((record) =>
    record.weightKg === null ? [] : [record.weightKg],
  )
  let weightStart: number | null = null
  let weightEnd: number | null = null
  let weightMethod: PeriodSummaryMetrics['weight']['method'] = 'insufficient'

  if (weightReadings.length >= 6) {
    weightStart = roundToOneDecimal(average(weightReadings.slice(0, 3)))
    weightEnd = roundToOneDecimal(average(weightReadings.slice(-3)))
    weightMethod = 'three-point-average'
  } else if (weightReadings.length >= 2) {
    weightStart = roundToOneDecimal(weightReadings[0])
    weightEnd = roundToOneDecimal(weightReadings.at(-1) as number)
    weightMethod = 'endpoints'
  }

  const nutritionRecords = selectedRecords.filter((record) => record.foods.length > 0)
  const nutritionSummaries = nutritionRecords.map((record) =>
    summarizeNutrition(record.foods),
  )
  const sleepHours = selectedRecords.flatMap((record) =>
    record.sleepHours === null ? [] : [record.sleepHours],
  )
  const unestimatedMealCount = selectedRecords.reduce(
    (total, record) => total + record.unestimatedMeals.length,
    0,
  )
  const daysWithUnestimatedMeals = selectedRecords.filter(
    (record) => record.unestimatedMeals.length > 0,
  ).length

  const limitations: string[] = []
  if (selectedRecords.length === 0) {
    limitations.push('该周期还没有任何有效记录。')
  } else if (selectedRecords.length < totalDays) {
    limitations.push(
      `${totalDays} 天中有 ${selectedRecords.length} 天存在记录，未记录日期不能按零计算。`,
    )
  }
  if (weightReadings.length < 2) {
    limitations.push('体重记录少于 2 次，暂时无法判断阶段变化。')
  } else if (weightReadings.length < 6) {
    limitations.push('体重样本较少，当前变化基于最早值和最新值。')
  }
  if (nutritionRecords.length === 0) {
    limitations.push('该周期没有可计算的饮食记录。')
  } else {
    limitations.push(
      `营养均值只基于 ${nutritionRecords.length} 个有可计算饮食的日期，不能代表未记录部分。`,
    )
  }
  if (unestimatedMealCount > 0) {
    limitations.push(
      `共有 ${unestimatedMealCount} 条未估算饮食，未计入热量和蛋白质均值。`,
    )
  }
  if (sleepHours.length < selectedRecords.length && selectedRecords.length > 0) {
    limitations.push(`睡眠数据覆盖 ${sleepHours.length} 个记录日期。`)
  }

  return {
    range: { startDate, endDate, totalDays },
    coverage: { recordedDays: selectedRecords.length },
    weight: {
      readingCount: weightReadings.length,
      startKg: weightStart,
      endKg: weightEnd,
      changeKg:
        weightStart === null || weightEnd === null
          ? null
          : roundToOneDecimal(weightEnd - weightStart),
      method: weightMethod,
    },
    nutrition: {
      recordedDays: nutritionRecords.length,
      averageCalories:
        nutritionSummaries.length > 0
          ? Math.round(average(nutritionSummaries.map((item) => item.totalCalories)))
          : null,
      averageProtein: nullableAverage(
        nutritionSummaries.map((item) => item.totalProtein),
      ),
      unestimatedMealCount,
      daysWithUnestimatedMeals,
    },
    training: {
      days: selectedRecords.filter((record) => record.training.trim()).length,
    },
    sleep: {
      recordedDays: sleepHours.length,
      averageHours: nullableAverage(sleepHours),
      atLeastSevenHoursDays: sleepHours.filter((hours) => hours >= 7).length,
      underSixHoursDays: sleepHours.filter((hours) => hours < 6).length,
    },
    limitations: limitations.slice(0, 6),
  }
}
