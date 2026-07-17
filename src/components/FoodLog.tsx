import { useState } from 'react'
import type { DailyRecord, FoodItem } from '../types'
import { createFoodId, roundToOneDecimal } from '../utils'

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
    const parsedCalories = Number(draft.calories)
    const parsedProtein = Number(draft.protein)
    const calories = Number.isFinite(parsedCalories)
      ? Math.max(0, Math.round(parsedCalories))
      : 0
    const protein = Number.isFinite(parsedProtein)
      ? Math.max(0, roundToOneDecimal(parsedProtein))
      : 0

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

  const removeUnestimatedMeal = (mealId: string) => {
    onChange({
      ...record,
      unestimatedMeals: record.unestimatedMeals.filter(
        (meal) => meal.id !== mealId,
      ),
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
        <p className="empty-state">今天还没有可计算的食物记录</p>
      )}

      {record.unestimatedMeals.length > 0 && (
        <div className="unestimated-meals">
          <div className="unestimated-meals-heading">
            <h3>未估算饮食</h3>
            <span>{record.unestimatedMeals.length} 条</span>
          </div>
          <p>这些饮食事实已保存，但不会计入热量和蛋白质汇总。</p>
          <ul className="unestimated-meal-list">
            {record.unestimatedMeals.map((meal) => (
              <li key={meal.id}>
                <div>
                  <strong>{meal.description}</strong>
                  {meal.reason && <span>{meal.reason}</span>}
                </div>
                <button
                  type="button"
                  onClick={() => removeUnestimatedMeal(meal.id)}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
