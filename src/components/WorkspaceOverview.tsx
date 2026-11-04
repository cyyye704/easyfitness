import type { DailyRecord, NutritionSummary, RatingResult } from '../types'
import { isNutritionComplete } from '../utils'
import type { WorkspacePage } from '../workspace/navigation'
import { WorkspaceIcon } from './WorkspaceNavigation'

type Props = {
  record: DailyRecord
  summary: NutritionSummary
  rating: RatingResult
  hasProfile: boolean
  onNavigate: (page: WorkspacePage) => void
}

export function WorkspaceOverview({ record, summary, rating, hasProfile, onNavigate }: Props) {
  return <div className="overview-content">
    <section className="panel overview-summary" aria-labelledby="overview-title">
      <div className="overview-heading"><h2 id="overview-title">当日概览</h2><span className="overview-rating">{rating.rating}</span></div>
      <div className="overview-metrics">
        <div><span>摄入热量</span><strong>{summary.totalCalories}<small>千卡</small></strong></div>
        <div><span>蛋白质</span><strong>{summary.totalProtein}<small>克</small></strong></div>
        <div><span>体重</span><strong>{record.weightKg ?? '—'}<small>公斤</small></strong></div>
        <div><span>睡眠</span><strong>{record.sleepHours ?? '—'}<small>小时</small></strong></div>
      </div>
      <div className="overview-checks">
        <span>{isNutritionComplete(record) ? '饮食已记完' : '饮食待补充'}</span>
        <span>{record.trainingStatus === 'trained' ? '已训练' : record.trainingStatus === 'rest' ? '休息日' : '训练待确认'}</span>
        <button type="button" className="course-text-button" onClick={() => onNavigate('records')}>查看与补充记录 →</button>
      </div>
      {!isNutritionComplete(record) && <p className="overview-note">热量与蛋白质仅统计已记录的饮食。</p>}
    </section>
    <div className="overview-shortcuts" aria-label="常用入口">
      <button type="button" className="overview-shortcut primary-shortcut" onClick={() => onNavigate('records')}>
        <WorkspaceIcon page="records" /><span><strong>填写记录</strong><small>饮食、体重、训练与睡眠</small></span><b aria-hidden="true">→</b>
      </button>
      <button type="button" className="overview-shortcut" onClick={() => onNavigate('ai')}>
        <WorkspaceIcon page="ai" /><span><strong>说一段话，整理记录</strong><small>AI 生成草稿，由你确认</small></span><b aria-hidden="true">→</b>
      </button>
    </div>
    <div className="overview-footer">
      <button type="button" className="course-text-button" onClick={() => onNavigate('history')}>查看历史与统计 →</button>
      {!hasProfile && <button type="button" className="course-text-button" onClick={() => onNavigate('profile')}>完善个人档案 →</button>}
    </div>
  </div>
}
