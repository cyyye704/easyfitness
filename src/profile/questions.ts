import type { ProfileQuestion } from './types.js'

export const profileQuestions: ProfileQuestion[] = [
  {
    id: 'heightCm',
    priority: 10,
    requiredForUsableModel: true,
    title: '你的身高大概是多少？',
    description: '使用厘米记录，例如 172。',
    inputType: 'number',
    shouldAsk: (draft) => draft.facts.heightCm === null,
  },
  {
    id: 'baselineWeightKg',
    priority: 20,
    requiredForUsableModel: true,
    title: '你当前体重大概是多少？',
    description: '后续每日体重会优先作为当前体重，初始值仍会保留。',
    inputType: 'number',
    shouldAsk: (draft) => draft.facts.baselineWeightKg === null,
  },
  {
    id: 'age',
    priority: 30,
    requiredForUsableModel: true,
    title: '你的年龄是多少？',
    inputType: 'number',
    shouldAsk: (draft) => draft.facts.age === null,
  },
  {
    id: 'primaryGoal',
    priority: 40,
    requiredForUsableModel: true,
    title: '你现在最想先改善什么？',
    inputType: 'single-select',
    shouldAsk: (draft) => draft.facts.primaryGoal === 'unsure',
  },
  {
    id: 'activityLevel',
    priority: 50,
    requiredForUsableModel: true,
    title: '除训练以外，你平时活动量怎样？',
    description: '这里描述日常走动，不把训练次数混在一起。',
    inputType: 'single-select',
    shouldAsk: (draft) => draft.facts.activityLevel === 'unsure',
  },
  {
    id: 'sexForEnergyEstimate',
    priority: 60,
    requiredForUsableModel: false,
    title: '未来做基础能量估算时，使用哪组生理参数？',
    description: '这只用于未来能量估算，不作为身份标签。第一版不会据此生成目标。',
    inputType: 'single-select',
    shouldAsk: (draft) => draft.facts.sexForEnergyEstimate === 'unspecified',
  },
  {
    id: 'trainingFrequency',
    priority: 70,
    requiredForUsableModel: false,
    title: '你通常每周训练几次？',
    inputType: 'compound-number',
    shouldAsk: (draft) =>
      draft.facts.strengthSessionsPerWeek === null &&
      draft.facts.cardioSessionsPerWeek === null,
  },
  {
    id: 'averageSleepHours',
    priority: 80,
    requiredForUsableModel: false,
    title: '你通常每晚睡多久？',
    inputType: 'number',
    shouldAsk: (draft) => draft.facts.averageSleepHours === null,
  },
  {
    id: 'healthLimitations',
    priority: 90,
    requiredForUsableModel: false,
    title: '是否有需要在运动或饮食中注意的伤病或限制？',
    description: '只需填写一般限制，不需要提供详细病历、药物或诊断。',
    inputType: 'text',
    shouldAsk: (draft) =>
      draft.facts.healthLimitations.length === 0 &&
      draft.unknowns.some((item) => /健康|伤病|限制|治疗/.test(item)),
  },
]

export const getProfileQuestion = (id: ProfileQuestion['id']) =>
  profileQuestions.find((question) => question.id === id) ?? null
