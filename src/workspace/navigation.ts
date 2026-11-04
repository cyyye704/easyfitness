import { useEffect, useState } from 'react'

export const workspacePages = [
  { id: 'home', label: '首页', description: '饮食与训练，一眼看清。' },
  { id: 'records', label: '每日记录', description: '记录饮食、体重、训练和睡眠。' },
  { id: 'ai', label: 'AI 记录', description: '用一段话整理记录，确认后保存。' },
  { id: 'history', label: '历史与统计', description: '查看过去的记录和阶段变化。' },
  { id: 'coros', label: '手表同步', description: '读取高驰数据，核对后导入。' },
  { id: 'profile', label: '个人档案', description: '管理身体基线与训练习惯。' },
  { id: 'knowledge', label: '减脂知识', description: '了解饮食、训练与恢复的基础知识。' },
  { id: 'account', label: '账号与数据', description: '管理登录、本机导入和数据保存。' },
] as const

export type WorkspacePage = typeof workspacePages[number]['id']

export function getWorkspacePage(url: URL): WorkspacePage {
  // OAuth returns to the root URL; open the device module to show its result.
  if (url.searchParams.has('coros')) return 'coros'
  const route = url.hash.slice(2)
  return workspacePages.find((page) => url.hash.startsWith('#/') && page.id === route)?.id ?? 'home'
}

export function useWorkspaceNavigation() {
  const [navigation, setNavigation] = useState(() => {
    const page = getWorkspacePage(new URL(window.location.href))
    return { page, visited: new Set<WorkspacePage>([page]) }
  })

  useEffect(() => {
    const url = new URL(window.location.href)
    if (!url.hash) {
      url.hash = `/${navigation.page}`
      window.history.replaceState(window.history.state, '', url)
    }
  }, [navigation.page])

  useEffect(() => {
    const restore = () => {
      const page = getWorkspacePage(new URL(window.location.href))
      setNavigation((current) => ({ page, visited: new Set([...current.visited, page]) }))
    }
    window.addEventListener('popstate', restore)
    window.addEventListener('hashchange', restore)
    return () => {
      window.removeEventListener('popstate', restore)
      window.removeEventListener('hashchange', restore)
    }
  }, [])

  const navigate = (page: WorkspacePage) => {
    if (page === navigation.page) return
    const url = new URL(window.location.href)
    url.hash = `/${page}`
    window.history.pushState(window.history.state, '', url)
    setNavigation((current) => ({ page, visited: new Set([...current.visited, page]) }))
  }

  return { activePage: navigation.page, visitedPages: navigation.visited, navigate }
}
