import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Plus, Minus, Trash2, Printer, ChevronDown, Check } from 'lucide-react'
import { useToast } from '../context/ToastContext'
import { formatMoney } from '../lib/format'
import { Loading } from '../components/ui/Loading'
import { EmptyState } from '../components/ui/EmptyState'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
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
  waiterId: number | null
}

type ProductStockAlert = {
  productId: number
  message: string
}

function getStockAlerts(items: CartLine[], products: Product[]): ProductStockAlert[] {
  const requestedByProduct = new Map<number, number>()
  for (const item of items) {
    requestedByProduct.set(
      item.product_id,
      (requestedByProduct.get(item.product_id) ?? 0) + item.quantity
    )
  }

  return products.flatMap((product) => {
    const requested = requestedByProduct.get(product.id)
    if (product.is_available !== 1 || requested === undefined || product.quantity >= requested) {
      return []
    }

    return [{
      productId: product.id,
      message: `${product.name}: insufficient quantity. Need ${requested}, available ${product.quantity}.`,
    }]
  })
}

type PosOutletContext = {
  posView: 'menu' | 'orders'
  setPosView: (view: 'menu' | 'orders') => void
  setDraftOrderCount: (count: number) => void
}

export default function POS() {
  const toast = useToast()
  const { posView: activeView, setPosView, setDraftOrderCount } = useOutletContext<PosOutletContext>()
  const [loading, setLoading] = useState(true)
  const [desktopUnavailable, setDesktopUnavailable] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryId, setCategoryId] = useState<number | 'all'>('all')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [draftOrders, setDraftOrders] = useState<DraftOrder[]>([{
    number: 1,
    cart: [],
    discount: 0,
    paymentMethod: 'cash',
    cashReceived: 0,
    waiterId: null,
  }])
  const [activeDraftNumber, setActiveDraftNumber] = useState(1)
  const [nextDraftNumber, setNextDraftNumber] = useState(2)
  const [waiters, setWaiters] = useState<Waiter[]>([])
  const [selectedWaiterId, setSelectedWaiterId] = useState<number | null>(null)
  const waiterDropdownRef = useRef<HTMLDetailsElement>(null)
  const [waiterDeleteTarget, setWaiterDeleteTarget] = useState<Waiter | null>(null)
  const [deletingWaiter, setDeletingWaiter] = useState(false)
  const [cartQuantityDrafts, setCartQuantityDrafts] = useState<Record<number, string>>({})
  const [discount, setDiscount] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'other'>('cash')
  const [cashReceived, setCashReceived] = useState(0)
  const [saving, setSaving] = useState(false)
  const [selectedQuantities, setSelectedQuantities] = useState<Record<number, number>>({})
  const [stockAlerts, setStockAlerts] = useState<ProductStockAlert[]>([])

  useEffect(() => {
    if (stockAlerts.length === 0) return
    document
      .querySelector<HTMLElement>(`[data-product-id="${stockAlerts[0].productId}"]`)
      ?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
    const timeout = window.setTimeout(() => setStockAlerts([]), 15_000)
    return () => window.clearTimeout(timeout)
  }, [stockAlerts])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (!window.api) {
        setDesktopUnavailable(true)
        return
      }
      const [cats, prods, waiterRows] = await Promise.all([
        window.api.listCategories(),
        window.api.listProducts(),
        window.api.listWaiters(),
      ])
      setCategories(cats)
      setProducts(prods)
      setWaiters(waiterRows)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load products')
    } finally {
      setLoading(false)
    }
  }, [toast])

  const syncDraft = useCallback((patch: Partial<Omit<DraftOrder, 'number'>>) => {
    setDraftOrders((prev) =>
      prev.map((draft) =>
        draft.number === activeDraftNumber ? { ...draft, ...patch } : draft
      )
    )
  }, [activeDraftNumber])

  function activateDraft(draft: DraftOrder) {
    setActiveDraftNumber(draft.number)
    setCart(draft.cart)
    setCartQuantityDrafts({})
    setDiscount(draft.discount)
    setPaymentMethod(draft.paymentMethod)
    setCashReceived(draft.cashReceived)
    setSelectedWaiterId(draft.waiterId)
  }

  function openDraft(number: number) {
    const draft = draftOrders.find((item) => item.number === number)
    if (draft) activateDraft(draft)
  }

  function createNewOrder() {
    const draft: DraftOrder = {
      number: nextDraftNumber,
      cart: [],
      discount: 0,
      paymentMethod: 'cash',
      cashReceived: 0,
      waiterId: selectedWaiterId,
    }
    setDraftOrders((prev) => [...prev, draft])
    setNextDraftNumber((prev) => prev + 1)
    activateDraft(draft)
  }

  useEffect(() => {
    void load()
  }, [load])

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
    const existing = cart.find((line) => line.product_id === product.id)
    const nextCart = existing
      ? cart.map((line) =>
          line.product_id === product.id
            ? { ...line, quantity: line.quantity + quantity }
            : line
        )
      : [
          ...cart,
          {
            product_id: product.id,
            product_name: product.name,
            unit_price: product.selling_price,
            quantity,
          },
        ]
    setCart(nextCart)
    syncDraft({ cart: nextCart })
  }

  function tryAddProduct(product: Product, quantity = 1): boolean {
    const requested = qtyInCart(product.id) + quantity
    if (product.is_available === 1 && requested > product.quantity) {
      showStockAlerts([{
        productId: product.id,
        message: `${product.name}: insufficient quantity. Need ${requested}, available ${product.quantity}.`,
      }])
      return false
    }

    addProduct(product, quantity)
    return true
  }

  function setSelectedQuantity(productId: number, quantity: number) {
    setSelectedQuantities((prev) => ({ ...prev, [productId]: Math.max(1, quantity) }))
  }

  function setQty(productId: number, quantity: number) {
    const next =
      quantity <= 0
        ? cart.filter((line) => line.product_id !== productId)
        : cart.map((line) => (line.product_id === productId ? { ...line, quantity } : line))
    setCart(next)
    syncDraft({ cart: next })
    if (quantity <= 0) {
      setCartQuantityDrafts((prev) => {
        const next = { ...prev }
        delete next[productId]
        return next
      })
    }
  }

  function showStockAlerts(alerts: ProductStockAlert[]) {
    setStockAlerts(alerts)
    setSearch('')
    setCategoryId('all')
    setPosView('menu')
  }

  async function refreshWaiters() {
    try {
      const rows = await window.api.listWaiters()
      setWaiters(rows)
      if (selectedWaiterId !== null && !rows.some((waiter) => waiter.id === selectedWaiterId)) {
        setSelectedWaiterId(null)
        syncDraft({ waiterId: null })
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load waiters')
    }
  }

  function chooseWaiter(value: string) {
    const waiterId = value ? Number(value) : null
    setSelectedWaiterId(waiterId)
    syncDraft({ waiterId })
  }

  async function deleteWaiter() {
    if (!waiterDeleteTarget || deletingWaiter) return
    setDeletingWaiter(true)
    try {
      await window.api.deleteWaiter(waiterDeleteTarget.id)
      setWaiters((current) => current.filter((waiter) => waiter.id !== waiterDeleteTarget.id))
      setDraftOrders((current) =>
        current.map((draft) =>
          draft.waiterId === waiterDeleteTarget.id ? { ...draft, waiterId: null } : draft
        )
      )
      if (selectedWaiterId === waiterDeleteTarget.id) {
        setSelectedWaiterId(null)
        syncDraft({ waiterId: null })
      }
      setWaiterDeleteTarget(null)
      waiterDropdownRef.current?.removeAttribute('open')
      toast.success(`${waiterDeleteTarget.name} removed`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove waiter')
    } finally {
      setDeletingWaiter(false)
    }
  }

  async function saveOrder() {
    if (!cart.length) {
      toast.error('Add products to the order first')
      return
    }
    if (paymentMethod === 'cash' && (Number(cashReceived) || 0) < grandTotal) {
      toast.error('Cash received is less than total')
      return
    }

    setStockAlerts([])
    setSaving(true)
    try {
      const currentProducts = await window.api.listProducts()
      setProducts(currentProducts)
      const stockAlerts = getStockAlerts(cart, currentProducts)
      if (stockAlerts.length > 0) {
        showStockAlerts(stockAlerts)
        return
      }

      const result = await window.api.createOrder({
        customer_name: '',
        customer_phone: '',
        notes: '',
        waiter_id: selectedWaiterId,
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
      try {
        setProducts(await window.api.listProducts())
      } catch (refreshError) {
        const soldByProduct = new Map<number, number>()
        for (const item of cart) {
          soldByProduct.set(
            item.product_id,
            (soldByProduct.get(item.product_id) ?? 0) + item.quantity
          )
        }
        setProducts(currentProducts.map((product) => ({
          ...product,
          quantity:
            product.is_available === 1
              ? Math.max(0, product.quantity - (soldByProduct.get(product.id) ?? 0))
              : product.quantity,
        })))
        toast.error(
          `Order saved, but product quantities could not refresh: ${
            refreshError instanceof Error ? refreshError.message : 'Unknown error'
          }`
        )
      }
      toast.success(`Order ${result.order_number} saved`)
      await window.api.printInvoice(result.id)
      const remaining = draftOrders
        .filter((draft) => draft.number !== activeDraftNumber)
        .sort((a, b) => a.number - b.number)
      setDraftOrders(remaining)
      setCart([])
      setCartQuantityDrafts({})
      setDiscount(0)
      setPaymentMethod('cash')
      setCashReceived(0)
      setCartQuantityDrafts({})
      if (remaining.length > 0) {
        openDraft(remaining[0].number)
      } else {
        const draft: DraftOrder = {
          number: nextDraftNumber,
          cart: [],
          discount: 0,
          paymentMethod: 'cash',
          cashReceived: 0,
          waiterId: selectedWaiterId,
        }
        setDraftOrders([draft])
        setNextDraftNumber((prev) => prev + 1)
        activateDraft(draft)
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not save order'
      if (message.includes('Insufficient quantity for ')) {
        try {
          const currentProducts = await window.api.listProducts()
          setProducts(currentProducts)
          const stockAlerts = getStockAlerts(cart, currentProducts)
          if (stockAlerts.length > 0) {
            showStockAlerts(stockAlerts)
            return
          }
        } catch (refreshError) {
          toast.error(
            `Order failed: ${message}. Could not refresh product quantities: ${
              refreshError instanceof Error ? refreshError.message : 'Unknown error'
            }`,
            15_000
          )
          return
        }
      }
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (paymentMethod === 'cash' && cashReceived < grandTotal) {
      setCashReceived(grandTotal)
      syncDraft({ cashReceived: grandTotal })
    }
  }, [cashReceived, grandTotal, paymentMethod, syncDraft])

  useEffect(() => {
    setDraftOrderCount(draftOrders.length)
  }, [draftOrders.length, setDraftOrderCount])

  if (loading) return <Loading label="Loading POS..." />
  if (desktopUnavailable) {
    return (
      <EmptyState
        title="POS requires the desktop app"
        hint="Open Shafi Tikka in the Electron app to load products and save orders."
      />
    )
  }

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
              const stockAlert = stockAlerts.find((alert) => alert.productId === p.id)
              return (
                <div
                  key={p.id}
                  data-product-id={p.id}
                  className={`product-tile ${stockAlert ? 'has-stock-alert' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => tryAddProduct(p)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      tryAddProduct(p)
                    }
                  }}
                >
                  {qty > 0 && <span className="qty-badge">{qty}</span>}
                  <ProductThumb name={p.name} imagePath={p.image_path} />
                  <strong>{p.name}</strong>
                  {stockAlert && (
                    <div className="product-stock-alert" role="alert">
                      {stockAlert.message}
                    </div>
                  )}
                  <div className="price">{formatMoney(p.selling_price)}</div>
                  <ProductQuantitySelector
                    quantity={selectedQuantity}
                    onQuantityChange={(quantity) => setSelectedQuantity(p.id, quantity)}
                    onAdd={(quantity) => {
                      if (tryAddProduct(p, quantity)) {
                        setSelectedQuantity(p.id, 1)
                      }
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
          <button type="button" className="btn pos-new-button" onClick={createNewOrder}>
            <Plus size={14} /> New
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
                  syncDraft({ discount: nextDiscount })
                  if (paymentMethod === 'cash') {
                    const appliedDiscount = Math.min(Math.max(0, nextDiscount), subtotal)
                    setCashReceived(Math.max(0, subtotal - appliedDiscount))
                    syncDraft({
                      cashReceived: Math.max(0, subtotal - appliedDiscount),
                    })
                  }
                }}
              />
            </label>
            <label>
              Payment
              <select
                className="pos-payment-select"
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
          <div className="pos-waiter-field">
            Waiter on counter
            <details
              ref={waiterDropdownRef}
              className="pos-waiter-dropdown"
              onToggle={(event) => {
                if (event.currentTarget.open) void refreshWaiters()
              }}
            >
              <summary className="pos-waiter-trigger">
                <span>{waiters.find((waiter) => waiter.id === selectedWaiterId)?.name || 'Select waiter'}</span>
                <ChevronDown size={16} />
              </summary>
              <div className="pos-waiter-menu" role="group" aria-label="Choose waiter on counter">
                <button
                  type="button"
                  className="pos-waiter-option"
                  aria-pressed={selectedWaiterId === null}
                  onClick={() => {
                    chooseWaiter('')
                    waiterDropdownRef.current?.removeAttribute('open')
                  }}
                >
                  <span className="pos-waiter-check">
                    {selectedWaiterId === null && <Check size={14} />}
                  </span>
                  <span>No waiter selected</span>
                </button>
                {waiters.map((waiter) => (
                  <div key={waiter.id} className="pos-waiter-option-row">
                    <button
                      type="button"
                      className="pos-waiter-option"
                      aria-pressed={selectedWaiterId === waiter.id}
                      onClick={() => {
                        chooseWaiter(String(waiter.id))
                        waiterDropdownRef.current?.removeAttribute('open')
                      }}
                    >
                      <span className="pos-waiter-check">
                        {selectedWaiterId === waiter.id && <Check size={14} />}
                      </span>
                      <span>{waiter.name}</span>
                    </button>
                    <button
                      type="button"
                      className="pos-waiter-delete"
                      aria-label={`Remove ${waiter.name}`}
                      title={`Remove ${waiter.name}`}
                      onClick={() => setWaiterDeleteTarget(waiter)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {waiters.length === 0 && (
                  <span className="pos-waiter-empty">No waiters added</span>
                )}
              </div>
            </details>
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
          <button
            type="button"
            className="pos-print-button"
            onClick={() => void saveOrder()}
            disabled={saving || !cart.length}
          >
            <span className="pos-print-icon"><Printer size={20} /></span>
            <span>{saving ? 'Printing...' : 'Print'}</span>
          </button>
        </div>
      </aside>
      </div>
      {waiterDeleteTarget && (
        <ConfirmDialog
          title="Remove waiter"
          message={`Remove ${waiterDeleteTarget.name} from the waiter list?`}
          confirmLabel={deletingWaiter ? 'Removing...' : 'Remove waiter'}
          danger
          onClose={() => {
            if (!deletingWaiter) setWaiterDeleteTarget(null)
          }}
          onConfirm={() => void deleteWaiter()}
        />
      )}
    </div>
  )
}
