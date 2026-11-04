import { useEffect, useRef, useState, type FormEvent } from 'react'
import { getAuthErrorMessage } from '../auth/errors'
import { buildAuthRedirectUrl } from '../auth/redirect'
import { supabase } from '../auth/supabase'
import { clearPendingEmailVerification, isEmailVerificationRequested, readPendingEmailVerification, savePendingEmailVerification, type PendingEmailVerification } from '../auth/emailVerification'
import { EmailVerificationPanel } from './EmailVerificationPanel.tsx'

type AuthPanelProps = {
  recovering: boolean
  onRecovered: () => void
  onContinueAsGuest?: () => void
  onClearAuthError?: () => void
  hasCallbackError?: boolean
}
type AuthMode = 'sign-in' | 'sign-up' | 'reset-request'
const EMAIL_LINK_HINT = '请检查收件箱和垃圾邮件，并在当前浏览器打开邮件链接。'

export function AuthPanel({ recovering, onRecovered, onContinueAsGuest, onClearAuthError, hasCallbackError = false }: AuthPanelProps) {
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [verification, setVerification] = useState<PendingEmailVerification | null>(() =>
    recovering || hasCallbackError ? null :
      readPendingEmailVerification() ?? (isEmailVerificationRequested() ? { email: '', sentAt: null } : null))
  const busyRef = useRef(false)
  const creatingPassword = recovering || mode === 'sign-up'
  const needsPassword = recovering || mode !== 'reset-request'
  const title = recovering ? '设置新密码' : mode === 'sign-up' ? '创建账户' : mode === 'reset-request' ? '找回密码' : '登录 EasyFitness'

  useEffect(() => {
    if (verification && !recovering) onClearAuthError?.()
  }, [verification, recovering, onClearAuthError])

  const changeMode = (nextMode: AuthMode) => {
    if (busyRef.current) return
    setMode(nextMode)
    setPassword('')
    setConfirmation('')
    setError(null)
    setNotice(null)
    onClearAuthError?.()
  }

  const showVerification = (recipient: string, sentAt: number | null) => {
    const pending = { email: recipient, sentAt }
    savePendingEmailVerification(pending)
    setVerification(pending)
    setPassword('')
    setConfirmation('')
    setError(null)
    setNotice(null)
    onClearAuthError?.()
  }

  const continueAsGuest = onContinueAsGuest ? () => {
    clearPendingEmailVerification()
    onContinueAsGuest()
  } : undefined

  const runAction = async (action: () => Promise<void>) => {
    if (busyRef.current || !supabase) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
    } catch (actionError) {
      setError(getAuthErrorMessage(actionError))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase || busyRef.current) return
    if (creatingPassword && password.length < 8) {
      setError('请设置至少 8 位的新密码。')
      return
    }
    if (creatingPassword && password !== confirmation) {
      setError('两次输入的密码不一致。')
      return
    }
    const client = supabase
    void runAction(async () => {
      if (recovering) {
        const { error: updateError } = await client.auth.updateUser({ password })
        if (updateError) throw updateError
        setPassword('')
        setConfirmation('')
        onRecovered()
        return
      }
      const normalizedEmail = email.trim()
      const redirectTo = buildAuthRedirectUrl(window.location.href, mode === 'reset-request')
      if (mode === 'sign-in') {
        const { error: loginError } = await client.auth.signInWithPassword({ email: normalizedEmail, password })
        if (loginError?.code === 'email_not_confirmed') {
          showVerification(normalizedEmail, null)
          return
        }
        if (loginError) throw loginError
        setPassword('')
      } else if (mode === 'sign-up') {
        const { data, error: signUpError } = await client.auth.signUp({
          email: normalizedEmail,
          password,
          options: { emailRedirectTo: redirectTo },
        })
        if (signUpError) throw signUpError
        setPassword('')
        setConfirmation('')
        if (!data.session) {
          showVerification(normalizedEmail, Date.now())
        }
      } else {
        const { error: resetError } = await client.auth.resetPasswordForEmail(normalizedEmail, { redirectTo })
        if (resetError) throw resetError
        setNotice(`如果该邮箱已注册，你将收到密码重置邮件。${EMAIL_LINK_HINT}`)
      }
    })
  }

  if (!recovering && verification) {
    return <EmailVerificationPanel
      initialEmail={verification.email}
      sentAt={verification.sentAt}
      onBack={(recipient) => {
        clearPendingEmailVerification()
        setVerification(null)
        setEmail(recipient)
        changeMode('sign-in')
      }}
      onContinueAsGuest={continueAsGuest}
    />
  }

  return (
    <section className="panel auth-panel" aria-labelledby="auth-title">
      <div className="section-heading">
        <span className="eyebrow">EasyFitness</span>
        <h2 id="auth-title">{title}</h2>
        <p className="section-description">
          {recovering ? '设置新密码后即可继续使用账户。' : mode === 'reset-request'
            ? '输入注册邮箱，我们会发送密码重置链接。'
            : '登录后，将饮食、训练和个人档案保存到你的账户。'}
        </p>
      </div>
      {!recovering && mode !== 'reset-request' && (
        <div className="auth-tabs" aria-label="账户操作">
          <button type="button" aria-pressed={mode === 'sign-in'} disabled={busy} onClick={() => changeMode('sign-in')}>登录</button>
          <button type="button" aria-pressed={mode === 'sign-up'} disabled={busy} onClick={() => changeMode('sign-up')}>注册</button>
        </div>
      )}
      <form className="auth-form" onSubmit={submit} aria-busy={busy}>
        {!recovering && (
          <label htmlFor="auth-email">
            <span>邮箱</span>
            <input id="auth-email" type="email" autoComplete="email" inputMode="email" required maxLength={254} value={email} disabled={busy} onChange={(event) => setEmail(event.target.value)} />
          </label>
        )}
        {needsPassword && (
          <label htmlFor="auth-password">
            <span>{creatingPassword ? '新密码' : '密码'}</span>
            <input id="auth-password" type="password" autoComplete={creatingPassword ? 'new-password' : 'current-password'} required minLength={creatingPassword ? 8 : undefined} maxLength={128} value={password} disabled={busy} onChange={(event) => setPassword(event.target.value)} />
            {creatingPassword && <small>至少 8 位，建议使用字母、数字和符号。</small>}
          </label>
        )}
        {creatingPassword && (
          <label htmlFor="auth-confirmation">
            <span>确认密码</span>
            <input id="auth-confirmation" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)} />
          </label>
        )}
        <div className="auth-status" aria-live="polite" aria-atomic="true">
          {error && <p className="ai-inline-error" role="alert">{error}</p>}
          {notice && <p className="auth-notice" role="status">{notice}</p>}
        </div>
        <button type="submit" className="primary-button" disabled={busy || !supabase}>
          {busy ? '正在处理……' : recovering ? '保存新密码' : mode === 'sign-up' ? '创建账户' : mode === 'reset-request' ? '发送重置邮件' : '登录账户'}
        </button>
      </form>
      {!recovering && (
        <div className="auth-links">
          {mode === 'reset-request' ? (
            <button type="button" className="course-text-button" disabled={busy} onClick={() => changeMode('sign-in')}>返回登录</button>
          ) : (
            <>
              <button type="button" className="course-text-button" disabled={busy} onClick={() => changeMode('reset-request')}>忘记密码</button>
              <button type="button" className="course-text-button" disabled={busy} onClick={() => showVerification(email.trim(), null)}>验证邮箱 / 重发验证码</button>
            </>
          )}
        </div>
      )}
      {!recovering && onContinueAsGuest && (
        <div className="auth-guest">
          <button type="button" className="secondary-button" disabled={busy} onClick={continueAsGuest}>
            暂不登录，先使用
          </button>
          <p>记录只保存在当前浏览器，登录后可复核并导入账号。AI 功能需要登录。</p>
        </div>
      )}
    </section>
  )
}
