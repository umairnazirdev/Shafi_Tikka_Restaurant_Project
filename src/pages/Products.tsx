import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, ImagePlus } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Loading } from '../components/ui/Loading'
import { EmptyState } from '../components/ui/EmptyState'
import { useToast } from '../context/ToastContext'
import { formatMoney } from '../lib/format'

type ProductForm = {
  name: string
  category_id: number | ''
  selling_price: string
  purchase_cost: string
  image_path: string | null
  is_available: boolean
}

const emptyForm = (): ProductForm => ({
  name: '',
  category_id: '',
  selling_price: '',
  purchase_cost: '0',
  image_path: null,
  is_available: true,
})

export default function Products() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [cats, prods] = await Promise.all([
        window.api.listCategories(),
        window.api.listProducts(),
      ])
      setCategories(cats)
      setProducts(prods)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load products')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (categoryFilter !== 'all' && p.category_id !== categoryFilter) return false
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [products, search, categoryFilter])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  function openEdit(p: Product) {
    setEditing(p)
    setForm({
      name: p.name,
      category_id: p.category_id ?? '',
      selling_price: String(p.selling_price),
      purchase_cost: String(p.purchase_cost ?? 0),
      image_path: p.image_path,
      is_available: !!p.is_available,
    })
    setModalOpen(true)
  }

  async function createCategoryInline() {
    const name = newCategory.trim()
    if (!name) return
    try {
      const { id } = await window.api.createCategory(name)
      const cats = await window.api.listCategories()
      setCategories(cats)
      setForm((f) => ({ ...f, category_id: id }))
      setNewCategory('')
      toast.success('Category created')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create category')
    }
  }

  async function pickImage() {
    try {
      const path = await window.api.selectImage()
      if (path) setForm((f) => ({ ...f, image_path: path }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to select image')
    }
  }

  async function saveProduct() {
    if (!form.name.trim()) {
      toast.error('Product name required')
      return
    }
    const selling = Number(form.selling_price)
    if (Number.isNaN(selling) || selling < 0) {
      toast.error('Valid selling price required')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        category_id: form.category_id === '' ? null : Number(form.category_id),
        selling_price: selling,
        purchase_cost: Number(form.purchase_cost) || 0,
        image_path: form.image_path,
        is_available: form.is_available ? 1 : 0,
      }
      if (editing) {
        await window.api.updateProduct(editing.id, payload)
        toast.success('Product updated')
      } else {
        await window.api.createProduct(payload)
        toast.success('Product created')
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
      const res = await window.api.deleteProduct(deleteTarget.id)
      toast.success(res.softDeleted ? 'Product marked unavailable (used in orders)' : 'Product deleted')
      setDeleteTarget(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Menu items for the POS"
        actions={
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Add product
          </button>
        }
      />

      <div className="toolbar">
        <input
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          value={categoryFilter === 'all' ? 'all' : String(categoryFilter)}
          onChange={(e) =>
            setCategoryFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
          }
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState title="No products found" hint="Add a product or clear filters." />
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Selling price</th>
                <th>Purchase cost</th>
                <th>Available</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                  </td>
                  <td>{p.category_name || '—'}</td>
                  <td>{formatMoney(p.selling_price)}</td>
                  <td>{formatMoney(p.purchase_cost)}</td>
                  <td>
                    <span className={`badge ${p.is_available ? 'badge-ok' : 'badge-muted'}`}>
                      {p.is_available ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="btn btn-ghost" onClick={() => openEdit(p)}>
                        <Pencil size={14} /> Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => setDeleteTarget(p)}
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
          title={editing ? 'Edit product' : 'Add product'}
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
                onClick={() => void saveProduct()}
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
              Category
              <select
                value={form.category_id === '' ? '' : String(form.category_id)}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    category_id: e.target.value === '' ? '' : Number(e.target.value),
                  }))
                }
              >
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              <span>New category</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="e.g. BBQ"
                />
                <button type="button" className="btn btn-secondary" onClick={() => void createCategoryInline()}>
                  Add
                </button>
              </div>
            </div>
            <label className="field">
              Selling price
              <input
                type="number"
                min={0}
                value={form.selling_price}
                onChange={(e) => setForm((f) => ({ ...f, selling_price: e.target.value }))}
              />
            </label>
            <label className="field">
              Purchase cost
              <input
                type="number"
                min={0}
                value={form.purchase_cost}
                onChange={(e) => setForm((f) => ({ ...f, purchase_cost: e.target.value }))}
              />
            </label>
            <div className="field full">
              <span>Image</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button type="button" className="btn btn-ghost" onClick={() => void pickImage()}>
                  <ImagePlus size={16} /> Select image
                </button>
                {form.image_path && (
                  <>
                    <span className="muted" style={{ fontSize: 12, wordBreak: 'break-all' }}>
                      {form.image_path.split(/[/\\]/).pop()}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setForm((f) => ({ ...f, image_path: null }))}
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
            </div>
            <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={form.is_available}
                onChange={(e) => setForm((f) => ({ ...f, is_available: e.target.checked }))}
              />
              Available on POS
            </label>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete product"
          message={`Delete “${deleteTarget.name}”? If used in orders it will be marked unavailable instead.`}
          confirmLabel="Delete"
          danger
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </div>
  )
}
