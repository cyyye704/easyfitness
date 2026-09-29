import { useState } from 'react'
import type { MealType } from '../types'
import { mealLabels, mealTypes, parseFoodValues } from '../food/foodUtils'
import type { FoodValues } from '../food/foodUtils'

type Props = {
  initial?: FoodValues
  emptyNutrition?: boolean
  submitLabel: string
  onSave: (food: FoodValues) => void
  onCancel?: () => void
}

export function FoodEditor({ initial, emptyNutrition, submitLabel, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [calories, setCalories] = useState(initial && !emptyNutrition ? String(initial.calories) : '')
  const [protein, setProtein] = useState(initial && !emptyNutrition ? String(initial.protein) : '')
  const [meal, setMeal] = useState<MealType>(initial?.meal ?? 'unspecified')
  const [error, setError] = useState<string | null>(null)
  return (
    <form className="food-editor" onSubmit={(event) => {
      event.preventDefault()
      const food = parseFoodValues(name, calories, protein, meal)
      if (!food) { setError('请填写食物名称及有效的热量、蛋白质；明确为零时请填 0。'); return }
      onSave(food)
      setError(null)
      if (!initial) { setName(''); setCalories(''); setProtein('') }
    }}>
      <label className="food-name-field"><span>食物名称</span><input required maxLength={200} value={name} placeholder="例如：鸡胸肉 100 克"
        onChange={(event) => setName(event.target.value)} /></label>
      <label><span>热量 kcal</span><input required type="number" inputMode="decimal" min="0" max="100000" step="any"
        value={calories} onChange={(event) => setCalories(event.target.value)} /></label>
      <label><span>蛋白质 g</span><input required type="number" inputMode="decimal" min="0" max="10000" step="any"
        value={protein} onChange={(event) => setProtein(event.target.value)} /></label>
      <label><span>餐次</span><select value={meal} onChange={(event) => setMeal(event.target.value as MealType)}>
        {mealTypes.map((value) => <option key={value} value={value}>{mealLabels[value]}</option>)}
      </select></label>
      <div className="food-actions">
        <button type="submit" className="primary-button">{submitLabel}</button>
        {onCancel && <button type="button" className="secondary-button" onClick={onCancel}>取消</button>}
      </div>
      {error && <p className="ai-inline-error" role="alert">{error}</p>}
    </form>
  )
}
