import type { UserProfile } from '../profile/types.js'
import type { DailyRecord } from '../types.js'
import type { Versioned, WorkspaceSnapshot } from './types.js'
import { parseDailyRecord, parseUserProfile } from './validation.js'

export type ImportStatus = 'missing' | 'same' | 'conflict'
type ImportItem<T> = { status: ImportStatus; local: T; cloud: Versioned<T> | null }

export type ImportPlan = {
  records: (ImportItem<DailyRecord> & { date: string })[]
  profile: ImportItem<UserProfile> | null
}

// Compare JSON data independently of object key insertion order; array order is meaningful.
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const classify = <T>(local: T, cloud: Versioned<T> | null): ImportItem<T> => ({
  local,
  cloud,
  status: cloud === null
    ? 'missing'
    : canonicalJson(local) === canonicalJson(cloud.data) ? 'same' : 'conflict',
})

export const buildImportPlan = (
  localRecords: Record<string, DailyRecord>,
  localProfile: UserProfile | null,
  cloud: WorkspaceSnapshot,
): ImportPlan => ({
  records: Object.entries(localRecords)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([date, value]) => ({
      date,
      ...classify(parseDailyRecord(value, date), cloud.records[date] ?? null),
    })),
  profile: localProfile === null
    ? null
    : classify(parseUserProfile(localProfile), cloud.profile),
})

export const getImportWrites = (
  plan: ImportPlan,
  overwrite: { recordDates?: readonly string[]; profile?: boolean } = {},
) => {
  const selected = new Set(overwrite.recordDates ?? [])
  const records = plan.records
    .filter((item) => item.status === 'missing' || (item.status === 'conflict' && selected.has(item.date)))
    .map((item) => ({ record: item.local, expectedRevision: item.cloud?.revision ?? null }))
  const profile = plan.profile &&
    (plan.profile.status === 'missing' || (plan.profile.status === 'conflict' && overwrite.profile === true))
    ? { profile: plan.profile.local, expectedRevision: plan.profile.cloud?.revision ?? null }
    : null
  return { records, profile }
}
