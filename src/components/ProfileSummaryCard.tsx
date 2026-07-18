import { useState } from 'react'
import {
  bodyModelLevelLabels,
  goalLabels,
} from '../profile/labels'
import type { BodyModel, UserProfile } from '../profile/types'

type ProfileSummaryCardProps = {
  profile: UserProfile
  model: BodyModel
  onEdit: () => void
  onClear: () => string | null
}

export function ProfileSummaryCard({
  profile,
  model,
  onEdit,
  onClear,
}: ProfileSummaryCardProps) {
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <section className="panel profile-summary-card" aria-labelledby="profile-summary-title">
      <div className="profile-summary-heading">
        <div>
          <span className="eyebrow">Profile / Personal baseline</span>
          <h2 id="profile-summary-title">个人基线</h2>
        </div>
        <button type="button" className="secondary-button" onClick={onEdit}>
          查看与修改
        </button>
      </div>
      <div className="profile-summary-grid">
        <div><span>目标</span><strong>{goalLabels[model.primaryGoal]}</strong></div>
        <div>
          <span>当前体重</span>
          <strong>{model.currentWeightKg === null ? '未记录' : `${model.currentWeightKg} kg`}</strong>
        </div>
        <div><span>身高</span><strong>{model.heightCm === null ? '未记录' : `${model.heightCm} cm`}</strong></div>
        <div><span>BMI 参考</span><strong>{model.bmi ?? '数据不足'}</strong></div>
        <div><span>模型状态</span><strong>{bodyModelLevelLabels[model.level]}</strong></div>
      </div>
      <p className="profile-weight-source">
        {model.currentWeightSource === 'latest-daily-record'
          ? '体重来自最近一次每日记录。'
          : model.currentWeightSource === 'profile-baseline'
            ? '当前暂无更新体重，暂用初始基线。'
            : '尚未建立当前体重。'}
      </p>
      <p className="profile-bmi-note">
        BMI 仅作为基础体重身高参考，不等于体脂率或医学诊断。
      </p>
      {model.missingImportantFields.length > 0 && (
        <p className="profile-missing-note">
          已建立个人档案；补充{model.missingImportantFields.slice(0, 2).join('、')}后，身体模型会更完整。
        </p>
      )}
      {model.cautions.length > 0 && (
        <div className="profile-cautions">
          {model.cautions.map((item) => <p key={item}>{item}</p>)}
        </div>
      )}
      <div className="profile-card-footer">
        <small>档案更新于 {profile.updatedAt.slice(0, 10)}</small>
        {!confirmingClear ? (
          <button
            type="button"
            className="course-text-button"
            onClick={() => setConfirmingClear(true)}
          >
            清除个人档案
          </button>
        ) : (
          <div className="profile-clear-confirm" role="group" aria-label="确认清除个人档案">
            <p>这只会删除当前浏览器中的个人基线，不会删除每日记录。</p>
            <button
              type="button"
              className="danger-button"
              onClick={() => {
                const clearError = onClear()
                setError(clearError)
                if (clearError) {
                  setConfirmingClear(false)
                }
              }}
            >
              确认清除
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setConfirmingClear(false)}
            >
              取消
            </button>
          </div>
        )}
      </div>
      {error && <p className="ai-inline-error" role="alert">{error}</p>}
    </section>
  )
}
