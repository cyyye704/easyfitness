import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AUTH_LINK_ERROR, getAuthErrorMessage } from './errors'
import { cleanAuthUrl } from './redirect'
import { initialAuthRedirect, supabase } from './supabase'

const replaceAuthUrl = (recovering: boolean) => {
  const clean = cleanAuthUrl(window.location.href, recovering)
  if (clean !== window.location.href) window.history.replaceState(window.history.state, '', clean)
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(supabase !== null)
  const [error, setError] = useState<string | null>(initialAuthRedirect.error)
  const [recovering, setRecovering] = useState(Boolean(supabase && initialAuthRedirect.recovering))
  const recoveryRef = useRef(Boolean(supabase && initialAuthRedirect.recovering))

  useEffect(() => {
    if (!supabase) {
      replaceAuthUrl(false)
      return
    }
    const client = supabase
    let active = true
    let liveEvents = 0
    let initializing = true
    const { data: { subscription } } = client.auth.onAuthStateChange((event, nextSession) => {
      if (!active || (event === 'INITIAL_SESSION' && liveEvents > 0)) return
      if (event !== 'INITIAL_SESSION') liveEvents += 1
      setSession(nextSession)
      if (event === 'PASSWORD_RECOVERY') {
        recoveryRef.current = true
        setRecovering(true)
        setError(null)
      } else if (event === 'SIGNED_OUT') {
        recoveryRef.current = false
        setRecovering(false)
        replaceAuthUrl(false)
      } else if (event === 'SIGNED_IN') {
        setError(null)
      }
      // Initialization below owns callback errors and the initial loading state.
      if (!initializing) setLoading(false)
    })

    const version = liveEvents
    void (async () => {
      try {
        const initialized = await client.auth.initialize()
        const result = await client.auth.getSession()
        if (!active) return
        const callbackUnresolved = initialAuthRedirect.hasCode && new URL(window.location.href).searchParams.has('code')
        const callbackError = initialAuthRedirect.error ??
          (initialized.error ? getAuthErrorMessage(initialized.error, AUTH_LINK_ERROR) : null) ??
          (callbackUnresolved ? AUTH_LINK_ERROR : null)
        if (liveEvents === version) {
          setSession(result.data.session)
          setError(callbackError ?? (result.error ? getAuthErrorMessage(result.error) : null))
          recoveryRef.current = Boolean(result.data.session && recoveryRef.current && !callbackError)
          setRecovering(recoveryRef.current)
        }
        if (callbackError) {
          setError(callbackError)
          recoveryRef.current = false
          setRecovering(false)
        }
        replaceAuthUrl(recoveryRef.current)
      } catch (initializationError) {
        if (active && liveEvents === version) {
          setError(getAuthErrorMessage(initializationError, AUTH_LINK_ERROR))
          recoveryRef.current = false
          setRecovering(false)
          replaceAuthUrl(false)
        }
      } finally {
        initializing = false
        if (active) {
          replaceAuthUrl(recoveryRef.current)
          setLoading(false)
        }
      }
    })()
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const finishRecovery = () => {
    recoveryRef.current = false
    setRecovering(false)
    setError(null)
    replaceAuthUrl(false)
  }

  const signOut = async (): Promise<string | null> => {
    if (!supabase) return null
    try {
      const result = await supabase.auth.signOut({ scope: 'local' })
      if (result.error) return getAuthErrorMessage(result.error, '暂时无法退出登录，请重试。')
      finishRecovery()
      return null
    } catch (signOutError) {
      return getAuthErrorMessage(signOutError, '暂时无法退出登录，请重试。')
    }
  }

  return { session, loading, error, recovering, finishRecovery, signOut }
}
