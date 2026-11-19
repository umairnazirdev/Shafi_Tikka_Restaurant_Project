import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Loading } from '../components/ui/Loading'
import { EmptyState } from '../components/ui/EmptyState'
import { useToast } from '../context/ToastContext'
import { formatMoney, formatDate, todayISO } from '../lib/format'

const CATEGORIES = [
  'Electricity',
  'Gas',
  'Rent',
  'Salary',
  'Transportation',
  'Other',
] as const

type ExpenseForm = {
  title: string
  amount: string
  expense_date: string
  category: string
  description: string
}

const emptyForm = (): ExpenseForm => ({
  title: '',
  amount: '',
  expense_date: todayISO(),
  category: 'Other',
  description: '',
})

export default function Expenses() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [form, setForm] = useState<ExpenseForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null)

  async function load() {
    setLoading(true)
    try {
      setExpenses(
        await window.api.listExpenses({
          from: from || undefined,
          to: to || undefined,
        })
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load expenses')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const total = useMemo(
    () => expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [expenses]
  )

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  function openEdit(e: Expense) {
    setEditing(e)
    setForm({
      title: e.title,
      amount: String(e.amount),
      expense_date: e.expense_date,
      category: e.category || 'Other',
      description: e.description || '',
    })
    setModalOpen(true)
  }

  async function save() {
    if (!form.title.trim()) {
      toast.error('Title required')
      return
    }
    const amount = Number(form.amount)
    if (!amount || amount <= 0) {
      toast.error('Amount must be positive')
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        amount,
        expense_date: form.expense_date,
        category: form.category,
        description: form.description.trim() || undefined,
      }
      if (editing) {
        await window.api.updateExpense(editing.id, payload)
        toast.success('Expense updated')
      } else {
        await window.api.createExpense(payload)
        toast.success('Expense added')
      }
      setModalOpen(false)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await window.api.deleteExpense(deleteTarget.id)
      toast.success('Expense deleted')
      setDeleteTarget(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle="Shop running costs"
        actions={
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Add expense
          </button>
        }
      />

      <div className="toolbar">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <button type="button" className="btn btn-primary" onClick={() => void load()}>
          Apply
        </button>
        <div className="stat-card" style={{ padding: '8px 14px', marginLeft: 'auto' }}>
          <span>Total</span>
          <strong style={{ fontSize: 18 }}>{formatMoney(total)}</strong>
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : expenses.length === 0 ? (
        <div className="card">
          <EmptyState title="No expenses" hint="Add rent, gas, salary, etc." />
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td>
                    <strong>{e.title}</strong>
                  </td>
                  <td>
                    <span className="badge badge-muted">{e.category}</span>
                  </td>
                  <td>{formatMoney(e.amount)}</td>
                  <td>{formatDate(e.expense_date)}</td>
                  <td>{e.description || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="btn btn-ghost" onClick={() => openEdit(e)}>
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => setDeleteTarget(e)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <Modal
          title={editing ? 'Edit expense' : 'Add expense'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <label className="field full">
              Title
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </label>
            <label className="field">
              Amount
              <input
                type="number"
                min={0}
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </label>
            <label className="field">
              Date
              <input
                type="date"
                value={form.expense_date}
                onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))}
              />
            </label>
            <label className="field full">
              Category
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="field full">
              Description
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </label>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete expense"
          message={`Delete “${deleteTarget.title}”?`}
          confirmLabel="Delete"
          danger
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </div>
  )
}
