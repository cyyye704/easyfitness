import type { UserProfile } from '../profile/types.js'
import type { DailyRecord } from '../types.js'

export type Versioned<T> = {
  data: T
  revision: number
}

export type WorkspaceSnapshot = {
  records: Record<string, Versioned<DailyRecord>>
  profile: Versioned<UserProfile> | null
}

export type DataRepository = {
  mode: 'local' | 'cloud'
  load: (signal?: AbortSignal) => Promise<WorkspaceSnapshot>
  saveRecord: (
    record: DailyRecord,
    expectedRevision: number | null,
    signal?: AbortSignal,
  ) => Promise<Versioned<DailyRecord>>
  saveProfile: (
    profile: UserProfile,
    expectedRevision: number | null,
    signal?: AbortSignal,
  ) => Promise<Versioned<UserProfile>>
  deleteProfile: (expectedRevision: number, signal?: AbortSignal) => Promise<void>
}

export type CloudDataErrorKind = 'conflict' | 'auth' | 'network' | 'invalid' | 'unknown'

const errorMessages: Record<CloudDataErrorKind, string> = {
  conflict: '云端记录已被更新，请重新加载后再决定是否覆盖。',
  auth: '登录状态已失效或无权访问，请重新登录。',
  network: '无法连接云端，修改尚未保存，请检查网络后重试。',
  invalid: '记录格式不正确，未写入云端，请检查数据后重试。',
  unknown: '云端操作暂时失败，请稍后重试。',
}

export class CloudDataError extends Error {
  kind: CloudDataErrorKind

  constructor(kind: CloudDataErrorKind, message = errorMessages[kind]) {
    super(message)
    this.name = 'CloudDataError'
    this.kind = kind
  }
}
