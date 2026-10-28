import { useState } from 'react'
import type { DailyRecord, FoodItem } from '../types'
import { createFoodId, isNutritionComplete } from '../utils'
import { appendFoods, mealLabels, mealTypes, normalizeMeal, restoreDeletedFood } from '../food/foodUtils'
import type { DeletedFood, FoodTemplate, FoodValues } from '../food/foodUtils'
import { loadFoodTemplates, saveFoodTemplates } from '../food/templateStorage'
import { FoodEditor } from './FoodEditor'
import { FoodShortcuts } from './FoodShortcuts'

type FoodLogProps = {
  userId?: string
  record: DailyRecord
  previousRecord?: DailyRecord
  onChange: (record: DailyRecord) => void
}

export function FoodLog({ userId, record, previousRecord, onChange }: FoodLogProps) {
  const [editing, setEditing] = useState<string | null>(null)
  const [deleted, setDeleted] = useState<DeletedFood[]>([])
  const [initialTemplates] = useState(() => loadFoodTemplates(userId))
  const [templates, setTemplates] = useState(initialTemplates.templates)
  const [templateError, setTemplateError] = useState(initialTemplates.error)
  const [notice, setNotice] = useState('')
  const lastDeleted = deleted.at(-1)

  const saveTemplates = (next: FoodTemplate[]) => {
    if (!initialTemplates.writable) return false
    const error = saveFoodTemplates(next, userId)
    setTemplateError(error)
    if (error) return false
    setTemplates(next)
    return true
  }
  const favorite = (food: FoodItem) => {
    const values: FoodValues = { name: food.name, calories: food.calories, protein: food.protein, meal: food.meal }
    if (templates.some((template) => template.foods.length === 1 && template.foods[0].name === food.name &&
      template.foods[0].calories === food.calories && template.foods[0].protein === food.protein)) {
      setNotice('相同食物已在常用收藏中。'); return
    }
    if (saveTemplates([...templates, { id: createFoodId(), name: food.name, foods: [values] }])) setNotice(`已收藏：${food.name}`)
  }
  const remove = (entry: DeletedFood) => {
    setDeleted((current) => [...current, entry])
    setEditing(null)
    onChange({ ...record, nutritionComplete: false,
      foods: entry.kind === 'food' ? record.foods.filter((food) => food.id !== entry.item.id) : record.foods,
      unestimatedMeals: entry.kind === 'unestimated' ? record.unestimatedMeals.filter((meal) => meal.id !== entry.item.id) : record.unestimatedMeals,
    })
  }

  return (
    <section className="panel food-panel" aria-labelledby="food-title">
      <div className="section-heading"><span className="eyebrow">Food</span><h2 id="food-title">饮食</h2></div>
      <FoodEditor submitLabel="添加食物" onSave={(food) => onChange(appendFoods(record, [{ ...food, id: createFoodId() }]))} />
      <p className="food-help">{userId
        ? '当前账号的收藏与餐食模板只保存在这台设备的浏览器，不会跨设备同步。'
        : '收藏与餐食模板只保存在当前浏览器。'}</p>
      <FoodShortcuts userId={userId} record={record} previousRecord={previousRecord} templates={templates} onSaveTemplates={saveTemplates}
        onAdd={(foods) => onChange(appendFoods(record, foods))} />
      {templateError && <p className="ai-inline-error" role="alert">{templateError}</p>}
      <p className="food-help" role="status">{notice}</p>
      {lastDeleted && <div className="food-undo" role="status">
        <span>已删除：{lastDeleted.kind === 'food' ? lastDeleted.item.name : lastDeleted.item.description}</span>
        <button type="button" className="secondary-button" onClick={() => {
          onChange(restoreDeletedFood(record, lastDeleted)); setDeleted((current) => current.slice(0, -1))
        }}>撤销删除</button>
      </div>}
      {record.foods.length === 0 && <p className="empty-state">今天还没有可计算的食物记录</p>}
      {mealTypes.map((meal) => {
        const foods = record.foods.filter((food) => normalizeMeal(food.meal) === meal)
        return foods.length > 0 && <div className="meal-group" key={meal}>
          <h3>{mealLabels[meal]}</h3>
          <ul className="food-list">
            {foods.map((food) => <li key={food.id}>
              {editing === food.id ? <FoodEditor initial={food} submitLabel="保存修改" onCancel={() => setEditing(null)} onSave={(values) => {
                onChange({ ...record, nutritionComplete: false, foods: record.foods.map((item) => item.id === food.id ? { ...values, id: food.id } : item) })
                setEditing(null)
              }} /> : <>
                <div className="food-item-text"><strong>{food.name}</strong><span>{food.calories} kcal / {food.protein} g</span></div>
                <div className="food-actions">
                  <button type="button" onClick={() => setEditing(food.id)}>编辑</button>
                  <button type="button" onClick={() => favorite(food)}>收藏</button>
                  <button type="button" onClick={() => remove({ kind: 'food', date: record.date, item: food, index: record.foods.indexOf(food) })}>删除</button>
                </div>
              </>}
            </li>)}
          </ul>
        </div>
      })}
      {record.unestimatedMeals.length > 0 && <div className="unestimated-meals">
        <div className="unestimated-meals-heading"><h3>未估算饮食</h3><span>{record.unestimatedMeals.length} 条</span></div>
        <p>补齐热量与蛋白质并确认后，该项会移入可计算饮食。</p>
        <ul className="unestimated-meal-list">{record.unestimatedMeals.map((meal) => <li key={meal.id}>
          {editing === meal.id ? <FoodEditor initial={{ name: meal.description, calories: 0, protein: 0 }} emptyNutrition
            submitLabel="确认补齐" onCancel={() => setEditing(null)} onSave={(values) => {
              onChange({ ...record, nutritionComplete: false, foods: [{ ...values, id: createFoodId() }, ...record.foods],
                unestimatedMeals: record.unestimatedMeals.filter((item) => item.id !== meal.id) })
              setEditing(null)
            }} /> : <>
            <div><strong>{meal.description}</strong>{meal.reason && <span>{meal.reason}</span>}</div>
            <div className="food-actions">
              <button type="button" onClick={() => setEditing(meal.id)}>补齐营养值</button>
              <button type="button" onClick={() => remove({ kind: 'unestimated', date: record.date, item: meal, index: record.unestimatedMeals.indexOf(meal) })}>删除</button>
            </div>
          </>}
        </li>)}</ul>
      </div>}
      <div className="nutrition-completeness">
        <label><input type="checkbox" checked={isNutritionComplete(record)} disabled={record.unestimatedMeals.length > 0}
          onChange={(event) => onChange({ ...record, nutritionComplete: event.target.checked })} />
          <span>当天饮食已全部记完</span></label>
        <p className="food-help">{record.unestimatedMeals.length > 0 ? '请先补齐未估算饮食，再确认完整。' :
          '修改饮食后需重新确认；尚未记完时不对全天摄入评分。'}</p>
      </div>
    </section>
  )
}
