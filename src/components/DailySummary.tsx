import type { DailyRecord, NutritionSummary, RatingResult } from '../types'
import { isNutritionComplete } from '../utils'
import { formatCorosSleep } from '../coros/import'

type DailySummaryProps = {
  record: DailyRecord
  summary: NutritionSummary
  rating: RatingResult
}

export function DailySummary({ record, summary, rating }: DailySummaryProps) {
  return (
    <section className="panel summary-panel" aria-labelledby="summary-title">
      <div className="section-heading">
        <h2 id="summary-title">{record.date}</h2>
      </div>

      <div className="summary-grid">
        <div>
          <span>摄入热量</span>
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

      {record.coros && <div className="coros-summary" aria-label="COROS 设备记录">
        {record.coros.activeCaloriesKcal !== null && <p>COROS 活动热量 <strong>{record.coros.activeCaloriesKcal} kcal</strong>（不含静息代谢）</p>}
        {record.coros.sleepHours !== null && <p>COROS 睡眠 <strong>{formatCorosSleep(record.coros.sleepHours)}</strong>
          {record.sleepHours !== record.coros.sleepHours && (record.sleepHours === null ? ' · 尚未填写到当天睡眠' : ' · 当天睡眠保留原值')}</p>}
        <p>来源：COROS · 读取于 {new Date(record.coros.syncedAt).toLocaleString('zh-CN')}</p>
      </div>}

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
