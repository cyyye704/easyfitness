import { useEffect, useState, useSyncExternalStore } from 'react'
import type { DataRepository } from './types'
import { WorkspaceStore } from './workspaceStore'

export function useWorkspaceData(repository: DataRepository) {
  const [store] = useState(() => new WorkspaceStore(repository))
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  useEffect(() => {
    store.start()
    return store.stop
  }, [store])
  useEffect(() => {
    if (!state.pending && !state.busy) return
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [state.pending, state.busy])
  return { ...state, store }
}
