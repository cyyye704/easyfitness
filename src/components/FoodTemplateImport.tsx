import { useState } from 'react'
import type { FoodTemplate } from '../food/foodUtils'
import { buildFoodTemplateImport, loadFoodTemplates } from '../food/templateStorage'

type Props = {
  templates: FoodTemplate[]
  onSaveTemplates: (templates: FoodTemplate[]) => boolean
}

export function FoodTemplateImport({ templates, onSaveTemplates }: Props) {
  const [legacy, setLegacy] = useState<FoodTemplate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const plan = legacy ? buildFoodTemplateImport(templates, legacy) : null

  return <div className="template-builder template-import">
    <p className="food-help">旧版本的收藏与模板可复制到当前账号。请先确认属于你；同名模板保留当前账号版本，原数据不会删除，导入后仍只保存在本机。</p>
    <button type="button" className="secondary-button" onClick={() => {
      const result = loadFoodTemplates()
      setError(result.error)
      setLegacy(result.error ? null : result.templates)
      setNotice('')
    }}>查看旧版模板</button>
    {error && <p className="ai-inline-error" role="alert">{error}</p>}
    {plan && <>
      <p className="food-help">可导入 {plan.imported} 个模板，{plan.skipped} 个同名模板将跳过。</p>
      {legacy?.length ? <p className="food-help">旧版模板：{legacy.map((template) => template.name).join('、')}</p>
        : <p className="food-help">这个浏览器没有旧版模板。</p>}
      <div className="food-actions">
        <button type="button" className="secondary-button" disabled={!plan.imported} onClick={() => {
          if (onSaveTemplates(plan.templates)) {
            setLegacy(null)
            setNotice(`已导入 ${plan.imported} 个模板；同名模板与本机原数据已保留。`)
          }
        }}>确认导入当前账号</button>
        <button type="button" className="secondary-button" onClick={() => setLegacy(null)}>取消导入</button>
      </div>
    </>}
    <p className="food-help" role="status">{notice}</p>
  </div>
}
