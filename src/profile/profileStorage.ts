import type { StoredProfileDraft, UserProfile } from './types.js'
import {
  normalizeStoredProfileDraft,
  normalizeUserProfile,
  ProfileValidationError,
} from './validation.js'

export const PROFILE_STORAGE_KEY = 'easyfitness.profile.v1'
export const PROFILE_DRAFT_STORAGE_KEY = 'easyfitness.profile-draft.v1'

type LoadResult<T> = {
  value: T
  warning: string | null
}

type WriteResult = {
  ok: boolean
  error: string | null
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export const loadProfile = (): LoadResult<UserProfile | null> => {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY)
    if (!raw) {
      return { value: null, warning: null }
    }
    const parsed: unknown = JSON.parse(raw)
    if (!isObject(parsed) || parsed.version !== 1 || !('profile' in parsed)) {
      return {
        value: null,
        warning: '个人档案格式或版本无法识别，原数据未被自动覆盖。',
      }
    }
    return { value: normalizeUserProfile(parsed.profile), warning: null }
  } catch {
    return {
      value: null,
      warning: '无法读取个人档案，原数据未被自动覆盖。',
    }
  }
}

export const saveProfile = (profile: UserProfile): WriteResult => {
  try {
    const normalized = normalizeUserProfile(profile)
    localStorage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({ version: 1, profile: normalized }),
    )
    return { ok: true, error: null }
  } catch {
    return {
      ok: false,
      error: '个人档案保存失败，请检查浏览器存储权限或剩余空间。',
    }
  }
}

const recoverDraft = (value: unknown): StoredProfileDraft | null => {
  if (!isObject(value) || value.version !== 1) {
    return null
  }
  try {
    return normalizeStoredProfileDraft({
      ...value,
      parsedDraft: null,
      stage: 'intro',
      questionIds: [],
      answeredQuestionIds: [],
      skippedQuestionIds: [],
      currentQuestionId: null,
    })
  } catch {
    return null
  }
}

export const loadProfileDraft = (): LoadResult<StoredProfileDraft | null> => {
  try {
    const raw = localStorage.getItem(PROFILE_DRAFT_STORAGE_KEY)
    if (!raw) {
      return { value: null, warning: null }
    }
    const parsed: unknown = JSON.parse(raw)
    try {
      return { value: normalizeStoredProfileDraft(parsed), warning: null }
    } catch (error) {
      if (!(error instanceof ProfileValidationError)) {
        throw error
      }
      const recovered = recoverDraft(parsed)
      return {
        value: recovered,
        warning: recovered
          ? '引导草稿部分损坏，已保留可恢复的原始输入。'
          : '引导草稿格式或版本无法识别，原数据未被自动覆盖。',
      }
    }
  } catch {
    return {
      value: null,
      warning: '无法读取个人档案草稿，原数据未被自动覆盖。',
    }
  }
}

export const saveProfileDraft = (draft: StoredProfileDraft): WriteResult => {
  try {
    const normalized = normalizeStoredProfileDraft(draft)
    localStorage.setItem(PROFILE_DRAFT_STORAGE_KEY, JSON.stringify(normalized))
    return { ok: true, error: null }
  } catch {
    return {
      ok: false,
      error: '引导进度保存失败，请检查浏览器存储权限或剩余空间。',
    }
  }
}

const removeKey = (key: string, error: string): WriteResult => {
  try {
    localStorage.removeItem(key)
    return { ok: true, error: null }
  } catch {
    return { ok: false, error }
  }
}

export const removeProfileDraft = () =>
  removeKey(PROFILE_DRAFT_STORAGE_KEY, '无法清除个人档案草稿。')

export const removeProfile = () =>
  removeKey(PROFILE_STORAGE_KEY, '无法清除个人档案。')

export const clearProfileData = (): WriteResult => {
  const profileResult = removeProfile()
  const draftResult = removeProfileDraft()
  return profileResult.ok ? draftResult : profileResult
}
