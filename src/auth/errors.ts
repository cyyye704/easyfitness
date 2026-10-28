const messages: Record<string, string> = {
  invalid_credentials: '邮箱或密码不正确，请检查后重试。',
  email_not_confirmed: '请先打开确认邮件验证邮箱，也可以重新发送确认邮件。',
  email_address_invalid: '邮箱格式不正确，请检查后重试。',
  email_address_not_authorized: '当前邮件服务暂时无法向此邮箱发送邮件，请联系应用维护者。',
  email_provider_disabled: '邮箱登录暂未启用，请联系应用维护者。',
  signup_disabled: '当前暂未开放注册，请联系应用维护者。',
  user_already_exists: '该邮箱已注册，请直接登录或找回密码。',
  weak_password: '密码强度不足，请使用更长且包含多种字符的密码。',
  same_password: '新密码不能与原密码相同。',
  over_email_send_rate_limit: '邮件发送过于频繁，请稍后再试。',
  over_request_rate_limit: '操作过于频繁，请稍后再试。',
  otp_expired: '邮件链接已失效或已使用，请重新发送邮件。',
  flow_state_expired: '邮件链接已失效，请重新发送邮件。',
  flow_state_not_found: '无法验证邮件链接，请在发起请求的同一浏览器中打开，或重新发送邮件。',
  bad_code_verifier: '无法验证邮件链接，请在发起请求的同一浏览器中打开，或重新发送邮件。',
  session_not_found: '登录已失效，请重新登录或重新发送密码重置邮件。',
  refresh_token_not_found: '登录已失效，请重新登录。',
}

export const AUTH_LINK_ERROR = '邮件链接无法验证，请在发起请求的同一浏览器中打开，或重新发送邮件。'

// Provider messages and redirect descriptions can contain URLs or credentials.
// Only display our own messages selected by a known code.
export const getAuthErrorMessage = (
  error: unknown,
  fallback = '暂时无法完成账户操作，请检查网络后重试。',
) => {
  if (!error || typeof error !== 'object') return fallback
  const code = 'code' in error ? error.code : undefined
  if (typeof code === 'string' && Object.hasOwn(messages, code)) return messages[code]
  const status = 'status' in error ? error.status : undefined
  return status === 429 ? messages.over_request_rate_limit : fallback
}
