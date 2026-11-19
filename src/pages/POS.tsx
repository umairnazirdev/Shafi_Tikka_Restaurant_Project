import { useEffect, useMemo, useState } from 'react'
import { Plus, Minus, Trash2, Printer, Save, RotateCcw } from 'lucide-react'
import { useToast } from '../context/ToastContext'
import { formatMoney } from '../lib/format'
import { Loading } from '../components/ui/Loading'
import { EmptyState } from '../components/ui/EmptyState'
import { ProductThumb } from '../components/ProductThumb'

type CartLine = {
  product_id: number
  product_name: string
  unit_price: number
  quantity: number
}

export default function POS() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryId, setCategoryId] = useState<number | 'all'>('all')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [discount, setDiscount] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'other'>('cash')
  const [cashReceived, setCashReceived] = useState(0)
  const [saving, setSaving] = useState(false)
  const [lastOrderId, setLastOrderId] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [cats, prods] = await Promise.all([
        window.api.listCategories(),
        window.api.listProducts({ available_only: true }),
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
      if (categoryId !== 'all' && p.category_id !== categoryId) return false
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [products, categoryId, search])

  const subtotal = useMemo(
    () => cart.reduce((s, i) => s + i.quantity * i.unit_price, 0),
    [cart]
  )
  const safeDiscount = Math.min(Math.max(0, Number(discount) || 0), subtotal)
  const grandTotal = Math.max(0, subtotal - safeDiscount)
  const changeAmount =
    paymentMethod === 'cash' ? Math.max(0, (Number(cashReceived) || 0) - grandTotal) : 0

  function qtyInCart(productId: number) {
    return cart.find((c) => c.product_id === productId)?.quantity || 0
  }

  function addProduct(product: Product) {
    setCart((prev) => {
      const existing = prev.find((c) => c.product_id === product.id)
      if (existing) {
        return prev.map((c) =>
          c.product_id === product.id ? { ...c, quantity: c.quantity + 1 } : c
        )
      }
      return [
        ...prev,
        {
          product_id: product.id,
          product_name: product.name,
          unit_price: product.selling_price,
          quantity: 1,
        },
      ]
    })
  }

  function setQty(productId: number, quantity: number) {
    setCart((prev) => {
      if (quantity <= 0) return prev.filter((c) => c.product_id !== productId)
      return prev.map((c) => (c.product_id === productId ? { ...c, quantity } : c))
    })
  }

  function clearCart() {
    setCart([])
    setCustomerName('')
    setCustomerPhone('')
    setNotes('')
    setDiscount(0)
    setPaymentMethod('cash')
    setCashReceived(0)
    setLastOrderId(null)
  }

  async function saveOrder(printAfter: boolean) {
    if (!cart.length) {
      toast.error('Add products to the order first')
      return
    }
    if (paymentMethod === 'cash' && (Number(cashReceived) || 0) < grandTotal) {
      toast.error('Cash received is less than total')
      return
    }

    setSaving(true)
    try {
      const result = await window.api.createOrder({
        customer_name: customerName,
        customer_phone: customerPhone,
        notes,
        discount: safeDiscount,
        payment_method: paymentMethod,
        cash_received: paymentMethod === 'cash' ? Number(cashReceived) || grandTotal : 0,
        items: cart.map((c) => ({
          product_id: c.product_id,
          product_name: c.product_name,
          quantity: c.quantity,
          unit_price: c.unit_price,
        })),
      })
      setLastOrderId(result.id)
      toast.success(`Order ${result.order_number} saved`)
      if (printAfter) {
        await window.api.printReceipt(result.id)
      }
      clearCart()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save order')
    } finally {
      setSaving(false)
    }
  }

  async function reprintLast() {
    if (!lastOrderId) {
      toast.info('No recent order to print')
      return
    }
    try {
      await window.api.printReceipt(lastOrderId)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Print failed')
    }
  }

  useEffect(() => {
    if (paymentMethod === 'cash' && cashReceived < grandTotal) {
      setCashReceived(grandTotal)
    }
  }, [grandTotal, paymentMethod])

  if (loading) return <Loading label="Loading POS..." />

  return (
    <div className="pos-layout">
      <section className="pos-products">
        <div className="toolbar">
          <input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <button type="button" className="btn btn-ghost" onClick={() => void load()}>
            Refresh
          </button>
        </div>
        <div className="chip-row">
          <button
            type="button"
            className={`chip ${categoryId === 'all' ? 'active' : ''}`}
            onClick={() => setCategoryId('all')}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`chip ${categoryId === c.id ? 'active' : ''}`}
              onClick={() => setCategoryId(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <EmptyState title="No products found" hint="Add products from the Products page." />
        ) : (
          <div className="product-grid">
            {filtered.map((p) => {
              const qty = qtyInCart(p.id)
              return (
                <button key={p.id} type="button" className="product-tile" onClick={() => addProduct(p)}>
                  {qty > 0 && <span className="qty-badge">{qty}</span>}
                  <ProductThumb name={p.name} imagePath={p.image_path} />
                  <strong>{p.name}</strong>
                  <div className="price">{formatMoney(p.selling_price)}</div>
                  <span className="btn btn-primary" style={{ padding: '6px 8px', fontSize: 12 }}>
                    <Plus size={14} /> Add
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </section>

      <aside className="cart-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Current Order</h2>
          <button type="button" className="btn btn-ghost" onClick={clearCart} title="New Order">
            <RotateCcw size={16} /> New
          </button>
        </div>

        <div className="cart-list">
          {cart.length === 0 && <EmptyState title="Cart is empty" hint="Tap products to add them." />}
          {cart.map((item) => (
            <div key={item.product_id} className="cart-item">
              <div>
                <div className="name">{item.product_name}</div>
                <div className="meta">
                  {formatMoney(item.unit_price)} × {item.quantity} ={' '}
                  {formatMoney(item.unit_price * item.quantity)}
                </div>
              </div>
              <div className="qty-controls">
                <button type="button" onClick={() => setQty(item.product_id, item.quantity - 1)}>
                  <Minus size={14} />
                </button>
                <strong>{item.quantity}</strong>
                <button type="button" onClick={() => setQty(item.product_id, item.quantity + 1)}>
                  <Plus size={14} />
                </button>
                <button type="button" onClick={() => setQty(item.product_id, 0)} title="Remove">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="cart-fields">
          <label>
            Customer name
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Optional" />
          </label>
          <label>
            Phone
            <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Optional" />
          </label>
          <label>
            Notes
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label>
              Discount
              <input
                type="number"
                min={0}
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value) || 0)}
              />
            </label>
            <label>
              Payment
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as 'cash' | 'card' | 'other')}
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
          {paymentMethod === 'cash' && (
            <label>
              Cash received
              <input
                type="number"
                min={0}
                value={cashReceived}
                onChange={(e) => setCashReceived(Number(e.target.value) || 0)}
              />
            </label>
          )}
        </div>

        <div className="cart-totals">
          <div>
            <span>Subtotal</span>
            <span>{formatMoney(subtotal)}</span>
          </div>
          <div>
            <span>Discount</span>
            <span>{formatMoney(safeDiscount)}</span>
          </div>
          <div className="grand">
            <span>Grand Total</span>
            <span>{formatMoney(grandTotal)}</span>
          </div>
          {paymentMethod === 'cash' && (
            <div>
              <span>Change</span>
              <span>{formatMoney(changeAmount)}</span>
            </div>
          )}
        </div>

        <div className="cart-actions">
          <button type="button" className="btn btn-ghost" onClick={clearCart} disabled={saving}>
            Clear Cart
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void reprintLast()} disabled={saving}>
            <Printer size={16} /> Print
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void saveOrder(false)}
            disabled={saving || !cart.length}
          >
            <Save size={16} /> Save Order
          </button>
          <button
            type="button"
            className="btn btn-success span-2 btn-lg"
            onClick={() => void saveOrder(true)}
            disabled={saving || !cart.length}
          >
            <Printer size={16} /> Save & Print
          </button>
        </div>
      </aside>
    </div>
  )
}
