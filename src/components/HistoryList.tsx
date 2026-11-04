import type { DailyRecord } from '../types'
import { evaluateRecord, isNutritionComplete, summarizeNutrition } from '../utils'

type HistoryListProps = {
  records: DailyRecord[]
  activeDate: string
  onSelectDate: (date: string) => void
}

export function HistoryList({ records, activeDate, onSelectDate }: HistoryListProps) {
  return (
    <section className="panel" aria-labelledby="history-title">
      <div className="section-heading">
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
                    {isNutritionComplete(record) ? ' · 饮食已记完' : ' · 饮食待确认'}
                    {record.unestimatedMeals.length > 0 &&
                      ` · ${record.unestimatedMeals.length} 条未估算`}
                  </span>
                  {record.coros?.activeCaloriesKcal != null && <span>COROS 活动 {record.coros.activeCaloriesKcal} kcal</span>}
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
