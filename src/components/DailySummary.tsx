import type { DailyRecord, NutritionSummary, RatingResult } from '../types'
import { isNutritionComplete } from '../utils'

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
          <small>{rating.rating === '待补充' ? '记录尚未完整' : `${rating.score >= 0 ? '+' : ''}${rating.score}`}</small>
        </div>
      </div>

      {!isNutritionComplete(record) && (
        <p className="summary-incomplete-note">
          饮食尚未确认完整，以上数字仅代表已记录部分。
          {record.unestimatedMeals.length > 0 && ` 另有 ${record.unestimatedMeals.length} 条未估算饮食。`}
        </p>
      )}

      <ul className="reason-list">
        {rating.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <p className="food-help">饮食记完、训练状态确认并填写睡眠后生成评价。评分沿用通用规则，不代表个人营养目标。</p>
    </section>
  )
}
