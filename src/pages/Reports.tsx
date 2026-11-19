import { useEffect, useState } from 'react'
import { FileSpreadsheet, FileText, Save } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Loading } from '../components/ui/Loading'
import { EmptyState } from '../components/ui/EmptyState'
import { useToast } from '../context/ToastContext'
import { formatMoney, formatDate, formatDateTime, todayISO } from '../lib/format'
import { exportToExcel, exportToPdf } from '../lib/export'

export default function Reports() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(todayISO())
  const [summary, setSummary] = useState<DailySummary | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [preview, setPreview] = useState<ClosingPreview | null>(null)
  const [closings, setClosings] = useState<DailyClosing[]>([])
  const [openingCash, setOpeningCash] = useState('0')
  const [actualClosing, setActualClosing] = useState('0')
  const [closingNotes, setClosingNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function load(d = date) {
    setLoading(true)
    try {
      const opening = Number(openingCash) || 0
      const [report, prev, history] = await Promise.all([
        window.api.getDailyReport(d),
        window.api.previewClosing(d, opening),
        window.api.listClosings(),
      ])
      setSummary(report.summary)
      setOrders(report.orders)
      setPreview(prev)
      setClosings(history)

      const existing = await window.api.getClosing(d)
      if (existing) {
        setOpeningCash(String(existing.opening_cash ?? 0))
        setActualClosing(String(existing.actual_closing_cash ?? 0))
        setClosingNotes(existing.notes || '')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function refreshPreview() {
    try {
      setPreview(await window.api.previewClosing(date, Number(openingCash) || 0))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Preview failed')
    }
  }

  async function saveClosing() {
    setSaving(true)
    try {
      const result = await window.api.saveClosing({
        closing_date: date,
        opening_cash: Number(openingCash) || 0,
        actual_closing_cash: Number(actualClosing) || 0,
        notes: closingNotes.trim() || undefined,
      })
      toast.success(
        `Closing saved. Cash difference: ${formatMoney(result.cashDifference)}`
      )
      await load(date)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save closing failed')
    } finally {
      setSaving(false)
    }
  }

  function exportExcel() {
    if (!summary) return
    const summaryRows = [
      { Metric: 'Date', Value: summary.date },
      { Metric: 'Total sales', Value: summary.totalSales },
      { Metric: 'Orders', Value: summary.totalOrders },
      { Metric: 'Products sold', Value: summary.productsSold },
      { Metric: 'Cash sales', Value: summary.cashSales },
      { Metric: 'Card sales', Value: summary.cardSales },
      { Metric: 'Other sales', Value: summary.otherSales },
      { Metric: 'Discounts', Value: summary.totalDiscounts },
      { Metric: 'Cancelled orders', Value: summary.cancelledOrders },
      { Metric: 'Purchases', Value: summary.totalPurchases },
      { Metric: 'Expenses', Value: summary.totalExpenses },
      { Metric: 'COGS', Value: summary.cogs },
      { Metric: 'Gross profit', Value: summary.grossProfit },
      { Metric: 'Net profit', Value: summary.netProfit },
    ]
    const orderRows = orders.map((o) => ({
      Order: o.order_number,
      Customer: o.customer_name || '',
      Total: o.grand_total,
      Payment: o.payment_method,
      Status: o.status,
      Date: o.created_at,
    }))
    exportToExcel([...summaryRows, {}, ...orderRows], `daily-report-${summary.date}`)
    toast.success('Excel exported')
  }

  function exportPdf() {
    if (!summary) return
    const columns = ['Metric', 'Value']
    const rows: Array<Array<string | number>> = [
      ['Date', summary.date],
      ['Total sales', formatMoney(summary.totalSales)],
      ['Orders', summary.totalOrders],
      ['Products sold', summary.productsSold],
      ['Cash / Card / Other', `${formatMoney(summary.cashSales)} / ${formatMoney(summary.cardSales)} / ${formatMoney(summary.otherSales)}`],
      ['Discounts', formatMoney(summary.totalDiscounts)],
      ['Cancelled', summary.cancelledOrders],
      ['Purchases', formatMoney(summary.totalPurchases)],
      ['Expenses', formatMoney(summary.totalExpenses)],
      ['COGS', formatMoney(summary.cogs)],
      ['Gross profit', formatMoney(summary.grossProfit)],
      ['Net profit', formatMoney(summary.netProfit)],
      ['—', '—'],
      ['Order #', 'Total'],
      ...orders.map((o) => [o.order_number, formatMoney(o.grand_total)]),
    ]
    exportToPdf(`Daily report ${summary.date}`, columns, rows, `daily-report-${summary.date}`)
    toast.success('PDF exported')
  }

  if (loading && !summary) return <Loading label="Loading report..." />

  const cards = summary
    ? [
        { label: 'Sales', value: formatMoney(summary.totalSales) },
        { label: 'Orders', value: String(summary.totalOrders) },
        { label: 'Products sold', value: String(summary.productsSold) },
        { label: 'Cash sales', value: formatMoney(summary.cashSales) },
        { label: 'Card sales', value: formatMoney(summary.cardSales) },
        { label: 'Other sales', value: formatMoney(summary.otherSales) },
        { label: 'Discounts', value: formatMoney(summary.totalDiscounts) },
        { label: 'Cancelled', value: String(summary.cancelledOrders) },
        { label: 'Purchases', value: formatMoney(summary.totalPurchases) },
        { label: 'Expenses', value: formatMoney(summary.totalExpenses) },
        { label: 'COGS', value: formatMoney(summary.cogs) },
        { label: 'Gross profit', value: formatMoney(summary.grossProfit) },
        { label: 'Net profit', value: formatMoney(summary.netProfit) },
      ]
    : []

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Daily summary, closing & export"
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={exportExcel} disabled={!summary}>
              <FileSpreadsheet size={16} /> Excel
            </button>
            <button type="button" className="btn btn-ghost" onClick={exportPdf} disabled={!summary}>
              <FileText size={16} /> PDF
            </button>
          </>
        }
      />

      <div className="toolbar">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void load(date)}
        >
          Load day
        </button>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14, lineHeight: 1.5 }}>
          Profit note: <strong>gross</strong> = sales − COGS (recipe material costs on completed
          orders); <strong>net</strong> = gross − expenses. Purchases increase stock and are not
          double-counted in profit (COGS already reflects recipe usage).
        </p>
      </div>

      {summary && (
        <div className="stats-grid">
          {cards.map((c) => (
            <div key={c.label} className="stat-card">
              <span>{c.label}</span>
              <strong style={{ fontSize: 20 }}>{c.value}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="split-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Day&apos;s orders</h3>
          {orders.length === 0 ? (
            <EmptyState title="No orders this day" />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Total</th>
                    <th>Payment</th>
                    <th>Status</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td>{o.order_number}</td>
                      <td>{formatMoney(o.grand_total)}</td>
                      <td>{o.payment_method}</td>
                      <td>{o.status}</td>
                      <td>{formatDateTime(o.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Daily closing</h3>
          <div className="form-grid">
            <label className="field">
              Opening cash
              <input
                type="number"
                min={0}
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                onBlur={() => void refreshPreview()}
              />
            </label>
            <label className="field">
              Actual closing cash
              <input
                type="number"
                min={0}
                value={actualClosing}
                onChange={(e) => setActualClosing(e.target.value)}
              />
            </label>
            <label className="field full">
              Notes
              <textarea
                rows={2}
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
              />
            </label>
          </div>
          {preview && (
            <div style={{ marginTop: 12, fontSize: 14, display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Expected cash</span>
                <strong>{formatMoney(preview.expectedCash)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Cash sales</span>
                <strong>{formatMoney(preview.cashSales)}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Expected = opening + cash sales − purchases − expenses
              </div>
            </div>
          )}
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 14, width: '100%' }}
            disabled={saving}
            onClick={() => void saveClosing()}
          >
            <Save size={16} /> {saving ? 'Saving...' : 'Save closing'}
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Closing history</h3>
        {closings.length === 0 ? (
          <EmptyState title="No closings saved yet" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Sales</th>
                  <th>Gross</th>
                  <th>Net</th>
                  <th>Expected</th>
                  <th>Actual</th>
                  <th>Diff</th>
                </tr>
              </thead>
              <tbody>
                {closings.map((c) => (
                  <tr key={c.id}>
                    <td>{formatDate(c.closing_date)}</td>
                    <td>{formatMoney(c.total_sales)}</td>
                    <td>{formatMoney(c.gross_profit)}</td>
                    <td>{formatMoney(c.net_profit)}</td>
                    <td>{formatMoney(c.expected_cash)}</td>
                    <td>{formatMoney(c.actual_closing_cash)}</td>
                    <td>
                      <span
                        className={`badge ${
                          c.cash_difference === 0
                            ? 'badge-ok'
                            : c.cash_difference < 0
                              ? 'badge-danger'
                              : 'badge-warn'
                        }`}
                      >
                        {formatMoney(c.cash_difference)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
