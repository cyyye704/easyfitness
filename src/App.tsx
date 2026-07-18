import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
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
import { loadRecords, saveRecords } from './storage'
import type { DailyRecord } from './types'
import { buildBodyModel } from './profile/buildBodyModel'
import {
  clearProfileData,
  loadProfile,
  loadProfileDraft,
  removeProfileDraft,
  saveProfile,
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

function App() {
  const [initialLoad] = useState(loadRecords)
  const [initialProfileLoad] = useState(loadProfile)
  const [initialProfileDraftLoad] = useState(loadProfileDraft)
  const [activeDate, setActiveDate] = useState(getTodayKey)
  const [records, setRecords] = useState<Record<string, DailyRecord>>(
    initialLoad.records,
  )
  const [storageNotice, setStorageNotice] = useState(initialLoad.warning)
  const [profile, setProfile] = useState<UserProfile | null>(
    initialProfileLoad.value,
  )
  const [profileDraftSeed, setProfileDraftSeed] =
    useState<StoredProfileDraft | null>(initialProfileDraftLoad.value)
  const [profileNotice, setProfileNotice] = useState(
    initialProfileLoad.warning ?? initialProfileDraftLoad.warning,
  )
  const [showProfileOnboarding, setShowProfileOnboarding] = useState(
    initialProfileLoad.value === null,
  )
  const hasPendingSave = useRef(false)

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

  useEffect(() => {
    if (!hasPendingSave.current) {
      return
    }

    hasPendingSave.current = false
    const result = saveRecords(records)
    setStorageNotice(result.error)
  }, [records])

  const updateRecord = (record: DailyRecord) => {
    hasPendingSave.current = true
    setRecords((currentRecords) => ({
      ...currentRecords,
      [record.date]: record,
    }))
  }

  const selectDate = (date: string) => {
    if (isDateKey(date)) {
      setActiveDate(date)
    }
  }

  const completeProfile = (nextProfile: UserProfile) => {
    const result = saveProfile(nextProfile)
    if (!result.ok) {
      setProfileNotice(result.error)
      return result.error
    }
    const draftRemoval = removeProfileDraft()
    setProfile(nextProfile)
    setProfileDraftSeed(null)
    setShowProfileOnboarding(false)
    setProfileNotice(draftRemoval.error)
    return null
  }

  const skipProfileOnboarding = (draft: StoredProfileDraft) => {
    const result = saveProfileDraft(draft)
    setProfileDraftSeed(draft)
    setProfileNotice(result.error)
    setShowProfileOnboarding(false)
  }

  const openProfileOnboarding = () => {
    if (!profile) {
      const loadedDraft = loadProfileDraft()
      setProfileDraftSeed(loadedDraft.value)
      setProfileNotice(loadedDraft.warning)
    }
    setShowProfileOnboarding(true)
  }

  const clearProfile = () => {
    const result = clearProfileData()
    if (!result.ok) {
      setProfileNotice(result.error)
      return result.error
    }
    setProfile(null)
    setProfileDraftSeed(null)
    setShowProfileOnboarding(false)
    setProfileNotice(null)
    return null
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

        {storageNotice && (
          <p className="storage-notice" role="status">
            {storageNotice}
          </p>
        )}

        {profileNotice && (
          <p className="storage-notice" role="status">
            {profileNotice}
          </p>
        )}

        {showProfileOnboarding ? (
          <ProfileOnboarding
            key={profile?.id ?? profileDraftSeed?.updatedAt ?? 'new-profile'}
            initialDraft={profile ? null : profileDraftSeed}
            existingProfile={profile}
            onComplete={completeProfile}
            onSkip={skipProfileOnboarding}
            onCancelEdit={() => setShowProfileOnboarding(false)}
          />
        ) : profile && bodyModel ? (
          <ProfileSummaryCard
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
              activeDate={activeDate}
              currentRecord={activeRecord}
              onConfirm={updateRecord}
            />

            <KnowledgePanel items={fatLossKnowledge} />

            <PeriodSummaryPanel records={records} defaultEndDate={getTodayKey()} />

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
      </main>
    </>
  )
}

export default App
