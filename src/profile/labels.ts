import type {
  ActivityLevel,
  BodyModelLevel,
  EnergyEstimateSex,
  PrimaryGoal,
  ProfileConfidence,
  TrainingExperience,
} from './types.js'

export const goalLabels: Record<PrimaryGoal, string> = {
  'fat-loss': '减脂',
  'muscle-gain': '增肌',
  maintenance: '维持当前状态',
  fitness: '提升体能',
  unsure: '暂时不确定',
}

export const activityLabels: Record<ActivityLevel, string> = {
  sedentary: '久坐为主',
  light: '偶尔走动',
  moderate: '每天走动较多',
  high: '体力劳动或高活动量',
  unsure: '不确定',
}

export const sexLabels: Record<EnergyEstimateSex, string> = {
  male: '男性参数',
  female: '女性参数',
  unspecified: '暂不提供',
}

export const experienceLabels: Record<TrainingExperience, string> = {
  beginner: '初学',
  intermediate: '有一定经验',
  advanced: '进阶',
  unsure: '不确定',
}

export const confidenceLabels: Record<ProfileConfidence, string> = {
  high: '高',
  medium: '中',
  low: '低',
}

export const bodyModelLevelLabels: Record<BodyModelLevel, string> = {
  insufficient: '信息待补充',
  basic: '基础模型',
  usable: '可用模型',
  enhanced: '增强模型',
}
