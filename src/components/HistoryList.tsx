import type { DailyRecord } from '../types'
import { evaluateRecord, summarizeNutrition } from '../utils'

type HistoryListProps = {
  records: DailyRecord[]
  activeDate: string
  onSelectDate: (date: string) => void
}

export function HistoryList({ records, activeDate, onSelectDate }: HistoryListProps) {
  return (
    <section className="panel" aria-labelledby="history-title">
      <div className="section-heading">
        <span className="eyebrow">History</span>
        <h2 id="history-title">历史记录</h2>
      </div>

      {records.length > 0 ? (
        <ul className="history-list">
          {records.map((record) => {
            const summary = summarizeNutrition(record.foods)
            const rating = evaluateRecord(record)

            return (
              <li key={record.date}>
                <button
                  type="button"
                  className={record.date === activeDate ? 'active' : ''}
                  onClick={() => onSelectDate(record.date)}
                >
                  <span>
                    <strong>{record.date}</strong>
                    <small>{rating.rating}</small>
                  </span>
                  <span>
                    {summary.totalCalories} kcal / {summary.totalProtein} g
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="empty-state">保存记录后会出现在这里</p>
      )}
    </section>
  )
}
