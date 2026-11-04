import type { CorosDailyData } from '../types.js'

export type CorosRegion = 'auto' | 'cn' | 'eu' | 'us'
export type CorosStatus = { configured: boolean; connected: boolean; region?: CorosRegion }
export type CorosPreview = { days: CorosDailyData[]; warnings: string[] }

export type CorosImportChoice = {
  selected: boolean
  useSleep: boolean
  expectedSleepHours: number | null
  expectedCoros?: CorosDailyData
}

export const COROS_REGIONS: Record<CorosRegion, string> = {
  auto: '自动选择', cn: '中国大陆', eu: '欧洲', us: '美国',
}

export const isCorosRegion = (value: unknown): value is CorosRegion =>
  typeof value === 'string' && Object.hasOwn(COROS_REGIONS, value)
