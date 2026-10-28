import { useEffect, useMemo, useState } from 'react'
import { useWorkspaceData } from './data/useWorkspaceData'
import type { DataRepository } from './data/types'
import { LocalImportPanel } from './components/LocalImportPanel'
import { DailySummary } from './components/DailySummary'
import { FoodLog } from './components/FoodLog'
import { HistoryList } from './components/HistoryList'
import { KnowledgePanel } from './components/KnowledgePanel'
import { NaturalLogPanel } from './components/NaturalLogPanel'
import { PeriodSummaryPanel } from './components/PeriodSummaryPanel'
import { ProfileOnboarding } from './components/ProfileOnboarding'
import { ProfileSummaryCard } from './components/ProfileSummaryCard'
import { TodayForm } from './components/TodayForm'
import { fatLossKnowledge } from './knowledge'
import { buildBodyModel } from './profile/buildBodyModel'
import {
  loadProfileDraft,
  removeProfileDraft,
  saveProfileDraft,
} from './profile/profileStorage'
import type { StoredProfileDraft, UserProfile } from './profile/types'
import {
  createEmptyRecord,
  evaluateRecord,
  getTodayKey,
  hasRecordContent,
  isDateKey,
  summarizeNutrition,
} from './utils'

type FitnessWorkspaceProps = {
  repository: DataRepository
  userId?: string
  email?: string
  onSignOut?: () => Promise<string | null>
}

