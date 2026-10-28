import type { FoodTemplate } from './foodUtils.ts'
import { normalizeMeal, parseFoodValues } from './foodUtils.ts'
import { createFoodId } from '../utils.ts'

const KEY = 'easyfitness.food-templates.v1'
const storageKey = (userId?: string) =>
  userId === undefined ? KEY : `${KEY}.${encodeURIComponent(userId)}`
const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

// Build a preview only; reading legacy data and saving the result require explicit UI actions.
export const buildFoodTemplateImport = (
  current: FoodTemplate[],
  legacy: FoodTemplate[],
): { templates: FoodTemplate[]; imported: number; skipped: number } => {
  const templates = [...current]
  const names = new Set(current.map((template) => template.name.trim().toLocaleLowerCase()))
  const ids = new Set([...current, ...legacy].map((template) => template.id))
  let imported = 0
  for (const template of legacy) {
    const name = template.name.trim()
    const normalizedName = name.toLocaleLowerCase()
    if (!name || names.has(normalizedName)) continue
    names.add(normalizedName)
    let id = createFoodId()
    while (ids.has(id)) id = createFoodId()
    ids.add(id)
    templates.push({ id, name, foods: template.foods.map((food) => ({ ...food })) })
    imported += 1
  }
  return { templates, imported, skipped: legacy.length - imported }
}

export const loadFoodTemplates = (userId?: string): { templates: FoodTemplate[]; error: string | null; writable: boolean } => {
  try {
    const raw = localStorage.getItem(storageKey(userId))
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

export const saveFoodTemplates = (templates: FoodTemplate[], userId?: string): string | null => {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify({ version: 1, templates }))
    return null
  } catch {
    return '常用餐食保存失败，请检查浏览器存储权限或剩余空间。'
  }
}
