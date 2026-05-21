import type { DailyRecord, NutritionSummary, RatingResult } from '../types'

type DailySummaryProps = {
  record: DailyRecord
  summary: NutritionSummary
  rating: RatingResult
}

export function DailySummary({ record, summary, rating }: DailySummaryProps) {
  return (
    <section className="panel summary-panel" aria-labelledby="summary-title">
      <div className="section-heading">
        <span className="eyebrow">Today</span>
        <h2 id="summary-title">{record.date}</h2>
      </div>

      <div className="summary-grid">
        <div>
          <span>热量</span>
          <strong>{summary.totalCalories}</strong>
          <small>kcal</small>
        </div>
        <div>
          <span>蛋白质</span>
          <strong>{summary.totalProtein}</strong>
          <small>g</small>
        </div>
        <div>
          <span>评价</span>
          <strong>{rating.rating}</strong>
          <small>{rating.score >= 0 ? `+${rating.score}` : rating.score}</small>
        </div>
      </div>

      <ul className="reason-list">
        {rating.reasons.slice(0, 3).map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </section>
  )
}
