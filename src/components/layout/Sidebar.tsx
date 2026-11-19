import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Receipt,
  Boxes,
  ChefHat,
  Truck,
  Wallet,
  CalendarCheck,
  Settings,
} from 'lucide-react'

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/pos', label: 'POS', icon: ShoppingCart },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/orders', label: 'Orders', icon: Receipt },
  { to: '/stock', label: 'Stock', icon: Boxes },
  { to: '/recipes', label: 'Recipes', icon: ChefHat },
  { to: '/purchases', label: 'Purchases', icon: Truck },
  { to: '/expenses', label: 'Expenses', icon: Wallet },
  { to: '/reports', label: 'Daily Report', icon: CalendarCheck },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">ST</div>
        <div>
          <strong>SHAFI TIKKA</strong>
          <span>Counter POS</span>
        </div>
      </div>
      <nav className="side-nav">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
