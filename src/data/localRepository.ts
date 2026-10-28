import { loadRecords, saveRecords } from '../storage.js'
import { loadProfile, saveProfile, removeProfile } from '../profile/profileStorage.js'
import type { DailyRecord } from '../types.js'
import type { DataRepository } from './types.js'

export const createLocalRepository = (): DataRepository & { warning: string | null } => {
  let records: Record<string, DailyRecord> = {}
  const repository: DataRepository & { warning: string | null } = {
    mode: 'local',
    warning: null,
    async load(signal) {
      signal?.throwIfAborted()
      const loaded = loadRecords()
      const profile = loadProfile()
      records = loaded.records
      repository.warning = loaded.warning ?? profile.warning
      return {
        records: Object.fromEntries(Object.entries(records).map(([date, data]) => [date, { data, revision: 1 }])),
        profile: profile.value ? { data: profile.value, revision: 1 } : null,
      }
    },
    async saveRecord(record, revision, signal) {
      signal?.throwIfAborted()
      const next = { ...records, [record.date]: record }
      const result = saveRecords(next)
      if (!result.ok) throw new Error(result.error ?? '本地保存失败。')
      records = next
      return { data: record, revision: (revision ?? 0) + 1 }
    },
    async saveProfile(profile, revision, signal) {
      signal?.throwIfAborted()
      const result = saveProfile(profile)
      if (!result.ok) throw new Error(result.error ?? '个人档案保存失败。')
      return { data: profile, revision: (revision ?? 0) + 1 }
    },
    async deleteProfile(_revision, signal) {
      signal?.throwIfAborted()
      const result = removeProfile()
      if (!result.ok) throw new Error(result.error ?? '个人档案清除失败。')
    },
  }
  return repository
}
