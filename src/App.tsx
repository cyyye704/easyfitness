import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { DailySummary } from './components/DailySummary'
import { FoodLog } from './components/FoodLog'
import { HistoryList } from './components/HistoryList'
import { KnowledgePanel } from './components/KnowledgePanel'
import { TodayForm } from './components/TodayForm'
import { fatLossKnowledge } from './knowledge'
import { loadRecords, saveRecords } from './storage'
import type { DailyRecord } from './types'
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
  const [activeDate, setActiveDate] = useState(getTodayKey)
  const [records, setRecords] = useState<Record<string, DailyRecord>>(
    initialLoad.records,
  )
  const [storageNotice, setStorageNotice] = useState(initialLoad.warning)
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

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <span className="eyebrow">EasyFitness</span>
          <h1>每日减脂记录</h1>
        </div>
        <label className="date-picker">
          <span>日期</span>
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

      <KnowledgePanel items={fatLossKnowledge} />
    </main>
  )
}

export default App
