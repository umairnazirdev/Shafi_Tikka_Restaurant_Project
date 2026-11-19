import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Receipt,
  Users,
  Wallet,
  CalendarCheck,
  Settings,
} from 'lucide-react'

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/pos', label: 'POS', icon: ShoppingCart },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/orders', label: 'Orders', icon: Receipt },
  { to: '/waiters', label: 'Waiters', icon: Users },
  { to: '/expenses', label: 'Expenses', icon: Wallet },
  { to: '/reports', label: 'Daily Report', icon: CalendarCheck },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar({
  posView,
  draftOrderCount,
  onPosViewChange,
}: {
  posView: 'menu' | 'orders'
  draftOrderCount: number
  onPosViewChange: (view: 'menu' | 'orders') => void
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const isPos = location.pathname === '/pos'

  function openPosView(view: 'menu' | 'orders') {
    onPosViewChange(view)
    navigate('/pos')
  }

  return (
    <header className="sidebar">
      <div className="brand">
        <div className="brand-mark">ST</div>
        <div>
          <strong>SHAFI TIKKA</strong>
          <span>Counter POS</span>
        </div>
      </div>
      <nav className="side-nav">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="nav-actions">
        <div className="pos-topbar">
          <button
            type="button"
            className={`pos-top-button ${isPos && posView === 'menu' ? 'active' : ''}`}
            onClick={() => openPosView('menu')}
          >
            Menu
          </button>
          <button
            type="button"
            className={`pos-top-button ${isPos && posView === 'orders' ? 'active' : ''}`}
            onClick={() => openPosView('orders')}
          >
            Order
            <span className="pos-order-count">{draftOrderCount}</span>
          </button>
        </div>
      </div>
    </header>
  )
}
