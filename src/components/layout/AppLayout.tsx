import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

export function AppLayout() {
  const [posView, setPosView] = useState<'menu' | 'orders'>('menu')
  const [draftOrderCount, setDraftOrderCount] = useState(1)

  return (
    <div className="app-shell">
      <Sidebar
        posView={posView}
        draftOrderCount={draftOrderCount}
        onPosViewChange={setPosView}
      />
      <main className="main-content">
        <Outlet context={{ posView, setPosView, setDraftOrderCount }} />
      </main>
    </div>
  )
}