export function FitnessWorkspace({ repository, userId, email, onSignOut }: FitnessWorkspaceProps) {
  const data = useWorkspaceData(repository)
  const { records, profile, store } = data
  const [activeDate, setActiveDate] = useState(getTodayKey)
  const [initialDraft] = useState(() => loadProfileDraft(userId))
  const [profileDraftSeed, setProfileDraftSeed] = useState<StoredProfileDraft | null>(initialDraft.value)
  const [profileNotice, setProfileNotice] = useState<string | null>(initialDraft.warning)
  const [profileOpen, setProfileOpen] = useState<boolean | null>(null)
  const showProfileOnboarding = profileOpen ?? !profile
  const [showImport, setShowImport] = useState(false)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const [profileEdited, setProfileEdited] = useState(false)
  const updateRecord = store.updateRecord

  useEffect(() => {
    if (!profileEdited) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [profileEdited])

  const activeRecord = records[activeDate] ?? createEmptyRecord(activeDate)
  const summary = useMemo(
    () => summarizeNutrition(activeRecord.foods),
    [activeRecord.foods],
  )
  const rating = useMemo(() => evaluateRecord(activeRecord), [activeRecord])
  const sortedRecords = useMemo(
    () =>
      Object.values(records)
        .filter(hasRecordContent)
        .sort((first, second) => second.date.localeCompare(first.date)),
    [records],
  )
  const bodyModel = useMemo(
    () => (profile ? buildBodyModel(profile, records) : null),
    [profile, records],
  )

  const selectDate = (date: string) => {
    if (isDateKey(date)) {
      setActiveDate(date)
    }
  }

  const completeProfile = async (nextProfile: UserProfile) => {
    const error = await store.saveProfile(nextProfile)
    if (error) return error
    setProfileEdited(false)
    const result = removeProfileDraft(userId)
    setProfileDraftSeed(null)
    setProfileOpen(false)
    setProfileNotice(result.error)
    return null
  }

  const skipProfileOnboarding = (draft: StoredProfileDraft) => {
    const result = saveProfileDraft(draft, userId)
    setProfileDraftSeed(draft)
    setProfileNotice(result.error)
    setProfileOpen(false)
  }

  const openProfileOnboarding = () => {
    if (!profile && !profileDraftSeed) {
      const loaded = loadProfileDraft(userId)
      setProfileDraftSeed(loaded.value)
      setProfileNotice(loaded.warning)
    }
    setProfileOpen(true)
  }

  const clearProfile = async () => {
    const draftRemoval = removeProfileDraft(userId)
    if (!draftRemoval.ok) return draftRemoval.error
    const error = await store.deleteProfile()
    if (error) return error
    setProfileDraftSeed(null)
    setProfileOpen(false)
    setProfileNotice(null)
    return null
  }

  const signOut = async () => {
    if (!onSignOut || data.busy || signingOut) return
    if ((data.pending || profileEdited) && !window.confirm('仍有修改未保存。退出会丢弃当前未保存的更改，确定退出？')) return
    setSigningOut(true)
    // Cancel queued/in-flight account work before removing its session.
    store.stop()
    const error = await onSignOut()
    if (error) {
      setAccountError(error)
      store.resume()
      setSigningOut(false)
    }
  }

  const reload = () => {
    if ((data.pending || profileEdited) && !window.confirm('重新加载会放弃当前未保存的修改，读取已保存的记录。确定继续？')) return
    setProfileEdited(false)
    void store.reload()
  }

  return (
    <>
      <div className="scene-backdrop" aria-hidden="true">
        <div className="scene scene-gym" />
        <div className="scene scene-track" />
        <div className="scene scene-court" />
      </div>

      <main className="app-shell">
        <header className="app-header">
          <div className="brand-block">
            <span className="eyebrow">EasyFitness / Daily Protocol</span>
            <h1>每日减脂记录</h1>
            <p>让训练、饮食与恢复变成可持续的日常系统。</p>
          </div>
          <label className="date-picker">
            <span>记录日期</span>
            <input
              type="date"
              value={activeDate}
              onChange={(event) => selectDate(event.target.value)}
            />
          </label>
        </header>

        <section className="account-bar" aria-label="账号与保存状态">
          <div>
            <strong>{userId ? email ?? '已登录' : '本地模式'}</strong>
            <span role="status">{data.loading ? '正在读取记录……' : data.loadError ? '读取失败，请重试' : data.saveError ? '保存失败，修改暂留当前页面' : data.saving || data.busy ? '正在保存……' : data.pending ? '等待保存……' : userId ? '记录已保存到云端' : '记录保存在当前浏览器'}</span>
          </div>
          <div className="account-actions">
            {userId && <button type="button" className="secondary-button" disabled={data.busy || data.pending > 0 || data.loading || Boolean(data.loadError) || profileEdited} onClick={() => setShowImport(!showImport)}>导入本机旧记录</button>}
            <button type="button" className="secondary-button" disabled={data.saving || data.busy || data.loading} onClick={reload}>重新加载</button>
            {onSignOut && <button type="button" className="secondary-button" disabled={data.busy || signingOut} onClick={signOut}>{signingOut ? '正在退出……' : '退出登录'}</button>}
          </div>
        </section>
        {accountError && <p className="storage-notice" role="alert">{accountError}</p>}
        {data.warning && <p className="storage-notice" role="status">{data.warning}</p>}
        {data.saveError && (
          <div className="storage-notice" role="alert">
            <p>{data.saveError}</p>
            <p>更改暂留在当前页面，保存成功前请勿刷新或关闭。</p>
            {data.conflict ? <div className="account-actions">
              <button type="button" className="secondary-button" disabled={data.busy} onClick={reload}>放弃修改，读取云端</button>
              <button type="button" className="danger-button" disabled={data.busy} onClick={() => {
                if (window.confirm('用当前页面的待保存记录覆盖对应日期的云端记录？')) void store.overwritePending()
              }}>用当前修改覆盖云端</button>
            </div> : <button type="button" className="secondary-button" disabled={data.saving || data.busy} onClick={() => void store.flush()}>重试保存</button>}
          </div>
        )}
        {data.loadError && <div className="storage-notice" role="alert"><p>{data.loadError}</p><button type="button" className="secondary-button" onClick={() => void store.reload()}>重试加载</button></div>}
        {!data.loading && !data.loadError && <>
        {userId && showImport && <LocalImportPanel store={store} onClose={() => setShowImport(false)} />}
        <fieldset className="workspace-fields" disabled={data.busy || signingOut || showImport}>
        {profileNotice && (
          <p className="storage-notice" role="status">
            {profileNotice}
          </p>
        )}

        {showProfileOnboarding ? (
          <ProfileOnboarding
            userId={userId}
            key={profile ? `${profile.id}:${store.getCloudSnapshot().profile?.revision}` : profileDraftSeed?.updatedAt ?? 'new-profile'}
            initialDraft={profile ? null : profileDraftSeed}
            existingProfile={profile}
            onComplete={completeProfile}
            onSkip={skipProfileOnboarding}
            onEditChange={() => setProfileEdited(true)}
            onCancelEdit={() => { setProfileOpen(false); setProfileEdited(false) }}
          />
        ) : profile && bodyModel ? (
          <ProfileSummaryCard
            cloud={Boolean(userId)}
            profile={profile}
            model={bodyModel}
            onEdit={openProfileOnboarding}
            onClear={clearProfile}
          />
        ) : (
          <section className="panel profile-entry-card" aria-labelledby="profile-entry-title">
            <div>
              <span className="eyebrow">Profile / Optional</span>
              <h2 id="profile-entry-title">建立个人基线</h2>
              <p>用一段自然语言建立身高、当前体重和目标等基础信息。</p>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={openProfileOnboarding}
            >
              开始建立
            </button>
          </section>
        )}

        {!showProfileOnboarding && (
          <>
            <NaturalLogPanel
              userId={userId}
              activeDate={activeDate}
              currentRecord={activeRecord}
              onConfirm={updateRecord}
            />

            <KnowledgePanel items={fatLossKnowledge} />

            <PeriodSummaryPanel userId={userId} records={records} defaultEndDate={getTodayKey()} />

            <div className="app-layout">
              <div className="primary-column">
                <DailySummary record={activeRecord} summary={summary} rating={rating} />
                <TodayForm record={activeRecord} onChange={updateRecord} />
                <FoodLog record={activeRecord} onChange={updateRecord} />
              </div>

              <aside className="side-column">
                <HistoryList
                  records={sortedRecords}
                  activeDate={activeDate}
                  onSelectDate={selectDate}
                />
              </aside>
            </div>
          </>
        )}
        </fieldset>
        </>}
      </main>
    </>
  )
}
