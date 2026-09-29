import { useState } from 'react'
import type { DailyRecord, FoodItem, MealType } from '../types'
import { createFoodId, summarizeNutrition } from '../utils'
import { mealLabels, mealTypes, normalizeMeal, scaleFoods } from '../food/foodUtils'
import type { FoodTemplate } from '../food/foodUtils'

type Props = {
  record: DailyRecord
  previousRecord?: DailyRecord
  templates: FoodTemplate[]
  onSaveTemplates: (templates: FoodTemplate[]) => boolean
  onAdd: (foods: FoodItem[]) => void
}

export function FoodShortcuts({ record, previousRecord, templates, onSaveTemplates, onAdd }: Props) {
  const [servings, setServings] = useState('1')
  const [targetMeal, setTargetMeal] = useState<MealType>('breakfast')
  const [sourceMeal, setSourceMeal] = useState<MealType>('breakfast')
  const [selected, setSelected] = useState<string[]>([])
  const [name, setName] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const previousFoods = previousRecord?.foods.filter((food) => normalizeMeal(food.meal) === sourceMeal) ?? []
  const selectedFoods = record.foods.filter((food) => selected.includes(food.id))

  const add = (foods: FoodTemplate['foods']) => {
    const scaled = scaleFoods(foods, Number(servings), targetMeal)
    if (!scaled.length) { setNotice('请填写大于 0、不超过 100 的份数，并检查放大后的营养数值。'); return }
    onAdd(scaled)
    setNotice(`已向${mealLabels[targetMeal]}添加 ${scaled.length} 项食物（${servings} 份）。`)
  }

  return (
    <details className="food-shortcuts">
      <summary>常用食物与餐食模板 <small>{templates.length} 个收藏</small></summary>
      <div className="shortcut-controls">
        <label><span>添加到</span><select value={targetMeal} onChange={(event) => setTargetMeal(event.target.value as MealType)}>
          {mealTypes.map((meal) => <option key={meal} value={meal}>{mealLabels[meal]}</option>)}
        </select></label>
        <label><span>份数</span><input type="number" inputMode="decimal" min="0.1" max="100" step="any" value={servings}
          onChange={(event) => setServings(event.target.value)} /></label>
      </div>
      <p className="food-help">1 份使用收藏时的营养值，添加后可逐项修改。</p>
      {templates.length === 0 ? <p className="empty-state">先收藏一项食物，或从下方创建餐食模板。</p> : (
        <ul className="template-list">
          {templates.map((template) => {
            const total = summarizeNutrition(template.foods.map((food, index) => ({ ...food, id: String(index) })))
            return <li key={template.id}>
              <div><strong>{template.name}</strong><small>{template.foods.length} 项 · {total.totalCalories} kcal / {total.totalProtein} g</small>
                <small>{template.foods.map((food) => food.name).join('、')}</small></div>
              <div className="food-actions">
                <button type="button" className="secondary-button" onClick={() => add(template.foods)}>添加餐食</button>
                {confirmDelete === template.id ? <>
                  <button type="button" className="danger-button" onClick={() => {
                    if (onSaveTemplates(templates.filter((item) => item.id !== template.id))) {
                      setConfirmDelete(null); setNotice(`已移除收藏：${template.name}`)
                    }
                  }}>确认移除</button>
                  <button type="button" className="secondary-button" onClick={() => setConfirmDelete(null)}>取消</button>
                </> : <button type="button" className="secondary-button" onClick={() => setConfirmDelete(template.id)}>移除收藏</button>}
              </div>
            </li>
          })}
        </ul>
      )}
      <details className="template-builder">
        <summary>把所选食物存为模板</summary>
        {record.foods.length ? <form onSubmit={(event) => {
          event.preventDefault()
          if (!name.trim() || !selectedFoods.length) { setNotice('请输入模板名称，并至少选择一项食物。'); return }
          const template: FoodTemplate = { id: createFoodId(), name: name.trim(), foods: selectedFoods.map((food) => ({
            name: food.name, calories: food.calories, protein: food.protein, meal: food.meal,
          })) }
          if (onSaveTemplates([...templates, template])) {
            setName(''); setSelected([]); setNotice(`已保存模板：${template.name}`)
          }
        }}>
          <div className="template-choices">
            {record.foods.map((food) => <label key={food.id}>
              <input type="checkbox" checked={selected.includes(food.id)} onChange={(event) => {
                setSelected((current) => event.target.checked ? [...current, food.id] : current.filter((id) => id !== food.id))
              }} /><span>{mealLabels[normalizeMeal(food.meal)]} · {food.name}</span>
            </label>)}
          </div>
          <label><span>模板名称</span><input required maxLength={80} value={name} placeholder="例如：工作日早餐"
            onChange={(event) => setName(event.target.value)} /></label>
          <button className="secondary-button" type="submit" disabled={!selectedFoods.length}>保存所选 {selectedFoods.length} 项</button>
        </form> : <p className="food-help">当天添加食物后即可创建模板。</p>}
      </details>
      <div className="copy-meal">
        <h3>复制前一天的餐食</h3>
        <p className="food-help">前一天指当前记录日期的前一天；仅复制可计算食物。</p>
        <label><span>来源餐次</span><select value={sourceMeal} onChange={(event) => setSourceMeal(event.target.value as MealType)}>
          {mealTypes.map((meal) => <option key={meal} value={meal}>{mealLabels[meal]}</option>)}
        </select></label>
        <p className="food-help">{previousFoods.length ? previousFoods.map((food) => food.name).join('、') : '前一天该餐次没有可复制的食物。'}</p>
        <button type="button" className="secondary-button" disabled={!previousFoods.length} onClick={() => add(previousFoods)}>
          复制 {previousFoods.length} 项到{mealLabels[targetMeal]}
        </button>
      </div>
      <p className="food-help" role="status">{notice}</p>
    </details>
  )
}
