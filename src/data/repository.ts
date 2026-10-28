import type { SupabaseClient } from '@supabase/supabase-js'
import { CloudDataError } from './types.js'
import type { DataRepository, WorkspaceSnapshot } from './types.js'
import {
  isObject,
  parseCloudProfileRow,
  parseCloudRecordRow,
  parseDailyRecord,
  parseUserProfile,
  validateRevision,
} from './validation.js'

export { CloudDataError } from './types.js'

type QueryResult = { data: unknown; error: unknown; status: number }
type Query = PromiseLike<QueryResult> & {
  abortSignal: (signal: AbortSignal) => PromiseLike<QueryResult>
}

const translateError = (error: unknown, status = 0) => {
  if (error instanceof CloudDataError) {
    return error
  }
  const code = isObject(error) && typeof error.code === 'string' ? error.code : ''
  if (code === '23505') {
    return new CloudDataError('conflict')
  }
  if (status === 401 || status === 403 || code === '42501' || /^PGRST30[123]$/.test(code)) {
    return new CloudDataError('auth')
  }
  if (status === 0) {
    return new CloudDataError('network')
  }
  if (code.startsWith('22') || code.startsWith('23')) {
    return new CloudDataError('invalid')
  }
  return new CloudDataError('unknown')
}

const execute = async (query: Query, signal?: AbortSignal) => {
  signal?.throwIfAborted()
  try {
    const result = await (signal ? query.abortSignal(signal) : query)
    signal?.throwIfAborted()
    if (result.error) {
      throw translateError(result.error, result.status)
    }
    return result.data
  } catch (error) {
    signal?.throwIfAborted()
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }
    throw translateError(error)
  }
}

const rowsFrom = (value: unknown) => {
  if (!Array.isArray(value)) {
    throw new CloudDataError('invalid', '云端返回的记录格式无法识别，请稍后重试。')
  }
  return value as unknown[]
}

const oneChangedRow = (value: unknown) => {
  const rows = rowsFrom(value)
  if (rows.length === 0) {
    throw new CloudDataError('conflict')
  }
  if (rows.length !== 1) {
    throw new CloudDataError('invalid')
  }
  return rows[0]
}

export const createCloudRepository = (
  client: SupabaseClient,
  userId: string,
): DataRepository => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    throw new CloudDataError('auth')
  }

  const loadRecords = async (signal?: AbortSignal) => {
    const records: WorkspaceSnapshot['records'] = {}
    let lastDate: string | null = null
    // Continue until an empty page, including when the server caps pages below 500.
    while (true) {
      let query = client.from('daily_records')
        .select('user_id,date,data,revision')
        .eq('user_id', userId)
        .order('date', { ascending: true })
        .limit(500)
      if (lastDate !== null) {
        query = query.gt('date', lastDate)
      }
      const rows = rowsFrom(await execute(query, signal))
      if (rows.length === 0) {
        return records
      }
      for (const row of rows) {
        const record = parseCloudRecordRow(row, userId)
        if (lastDate !== null && record.data.date <= lastDate) {
          throw new CloudDataError('invalid', '云端历史记录顺序异常，请重新加载。')
        }
        records[record.data.date] = record
        lastDate = record.data.date
      }
    }
  }

  return {
    mode: 'cloud',
    async load(signal) {
      const [records, profileRows] = await Promise.all([
        loadRecords(signal),
        execute(client.from('user_profiles').select('user_id,data,revision').eq('user_id', userId), signal),
      ])
      const profiles = rowsFrom(profileRows)
      if (profiles.length > 1) {
        throw new CloudDataError('invalid')
      }
      return {
        records,
        profile: profiles.length === 1 ? parseCloudProfileRow(profiles[0], userId) : null,
      }
    },
    async saveRecord(record, expectedRevision, signal) {
      const data = parseDailyRecord(record)
      if (expectedRevision !== null) {
        validateRevision(expectedRevision)
      }
      const query = expectedRevision === null
        ? client.from('daily_records').insert({ user_id: userId, date: data.date, data })
        : client.from('daily_records').update({ data })
          .eq('user_id', userId).eq('date', data.date).eq('revision', expectedRevision)
      const row = oneChangedRow(await execute(query.select('user_id,date,data,revision'), signal))
      const saved = parseCloudRecordRow(row, userId)
      if (saved.data.date !== data.date) {
        throw new CloudDataError('invalid')
      }
      return saved
    },
    async saveProfile(profile, expectedRevision, signal) {
      const data = parseUserProfile(profile)
      if (expectedRevision !== null) {
        validateRevision(expectedRevision)
      }
      const query = expectedRevision === null
        ? client.from('user_profiles').insert({ user_id: userId, data })
        : client.from('user_profiles').update({ data })
          .eq('user_id', userId).eq('revision', expectedRevision)
      const row = oneChangedRow(await execute(query.select('user_id,data,revision'), signal))
      return parseCloudProfileRow(row, userId)
    },
    async deleteProfile(expectedRevision, signal) {
      validateRevision(expectedRevision)
      const data = await execute(
        client.from('user_profiles').delete()
          .eq('user_id', userId).eq('revision', expectedRevision)
          .select('user_id,revision'),
        signal,
      )
      const deleted = oneChangedRow(data)
      if (!isObject(deleted) || deleted.user_id !== userId || deleted.revision !== expectedRevision) {
        throw new CloudDataError('invalid')
      }
    },
  }
}
