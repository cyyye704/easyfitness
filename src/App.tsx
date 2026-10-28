import { lazy, Suspense, useMemo } from 'react'
import './App.css'
import './styles/auth.css'
import './styles/account.css'
import { AuthPanel } from './components/AuthPanel'
import { supabase, supabaseConfigError } from './auth/supabase'
import { useAuth } from './auth/useAuth'
import { createCloudRepository } from './data/repository'
import { createLocalRepository } from './data/localRepository'

const FitnessWorkspace = lazy(() => import('./FitnessWorkspace').then((module) => ({
  default: module.FitnessWorkspace,
})))

function App() {
  const auth = useAuth()
  const userId = auth.session?.user.id
  const repository = useMemo(() => userId && supabase
    ? createCloudRepository(supabase, userId)
    : createLocalRepository(), [userId])

  if (supabaseConfigError) {
    return <main className="app-shell">
      <section className="panel">
        <h1>登录服务配置不完整</h1>
        <p role="alert">{supabaseConfigError}</p>
        <p>请按项目部署说明配置环境变量后重新构建。</p>
      </section>
    </main>
  }
  if (supabase && auth.loading) {
    return <main className="app-shell"><p role="status">正在恢复登录状态……</p></main>
  }
  if (supabase && (!auth.session || auth.recovering)) {
    return <>
      {auth.error && <p className="storage-notice auth-global-error" role="alert">{auth.error}</p>}
      <AuthPanel recovering={auth.recovering} onRecovered={auth.finishRecovery} />
    </>
  }

  return <>
    {auth.error && <p className="storage-notice auth-global-error" role="alert">{auth.error}</p>}
    <Suspense fallback={<main className="app-shell"><p role="status">正在打开记录……</p></main>}>
      <FitnessWorkspace
        key={userId ?? 'local'}
        repository={repository}
        userId={userId}
        email={auth.session?.user.email}
        onSignOut={supabase ? auth.signOut : undefined}
      />
    </Suspense>
  </>
}

export default App
