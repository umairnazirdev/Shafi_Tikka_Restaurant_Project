import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Save } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Loading } from '../components/ui/Loading'
import { EmptyState } from '../components/ui/EmptyState'
import { useToast } from '../context/ToastContext'
import { formatQty } from '../lib/format'

type RecipeLine = {
  raw_material_id: number
  quantity: string
}

export default function Recipes() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [materials, setMaterials] = useState<RawMaterial[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [productId, setProductId] = useState<number | ''>('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<RecipeLine[]>([])
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Recipe | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [r, p, m] = await Promise.all([
        window.api.listRecipes(),
        window.api.listProducts(),
        window.api.listMaterials(),
      ])
      setRecipes(r)
      setProducts(p)
      setMaterials(m)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load recipes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const productsWithoutRecipe = useMemo(() => {
    const used = new Set(recipes.map((r) => r.product_id))
    return products.filter((p) => !used.has(p.id))
  }, [products, recipes])

  function openCreate() {
    setProductId(productsWithoutRecipe[0]?.id ?? '')
    setNotes('')
    setLines([{ raw_material_id: materials[0]?.id ?? 0, quantity: '' }])
    setModalOpen(true)
  }

  function openEdit(recipe: Recipe) {
    setProductId(recipe.product_id)
    setNotes(recipe.notes || '')
    setLines(
      recipe.items.length
        ? recipe.items.map((i) => ({
            raw_material_id: i.raw_material_id,
            quantity: String(i.quantity),
          }))
        : [{ raw_material_id: materials[0]?.id ?? 0, quantity: '' }]
    )
    setModalOpen(true)
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      { raw_material_id: materials[0]?.id ?? 0, quantity: '' },
    ])
  }

  async function save() {
    if (!productId) {
      toast.error('Select a product')
      return
    }
    const items = lines
      .map((l) => ({
        raw_material_id: Number(l.raw_material_id),
        quantity: Number(l.quantity),
      }))
      .filter((l) => l.raw_material_id && l.quantity > 0)

    if (!items.length) {
      toast.error('Add at least one material with quantity')
      return
    }

    setSaving(true)
    try {
      await window.api.saveRecipe({
        product_id: Number(productId),
        notes: notes.trim() || undefined,
        items,
      })
      toast.success('Recipe saved')
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
      await window.api.deleteRecipe(deleteTarget.id)
      toast.success('Recipe deleted')
      setDeleteTarget(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  return (
    <div>
      <PageHeader
        title="Recipes"
        subtitle="Link products to materials. Stock deducts when an order is completed."
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={openCreate}
            disabled={!materials.length || !products.length}
          >
            <Plus size={16} /> Add recipe
          </button>
        }
      />

      <div className="card" style={{ marginBottom: 14 }}>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14, lineHeight: 1.5 }}>
          Enter material quantities yourself (e.g. 0.25 KG chicken per tikka plate). When a POS
          order is completed, recipe materials are deducted from stock. Cancelling an order restores
          them. Purchases are tracked separately and are not double-counted in profit.
        </p>
      </div>

      {loading ? (
        <Loading />
      ) : recipes.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No recipes yet"
            hint="Create materials and products first, then configure recipes here."
          />
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Product</th>
                <th>Materials</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {recipes.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.product_name}</strong>
                  </td>
                  <td>
                    {r.items.length === 0
                      ? '—'
                      : r.items
                          .map((i) => `${i.material_name} (${formatQty(i.quantity)} ${i.unit})`)
                          .join(', ')}
                  </td>
                  <td>{r.notes || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="btn btn-ghost" onClick={() => openEdit(r)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => setDeleteTarget(r)}
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
          title="Recipe"
          wide
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
                <Save size={14} /> {saving ? 'Saving...' : 'Save recipe'}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <label className="field full">
              Product
              <select
                value={productId === '' ? '' : String(productId)}
                onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">Select product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field full">
              Notes
              <input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="toolbar" style={{ justifyContent: 'space-between' }}>
              <strong>Materials (enter quantities)</strong>
              <button type="button" className="btn btn-ghost" onClick={addLine}>
                <Plus size={14} /> Add row
              </button>
            </div>
            {lines.map((line, idx) => {
              const mat = materials.find((m) => m.id === line.raw_material_id)
              return (
                <div
                  key={idx}
                  className="form-grid"
                  style={{ marginBottom: 8, alignItems: 'end' }}
                >
                  <label className="field">
                    Material
                    <select
                      value={line.raw_material_id || ''}
                      onChange={(e) => {
                        const id = Number(e.target.value)
                        setLines((prev) =>
                          prev.map((l, i) => (i === idx ? { ...l, raw_material_id: id } : l))
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
                    Quantity {mat ? `(${mat.unit})` : ''}
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
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                    disabled={lines.length <= 1}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete recipe"
          message={`Delete recipe for “${deleteTarget.product_name}”?`}
          confirmLabel="Delete"
          danger
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </div>
  )
}
