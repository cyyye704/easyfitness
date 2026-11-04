import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { corosClient, CorosRequestError } from './client'
import type { CorosPreview, CorosRegion, CorosStatus } from './types'

const callbackNotice = () => {
  if (typeof window === 'undefined') return null
  const result = new URL(window.location.href).searchParams.get('coros')
  if (result === 'connected') return 'COROS 授权已完成，请读取数据并复核。'
  if (result === 'cancelled') return '已取消 COROS 授权，你可以重新连接。'
  if (result === 'error') return 'COROS 授权未完成，请重新连接；若持续失败，请检查账号地区及部署配置。'
  return null
}

export function useCorosConnection(userId: string | undefined, cancellationSignal: AbortSignal, active = true) {
  const [status, setStatus] = useState<CorosStatus | null>(null)
  const [busy, setBusy] = useState<string | null>(userId ? 'status' : null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState(callbackNotice)
  const [preview, setPreview] = useState<CorosPreview | null>(null)
  const controller = useRef<AbortController | null>(null)
  const working = useRef(Boolean(userId))
  const currentAction = useRef<string | null>(userId ? 'status' : null)
  const activeRef = useRef(active)

  useLayoutEffect(() => {
    activeRef.current = active
    // A hidden module may finish a preview, but must never navigate away.
    if (!active && currentAction.current === 'connect') controller.current?.abort()
  }, [active])

  useEffect(() => {
    const cancel = () => controller.current?.abort()
    cancellationSignal.addEventListener('abort', cancel, { once: true })
    return () => cancellationSignal.removeEventListener('abort', cancel)
  }, [cancellationSignal])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.has('coros')) {
      url.searchParams.delete('coros')
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    }
    if (!userId || cancellationSignal.aborted) return
    const request = new AbortController()
    controller.current = request
    working.current = true
    currentAction.current = 'status'
    const finish = () => {
      if (controller.current !== request) return
      controller.current = null
      currentAction.current = null
      working.current = false
      setBusy(null)
    }
    request.signal.addEventListener('abort', finish, { once: true })
    void corosClient.status(userId, request.signal).then((next) => {
      if (!request.signal.aborted) setStatus(next)
    }).catch((reason: unknown) => {
      if (!request.signal.aborted) setError(reason instanceof Error ? reason.message : '无法读取连接状态。')
    }).finally(() => {
      request.signal.removeEventListener('abort', finish)
      finish()
    })
    return () => {
      const pending = controller.current
      controller.current = null
      request.abort()
      pending?.abort()
    }
  }, [userId, cancellationSignal])

  const run = async (action: string, task: (signal: AbortSignal) => Promise<void>) => {
    if (!userId || working.current || cancellationSignal.aborted || (action === 'connect' && !activeRef.current)) return
    working.current = true
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    currentAction.current = action
    const finish = () => {
      // An aborted request can settle after a newer request has already started.
      if (controller.current !== request) return
      controller.current = null
      currentAction.current = null
      working.current = false
      setBusy(null)
    }
    request.signal.addEventListener('abort', finish, { once: true })
    setBusy(action)
    setError(null)
    setNotice(null)
    try { await task(request.signal) } catch (reason) {
      if (!request.signal.aborted) {
        setError(reason instanceof Error ? reason.message : 'COROS 操作失败，请重试。')
        if (reason instanceof CorosRequestError && reason.code === 'COROS_RECONNECT_REQUIRED') {
          setStatus({ configured: true, connected: false })
          setPreview(null)
        }
      }
    } finally {
      request.signal.removeEventListener('abort', finish)
      finish()
    }
  }

  return {
    status, busy, error, notice, preview, setPreview, setError, setNotice,
    refresh: () => run('status', async (signal) => {
      const next = await corosClient.status(userId!, signal)
      signal.throwIfAborted()
      setStatus(next)
    }),
    connect: (region: CorosRegion) => run('connect', async (signal) => {
      const url = await corosClient.connect(userId!, region, signal)
      signal.throwIfAborted()
      cancellationSignal.throwIfAborted()
      window.location.assign(url)
    }),
    read: () => run('preview', async (signal) => {
      setPreview(null)
      const next = await corosClient.preview(userId!, signal)
      signal.throwIfAborted()
      setPreview(next)
    }),
    disconnect: () => run('disconnect', async (signal) => {
      await corosClient.disconnect(userId!, signal)
      signal.throwIfAborted()
      setStatus({ configured: true, connected: false })
      setPreview(null)
      setNotice('已断开当前浏览器的 COROS 连接，已保存的记录保留。')
    }),
  }
}
