import { useEffect, useState } from 'react'
import { Eye, Printer, XCircle } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Loading } from '../components/ui/Loading'
import { EmptyState } from '../components/ui/EmptyState'
import { useToast } from '../context/ToastContext'
import { formatMoney, formatDateTime, todayISO } from '../lib/format'

export default function Orders() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState(todayISO())
  const [to, setTo] = useState(todayISO())
  const [status, setStatus] = useState('all')
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const rows = await window.api.listOrders({
        search: search.trim() || undefined,
        from: from || undefined,
        to: to || undefined,
        status: status === 'all' ? undefined : status,
      })
      setOrders(rows)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load orders')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function viewOrder(id: number) {
    try {
      setDetail(await window.api.getOrder(id))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load order')
    }
  }

  async function reprint(orderId: number) {
    setBusy(true)
    try {
      await window.api.printReceipt(orderId)
      toast.success('Receipt sent to printer')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Print failed')
    } finally {
      setBusy(false)
    }
  }

  async function confirmCancel() {
    if (!cancelTarget) return
    setBusy(true)
    try {
      await window.api.cancelOrder(cancelTarget.id)
      toast.success('Order cancelled')
      setCancelTarget(null)
      if (detail?.id === cancelTarget.id) setDetail(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cancel failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="Orders" subtitle="Search, view, reprint or cancel" />

      <div className="toolbar">
        <input
          placeholder="Search order # / customer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button type="button" className="btn btn-primary" onClick={() => void load()}>
          Apply
        </button>
      </div>

      {loading ? (
        <Loading />
      ) : orders.length === 0 ? (
        <div className="card">
          <EmptyState title="No orders found" hint="Adjust filters or create an order from POS." />
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <strong>{o.order_number}</strong>
                  </td>
                  <td>{o.customer_name || '—'}</td>
                  <td>{formatMoney(o.grand_total)}</td>
                  <td>{o.payment_method}</td>
                  <td>
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
                  </td>
                  <td>{formatDateTime(o.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="btn btn-ghost" onClick={() => void viewOrder(o.id)}>
                        <Eye size={14} /> View
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busy}
                        onClick={() => void reprint(o.id)}
                      >
                        <Printer size={14} />
                      </button>
                      {o.status !== 'cancelled' && (
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => setCancelTarget(o)}
                        >
                          <XCircle size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <Modal
          title={`Order ${detail.order_number}`}
          wide
          onClose={() => setDetail(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setDetail(null)}>
                Close
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => void reprint(detail.id)}
              >
                <Printer size={14} /> Reprint
              </button>
              {detail.status !== 'cancelled' && (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => setCancelTarget(detail)}
                >
                  Cancel order
                </button>
              )}
            </>
          }
        >
          <div className="form-grid" style={{ marginBottom: 12 }}>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                Customer
              </div>
              <strong>{detail.customer_name || 'Walk-in'}</strong>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                Waiter
              </div>
              <strong>{detail.waiter_name || '—'}</strong>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                Phone
              </div>
              <strong>{detail.customer_phone || '—'}</strong>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                Payment
              </div>
              <strong>{detail.payment_method}</strong>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                Status
              </div>
              <strong>{detail.status}</strong>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                Subtotal
              </div>
              <strong>{formatMoney(detail.subtotal)}</strong>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                Discount
              </div>
              <strong>{formatMoney(detail.discount)}</strong>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                Grand total
              </div>
              <strong>{formatMoney(detail.grand_total)}</strong>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                Date
              </div>
              <strong>{formatDateTime(detail.created_at)}</strong>
            </div>
            {detail.notes && (
              <div className="full">
                <div className="muted" style={{ fontSize: 12 }}>
                  Notes
                </div>
                <strong>{detail.notes}</strong>
              </div>
            )}
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.product_name}</td>
                    <td>{i.quantity}</td>
                    <td>{formatMoney(i.unit_price)}</td>
                    <td>{formatMoney(i.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}

      {cancelTarget && (
        <ConfirmDialog
          title="Cancel order"
          message={`Cancel order ${cancelTarget.order_number}?`}
          confirmLabel="Cancel order"
          danger
          onClose={() => setCancelTarget(null)}
          onConfirm={() => void confirmCancel()}
        />
      )}
    </div>
  )
}
