import type { DailyRecord } from '../types.js'
import type { UserProfile } from '../profile/types.js'
import { CloudDataError, type DataRepository, type WorkspaceSnapshot } from './types.js'
import type { getImportWrites } from './importPlan.js'

export type WorkspaceState = {
  records: Record<string, DailyRecord>
  profile: UserProfile | null
  loading: boolean
  loadError: string | null
  saveError: string | null
  conflict: boolean
  pending: number
  saving: boolean
  busy: boolean
  warning: string | null
}

const message = (error: unknown) => error instanceof Error ? error.message : '保存失败，请重试。'

// One store per mounted account. Revisions are updated only after acknowledged writes.
// Edits made while a request is in flight remain queued, never replaced by its response.
export class WorkspaceStore {
  private repository: DataRepository
  private delay: number
  private state: WorkspaceState = {
    records: {}, profile: null, loading: true, loadError: null,
    saveError: null, conflict: false, pending: 0, saving: false, busy: false, warning: null,
  }
  private cloud: WorkspaceSnapshot = { records: {}, profile: null }
  private listeners = new Set<() => void>()
  private pending = new Map<string, DailyRecord>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private controller = new AbortController()
  private active = false
  private generation = 0
  private running = false

  constructor(repository: DataRepository, delay = repository.mode === 'cloud' ? 600 : 0) {
    this.repository = repository
    this.delay = delay
  }

