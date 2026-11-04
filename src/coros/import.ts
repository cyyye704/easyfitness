import { parseCorosDailyData } from '../data/validation.js'
import type { CorosDailyData, DailyRecord } from '../types.js'
import { createEmptyRecord } from '../utils.js'
import type { CorosImportChoice } from './types.js'

export const sameCorosData = (left?: CorosDailyData, right?: CorosDailyData) =>
  left?.sourceDate === right?.sourceDate && left?.sleepHours === right?.sleepHours &&
  left?.activeCaloriesKcal === right?.activeCaloriesKcal && left?.syncedAt === right?.syncedAt

export const corosAlreadyRecorded = (record: DailyRecord | undefined, day: CorosDailyData) =>
  Boolean(record?.coros &&
    (day.sleepHours === null || (record.coros.sleepHours === day.sleepHours && record.sleepHours === day.sleepHours)) &&
    (day.activeCaloriesKcal === null || record.coros.activeCaloriesKcal === day.activeCaloriesKcal))

export const createCorosChoices = (days: CorosDailyData[], records: Record<string, DailyRecord>) =>
  Object.fromEntries(days.map((day) => {
    const record = records[day.sourceDate]
    return [day.sourceDate, {
      // Updating previously imported device data always requires a fresh selection.
      selected: !record?.coros,
      useSleep: record?.sleepHours == null && day.sleepHours !== null,
      expectedSleepHours: record?.sleepHours ?? null,
      expectedCoros: record?.coros,
    } satisfies CorosImportChoice]
  }))

export const buildCorosImport = (
  days: CorosDailyData[],
  records: Record<string, DailyRecord>,
  choices: Record<string, CorosImportChoice>,
): DailyRecord[] => {
  const dates = new Set<string>()
  return days.flatMap((candidate) => {
    const day = parseCorosDailyData(candidate, candidate.sourceDate)
    if (dates.has(day.sourceDate)) throw new Error('COROS 日期重复，请重新读取。')
    dates.add(day.sourceDate)
    const choice = choices[day.sourceDate]
    if (!choice?.selected) return []
    const current = records[day.sourceDate] ?? createEmptyRecord(day.sourceDate)
    if (current.sleepHours !== choice.expectedSleepHours || !sameCorosData(current.coros, choice.expectedCoros)) {
      throw new Error(`${day.sourceDate} 的睡眠或设备记录在预览后发生变化，请重新读取后确认。`)
    }
    const coros: CorosDailyData = {
      ...day,
      sleepHours: day.sleepHours ?? current.coros?.sleepHours ?? null,
      activeCaloriesKcal: day.activeCaloriesKcal ?? current.coros?.activeCaloriesKcal ?? null,
    }
    return [{ ...current, coros,
      sleepHours: choice.useSleep && day.sleepHours !== null ? day.sleepHours : current.sleepHours }]
  })
}

export const formatCorosSleep = (hours: number | null) => {
  if (hours === null) return '未返回'
  const minutes = Math.round(hours * 60)
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`
}
