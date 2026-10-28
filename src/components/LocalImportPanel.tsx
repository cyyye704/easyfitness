import { useMemo, useState } from 'react'
import { loadRecords } from '../storage'
import { loadProfile } from '../profile/profileStorage'
import { buildImportPlan, getImportWrites } from '../data/importPlan'
import type { WorkspaceStore } from '../data/workspaceStore'

export function LocalImportPanel({ store, onClose }: { store: WorkspaceStore; onClose: () => void }) {
  const [local] = useState(() => ({ records: loadRecords(), profile: loadProfile() }))
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [overwriteProfile, setOverwriteProfile] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const cloud = store.getCloudSnapshot()
  const result = useMemo(() => {
    try {
      return { plan: buildImportPlan(local.records.records, local.profile.value, cloud), error: null }
    } catch {
      return { plan: null, error: '本机旧记录格式无法导入。原数据已保留，请先在本地模式检查记录。' }
    }
  }, [local, cloud])
  const plan = result.plan
  const writes = plan ? getImportWrites(plan, { recordDates: selectedDates, profile: overwriteProfile }) : null
  const count = writes ? writes.records.length + (writes.profile ? 1 : 0) : 0

  return <section className="panel import-panel" aria-labelledby="import-title">
    <h2 id="import-title">导入本机旧记录</h2>
    <p>将此浏览器原本的本地数据复制到当前账号。先确认这些数据属于你；本机原数据会保留。</p>
    <p>默认只导入云端没有的记录。同日内容不同的记录需逐项选择覆盖，不会自动合并食物。</p>
    {local.records.warning && <p role="alert">{local.records.warning}</p>}
    {local.profile.warning && <p role="alert">{local.profile.warning}</p>}
    {result.error && <p role="alert">{result.error}</p>}
    {plan && <>
      <p>本机共 {plan.records.length} 天记录；{plan.records.filter((item) => item.status === 'same').length} 天与云端相同，自动跳过。</p>
      {plan.records.filter((item) => item.status === 'conflict').map((item) => <label className="import-choice" key={item.date}>
        <input type="checkbox" disabled={busy} checked={selectedDates.includes(item.date)} onChange={(event) => setSelectedDates((current) => event.target.checked ? [...current, item.date] : current.filter((date) => date !== item.date))} />
        <span>用本机记录覆盖 {item.date} 的云端记录</span>
      </label>)}
      {plan.profile?.status === 'conflict' && <label className="import-choice">
        <input type="checkbox" disabled={busy} checked={overwriteProfile} onChange={(event) => setOverwriteProfile(event.target.checked)} />
        <span>用本机个人档案覆盖云端档案</span>
      </label>}
      {plan.profile?.status === 'missing' && <p>将同时导入本机已确认的个人档案。</p>}
      <p>本次将写入 {writes?.records.length ?? 0} 天记录{writes?.profile ? '和 1 份个人档案' : ''}。</p>
    </>}
    {notice && <p role="status">{notice}</p>}
    <div className="account-actions">
      <button type="button" className="primary-button" disabled={busy || !count} onClick={async () => {
        if (!writes || busy) return
        setBusy(true)
        const error = await store.importData(writes)
        setNotice(error ?? '导入完成。相同记录不会重复导入。')
        setSelectedDates([])
        setOverwriteProfile(false)
        setBusy(false)
      }}>{busy ? '正在导入……' : '确认导入'}</button>
      <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>关闭</button>
    </div>
  </section>
}