  getSnapshot = () => this.state
  getCloudSnapshot = () => this.cloud
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  private emit(patch: Partial<WorkspaceState>) {
    if (!this.active) return
    this.state = { ...this.state, ...patch, pending: this.pending.size }
    this.listeners.forEach((listener) => listener())
  }
  start = () => {
    this.active = true
    this.controller = new AbortController()
    void this.reload()
  }
  stop = () => {
    this.active = false
    this.generation += 1
    this.controller.abort()
    clearTimeout(this.timer)
  }
  resume = () => {
    this.active = true
    this.controller = new AbortController()
    this.running = false
    this.emit({ saving: false, busy: false })
    if (this.state.loading) { void this.reload(); return }
    if (this.pending.size && !this.state.saveError) void this.flush()
  }
  reload = async () => {
    if (this.running || this.state.busy) return
    const generation = ++this.generation
    this.controller.abort()
    this.controller = new AbortController()
    this.pending.clear()
    clearTimeout(this.timer)
    this.emit({ loading: true, loadError: null, saveError: null, conflict: false })
    try {
      const snapshot = await this.repository.load(this.controller.signal)
      if (!this.active || generation !== this.generation) return
      this.cloud = snapshot
      const warning = 'warning' in this.repository && typeof this.repository.warning === 'string'
        ? this.repository.warning : null
      this.emit({
        records: Object.fromEntries(Object.entries(snapshot.records).map(([date, item]) => [date, item.data])),
        profile: snapshot.profile?.data ?? null, loading: false, warning,
      })
    } catch (error) {
      if (this.active && generation === this.generation) {
        this.emit({ loading: false, loadError: message(error) })
      }
    }
  }
  updateRecord = (record: DailyRecord) => {
    if (!this.active || this.state.loading || this.state.loadError || this.state.busy) return
    this.pending.set(record.date, record)
    this.emit({ records: { ...this.state.records, [record.date]: record } })
    clearTimeout(this.timer)
    if (!this.state.saveError) this.timer = setTimeout(() => { void this.flush() }, this.delay)
  }
  flush = async () => {
    if (!this.active || this.running || this.state.busy || this.state.conflict) return
    clearTimeout(this.timer)
    this.running = true
    const generation = this.generation
    this.emit({ saving: true, saveError: null })
    try {
      while (this.pending.size && this.active && generation === this.generation) {
        const [date, record] = this.pending.entries().next().value!
        const saved = await this.repository.saveRecord(
          record, this.cloud.records[date]?.revision ?? null, this.controller.signal,
        )
        if (!this.active || generation !== this.generation) return
        this.cloud = { ...this.cloud, records: { ...this.cloud.records, [date]: saved } }
        if (this.pending.get(date) === record) this.pending.delete(date)
        this.emit({})
      }
    } catch (error) {
      if (this.active && generation === this.generation) {
        this.emit({ saveError: message(error), conflict: error instanceof CloudDataError && error.kind === 'conflict' })
      }
    } finally {
      if (generation === this.generation) {
        this.running = false
        this.emit({ saving: false })
      }
    }
  }
  // Only invoked after the user explicitly chooses their current edits over cloud values.
  overwritePending = async () => {
    if (!this.active || this.running || this.state.busy) return
    const generation = this.generation
    this.emit({ busy: true })
    try {
      const latest = await this.repository.load(this.controller.signal)
      if (!this.active || generation !== this.generation) return
      // Resolving daily-record conflicts must not reset an open profile editor.
      this.cloud = { ...latest, profile: this.cloud.profile }
      this.emit({
        records: {
          ...Object.fromEntries(Object.entries(latest.records).map(([date, item]) => [date, item.data])),
          ...Object.fromEntries(this.pending),
        },
        conflict: false, saveError: null, busy: false,
      })
      await this.flush()
    } catch (error) {
      if (generation === this.generation) this.emit({ saveError: message(error), busy: false })
    }
  }
  saveProfile = async (profile: UserProfile): Promise<string | null> => {
    if (this.state.loading || this.state.loadError) return '请先成功加载记录，再保存档案。'
    if (!this.active || this.state.busy) return '正在保存，请稍候。'
    this.emit({ busy: true })
    const generation = this.generation
    try {
      const saved = await this.repository.saveProfile(profile, this.cloud.profile?.revision ?? null, this.controller.signal)
      if (!this.active || generation !== this.generation) return '账号已切换，本次操作已停止。'
      this.cloud = { ...this.cloud, profile: saved }
      this.emit({ profile: saved.data })
      return null
    } catch (error) {
      return message(error)
    } finally {
      if (generation === this.generation) {
        this.emit({ busy: false })
        if (this.pending.size && !this.state.saveError) void this.flush()
      }
    }
  }
  deleteProfile = async (): Promise<string | null> => {
    if (this.state.loading || this.state.loadError) return '请先成功加载记录，再清除档案。'
    if (!this.active || this.state.busy) return '正在保存，请稍候。'
    if (!this.cloud.profile) return null
    this.emit({ busy: true })
    const generation = this.generation
    try {
      await this.repository.deleteProfile(this.cloud.profile.revision, this.controller.signal)
      if (!this.active || generation !== this.generation) return '账号已切换，本次操作已停止。'
      this.cloud = { ...this.cloud, profile: null }
      this.emit({ profile: null })
      return null
    } catch (error) {
      return message(error)
    } finally {
      if (generation === this.generation) {
        this.emit({ busy: false })
        if (this.pending.size && !this.state.saveError) void this.flush()
      }
    }
  }
  importData = async (writes: ReturnType<typeof getImportWrites>): Promise<string | null> => {
    if (this.state.loading || this.state.loadError) return '请先成功加载记录，再导入本机记录。'
    if (!this.active || this.pending.size || this.state.busy) return '请先保存当前修改，再导入本机记录。'
    this.emit({ busy: true })
    const generation = this.generation
    try {
      for (const { record, expectedRevision } of writes.records) {
        if (!this.active || generation !== this.generation) return '账号已切换，导入已停止。'
        const saved = await this.repository.saveRecord(record, expectedRevision, this.controller.signal)
        if (!this.active || generation !== this.generation) return '账号已切换，导入已停止。'
        this.cloud = { ...this.cloud, records: { ...this.cloud.records, [record.date]: saved } }
        this.emit({ records: { ...this.state.records, [record.date]: saved.data } })
      }
      if (writes.profile) {
        if (!this.active || generation !== this.generation) return '账号已切换，导入已停止。'
        const saved = await this.repository.saveProfile(writes.profile.profile, writes.profile.expectedRevision, this.controller.signal)
        if (!this.active || generation !== this.generation) return '账号已切换，导入已停止。'
        this.cloud = { ...this.cloud, profile: saved }
        this.emit({ profile: saved.data })
      }
      return null
    } catch (error) {
      return `${message(error)} 已成功导入的部分会保留，本机原数据未删除。`
    } finally {
      if (generation === this.generation) this.emit({ busy: false })
    }
  }
}
