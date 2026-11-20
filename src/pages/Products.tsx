import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, ImagePlus, Check, X } from 'lucide-react'
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
  quantity: string
  image_path: string | null
  is_available: boolean
}

const emptyForm = (): ProductForm => ({
  name: '',
  category_id: '',
  selling_price: '',
  quantity: '0',
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
  const [quantityDrafts, setQuantityDrafts] = useState<Record<number, string>>({})
  const [updatingQuantityId, setUpdatingQuantityId] = useState<number | null>(null)

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
      quantity: String(p.quantity ?? 0),
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
    const quantity = Number(form.quantity)
    if (!Number.isInteger(quantity) || quantity < 0) {
      toast.error('Valid quantity required')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        category_id: form.category_id === '' ? null : Number(form.category_id),
        selling_price: selling,
        quantity,
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

  async function setProductAvailability(product: Product, isAvailable: boolean) {
    try {
      await window.api.updateProduct(product.id, {
        name: product.name,
        category_id: product.category_id,
        selling_price: product.selling_price,
        purchase_cost: product.purchase_cost,
        quantity: product.quantity,
        image_path: product.image_path,
        is_available: isAvailable ? 1 : 0,
        sort_order: product.sort_order,
      })
      setProducts((current) =>
        current.map((item) =>
          item.id === product.id ? { ...item, is_available: isAvailable ? 1 : 0 } : item
        )
      )
      toast.success(isAvailable ? 'Quantity tracking enabled' : 'Quantity tracking disabled')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update availability')
    }
  }

  async function setProductQuantity(product: Product) {
    const rawQuantity = quantityDrafts[product.id]
    if (rawQuantity === undefined || rawQuantity.trim() === '') {
      toast.error('Enter a quantity to add')
      return
    }
    const quantity = Number(rawQuantity)
    if (!Number.isInteger(quantity) || quantity <= 0) {
      toast.error('Enter a positive whole-number quantity')
      return
    }

    setUpdatingQuantityId(product.id)
    try {
      const result = await window.api.addProductQuantity(product.id, quantity)
      setProducts((current) =>
        current.map((item) =>
          item.id === product.id ? { ...item, quantity: result.quantity } : item
        )
      )
      setQuantityDrafts((current) => {
        const next = { ...current }
        delete next[product.id]
        return next
      })
      toast.success(`${quantity} added to ${product.name}. New quantity: ${result.quantity}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update quantity')
    } finally {
      setUpdatingQuantityId(null)
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
                <th>Quantity</th>
                <th>Manage Stock</th>
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
                  <td>{p.quantity ?? 0}</td>
                  <td>
                    <div className="manage-product-toggle" role="group" aria-label={`Manage ${p.name}`}>
                      <button
                        type="button"
                        className={`manage-product-button yes ${p.is_available ? 'active' : ''}`}
                        onClick={() => void setProductAvailability(p, true)}
                        aria-pressed={!!p.is_available}
                        title="Track product quantity"
                      >
                        <Check size={14} /> Yes
                      </button>
                      <button
                        type="button"
                        className={`manage-product-button no ${!p.is_available ? 'active' : ''}`}
                        onClick={() => void setProductAvailability(p, false)}
                        aria-pressed={!p.is_available}
                        title="Ignore product quantity"
                      >
                        <X size={14} /> No
                      </button>
                    </div>
                  </td>
                  <td>
                    <div className="product-actions">
                      <button type="button" className="btn btn-ghost" onClick={() => openEdit(p)}>
                        <Pencil size={14} /> Edit
                      </button>
                      <input
                        className="product-quantity-quick-input"
                        type="number"
                        min={1}
                        step={1}
                        placeholder="Add qty"
                        aria-label={`Add stock quantity for ${p.name}`}
                        value={quantityDrafts[p.id] ?? ''}
                        onChange={(event) =>
                          setQuantityDrafts((current) => ({
                            ...current,
                            [p.id]: event.target.value,
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="btn btn-secondary product-quantity-quick-save"
                        aria-label={`Add quantity for ${p.name}`}
                        title="Add quantity"
                        disabled={updatingQuantityId === p.id}
                        onClick={() => void setProductQuantity(p)}
                      >
                        <Plus size={14} />
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
              Quantity
              <input
                type="number"
                min={0}
                step={1}
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
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
