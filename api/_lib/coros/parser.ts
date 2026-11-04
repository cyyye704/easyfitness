import type { CorosDailyData } from '../../../src/types.js'
import { isDateKey } from '../../../src/utils.js'

type Metric = 'sleep' | 'calories'
type MetricResult = { values: Map<string, number>; warnings: string[] }

const metricLabel = (metric: Metric) => metric === 'sleep' ? '睡眠时长' : '活动热量'
const clean = (text: string) => text.trim().replace(/\*\*/g, '').replace(/^#{1,6}\s+/, '')

// COROS documents Daily Sleep as h/min and includes naps, on the wake-up date:
// https://github.com/coroslab/COROS-MCP/blob/main/docs/en/tools.md#querysleepoverview
// No machine-readable daily-calorie schema is published. Accept only an explicit
// active-calorie label and kcal unit; never guess the units of raw JSON numbers or
// reinterpret a generic Calories / Total Calories field as active calories.
const isLabel = (label: string, metric: Metric) => metric === 'sleep'
  ? /^(?:Daily Sleep|每日睡眠|全天睡眠)$/i.test(label)
  : /^(?:Active Calories|活动热量|活动卡路里)(?:\s*[（(]kcal[）)])?$/i.test(label)

const parseValue = (text: string, metric: Metric, label: string): number | null => {
  if (metric === 'calories') {
    const value = /^([0-9]+(?:\.[0-9]+)?)\s*(kcal|千卡)$/i.exec(text)
      ?? (/[(（]kcal[)）]/i.test(label) ? /^([0-9]+(?:\.[0-9]+)?)$/.exec(text) : null)
    if (!value) return null
    const calories = Number(value[1])
    return Number.isFinite(calories) && calories <= 30_000 ? calories : null
  }

  const duration = text.replace(/\s*(?:\(incl\. naps\)|（含小睡）|\(含小睡\))$/i, '').trim()
  const match = /^(?:(\d+)\s*(?:h|小时)\s*)?(?:(\d+)\s*(?:min|分钟))?$/i.exec(duration)
  if (!match || (match[1] === undefined && match[2] === undefined)) return null
  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2] ?? 0)
  if ((match[1] !== undefined && minutes >= 60) || hours * 60 + minutes > 1_440) return null
  return Math.round((hours + minutes / 60) * 100) / 100
}

const recentDate = (date: string, now: Date) => {
  if (!isDateKey(date)) return false
  // The COROS account timezone can differ from this server's UTC date. Keep the
  // account's date unchanged, with a one-day tolerance at either UTC boundary.
  const day = Date.parse(`${date}T00:00:00Z`)
  const utcToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return day >= utcToday - 7 * 86_400_000 && day <= utcToday + 86_400_000
}

const textContent = (result: unknown): string[] | null => {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null
  if ('isError' in result && result.isError === true) return null
  if (!('content' in result) || !Array.isArray(result.content)) return null
  const texts = result.content.flatMap((block: unknown) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) return []
    return 'type' in block && block.type === 'text' && 'text' in block && typeof block.text === 'string'
      ? [block.text] : []
  })
  return texts.length ? texts : null
}

export const parseCorosMetric = (result: unknown, metric: Metric, now = new Date()): MetricResult => {
  const values = new Map<string, number>()
  const rejected = new Set<string>()
  const warnings = new Set<string>()
  const texts = textContent(result)
  const label = metricLabel(metric)
  if (texts === null) return { values, warnings: [`COROS 未返回可识别的${label}，本次不会填入该项。`] }

  const add = (date: string | null, raw: string, fieldLabel: string) => {
    if (!date || !recentDate(date, now)) {
      warnings.add(`部分${label}缺少有效的最近日期，已跳过。`)
      return
    }
    const value = parseValue(raw.trim(), metric, fieldLabel)
    if (value === null) {
      rejected.add(date)
      values.delete(date)
      warnings.add(`部分${label}的单位或数值无法确认，已跳过。`)
      return
    }
    if (rejected.has(date)) return
    if (values.has(date) && values.get(date) !== value) {
      values.delete(date)
      rejected.add(date)
      warnings.add(`COROS 返回了同一天不同的${label}，已跳过冲突数据。`)
    } else values.set(date, value)
  }

  for (const text of texts) {
    // Text blocks are independent: a new block cannot inherit another date.
    let date: string | null = null
    let table: { date: number; value: number; label: string; width: number } | null = null
    for (const rawLine of text.split(/\r?\n/)) {
      const line = clean(rawLine)
      if (line.includes('|')) {
        const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(clean)
        const dateIndex = cells.findIndex((cell) => /^(?:Date|日期)$/i.test(cell))
        const valueIndex = cells.findIndex((cell) => isLabel(cell, metric))
        if (dateIndex >= 0) {
          table = valueIndex >= 0 ? { date: dateIndex, value: valueIndex, label: cells[valueIndex], width: cells.length } : null
          date = null
          continue
        }
        if (table && cells.every((cell) => /^:?-+:?$/.test(cell))) continue
        if (table && cells.length === table.width) {
          add(cells[table.date], cells[table.value], table.label)
          continue
        }
      } else table = null

      const dateHeading = /^(?:(?:Date|日期)\s*[:：]\s*)?(\d{4}-\d{2}-\d{2})\s*[:：]?$/.exec(line)
      if (dateHeading) {
        date = dateHeading[1]
        continue
      }
      if (/^(?:Date|日期)\s*[:：]|^\d{4}[-/]/i.test(line)) {
        // An unsupported date format must not inherit the preceding day's date.
        date = null
        table = null
        warnings.add(`部分${label}的日期格式无法确认，已跳过。`)
        continue
      }
      // Only exact labels are interpreted. Other health data is discarded and is
      // never returned to the browser, logged, or persisted by this module.
      for (const segment of line.split('|')) {
        const field = /^([^:：]+)\s*[:：]\s*(.*)$/.exec(clean(segment))
        if (field && isLabel(field[1].trim(), metric)) add(date, field[2], field[1].trim())
      }
    }
  }
  if (values.size === 0) warnings.add(`COROS 未返回可识别的${label}；可能暂无数据或返回格式暂不支持，本次不会填入该项。`)
  return { values, warnings: [...warnings] }
}

export const parseCorosPreview = (
  dailyHealthResult: unknown,
  sleepResult: unknown,
  now = new Date(),
): { days: CorosDailyData[]; warnings: string[] } => {
  const calories = parseCorosMetric(dailyHealthResult, 'calories', now)
  const sleep = parseCorosMetric(sleepResult, 'sleep', now)
  const dates = [...new Set([...calories.values.keys(), ...sleep.values.keys()])].sort().reverse()
  if (dates.length > 7) {
    return { days: [], warnings: ['COROS 返回的日期超出最近 7 天范围，本次数据未导入。'] }
  }
  return {
    days: dates.map((sourceDate) => ({
      sourceDate,
      sleepHours: sleep.values.get(sourceDate) ?? null,
      activeCaloriesKcal: calories.values.get(sourceDate) ?? null,
      syncedAt: now.toISOString(),
    })),
    warnings: [...new Set([...calories.warnings, ...sleep.warnings])],
  }
}
