import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  clearPendingEmailVerification, getEmailVerificationError, readPendingEmailVerification, resendEmailVerification,
  savePendingEmailVerification, verifyEmailCode,
} from '../auth/emailVerification'
import { supabase } from '../auth/supabase'

type EmailVerificationPanelProps = {
  initialEmail: string
  sentAt: number | null
  onBack: (email: string) => void
  onContinueAsGuest?: () => void
}

const SENT_NOTICE = '如果该邮箱需要验证，验证码将发送到此邮箱。请检查收件箱和垃圾邮件，并使用最新验证码。'

export function EmailVerificationPanel({ initialEmail, sentAt, onBack, onContinueAsGuest }: EmailVerificationPanelProps) {
  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState('')
  const [lastSentAt, setLastSentAt] = useState(sentAt)
  const [now, setNow] = useState(Date.now)
  const [busy, setBusy] = useState<'verify' | 'resend' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(sentAt ? SENT_NOTICE : null)
  const busyRef = useRef(false)
  const mounted = useRef(true)
  const remaining = lastSentAt ? Math.min(60, Math.max(0, Math.ceil((lastSentAt + 60_000 - now) / 1_000))) : 0

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    if (!lastSentAt || lastSentAt + 60_000 <= Date.now()) return
    const timer = window.setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= lastSentAt + 60_000) window.clearInterval(timer)
    }, 1_000)
    return () => window.clearInterval(timer)
  }, [lastSentAt])

  const runAction = async (action: 'verify' | 'resend') => {
    if (busyRef.current || !supabase || (action === 'resend' && remaining > 0)) return
    busyRef.current = true
    setBusy(action)
    setError(null)
    setNotice(null)
    const normalizedEmail = email.trim()
    try {
      if (action === 'verify') {
        await verifyEmailCode(supabase.auth, normalizedEmail, code)
        const pending = readPendingEmailVerification()
        if (!pending || pending.email.toLowerCase() === normalizedEmail.toLowerCase()) clearPendingEmailVerification()
        if (mounted.current) setCode('')
        // Supabase emits SIGNED_IN and App opens the authenticated workspace.
      } else {
        await resendEmailVerification(supabase.auth, normalizedEmail)
        if (!mounted.current) return
        const sent = Date.now()
        setEmail(normalizedEmail)
        setCode('')
        setLastSentAt(sent)
        setNow(sent)
        savePendingEmailVerification({ email: normalizedEmail, sentAt: sent })
        setNotice(SENT_NOTICE)
      }
    } catch (actionError) {
      if (mounted.current) setError(getEmailVerificationError(actionError, action))
    } finally {
      busyRef.current = false
      if (mounted.current) setBusy(null)
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void runAction('verify')
  }

  const changeEmail = (nextEmail: string) => {
    if (busyRef.current) return
    setEmail(nextEmail)
    setCode('')
    setLastSentAt(null)
    setError(null)
    setNotice(null)
    // Editing cannot reuse another address's pending confirmation or countdown.
    // Keep the URL entry point; a refresh can resume with an empty email field.
    savePendingEmailVerification({ email: '', sentAt: null })
  }

  const leave = (action: () => void) => {
    if (busyRef.current) return
    clearPendingEmailVerification()
    action()
  }

  return <section className="panel auth-panel" aria-labelledby="auth-verification-title">
    <div className="section-heading">
      <span className="eyebrow">EasyFitness</span>
      <h2 id="auth-verification-title">验证邮箱</h2>
      <p className="section-description">输入邮件中的验证码，完成邮箱验证并登录。</p>
    </div>
    <p className="auth-verification-help">无需点击邮件链接。可以在其他浏览器打开本站，进入邮箱验证后输入同一邮箱和验证码。</p>
    <form className="auth-form" onSubmit={submit} aria-busy={Boolean(busy)}>
      <label htmlFor="auth-verification-email">
        <span>注册邮箱</span>
        <input id="auth-verification-email" type="email" autoComplete="email" inputMode="email" required maxLength={254}
          value={email} disabled={Boolean(busy)} onChange={(event) => changeEmail(event.target.value)} />
      </label>
      <label htmlFor="auth-verification-code">
        <span>邮箱验证码</span>
        <input id="auth-verification-code" type="text" autoComplete="one-time-code" inputMode="numeric" required
          pattern="[0-9]{6,10}" minLength={6} maxLength={24} value={code} disabled={Boolean(busy)}
          onChange={(event) => { setCode(event.target.value.replace(/\s/g, '')); setError(null) }} />
        <small>请检查收件箱和垃圾邮件，完整输入邮件中的数字验证码。</small>
      </label>
      <div className="auth-status" aria-live="polite" aria-atomic="true">
        {error && <p className="ai-inline-error" role="alert">{error}</p>}
        {notice && <p className="auth-notice" role="status">{notice}</p>}
      </div>
      <button type="submit" className="primary-button" disabled={Boolean(busy) || !supabase}>
        {busy === 'verify' ? '正在验证……' : '验证并登录'}
      </button>
    </form>
    <div className="auth-links">
      <button type="button" className="course-text-button" disabled={Boolean(busy) || remaining > 0 || !supabase}
        onClick={() => { void runAction('resend') }}>
        {busy === 'resend' ? '正在发送……' : remaining > 0 ? `${remaining} 秒后可重新发送` : '重新发送验证码'}
      </button>
      <button type="button" className="course-text-button" disabled={Boolean(busy)} onClick={() => leave(() => onBack(email.trim()))}>返回登录</button>
    </div>
    {onContinueAsGuest && <div className="auth-guest">
      <button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => leave(onContinueAsGuest)}>暂不登录，先使用</button>
      <p>记录只保存在当前浏览器，登录后可复核并导入账号。AI 功能需要登录。</p>
    </div>}
  </section>
}
