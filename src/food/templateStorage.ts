import type { FoodTemplate } from './foodUtils.ts'
import { normalizeMeal, parseFoodValues } from './foodUtils.ts'

const KEY = 'easyfitness.food-templates.v1'
const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export const loadFoodTemplates = (): { templates: FoodTemplate[]; error: string | null; writable: boolean } => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { templates: [], error: null, writable: true }
    const data: unknown = JSON.parse(raw)
    if (!isObject(data) || data.version !== 1 || !Array.isArray(data.templates)) throw new Error('Invalid templates')
    const ids = new Set<string>()
    const templates = data.templates.map((template): FoodTemplate => {
      if (!isObject(template) || typeof template.id !== 'string' || !template.id || ids.has(template.id) ||
        typeof template.name !== 'string' || !template.name.trim() || !Array.isArray(template.foods) || !template.foods.length) {
        throw new Error('Invalid template')
      }
      ids.add(template.id)
      const foods = template.foods.map((food) => {
        if (!isObject(food) || typeof food.name !== 'string' ||
          typeof food.calories !== 'number' || typeof food.protein !== 'number') throw new Error('Invalid food')
        const parsed = parseFoodValues(food.name, String(food.calories), String(food.protein), normalizeMeal(food.meal))
        if (!parsed) throw new Error('Invalid nutrition')
        return parsed
      })
      return { id: template.id, name: template.name.trim(), foods }
    })
    return { templates, error: null, writable: true }
  } catch {
    return { templates: [], error: '常用餐食无法读取，原数据已保留；请检查浏览器存储后刷新重试。', writable: false }
  }
}

export const saveFoodTemplates = (templates: FoodTemplate[]): string | null => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, templates }))
    return null
  } catch {
    return '常用餐食保存失败，请检查浏览器存储权限或剩余空间。'
  }
}
