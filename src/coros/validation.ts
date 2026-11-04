import { isObject, parseCorosDailyData } from '../data/validation.js'
import { isCorosRegion } from './types.js'
import type { CorosPreview, CorosStatus } from './types.js'

export const parseCorosStatus = (value: unknown): CorosStatus => {
  if (!isObject(value) || typeof value.configured !== 'boolean' ||
    typeof value.connected !== 'boolean' || (value.connected && !value.configured) ||
    (value.region !== undefined && !isCorosRegion(value.region))) {
    throw new Error('COROS 连接状态格式异常。')
  }
  return { configured: value.configured, connected: value.connected,
    ...(isCorosRegion(value.region) ? { region: value.region } : {}) }
}

export const parseCorosAuthorization = (value: unknown): string => {
  if (!isObject(value) || typeof value.authorizationUrl !== 'string') {
    throw new Error('COROS 授权地址格式异常。')
  }
  const url = new URL(value.authorizationUrl)
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash ||
    !['mcp.coros.com', 'mcpcn.coros.com', 'mcpeu.coros.com', 'mcpus.coros.com'].includes(url.hostname) ||
    url.pathname !== '/oauth2/authorize') {
    throw new Error('COROS 授权地址不受信任。')
  }
  return url.href
}

export const parseCorosPreview = (value: unknown): CorosPreview => {
  if (!isObject(value) || !Array.isArray(value.days) || value.days.length > 7 ||
    !Array.isArray(value.warnings) || value.warnings.length > 20 ||
    !value.warnings.every((warning) => typeof warning === 'string' && warning.length <= 300)) {
    throw new Error('COROS 数据格式异常，请重新读取。')
  }
  const dates = new Set<string>()
  const days = value.days.map((day: unknown) => {
    if (!isObject(day) || typeof day.sourceDate !== 'string' || dates.has(day.sourceDate)) {
      throw new Error('COROS 日期重复或无效，请重新读取。')
    }
    const parsed = parseCorosDailyData(day, day.sourceDate)
    dates.add(parsed.sourceDate)
    return parsed
  }).sort((a, b) => b.sourceDate.localeCompare(a.sourceDate))
  return { days, warnings: value.warnings as string[] }
}
