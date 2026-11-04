import { useEffect, useRef, useState } from 'react'
import { workspacePages, type WorkspacePage } from '../workspace/navigation'

const iconPaths: Record<WorkspacePage, string> = {
  home: 'm3 10 9-7 9 7v10H3Z M9 20v-7h6v7',
  records: 'M8 4H5v17h14V4h-3 M8 2h8v4H8Z M8 11h8 M8 16h5',
  ai: 'm12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8Z',
  history: 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2',
  coros: 'M8 6V2h8v4 M8 18v4h8v-4 M6 6h12v12H6Z M12 9v3l2 1',
  profile: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-3a8 8 0 0 1 16 0v3',
  knowledge: 'M12 5v16 M3 3l9 2 9-2v16l-9 2-9-2Z',
  account: 'M4 4h16v16H4Z M8 8h8 M8 12h8 M8 16h4',
}

export function WorkspaceIcon({ page }: { page: WorkspacePage }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={iconPaths[page]} /></svg>
}

type Props = {
  activePage: WorkspacePage
  onNavigate: (page: WorkspacePage) => void
  cloud: boolean
}

export function WorkspaceNavigation({ activePage, onNavigate, cloud }: Props) {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    dialog?.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const desktop = window.matchMedia('(min-width: 960px)')
    const closeOnDesktop = () => { if (desktop.matches) dialog?.close() }
    desktop.addEventListener('change', closeOnDesktop)
    return () => {
      dialog?.close()
      document.body.style.overflow = previousOverflow
      desktop.removeEventListener('change', closeOnDesktop)
    }
  }, [open])

  const links = (mobile: boolean) => <nav aria-label="模块导航">
    {workspacePages.map((page) => <a key={page.id} href={`#/${page.id}`} aria-current={activePage === page.id ? 'page' : undefined}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
        event.preventDefault()
        if (mobile) dialogRef.current?.close()
        onNavigate(page.id)
      }}>
      <WorkspaceIcon page={page.id} /><span>{page.label}</span>
    </a>)}
  </nav>

  const brand = <div className="navigation-brand"><span className="brand-mark" aria-hidden="true">E</span><strong>EasyFitness</strong></div>
  const footer = <p className="navigation-footer">{cloud ? '已登录 · 云端保存' : '本地模式 · 当前浏览器保存'}</p>

  return <>
    <aside className="workspace-sidebar">{brand}{links(false)}{footer}</aside>
    <div className="navigation-mobile-bar">
      <button className="navigation-toggle" type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        <span>菜单</span>
      </button>
      <strong>EasyFitness</strong>
    </div>
    <dialog ref={dialogRef} id="mobile-navigation" className="navigation-drawer" aria-label="模块导航" onClose={() => setOpen(false)}
      onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close() }}>
      <div className="navigation-drawer-content">
        <div className="navigation-drawer-heading">{brand}<button type="button" className="navigation-close" aria-label="关闭菜单" onClick={() => dialogRef.current?.close()}>×</button></div>
        {links(true)}{footer}
      </div>
    </dialog>
  </>
}
