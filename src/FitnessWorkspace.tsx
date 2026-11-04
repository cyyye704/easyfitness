import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import { CorosPanel } from './components/CorosPanel'
import { WorkspaceNavigation } from './components/WorkspaceNavigation'
import { WorkspaceOverview } from './components/WorkspaceOverview'
import { useWorkspaceNavigation, workspacePages, type WorkspacePage } from './workspace/navigation'
import './styles/workspace.css'
import { buildCorosImport } from './coros/import'
import type { CorosImportChoice } from './coros/types'
import type { CorosDailyData } from './types'
import { fatLossKnowledge } from './knowledge'
import { buildBodyModel } from './profile/buildBodyModel'
import { shiftDateKey } from './periodSummary/calculatePeriodSummary'
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
  onSignIn?: () => void
}

export function FitnessWorkspace({ repository, userId, email, onSignOut, onSignIn }: FitnessWorkspaceProps) {
  const data = useWorkspaceData(repository)
  const { records, profile, store } = data
  const [activeDate, setActiveDate] = useState(getTodayKey)
  const [initialDraft] = useState(() => loadProfileDraft(userId))
  const [profileDraftSeed, setProfileDraftSeed] = useState<StoredProfileDraft | null>(initialDraft.value)
  const [profileNotice, setProfileNotice] = useState<string | null>(initialDraft.warning)
  const [profileOpen, setProfileOpen] = useState<boolean | null>(userId ? null : false)
  const showProfileOnboarding = profileOpen ?? !profile
  const [showImport, setShowImport] = useState(false)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const [openingSignIn, setOpeningSignIn] = useState(false)
  const [corosController, setCorosController] = useState(() => new AbortController())
  const [profileEdited, setProfileEdited] = useState(false)
  const updateRecord = store.updateRecord
  const { activePage, visitedPages, navigate } = useWorkspaceNavigation()
  const pageInfo = workspacePages.find((page) => page.id === activePage)!
  const headingRef = useRef<HTMLHeadingElement>(null)
  const previousPage = useRef(activePage)
  const saveStatus = data.loading ? '正在读取记录……' : data.loadError ? '读取失败，请重试'
    : data.saveError ? '保存失败，请重试' : data.saving || data.busy ? '正在保存……'
      : data.pending ? '等待保存……' : userId ? '已保存到云端' : '已保存在此浏览器'

  useEffect(() => {
    if (previousPage.current === activePage) return
    previousPage.current = activePage
    window.scrollTo({ top: 0, behavior: 'instant' })
    headingRef.current?.focus({ preventScroll: true })
  }, [activePage])

  // Keep visited modules mounted so switching navigation never discards local drafts.
  const renderModule = (page: WorkspacePage, children: ReactNode) => visitedPages.has(page)
    ? <div key={page} className="workspace-module" hidden={activePage !== page}>{children}</div>
    : null

  const confirmCoros = (days: CorosDailyData[], choices: Record<string, CorosImportChoice>) => {
    const current = store.getSnapshot()
    if (!userId || signingOut || current.loading || current.loadError || current.busy || current.pending || current.saveError) {
      throw new Error('请先完成当前保存，再确认 COROS 数据。')
    }
    const writes = buildCorosImport(days, current.records, choices)
    if (!writes.length) throw new Error('请先选择要记录的日期。')
    writes.forEach(updateRecord)
    void store.flush()
    return writes.length
  }

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
    setProfileNotice(result.error)
    if (!result.ok) return
    setProfileDraftSeed(draft)
    setProfileEdited(false)
    setProfileOpen(false)
    navigate('home')
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
    corosController.abort()
    setSigningOut(true)
    // Cancel queued/in-flight account work before removing its session.
    store.stop()
    const error = await onSignOut()
    if (error) {
      setAccountError(error)
      store.resume()
      setCorosController(new AbortController())
      setSigningOut(false)
    }
  }

  const signIn = async () => {
    if (!onSignIn || data.busy || data.saving || data.loading || openingSignIn) return
    if (profileEdited && !window.confirm('个人档案还有未保存的修改，前往登录会放弃这些修改。确定继续？')) return
    setOpeningSignIn(true)
    setAccountError(null)
    await store.flush()
    const current = store.getSnapshot()
    if (current.pending || current.saveError) {
      setAccountError('本地记录尚未保存成功，请重试保存后再登录。')
      setOpeningSignIn(false)
      return
    }
    onSignIn()
  }

  const reload = () => {
    if ((data.pending || profileEdited) && !window.confirm('重新加载会放弃当前未保存的修改，读取已保存的记录。确定继续？')) return
    setProfileEdited(false)
    void store.reload()
  }

  return (
    <div className="workspace-app">
      <div className="scene-backdrop" aria-hidden="true">
        <div className="scene scene-gym" />
        <div className="scene scene-track" />
        <div className="scene scene-court" />
      </div>
      <a className="workspace-skip" href="#workspace-main" onClick={(event) => {
        event.preventDefault()
        headingRef.current?.focus()
      }}>跳到内容</a>
      <WorkspaceNavigation activePage={activePage} onNavigate={navigate} cloud={Boolean(userId)} />
      <main id="workspace-main" className="app-shell workspace-shell">
        <header className="workspace-header">
          <div>
            <h1 ref={headingRef} tabIndex={-1}>{pageInfo.label}</h1>
            <p>{pageInfo.description}</p>
          </div>
          {(['home', 'records', 'ai'] as WorkspacePage[]).includes(activePage) && <label className="workspace-date-picker">
            <span>记录日期</span>
            <input type="date" value={activeDate} onChange={(event) => selectDate(event.target.value)} />
          </label>}
        </header>
        <div className={`workspace-save-status${data.saveError || data.loadError ? ' has-error' : ''}`}>
          <span role="status">{saveStatus}</span>
          <button type="button" className="course-text-button" onClick={() => navigate('account')}>{userId || !onSignIn ? '账号与数据' : '本地模式 · 登录'}</button>
        </div>
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
        {renderModule('account', <>
          <section className="panel" aria-labelledby="account-title">
            <h2 id="account-title">{userId ? '当前账号' : '本地模式'}</h2>
            <div className="account-bar">
              <div>
                <strong>{userId ? email ?? '已登录' : '记录保存在当前浏览器'}</strong>
                <span>{userId ? '正式记录与个人档案按账号保存在云端。' : '登录后可跨设备保存；本地记录需复核确认后导入。'}</span>
              </div>
              <div className="account-actions">
                {userId && <button type="button" className="secondary-button" disabled={data.loading || Boolean(data.loadError) || data.busy || data.pending > 0 || profileEdited} onClick={() => setShowImport(!showImport)}>{showImport ? '收起导入' : '导入本机旧记录'}</button>}
                <button type="button" className="secondary-button" disabled={data.loading || data.saving || data.busy} onClick={reload}>重新加载</button>
                {onSignOut && <button type="button" className="secondary-button" disabled={data.busy || signingOut} onClick={signOut}>{signingOut ? '正在退出……' : '退出登录'}</button>}
                {onSignIn && <button type="button" className="primary-button" disabled={data.busy || data.saving || openingSignIn} onClick={signIn}>{openingSignIn ? '正在保存……' : '登录 / 注册'}</button>}
              </div>
            </div>
          </section>
          {userId && showImport && !data.loading && !data.loadError && <LocalImportPanel store={store} onClose={() => setShowImport(false)} />}
        </>)}
        {!data.loading && !data.loadError && <>
          {showImport && activePage !== 'account' && <p className="storage-notice">本机导入尚未关闭。<button type="button" className="course-text-button" onClick={() => navigate('account')}>返回账号与数据</button></p>}
          <fieldset className="workspace-fields" disabled={data.busy || signingOut || openingSignIn || showImport}>
            {renderModule('home', <WorkspaceOverview record={activeRecord} summary={summary} rating={rating} hasProfile={Boolean(profile)} onNavigate={navigate} />)}
            {renderModule('records', <>
              <TodayForm record={activeRecord} onChange={updateRecord} />
              {/* Only changing the record date resets this editor, never module navigation. */}
              <FoodLog key={activeDate} userId={userId} record={activeRecord}
                previousRecord={records[shiftDateKey(activeDate, -1)]} onChange={updateRecord} />
              <DailySummary record={activeRecord} summary={summary} rating={rating} />
            </>)}
            {renderModule('ai', <NaturalLogPanel userId={userId} activeDate={activeDate} currentRecord={activeRecord} onConfirm={updateRecord} />)}
            {renderModule('history', <>
              <PeriodSummaryPanel userId={userId} records={records} defaultEndDate={getTodayKey()} />
              <HistoryList records={sortedRecords} activeDate={activeDate} onSelectDate={(date) => {
                selectDate(date)
                navigate('records')
              }} />
            </>)}
            {renderModule('coros', !signingOut && <CorosPanel userId={userId} records={records} cancellationSignal={corosController.signal} active={activePage === 'coros'}
              blocked={data.busy || signingOut || data.pending > 0 || data.saving || Boolean(data.saveError) || profileEdited}
              onConfirm={confirmCoros} />)}
            {renderModule('knowledge', <KnowledgePanel items={fatLossKnowledge} />)}
            {renderModule('profile', <>
              {profileNotice && <p className="storage-notice" role="status">{profileNotice}</p>}
              {showProfileOnboarding ? <ProfileOnboarding userId={userId}
                key={profile ? `${profile.id}:${store.getCloudSnapshot().profile?.revision}` : profileDraftSeed?.updatedAt ?? 'new-profile'}
                initialDraft={profile ? null : profileDraftSeed} existingProfile={profile}
                onComplete={completeProfile} onSkip={skipProfileOnboarding}
                onEditChange={() => setProfileEdited(true)} onCancelEdit={() => { setProfileOpen(false); setProfileEdited(false) }} />
                : profile && bodyModel ? <ProfileSummaryCard cloud={Boolean(userId)} profile={profile} model={bodyModel}
                  onEdit={openProfileOnboarding} onClear={clearProfile} />
                  : <section className="panel profile-entry-card" aria-labelledby="profile-entry-title">
                    <div><h2 id="profile-entry-title">建立个人基线</h2><p>记录身高、体重和目标，了解自己的起点。</p></div>
                    <button type="button" className="secondary-button" onClick={openProfileOnboarding}>开始建立</button>
                  </section>}
            </>)}
          </fieldset>
        </>}
      </main>
    </div>
  )
}
