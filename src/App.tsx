import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { DailySummary } from './components/DailySummary'
import { FoodLog } from './components/FoodLog'
import { HistoryList } from './components/HistoryList'
import { KnowledgePanel } from './components/KnowledgePanel'
import { TodayForm } from './components/TodayForm'
import { fatLossKnowledge } from './knowledge'
import { loadRecords, saveRecords } from './storage'
import type { DailyRecord } from './types'
import { createEmptyRecord, evaluateRecord, getTodayKey, summarizeNutrition } from './utils'

function App() {
  const [activeDate, setActiveDate] = useState(getTodayKey)
  const [records, setRecords] = useState<Record<string, DailyRecord>>(() => {
    const loadedRecords = loadRecords()
    const today = getTodayKey()

    return {
      ...loadedRecords,
      [today]: loadedRecords[today] ?? createEmptyRecord(today),
    }
  })

  const activeRecord = records[activeDate] ?? createEmptyRecord(activeDate)
  const summary = useMemo(
    () => summarizeNutrition(activeRecord.foods),
    [activeRecord.foods],
  )
  const rating = useMemo(() => evaluateRecord(activeRecord), [activeRecord])
  const sortedRecords = useMemo(
    () => Object.values(records).sort((first, second) => second.date.localeCompare(first.date)),
    [records],
  )

  useEffect(() => {
    saveRecords(records)
  }, [records])

  const updateRecord = (record: DailyRecord) => {
    setRecords((currentRecords) => ({
      ...currentRecords,
      [record.date]: record,
    }))
  }

  const selectDate = (date: string) => {
    setActiveDate(date)
    setRecords((currentRecords) => ({
      ...currentRecords,
      [date]: currentRecords[date] ?? createEmptyRecord(date),
    }))
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
