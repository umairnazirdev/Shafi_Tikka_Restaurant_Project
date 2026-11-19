import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Plus, Minus, Trash2, Printer, Save, RotateCcw } from 'lucide-react'
import { useToast } from '../context/ToastContext'
import { formatMoney } from '../lib/format'
import { Loading } from '../components/ui/Loading'
import { EmptyState } from '../components/ui/EmptyState'
import { ProductThumb } from '../components/ProductThumb'
import { ProductQuantitySelector } from '../components/ui/ProductQuantitySelector'

type CartLine = {
  product_id: number
  product_name: string
  unit_price: number
  quantity: number
}

type DraftOrder = {
  number: number
  cart: CartLine[]
  discount: number
  paymentMethod: 'cash' | 'card' | 'other'
  cashReceived: number
}

type PosOutletContext = {
  posView: 'menu' | 'orders'
  setPosView: (view: 'menu' | 'orders') => void
  setDraftOrderCount: (count: number) => void
}

export default function POS() {
  const toast = useToast()
  const { posView: activeView, setPosView: setActiveView, setDraftOrderCount } =
    useOutletContext<PosOutletContext>()
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryId, setCategoryId] = useState<number | 'all'>('all')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [cartQuantityDrafts, setCartQuantityDrafts] = useState<Record<number, string>>({})
  const [discount, setDiscount] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'other'>('cash')
  const [cashReceived, setCashReceived] = useState(0)
  const [saving, setSaving] = useState(false)
  const [lastOrderId, setLastOrderId] = useState<number | null>(null)
  const [selectedQuantities, setSelectedQuantities] = useState<Record<number, number>>({})

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

  function qtyInCart(productId: number) {
    return cart.find((c) => c.product_id === productId)?.quantity || 0
  }

  function addProduct(product: Product, quantity = 1) {
    setCart((prev) => {
      const existing = prev.find((c) => c.product_id === product.id)
      if (existing) {
        return prev.map((c) =>
          c.product_id === product.id ? { ...c, quantity: c.quantity + quantity } : c
        )
      }
      return [
        ...prev,
        {
          product_id: product.id,
          product_name: product.name,
          unit_price: product.selling_price,
          quantity,
        },
      ]
    })
  }

  function setSelectedQuantity(productId: number, quantity: number) {
    setSelectedQuantities((prev) => ({ ...prev, [productId]: Math.max(1, quantity) }))
  }

  function setQty(productId: number, quantity: number) {
    setCart((prev) => {
      const next =
        quantity <= 0
          ? prev.filter((c) => c.product_id !== productId)
          : prev.map((c) => (c.product_id === productId ? { ...c, quantity } : c))
      syncDraft({ cart: next })
      return next
    })
    if (quantity <= 0) {
      setCartQuantityDrafts((prev) => {
        const next = { ...prev }
        delete next[productId]
        return next
      })
    }
  }

  function clearCart() {
    setCart([])
    setCartQuantityDrafts({})
    setDiscount(0)
    setPaymentMethod('cash')
    setCashReceived(0)
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
        customer_name: '',
        customer_phone: '',
        notes: '',
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
      const remaining = draftOrders
        .filter((draft) => draft.number !== activeDraftNumber)
        .sort((a, b) => a.number - b.number)
      setDraftOrders(remaining)
      setCart([])
      setCartQuantityDrafts({})
      setDiscount(0)
      setPaymentMethod('cash')
      setCashReceived(0)
      if (remaining.length > 0) {
        openDraft(remaining[0].number)
      } else {
        const number = nextDraftNumber
        setDraftOrders([{
          number,
          cart: [],
          discount: 0,
          paymentMethod: 'cash',
          cashReceived: 0,
        }])
        setNextDraftNumber((prev) => prev + 1)
        setActiveDraftNumber(number)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save order')
    } finally {
      setSaving(false)
    }
  }

  async function reprintLast() {
    if (!lastOrderId) {
      toast.info('Save an order before printing an invoice')
      return
    }
    try {
      await window.api.printInvoice(lastOrderId)
      toast.success('Invoice preview opened')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Print failed')
    }
  }

  useEffect(() => {
    if (paymentMethod === 'cash' && cashReceived < grandTotal) {
      setCashReceived(grandTotal)
      syncDraft({ cashReceived: grandTotal })
    }
  }, [grandTotal, paymentMethod])

  useEffect(() => {
    setDraftOrderCount(draftOrders.length)
  }, [draftOrders.length, setDraftOrderCount])

  if (loading) return <Loading label="Loading POS..." />

  return (
    <div>
      <div className="pos-layout">
        <section className="pos-products">
          {activeView === 'menu' ? (
            <>
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
              const selectedQuantity = selectedQuantities[p.id] ?? 1
              return (
                <div
                  key={p.id}
                  className="product-tile"
                  role="button"
                  tabIndex={0}
                  onClick={() => addProduct(p)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      addProduct(p)
                    }
                  }}
                >
                  {qty > 0 && <span className="qty-badge">{qty}</span>}
                  <ProductThumb name={p.name} imagePath={p.image_path} />
                  <strong>{p.name}</strong>
                  <div className="price">{formatMoney(p.selling_price)}</div>
                  <ProductQuantitySelector
                    quantity={selectedQuantity}
                    onQuantityChange={(quantity) => setSelectedQuantity(p.id, quantity)}
                    onAdd={(quantity) => {
                      addProduct(p, quantity)
                      setSelectedQuantity(p.id, 1)
                    }}
                  />
                </div>
              )
            })}
                </div>
              )}
            </>
          ) : (
            <div className="pos-order-browser">
              <h2>Current Orders</h2>
              <p>First come, first served</p>
              <div className="pos-order-list">
                {[...draftOrders].sort((a, b) => a.number - b.number).map((draft) => (
                  <button
                    key={draft.number}
                    type="button"
                    className={`pos-order-card ${draft.number === activeDraftNumber ? 'active' : ''}`}
                    onClick={() => openDraft(draft.number)}
                  >
                    <span className="pos-order-number">#{draft.number}</span>
                    <strong>{draft.cart.length ? `${draft.cart.length} item(s)` : 'New order'}</strong>
                    <span>{formatMoney(draft.cart.reduce((sum, item) => sum + item.quantity * item.unit_price, 0) - draft.discount)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

      <aside className="cart-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Order #{activeDraftNumber}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button type="button" className="btn pos-new-button" onClick={createNewOrder}>
              <Plus size={14} /> New
            </button>
            <button type="button" className="btn btn-ghost" onClick={clearCart} title="Clear current order">
              <RotateCcw size={16} /> Clear
            </button>
          </div>
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
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={cartQuantityDrafts[item.product_id] ?? String(item.quantity)}
                  aria-label={`Quantity for ${item.product_name}`}
                  onChange={(event) => {
                    const value = event.target.value
                    setCartQuantityDrafts((prev) => ({ ...prev, [item.product_id]: value }))
                    const quantity = Number(value)
                    if (Number.isInteger(quantity) && quantity >= 1) {
                      setQty(item.product_id, quantity)
                    }
                  }}
                  onBlur={() => {
                    const draft = cartQuantityDrafts[item.product_id]
                    const quantity = draft === undefined ? item.quantity : Number(draft)
                    setQty(
                      item.product_id,
                      Number.isInteger(quantity) && quantity >= 1 ? quantity : Math.max(1, item.quantity)
                    )
                    setCartQuantityDrafts((prev) => {
                      const next = { ...prev }
                      delete next[item.product_id]
                      return next
                    })
                  }}
                />
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label>
              Discount
              <input
                type="number"
                min={0}
                value={discount}
                onChange={(e) => {
                  const nextDiscount = Number(e.target.value) || 0
                  setDiscount(nextDiscount)
                  if (paymentMethod === 'cash') {
                    const appliedDiscount = Math.min(Math.max(0, nextDiscount), subtotal)
                    setCashReceived(Math.max(0, subtotal - appliedDiscount))
                  }
                }}
              />
            </label>
            <label>
              Payment
              <select
                value={paymentMethod}
                onChange={(e) => {
                  const nextPayment = e.target.value as 'cash' | 'card' | 'other'
                  setPaymentMethod(nextPayment)
                  syncDraft({ paymentMethod: nextPayment })
                }}
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
                onChange={(e) => {
                  const nextCashReceived = Number(e.target.value) || 0
                  setCashReceived(nextCashReceived)
                  syncDraft({ cashReceived: nextCashReceived })
                }}
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
    </div>
  )
}
