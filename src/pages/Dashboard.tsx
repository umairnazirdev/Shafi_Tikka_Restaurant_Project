import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ShoppingCart } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Loading } from '../components/ui/Loading'
import { EmptyState } from '../components/ui/EmptyState'
import { useToast } from '../context/ToastContext'
import { formatMoney, formatDateTime } from '../lib/format'

export default function Dashboard() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats | null>(null)

  async function load() {
    setLoading(true)
    try {
      setStats(await window.api.getDashboardStats())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  if (loading && !stats) return <Loading label="Loading dashboard..." />
  if (!stats) return <EmptyState title="No dashboard data" hint="Try refreshing the page." />

  const cards = [
    { label: "Today's Sales", value: formatMoney(stats.totalSales) },
    { label: 'Orders', value: String(stats.totalOrders) },
    { label: 'Expenses', value: formatMoney(stats.totalExpenses) },
    { label: 'Gross Profit', value: formatMoney(stats.grossProfit) },
    { label: 'Net Profit', value: formatMoney(stats.netProfit) },
  ]

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Today’s overview for Shafi Tikka"
        actions={
          <Link to="/pos" className="btn btn-primary btn-lg">
            <ShoppingCart size={18} /> Open POS
          </Link>
        }
      />

      <div className="stats-grid">
        {cards.map((c) => (
          <div key={c.label} className="stat-card">
            <span>{c.label}</span>
            <strong>{c.value}</strong>
          </div>
        ))}
      </div>

      <div className="dashboard-grid" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Sales (last 14 days)</h3>
          {stats.salesChart.length === 0 ? (
            <EmptyState title="No sales yet" hint="Completed orders will appear here." />
          ) : (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <AreaChart data={stats.salesChart}>
                  <defs>
                    <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#c45c26" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#c45c26" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eadfce" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatMoney(Number(v))} />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#c45c26"
                    fill="url(#salesFill)"
                    name="Sales"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Orders volume</h3>
          {stats.salesChart.length === 0 ? (
            <EmptyState title="No order chart data" />
          ) : (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={stats.salesChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eadfce" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="orders" fill="#2b211c" name="Orders" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Recent transactions</h3>
          {stats.recentTransactions.length === 0 ? (
            <EmptyState title="No recent orders" />
          ) : (
            <div className="recent-list">
              {stats.recentTransactions.map((o) => (
                <div key={o.id} className="list-row">
                  <div>
                    <strong>{o.order_number}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {formatDateTime(o.created_at)} · {o.payment_method}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong>{formatMoney(o.grand_total)}</strong>
                    <div>
                      <span
                        className={`badge ${
                          o.status === 'completed'
                            ? 'badge-ok'
                            : o.status === 'cancelled'
                              ? 'badge-danger'
                              : 'badge-muted'
                        }`}
                      >
                        {o.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
