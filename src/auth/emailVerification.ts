export type PendingEmailVerification = { email: string; sentAt: number | null }

const PENDING_KEY = 'easyfitness:pending-email-verification:v1'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const isVerificationEmail = (email: string) =>
  email.trim().length <= 254 && EMAIL_PATTERN.test(email.trim())

const setVerificationUrl = (requested: boolean) => {
  if (typeof window === 'undefined') return
  try {
    const url = new URL(window.location.href)
    if (requested) url.searchParams.set('auth', 'verify')
    else if (url.searchParams.get('auth') === 'verify') url.searchParams.delete('auth')
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url.href)
  } catch { /* The current form remains usable if history is unavailable. */ }
}

export const isEmailVerificationRequested = () => {
  if (typeof window === 'undefined') return false
  try { return new URL(window.location.href).searchParams.get('auth') === 'verify' } catch { return false }
}

export const readPendingEmailVerification = (): PendingEmailVerification | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !('email' in value) || typeof value.email !== 'string' || !isVerificationEmail(value.email)) return null
    const sentAt = 'sentAt' in value && typeof value.sentAt === 'number' &&
      Number.isFinite(value.sentAt) && value.sentAt > 0 && value.sentAt <= Date.now() ? value.sentAt : null
    return { email: value.email.trim(), sentAt }
  } catch { return null }
}

export const savePendingEmailVerification = (value: PendingEmailVerification): void => {
  if (typeof window === 'undefined') return
  try {
    if (isVerificationEmail(value.email)) {
      const sentAt = typeof value.sentAt === 'number' && Number.isFinite(value.sentAt) &&
        value.sentAt > 0 && value.sentAt <= Date.now() ? value.sentAt : null
      // Keep only these two fields. Passwords, OTPs and sessions never belong here.
      window.sessionStorage.setItem(PENDING_KEY, JSON.stringify({ email: value.email.trim(), sentAt }))
    } else window.sessionStorage.removeItem(PENDING_KEY)
  } catch { /* Verification still works when browser storage is disabled. */ }
  setVerificationUrl(true)
}

export const clearPendingEmailVerification = (): void => {
  if (typeof window === 'undefined') return
  try { window.sessionStorage.removeItem(PENDING_KEY) } catch { /* Storage may be unavailable. */ }
  setVerificationUrl(false)
}

export type EmailVerificationAuth = {
  verifyOtp: (input: { email: string; token: string; type: 'email' }) => Promise<{
    data: { session: unknown | null }
    error: unknown | null
  }>
  resend: (input: { email: string; type: 'signup' }) => Promise<{ error: unknown | null }>
}

class EmailVerificationInputError extends Error {
  code: string
  constructor(code: string) {
    super(code)
    this.code = code
  }
}

const checkedEmail = (email: string) => {
  if (!isVerificationEmail(email)) throw new EmailVerificationInputError('verification_email_invalid')
  return email.trim()
}

export const verifyEmailCode = async (auth: EmailVerificationAuth, email: string, code: string): Promise<void> => {
  const normalizedEmail = checkedEmail(email)
  const token = code.replace(/\s/g, '')
  if (!/^[0-9]{6,10}$/.test(token)) throw new EmailVerificationInputError('verification_code_invalid')
  const { data, error } = await auth.verifyOtp({ email: normalizedEmail, token, type: 'email' })
  if (error) throw error
  if (!data.session) throw new EmailVerificationInputError('verification_session_missing')
}

export const resendEmailVerification = async (auth: EmailVerificationAuth, email: string): Promise<void> => {
  const { error } = await auth.resend({ email: checkedEmail(email), type: 'signup' })
  if (error) throw error
}

const messages: Record<string, string> = {
  verification_email_invalid: '请填写有效的注册邮箱。',
  verification_code_invalid: '请完整输入邮件中的数字验证码。',
  verification_session_missing: '暂时无法完成验证登录，请重新输入验证码或获取新验证码。',
  otp_expired: '验证码不正确、已过期或已使用，请重新输入或获取新验证码。',
  invalid_credentials: '验证码不正确或已过期，请重新输入或获取新验证码。',
  email_not_confirmed: '邮箱尚未验证，请输入邮件中的验证码。',
  email_address_invalid: '邮箱格式不正确，请检查后重试。',
  email_address_not_authorized: '当前邮件服务暂时无法向此邮箱发送邮件，请联系应用维护者。',
  email_provider_disabled: '邮箱验证暂未启用，请联系应用维护者。',
  signup_disabled: '当前暂未开放注册，请联系应用维护者。',
  user_already_exists: '该邮箱已注册，请返回登录或找回密码。',
  over_email_send_rate_limit: '验证码发送过于频繁，请稍后再试。',
  over_request_rate_limit: '操作过于频繁，请稍后再试。',
}

export const getEmailVerificationError = (error: unknown, action: 'verify' | 'resend') => {
  if (error && typeof error === 'object') {
    const code = 'code' in error ? error.code : undefined
    if (typeof code === 'string' && Object.hasOwn(messages, code)) return messages[code]
    const status = 'status' in error ? error.status : undefined
    if (code === 'unexpected_failure' ||
      (typeof status === 'number' && Number.isInteger(status) && status >= 500 && status <= 599)) {
      return action === 'verify' ? '邮箱验证服务暂时异常，请稍后重试。' : '邮件服务暂时异常，请稍后重新发送验证码。'
    }
    if (status === 429) return messages.over_request_rate_limit
  }
  return action === 'verify' ? '暂时无法验证邮箱，请检查网络后重试。' : '验证码未能发送，请检查网络后重试。'
}
