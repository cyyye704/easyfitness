import { useState } from 'react'
import type { DailyRecord, FoodItem } from '../types'
import { createFoodId } from '../utils'

type FoodLogProps = {
  record: DailyRecord
  onChange: (record: DailyRecord) => void
}

type FoodDraft = {
  name: string
  calories: string
  protein: string
}

const initialDraft: FoodDraft = {
  name: '',
  calories: '',
  protein: '',
}

export function FoodLog({ record, onChange }: FoodLogProps) {
  const [draft, setDraft] = useState<FoodDraft>(initialDraft)

  const addFood = () => {
    const name = draft.name.trim()
    const calories = Math.max(0, Math.round(Number(draft.calories) || 0))
    const protein = Math.max(0, Math.round((Number(draft.protein) || 0) * 10) / 10)

    if (!name || (calories === 0 && protein === 0)) {
      return
    }

    const food: FoodItem = {
      id: createFoodId(),
      name,
      calories,
      protein,
    }

    onChange({
      ...record,
      foods: [food, ...record.foods],
    })
    setDraft(initialDraft)
  }

  const removeFood = (foodId: string) => {
    onChange({
      ...record,
      foods: record.foods.filter((food) => food.id !== foodId),
    })
  }

  return (
    <section className="panel" aria-labelledby="food-title">
      <div className="section-heading">
        <span className="eyebrow">Food</span>
        <h2 id="food-title">饮食</h2>
      </div>

      <div className="food-form">
        <label>
          <span>食物</span>
          <input
            value={draft.name}
            placeholder="鸡胸肉"
            onChange={(event) =>
              setDraft((current) => ({ ...current, name: event.target.value }))
            }
          />
        </label>
        <label>
          <span>热量</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={draft.calories}
            placeholder="165"
            onChange={(event) =>
              setDraft((current) => ({ ...current, calories: event.target.value }))
            }
          />
        </label>
        <label>
          <span>蛋白</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.1"
            value={draft.protein}
            placeholder="31"
            onChange={(event) =>
              setDraft((current) => ({ ...current, protein: event.target.value }))
            }
          />
        </label>
        <button type="button" className="primary-button" onClick={addFood}>
          添加
        </button>
      </div>

      {record.foods.length > 0 ? (
        <ul className="food-list">
          {record.foods.map((food) => (
            <li key={food.id}>
              <div>
                <strong>{food.name}</strong>
                <span>
                  {food.calories} kcal / {food.protein} g
                </span>
              </div>
              <button type="button" onClick={() => removeFood(food.id)}>
                删除
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-state">今天还没有饮食记录</p>
      )}
    </section>
  )
}
