import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ToastProvider } from './context/ToastContext'
import { AppLayout } from './components/layout/AppLayout'
import Dashboard from './pages/Dashboard'
import POS from './pages/POS'
import Products from './pages/Products'
import Orders from './pages/Orders'
import Waiters from './pages/Waiters'
import Expenses from './pages/Expenses'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import './App.css'

export default function App() {
  return (
    <ToastProvider>
      <HashRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="pos" element={<POS />} />
            <Route path="products" element={<Products />} />
            <Route path="orders" element={<Orders />} />
            <Route path="waiters" element={<Waiters />} />
            <Route path="expenses" element={<Expenses />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </ToastProvider>
  )
}
