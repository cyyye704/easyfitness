import { useState } from 'react'
import { COROS_REGIONS, isCorosRegion } from '../coros/types'
import type { CorosImportChoice, CorosRegion } from '../coros/types'
import { useCorosConnection } from '../coros/useCorosConnection'
import type { CorosDailyData, DailyRecord } from '../types'
import { CorosDraftReview } from './CorosDraftReview'
import '../styles/coros.css'

type Props = {
  userId?: string
  records: Record<string, DailyRecord>
  blocked: boolean
  cancellationSignal: AbortSignal
  active?: boolean
  onConfirm: (days: CorosDailyData[], choices: Record<string, CorosImportChoice>) => number
}

export function CorosPanel({ userId, records, blocked, cancellationSignal, onConfirm, active = true }: Props) {
  const connection = useCorosConnection(userId, cancellationSignal, active)
  const [region, setRegion] = useState<CorosRegion>('cn')
  const { status, busy, preview } = connection
  const disabled = blocked || Boolean(busy)

  const confirm = (choices: Record<string, CorosImportChoice>) => {
    if (!preview || disabled) return
    try {
      const count = onConfirm(preview.days, choices)
      connection.setPreview(null)
      connection.setError(null)
      connection.setNotice(`已确认 ${count} 天的记录，保存进度和重试入口见页面顶部。`)
    } catch (reason) {
      connection.setError(reason instanceof Error ? reason.message : '暂时无法确认，请重试。')
    }
  }

  return <section className="panel coros-panel" aria-labelledby="coros-title" aria-busy={Boolean(busy)}>
    <div className="section-heading">
      <h2 id="coros-title">同步手表记录</h2>
      <p className="section-description">从 COROS 读取最近 7 天的睡眠和活动热量，复核后记录。</p>
    </div>
    {!userId ? <p className="food-help">请先登录 EasyFitness，再连接 COROS。</p> : <>
      {status?.connected ? <div className="coros-toolbar">
        <p className="coros-connection">已连接 COROS{status.region ? ` · ${COROS_REGIONS[status.region]}` : ''}</p>
        <div className="coros-actions">
          <button type="button" className="primary-button" disabled={disabled} onClick={connection.read}>
            {busy === 'preview' ? '正在读取……' : '读取最近 7 天'}
          </button>
          <button type="button" className="secondary-button" disabled={disabled} onClick={connection.disconnect}>断开连接</button>
        </div>
      </div> : status?.configured ? <>
        <div className="coros-toolbar">
          <label>账号地区<select value={region} disabled={disabled} onChange={(event) => {
            if (isCorosRegion(event.target.value)) setRegion(event.target.value)
          }}>{Object.entries(COROS_REGIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <button type="button" className="primary-button" disabled={disabled} onClick={() => connection.connect(region)}>
            {busy === 'connect' ? '正在连接……' : '连接 COROS'}
          </button>
        </div>
        <p className="food-help">将跳转至 COROS 官方授权页面。请先确认页面中的编辑和草稿，未确认的草稿不会随跳转保留。</p>
      </> : status ? <p className="food-help">COROS 连接尚未启用，需要完成服务端配置。</p> : busy ?
        <p role="status">正在检查连接状态……</p> :
        <button type="button" className="secondary-button" disabled={disabled} onClick={connection.refresh}>重试连接状态</button>}
      {blocked && <p className="food-help">请先完成当前编辑或处理页面顶部的保存状态，再同步手表记录。</p>}
      <p className="food-help">通过 COROS 官方接口读取，无需 AI 解析。活动热量单独记录，不抵扣饮食摄入。连接仅在当前浏览器保留。</p>
    </>}
    {connection.error && <p className="ai-inline-error" role="alert">{connection.error}</p>}
    {connection.notice && <p className="ai-inline-success" role="status">{connection.notice}</p>}
    {preview && <CorosDraftReview preview={preview} records={records} disabled={disabled}
      onConfirm={confirm} onCancel={() => connection.setPreview(null)} />}
  </section>
}
