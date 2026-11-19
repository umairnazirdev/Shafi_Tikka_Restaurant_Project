import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, SlidersHorizontal } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Loading } from '../components/ui/Loading'
import { EmptyState } from '../components/ui/EmptyState'
import { useToast } from '../context/ToastContext'
import { formatMoney, formatQty, formatDateTime } from '../lib/format'

const UNITS = ['KG', 'Gram', 'Liter', 'Piece'] as const

type MaterialForm = {
  name: string
  unit: string
  current_stock: string
  min_stock: string
  purchase_price: string
  notes: string
}

type AdjustForm = {
  raw_material_id: number
  material_name: string
  quantity: string
  movement_type: 'in' | 'out' | 'adjustment' | 'wastage'
  unit_price: string
  notes: string
}

const emptyMaterial = (): MaterialForm => ({
  name: '',
  unit: 'KG',
  current_stock: '0',
  min_stock: '0',
  purchase_price: '0',
  notes: '',
})

export default function Stock() {
  const toast = useToast()
  const [tab, setTab] = useState<'materials' | 'movements'>('materials')
  const [loading, setLoading] = useState(true)
  const [materials, setMaterials] = useState<RawMaterial[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<RawMaterial | null>(null)
  const [form, setForm] = useState<MaterialForm>(emptyMaterial())
  const [adjust, setAdjust] = useState<AdjustForm | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RawMaterial | null>(null)
  const [saving, setSaving] = useState(false)

  async function loadMaterials(q?: string) {
    setLoading(true)
    try {
      setMaterials(await window.api.listMaterials(q?.trim() || undefined))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load materials')
    } finally {
      setLoading(false)
    }
  }

  async function loadMovements() {
    setLoading(true)
    try {
      setMovements(await window.api.listStockMovements())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load movements')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'materials') void loadMaterials(search)
    else void loadMovements()
  }, [tab])

  function openCreate() {
    setEditing(null)
    setForm(emptyMaterial())
    setModalOpen(true)
  }

  function openEdit(m: RawMaterial) {
    setEditing(m)
    setForm({
      name: m.name,
      unit: m.unit,
      current_stock: String(m.current_stock),
      min_stock: String(m.min_stock),
      purchase_price: String(m.purchase_price),
      notes: m.notes || '',
    })
    setModalOpen(true)
  }

  async function saveMaterial() {
    if (!form.name.trim()) {
      toast.error('Name required')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await window.api.updateMaterial(editing.id, {
          name: form.name.trim(),
          unit: form.unit,
          min_stock: Number(form.min_stock) || 0,
          purchase_price: Number(form.purchase_price) || 0,
          notes: form.notes.trim() || null,
        })
        toast.success('Material updated')
      } else {
        await window.api.createMaterial({
          name: form.name.trim(),
          unit: form.unit,
          current_stock: Number(form.current_stock) || 0,
          min_stock: Number(form.min_stock) || 0,
          purchase_price: Number(form.purchase_price) || 0,
          notes: form.notes.trim() || undefined,
        })
        toast.success('Material created')
      }
      setModalOpen(false)
      await loadMaterials(search)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function saveAdjust() {
    if (!adjust) return
    const qty = Number(adjust.quantity)
    if (!qty) {
      toast.error('Quantity required')
      return
    }
    setSaving(true)
    try {
      await window.api.adjustStock({
        raw_material_id: adjust.raw_material_id,
        quantity: qty,
        movement_type: adjust.movement_type,
        unit_price: Number(adjust.unit_price) || 0,
        notes: adjust.notes.trim() || undefined,
      })
      toast.success('Stock adjusted')
      setAdjust(null)
      await loadMaterials(search)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Adjust failed')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await window.api.deleteMaterial(deleteTarget.id)
      toast.success('Material deleted')
      setDeleteTarget(null)
      await loadMaterials(search)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  return (
    <div>
      <PageHeader
        title="Stock"
        subtitle="Raw materials and stock movements (no recipe inventing here)"
        actions={
          tab === 'materials' ? (
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              <Plus size={16} /> Add material
            </button>
          ) : undefined
        }
      />

      <div className="tabs">
        <button
          type="button"
          className={tab === 'materials' ? 'active' : ''}
          onClick={() => setTab('materials')}
        >
          Materials
        </button>
        <button
          type="button"
          className={tab === 'movements' ? 'active' : ''}
          onClick={() => setTab('movements')}
        >
          Movements
        </button>
      </div>

      {tab === 'materials' && (
        <div className="toolbar">
          <input
            placeholder="Search materials..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="button" className="btn btn-ghost" onClick={() => void loadMaterials(search)}>
            Search
          </button>
        </div>
      )}

      {loading ? (
        <Loading />
      ) : tab === 'materials' ? (
        materials.length === 0 ? (
          <div className="card">
            <EmptyState title="No materials" hint="Add chicken, spices, gas, etc." />
          </div>
        ) : (
          <div className="card table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Unit</th>
                  <th>Current</th>
                  <th>Min</th>
                  <th>Purchase price</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((m) => {
                  const low = m.current_stock <= m.min_stock
                  return (
                    <tr key={m.id}>
                      <td>
                        <strong>{m.name}</strong>{' '}
                        {low && <span className="badge badge-danger">Low stock</span>}
                      </td>
                      <td>{m.unit}</td>
                      <td>{formatQty(m.current_stock)}</td>
                      <td>{formatQty(m.min_stock)}</td>
                      <td>{formatMoney(m.purchase_price)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() =>
                              setAdjust({
                                raw_material_id: m.id,
                                material_name: m.name,
                                quantity: '',
                                movement_type: 'in',
                                unit_price: String(m.purchase_price || 0),
                                notes: '',
                              })
                            }
                          >
                            <SlidersHorizontal size={14} /> Adjust
                          </button>
                          <button type="button" className="btn btn-ghost" onClick={() => openEdit(m)}>
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() => setDeleteTarget(m)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      ) : movements.length === 0 ? (
        <div className="card">
          <EmptyState title="No movements yet" />
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Material</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Unit price</th>
                <th>Notes</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id}>
                  <td>{m.material_name}</td>
                  <td>
                    <span className="badge badge-muted">{m.movement_type}</span>
                  </td>
                  <td>{formatQty(m.quantity)}</td>
                  <td>{formatMoney(m.unit_price)}</td>
                  <td>{m.notes || '—'}</td>
                  <td>{formatDateTime(m.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <Modal
          title={editing ? 'Edit material' : 'Add material'}
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
                onClick={() => void saveMaterial()}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <label className="field full">
              Name
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="field">
              Unit
              <select
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
            {!editing && (
              <label className="field">
                Opening stock
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={form.current_stock}
                  onChange={(e) => setForm((f) => ({ ...f, current_stock: e.target.value }))}
                />
              </label>
            )}
            <label className="field">
              Min stock
              <input
                type="number"
                min={0}
                step="any"
                value={form.min_stock}
                onChange={(e) => setForm((f) => ({ ...f, min_stock: e.target.value }))}
              />
            </label>
            <label className="field">
              Purchase price
              <input
                type="number"
                min={0}
                step="any"
                value={form.purchase_price}
                onChange={(e) => setForm((f) => ({ ...f, purchase_price: e.target.value }))}
              />
            </label>
            <label className="field full">
              Notes
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </label>
          </div>
        </Modal>
      )}

      {adjust && (
        <Modal
          title={`Adjust stock — ${adjust.material_name}`}
          onClose={() => setAdjust(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setAdjust(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={() => void saveAdjust()}
              >
                {saving ? 'Saving...' : 'Apply'}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <label className="field">
              Type
              <select
                value={adjust.movement_type}
                onChange={(e) =>
                  setAdjust((a) =>
                    a
                      ? {
                          ...a,
                          movement_type: e.target.value as AdjustForm['movement_type'],
                        }
                      : a
                  )
                }
              >
                <option value="in">Stock in</option>
                <option value="out">Stock out</option>
                <option value="adjustment">Adjustment (+/-)</option>
                <option value="wastage">Wastage</option>
              </select>
            </label>
            <label className="field">
              Quantity
              <input
                type="number"
                step="any"
                value={adjust.quantity}
                onChange={(e) => setAdjust((a) => (a ? { ...a, quantity: e.target.value } : a))}
              />
            </label>
            <label className="field">
              Unit price
              <input
                type="number"
                min={0}
                step="any"
                value={adjust.unit_price}
                onChange={(e) => setAdjust((a) => (a ? { ...a, unit_price: e.target.value } : a))}
              />
            </label>
            <label className="field full">
              Notes
              <input
                value={adjust.notes}
                onChange={(e) => setAdjust((a) => (a ? { ...a, notes: e.target.value } : a))}
              />
            </label>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete material"
          message={`Delete “${deleteTarget.name}”? Related movements may be removed.`}
          confirmLabel="Delete"
          danger
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </div>
  )
}
