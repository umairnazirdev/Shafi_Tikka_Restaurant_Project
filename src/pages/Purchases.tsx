import { useEffect, useMemo, useState } from 'react'
import { Plus, Eye, Trash2 } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Modal } from '../components/ui/Modal'
import { Loading } from '../components/ui/Loading'
import { EmptyState } from '../components/ui/EmptyState'
import { useToast } from '../context/ToastContext'
import { formatMoney, formatDate, formatQty, todayISO } from '../lib/format'

type PurchaseLine = {
  raw_material_id: number
  quantity: string
  unit_price: string
}

export default function Purchases() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [materials, setMaterials] = useState<RawMaterial[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [detail, setDetail] = useState<Purchase | null>(null)
  const [saving, setSaving] = useState(false)

  const [purchaseDate, setPurchaseDate] = useState(todayISO())
  const [supplierId, setSupplierId] = useState<number | ''>('')
  const [supplierName, setSupplierName] = useState('')
  const [newSupplierName, setNewSupplierName] = useState('')
  const [newSupplierPhone, setNewSupplierPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<PurchaseLine[]>([])

  async function load() {
    setLoading(true)
    try {
      const [rows, mats, sups] = await Promise.all([
        window.api.listPurchases({
          from: from || undefined,
          to: to || undefined,
        }),
        window.api.listMaterials(),
        window.api.listSuppliers(),
      ])
      setPurchases(rows)
      setMaterials(mats)
      setSuppliers(sups)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load purchases')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const lineTotal = useMemo(
    () =>
      lines.reduce(
        (s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0),
        0
      ),
    [lines]
  )

  function openCreate() {
    setPurchaseDate(todayISO())
    setSupplierId('')
    setSupplierName('')
    setNewSupplierName('')
    setNewSupplierPhone('')
    setNotes('')
    setLines([
      {
        raw_material_id: materials[0]?.id ?? 0,
        quantity: '',
        unit_price: String(materials[0]?.purchase_price ?? 0),
      },
    ])
    setCreateOpen(true)
  }

  async function createSupplierInline() {
    if (!newSupplierName.trim()) return
    try {
      const { id } = await window.api.createSupplier({
        name: newSupplierName.trim(),
        phone: newSupplierPhone.trim() || undefined,
      })
      const list = await window.api.listSuppliers()
      setSuppliers(list)
      setSupplierId(id)
      setNewSupplierName('')
      setNewSupplierPhone('')
      toast.success('Supplier added')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create supplier')
    }
  }

  async function savePurchase() {
    const items = lines
      .map((l) => ({
        raw_material_id: Number(l.raw_material_id),
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price),
      }))
      .filter((l) => l.raw_material_id && l.quantity > 0)

    if (!items.length) {
      toast.error('Add at least one material line')
      return
    }

    setSaving(true)
    try {
      const result = await window.api.createPurchase({
        supplier_id: supplierId === '' ? null : Number(supplierId),
        supplier_name: supplierName.trim() || undefined,
        purchase_date: purchaseDate,
        notes: notes.trim() || undefined,
        items,
      })
      toast.success(`Purchase ${result.purchase_number} saved`)
      setCreateOpen(false)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function viewPurchase(id: number) {
    try {
      setDetail(await window.api.getPurchase(id))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load purchase')
    }
  }

  return (
    <div>
      <PageHeader
        title="Purchases"
        subtitle="Buy raw materials — stock increases automatically"
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={openCreate}
            disabled={!materials.length}
          >
            <Plus size={16} /> New purchase
          </button>
        }
      />

      <div className="toolbar">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <button type="button" className="btn btn-primary" onClick={() => void load()}>
          Apply
        </button>
      </div>

      {loading ? (
        <Loading />
      ) : purchases.length === 0 ? (
        <div className="card">
          <EmptyState title="No purchases" hint="Record a purchase to add stock." />
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Number</th>
                <th>Supplier</th>
                <th>Date</th>
                <th>Total</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.purchase_number}</strong>
                  </td>
                  <td>{p.supplier_name || '—'}</td>
                  <td>{formatDate(p.purchase_date)}</td>
                  <td>{formatMoney(p.total_amount)}</td>
                  <td>{p.notes || '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => void viewPurchase(p.id)}
                    >
                      <Eye size={14} /> View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <Modal
          title="New purchase"
          wide
          onClose={() => setCreateOpen(false)}
          footer={
            <>
              <strong style={{ marginRight: 'auto' }}>Total: {formatMoney(lineTotal)}</strong>
              <button type="button" className="btn btn-ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={() => void savePurchase()}
              >
                {saving ? 'Saving...' : 'Save purchase'}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <label className="field">
              Date
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </label>
            <label className="field">
              Supplier
              <select
                value={supplierId === '' ? '' : String(supplierId)}
                onChange={(e) => {
                  const id = e.target.value === '' ? '' : Number(e.target.value)
                  setSupplierId(id)
                  const s = suppliers.find((x) => x.id === id)
                  if (s) setSupplierName(s.name)
                }}
              >
                <option value="">None / walk-in</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="field full">
              <span>Quick add supplier</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  placeholder="Name"
                  value={newSupplierName}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                />
                <input
                  placeholder="Phone"
                  value={newSupplierPhone}
                  onChange={(e) => setNewSupplierPhone(e.target.value)}
                />
                <button type="button" className="btn btn-secondary" onClick={() => void createSupplierInline()}>
                  Add
                </button>
              </div>
            </div>
            <label className="field full">
              Notes
              <input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="toolbar" style={{ justifyContent: 'space-between' }}>
              <strong>Materials</strong>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    {
                      raw_material_id: materials[0]?.id ?? 0,
                      quantity: '',
                      unit_price: String(materials[0]?.purchase_price ?? 0),
                    },
                  ])
                }
              >
                <Plus size={14} /> Add line
              </button>
            </div>
            {lines.map((line, idx) => (
              <div key={idx} className="form-grid" style={{ marginBottom: 8, alignItems: 'end' }}>
                <label className="field">
                  Material
                  <select
                    value={line.raw_material_id || ''}
                    onChange={(e) => {
                      const id = Number(e.target.value)
                      const mat = materials.find((m) => m.id === id)
                      setLines((prev) =>
                        prev.map((l, i) =>
                          i === idx
                            ? {
                                ...l,
                                raw_material_id: id,
                                unit_price: String(mat?.purchase_price ?? l.unit_price),
                              }
                            : l
                        )
                      )
                    }}
                  >
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.unit})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Qty
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={line.quantity}
                    onChange={(e) => {
                      const q = e.target.value
                      setLines((prev) =>
                        prev.map((l, i) => (i === idx ? { ...l, quantity: q } : l))
                      )
                    }}
                  />
                </label>
                <label className="field">
                  Unit price
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={line.unit_price}
                    onChange={(e) => {
                      const up = e.target.value
                      setLines((prev) =>
                        prev.map((l, i) => (i === idx ? { ...l, unit_price: up } : l))
                      )
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={lines.length <= 1}
                  onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {detail && (
        <Modal title={`Purchase ${detail.purchase_number}`} wide onClose={() => setDetail(null)}>
          <div className="form-grid" style={{ marginBottom: 12 }}>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                Supplier
              </div>
              <strong>{detail.supplier_name || '—'}</strong>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                Date
              </div>
              <strong>{formatDate(detail.purchase_date)}</strong>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                Total
              </div>
              <strong>{formatMoney(detail.total_amount)}</strong>
            </div>
            <div className="full">
              <div className="muted" style={{ fontSize: 12 }}>
                Notes
              </div>
              <strong>{detail.notes || '—'}</strong>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Qty</th>
                  <th>Unit price</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {(detail.items || []).map((i, idx) => (
                  <tr key={idx}>
                    <td>
                      {i.material_name} ({i.unit})
                    </td>
                    <td>{formatQty(i.quantity)}</td>
                    <td>{formatMoney(i.unit_price)}</td>
                    <td>{formatMoney(i.total_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  )
}
