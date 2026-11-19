import type Database from 'better-sqlite3'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { getDatabasePath } from '../db/connection'
import { deductRecipesForOrder, restoreRecipesForOrder, adjustStock } from '../services/stock'
import {
  generateOrderNumber,
  generatePurchaseNumber,
  nowLocal,
  roundMoney,
  todayLocal,
} from '../utils/helpers'

function dayStats(db: Database.Database, date: string) {
  const sales = db
    .prepare(
      `SELECT
        COUNT(*) as orders,
        COALESCE(SUM(grand_total),0) as sales,
        COALESCE(SUM(discount),0) as discounts,
        COALESCE(SUM(cogs),0) as cogs,
        COALESCE(SUM(CASE WHEN payment_method='cash' THEN grand_total ELSE 0 END),0) as cash,
        COALESCE(SUM(CASE WHEN payment_method='card' THEN grand_total ELSE 0 END),0) as card,
        COALESCE(SUM(CASE WHEN payment_method='other' THEN grand_total ELSE 0 END),0) as other
       FROM orders WHERE status='completed' AND date(created_at)=?`
    )
    .get(date) as Record<string, number>

  const cancelled = db
    .prepare(
      `SELECT COUNT(*) as c FROM orders WHERE status='cancelled' AND date(created_at)=?`
    )
    .get(date) as { c: number }

  const productsSold = db
    .prepare(
      `SELECT COALESCE(SUM(oi.quantity),0) as qty
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.status='completed' AND date(o.created_at)=?`
    )
    .get(date) as { qty: number }

  const purchases = db
    .prepare(
      `SELECT COALESCE(SUM(total_amount),0) as total FROM purchases WHERE purchase_date=?`
    )
    .get(date) as { total: number }

  const expenses = db
    .prepare(
      `SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE expense_date=?`
    )
    .get(date) as { total: number }

  const grossProfit = roundMoney((sales.sales || 0) - (sales.cogs || 0))
  const netProfit = roundMoney(grossProfit - (expenses.total || 0))

  return {
    date,
    totalOrders: sales.orders || 0,
    productsSold: productsSold.qty || 0,
    totalSales: sales.sales || 0,
    cashSales: sales.cash || 0,
    cardSales: sales.card || 0,
    otherSales: sales.other || 0,
    totalDiscounts: sales.discounts || 0,
    cancelledOrders: cancelled.c || 0,
    totalPurchases: purchases.total || 0,
    totalExpenses: expenses.total || 0,
    cogs: sales.cogs || 0,
    grossProfit,
    netProfit,
  }
}

export function registerAllHandlers(db: Database.Database): void {
  // ── Settings ──
  ipcMain.handle('settings:getAll', () => {
    const rows = db.prepare(`SELECT key, value FROM settings`).all() as Array<{
      key: string
      value: string
    }>
    return Object.fromEntries(rows.map((r) => [r.key, r.value]))
  })

  ipcMain.handle('settings:setMany', (_e, data: Record<string, string>) => {
    const stmt = db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now','localtime'))
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
    )
    const tx = db.transaction((entries: Array<[string, string]>) => {
      for (const [k, v] of entries) stmt.run(k, v)
    })
    tx(Object.entries(data))
    return { success: true }
  })

  ipcMain.handle('settings:backup', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Backup Database',
      defaultPath: `shafi_tikka_backup_${todayLocal()}.db`,
      filters: [{ name: 'Database', extensions: ['db'] }],
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    db.pragma('wal_checkpoint(FULL)')
    copyFileSync(getDatabasePath(), result.filePath)
    return { success: true, path: result.filePath }
  })

  ipcMain.handle('settings:restore', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Restore Database',
      filters: [{ name: 'Database', extensions: ['db'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return { canceled: true }
    if (!existsSync(result.filePaths[0])) throw new Error('File not found')
    db.close()
    copyFileSync(result.filePaths[0], getDatabasePath())
    return { success: true, restartRequired: true }
  })

  ipcMain.handle('app:selectImage', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Image',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      properties: ['openFile'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('app:imageDataUrl', (_e, filePath: string) => {
    if (!filePath || !existsSync(filePath)) return null
    const ext = extname(filePath).toLowerCase().replace('.', '')
    const mime =
      ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'webp'
          ? 'image/webp'
          : ext === 'gif'
            ? 'image/gif'
            : 'image/png'
    const buf = readFileSync(filePath)
    return `data:${mime};base64,${buf.toString('base64')}`
  })

  // ── Categories ──
  ipcMain.handle('categories:list', () =>
    db.prepare(`SELECT * FROM categories WHERE is_active=1 ORDER BY sort_order, name`).all()
  )

  ipcMain.handle('categories:create', (_e, name: string) => {
    if (!name?.trim()) throw new Error('Category name required')
    const r = db.prepare(`INSERT INTO categories (name) VALUES (?)`).run(name.trim())
    return { id: Number(r.lastInsertRowid) }
  })

  ipcMain.handle('categories:update', (_e, id: number, name: string) => {
    db.prepare(`UPDATE categories SET name=? WHERE id=?`).run(name.trim(), id)
    return { success: true }
  })

  ipcMain.handle('categories:delete', (_e, id: number) => {
    db.prepare(`UPDATE categories SET is_active=0 WHERE id=?`).run(id)
    return { success: true }
  })

  // ── Products ──
  ipcMain.handle('products:list', (_e, filters?: { search?: string; available_only?: boolean; category_id?: number }) => {
    let sql = `SELECT p.*, c.name as category_name FROM products p
               LEFT JOIN categories c ON c.id=p.category_id WHERE 1=1`
    const params: unknown[] = []
    if (filters?.available_only) sql += ` AND p.is_available=1`
    if (filters?.category_id) {
      sql += ` AND p.category_id=?`
      params.push(filters.category_id)
    }
    if (filters?.search) {
      sql += ` AND p.name LIKE ?`
      params.push(`%${filters.search}%`)
    }
    sql += ` ORDER BY p.sort_order, p.name`
    return db.prepare(sql).all(...params)
  })

  ipcMain.handle(
    'products:create',
    (
      _e,
      data: {
        name: string
        category_id?: number | null
        selling_price: number
        purchase_cost?: number
        image_path?: string | null
        is_available?: number
      }
    ) => {
      if (!data.name?.trim()) throw new Error('Product name required')
      if (data.selling_price < 0) throw new Error('Price cannot be negative')
      const r = db
        .prepare(
          `INSERT INTO products (name, category_id, selling_price, purchase_cost, image_path, is_available)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          data.name.trim(),
          data.category_id ?? null,
          data.selling_price,
          data.purchase_cost ?? 0,
          data.image_path ?? null,
          data.is_available ?? 1
        )
      return { id: Number(r.lastInsertRowid) }
    }
  )

  ipcMain.handle(
    'products:update',
    (
      _e,
      id: number,
      data: {
        name?: string
        category_id?: number | null
        selling_price?: number
        purchase_cost?: number
        image_path?: string | null
        is_available?: number
        sort_order?: number
      }
    ) => {
      const existing = db.prepare(`SELECT * FROM products WHERE id=?`).get(id) as Record<string, unknown> | undefined
      if (!existing) throw new Error('Product not found')
      db.prepare(
        `UPDATE products SET
          name=?, category_id=?, selling_price=?, purchase_cost=?, image_path=?,
          is_available=?, sort_order=?, updated_at=datetime('now','localtime')
         WHERE id=?`
      ).run(
        data.name ?? existing.name,
        data.category_id !== undefined ? data.category_id : existing.category_id,
        data.selling_price ?? existing.selling_price,
        data.purchase_cost ?? existing.purchase_cost,
        data.image_path !== undefined ? data.image_path : existing.image_path,
        data.is_available ?? existing.is_available,
        data.sort_order ?? existing.sort_order,
        id
      )
      return { success: true }
    }
  )

  ipcMain.handle('products:delete', (_e, id: number) => {
    const used = db.prepare(`SELECT COUNT(*) as c FROM order_items WHERE product_id=?`).get(id) as {
      c: number
    }
    if (used.c > 0) {
      db.prepare(`UPDATE products SET is_available=0, updated_at=datetime('now','localtime') WHERE id=?`).run(id)
      return { softDeleted: true }
    }
    db.prepare(`DELETE FROM products WHERE id=?`).run(id)
    return { success: true }
  })

  // ── Orders / POS ──
  ipcMain.handle(
    'orders:create',
    (
      _e,
      data: {
        customer_name?: string
        customer_phone?: string
        notes?: string
        discount?: number
        payment_method: 'cash' | 'card' | 'other'
        cash_received?: number
        items: Array<{ product_id: number; product_name: string; quantity: number; unit_price: number }>
      }
    ) => {
      if (!data.items?.length) throw new Error('Add at least one product')
      if (!['cash', 'card', 'other'].includes(data.payment_method)) {
        throw new Error('Invalid payment method')
      }

      const create = db.transaction(() => {
        const subtotal = roundMoney(
          data.items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
        )
        const discount = roundMoney(Math.min(data.discount || 0, subtotal))
        const grandTotal = roundMoney(subtotal - discount)
        const cashReceived =
          data.payment_method === 'cash'
            ? roundMoney(data.cash_received ?? grandTotal)
            : 0
        const changeAmount =
          data.payment_method === 'cash' ? roundMoney(Math.max(0, cashReceived - grandTotal)) : 0

        if (data.payment_method === 'cash' && cashReceived < grandTotal) {
          throw new Error('Cash received is less than grand total')
        }

        const orderNumber = generateOrderNumber(db)
        const r = db
          .prepare(
            `INSERT INTO orders (
              order_number, customer_name, customer_phone, notes,
              subtotal, discount, grand_total, payment_method,
              cash_received, change_amount, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)`
          )
          .run(
            orderNumber,
            data.customer_name?.trim() || null,
            data.customer_phone?.trim() || null,
            data.notes?.trim() || null,
            subtotal,
            discount,
            grandTotal,
            data.payment_method,
            cashReceived,
            changeAmount,
            nowLocal()
          )
        const orderId = Number(r.lastInsertRowid)

        const itemStmt = db.prepare(
          `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, line_total, unit_cost)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        for (const item of data.items) {
          const product = db
            .prepare(`SELECT purchase_cost FROM products WHERE id=?`)
            .get(item.product_id) as { purchase_cost: number } | undefined
          itemStmt.run(
            orderId,
            item.product_id,
            item.product_name,
            item.quantity,
            item.unit_price,
            roundMoney(item.quantity * item.unit_price),
            product?.purchase_cost ?? 0
          )
        }

        db.prepare(
          `INSERT INTO payments (order_id, method, amount) VALUES (?, ?, ?)`
        ).run(orderId, data.payment_method, grandTotal)

        const cogs = deductRecipesForOrder(db, orderId)
        db.prepare(`UPDATE orders SET cogs=? WHERE id=?`).run(cogs, orderId)

        if (data.customer_name?.trim()) {
          const existing = data.customer_phone
            ? (db
                .prepare(`SELECT id FROM customers WHERE phone=?`)
                .get(data.customer_phone.trim()) as { id: number } | undefined)
            : undefined
          if (!existing) {
            db.prepare(`INSERT INTO customers (name, phone) VALUES (?, ?)`).run(
              data.customer_name.trim(),
              data.customer_phone?.trim() || null
            )
          }
        }

        return { id: orderId, order_number: orderNumber, grand_total: grandTotal, change_amount: changeAmount }
      })

      return create()
    }
  )

  ipcMain.handle('orders:list', (_e, filters?: { search?: string; from?: string; to?: string; status?: string }) => {
    let sql = `SELECT * FROM orders WHERE 1=1`
    const params: unknown[] = []
    if (filters?.status) {
      sql += ` AND status=?`
      params.push(filters.status)
    }
    if (filters?.from) {
      sql += ` AND date(created_at)>=?`
      params.push(filters.from)
    }
    if (filters?.to) {
      sql += ` AND date(created_at)<=?`
      params.push(filters.to)
    }
    if (filters?.search) {
      sql += ` AND (order_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)`
      const q = `%${filters.search}%`
      params.push(q, q, q)
    }
    sql += ` ORDER BY id DESC LIMIT 500`
    return db.prepare(sql).all(...params)
  })

  ipcMain.handle('orders:get', (_e, id: number) => {
    const order = db.prepare(`SELECT * FROM orders WHERE id=?`).get(id)
    if (!order) throw new Error('Order not found')
    const items = db.prepare(`SELECT * FROM order_items WHERE order_id=?`).all(id)
    const payments = db.prepare(`SELECT * FROM payments WHERE order_id=?`).all(id)
    return { ...order, items, payments }
  })

  ipcMain.handle('orders:cancel', (_e, id: number) => {
    const order = db.prepare(`SELECT * FROM orders WHERE id=?`).get(id) as
      | { id: number; status: string }
      | undefined
    if (!order) throw new Error('Order not found')
    if (order.status === 'cancelled') throw new Error('Order already cancelled')

    const run = db.transaction(() => {
      restoreRecipesForOrder(db, id)
      db.prepare(
        `UPDATE orders SET status='cancelled', cancelled_at=datetime('now','localtime') WHERE id=?`
      ).run(id)
      return { success: true }
    })
    return run()
  })

  // ── Print ──
  ipcMain.handle('orders:printReceipt', async (_e, orderId: number) => {
    const order = db.prepare(`SELECT * FROM orders WHERE id=?`).get(orderId) as Record<string, unknown> | undefined
    if (!order) throw new Error('Order not found')
    const items = db.prepare(`SELECT * FROM order_items WHERE order_id=?`).all(orderId) as Array<{
      product_name: string
      quantity: number
      unit_price: number
      line_total: number
    }>
    const settings = Object.fromEntries(
      (db.prepare(`SELECT key, value FROM settings`).all() as Array<{ key: string; value: string }>).map(
        (r) => [r.key, r.value]
      )
    )
    const width = settings.receipt_width === '58' ? '58mm' : '80mm'
    const silent = settings.printer_silent === '1'

    const lines = items
      .map(
        (i) =>
          `<tr>
            <td>${escapeHtml(i.product_name)}</td>
            <td style="text-align:center">${i.quantity}</td>
            <td style="text-align:right">${Number(i.unit_price).toFixed(0)}</td>
            <td style="text-align:right">${Number(i.line_total).toFixed(0)}</td>
          </tr>`
      )
      .join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt</title>
      <style>
        @page { size: ${width} auto; margin: 4mm; }
        body { font-family: monospace; font-size: 12px; width: ${width}; margin: 0 auto; color: #000; }
        h1 { font-size: 16px; text-align: center; margin: 0 0 4px; }
        .center { text-align: center; }
        .meta { margin: 8px 0; font-size: 11px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 2px 0; }
        th { border-bottom: 1px dashed #000; text-align: left; font-size: 11px; }
        .totals { margin-top: 8px; border-top: 1px dashed #000; padding-top: 6px; }
        .totals div { display: flex; justify-content: space-between; margin: 2px 0; }
        .grand { font-weight: bold; font-size: 14px; }
        .footer { text-align: center; margin-top: 12px; font-size: 11px; }
      </style></head><body>
      <h1>${escapeHtml(settings.shop_name || 'SHAFI TIKKA')}</h1>
      ${settings.shop_address ? `<div class="center">${escapeHtml(settings.shop_address)}</div>` : ''}
      ${settings.shop_phone ? `<div class="center">${escapeHtml(settings.shop_phone)}</div>` : ''}
      <div class="meta">
        <div>Order: ${escapeHtml(String(order.order_number))}</div>
        <div>Date: ${escapeHtml(String(order.created_at))}</div>
        ${order.customer_name ? `<div>Customer: ${escapeHtml(String(order.customer_name))}</div>` : ''}
        ${order.customer_phone ? `<div>Phone: ${escapeHtml(String(order.customer_phone))}</div>` : ''}
      </div>
      <table>
        <thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>${lines}</tbody>
      </table>
      <div class="totals">
        <div><span>Subtotal</span><span>Rs. ${Number(order.subtotal).toFixed(0)}</span></div>
        <div><span>Discount</span><span>Rs. ${Number(order.discount).toFixed(0)}</span></div>
        <div class="grand"><span>Grand Total</span><span>Rs. ${Number(order.grand_total).toFixed(0)}</span></div>
        <div><span>Payment</span><span>${escapeHtml(String(order.payment_method))}</span></div>
        ${
          order.payment_method === 'cash'
            ? `<div><span>Cash Received</span><span>Rs. ${Number(order.cash_received).toFixed(0)}</span></div>
               <div><span>Change</span><span>Rs. ${Number(order.change_amount).toFixed(0)}</span></div>`
            : ''
        }
      </div>
      ${order.notes ? `<div style="margin-top:8px">Notes: ${escapeHtml(String(order.notes))}</div>` : ''}
      <div class="footer">${escapeHtml(settings.receipt_footer || 'Thank you!')}</div>
      <script>window.onload=()=>{ setTimeout(()=>window.print(), 200); }</script>
      </body></html>`

    const win = new BrowserWindow({
      show: false,
      width: 400,
      height: 600,
      webPreferences: { sandbox: true },
    })
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

    await new Promise<void>((resolve, reject) => {
      win.webContents.print(
        { silent, printBackground: true },
        (success, failureReason) => {
          win.destroy()
          if (!success && failureReason !== 'cancelled') {
            reject(new Error(failureReason || 'Print failed'))
          } else {
            resolve()
          }
        }
      )
    })

    return { success: true }
  })

  ipcMain.handle('orders:printInvoice', async (_e, orderId: number) => {
    const order = db.prepare(`SELECT * FROM orders WHERE id=?`).get(orderId) as Record<string, unknown> | undefined
    if (!order) throw new Error('Order not found')
    const items = db.prepare(
      `SELECT oi.product_name, oi.quantity, oi.unit_price, oi.line_total, COALESCE(c.name, '') as category_name
       FROM order_items oi
       LEFT JOIN products p ON p.id=oi.product_id
       LEFT JOIN categories c ON c.id=p.category_id
       WHERE oi.order_id=?`
    ).all(orderId) as Array<{
      product_name: string
      quantity: number
      unit_price: number
      line_total: number
      category_name: string
    }>
    const settings = Object.fromEntries(
      (db.prepare(`SELECT key, value FROM settings`).all() as Array<{ key: string; value: string }>).map(
        (r) => [r.key, r.value]
      )
    )
    const totalQuantity = items.reduce((total, item) => total + Number(item.quantity), 0)
    const rows = items
      .map(
        (item, index) => `<tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.product_name)}</td>
          <td>${escapeHtml(item.category_name)}</td>
          <td class="number">${Number(item.quantity).toLocaleString()}</td>
          <td class="number">Rs. ${Number(item.unit_price).toFixed(0)}</td>
          <td class="number">Rs. ${Number(item.line_total).toFixed(0)}</td>
        </tr>`
      )
      .join('')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Sales Invoice</title>
      <style>
        @page { size: A4 portrait; margin: 14mm 16mm; }
        * { box-sizing: border-box; }
        body { margin: 0; color: #292722; background: #ececec; font: 12px Arial, sans-serif; }
        .preview-toolbar { position: sticky; top: 0; z-index: 1; display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; background: #292722; color: white; }
        .preview-toolbar button { padding: 8px 14px; border: 0; border-radius: 5px; background: #aa8b3c; color: white; font-weight: 700; cursor: pointer; }
        .invoice { width: 100%; max-width: 790px; min-height: 1000px; margin: 24px auto; padding: 56px 64px; background: white; box-shadow: 0 2px 12px #0002; }
        .header { padding-bottom: 10px; border-bottom: 2px solid #aa8b3c; text-align: right; }
        .shop-name { margin: 0; color: #755c22; font-size: 18px; font-weight: 700; }
        .shop-contact { margin-top: 4px; color: #666; font-size: 10px; }
        .invoice-title { margin: 4px 0 6px; color: #9a792b; font-size: 11px; letter-spacing: 1.2px; }
        .meta { display: grid; gap: 3px; justify-items: end; font-size: 10px; }
        .section-title { margin: 0 0 8px; padding-bottom: 5px; color: #967728; border-bottom: 1px solid #d9c99c; font-size: 10px; letter-spacing: 1px; }
        .customer { margin: 14px 0 18px; }
        .customer-row { display: flex; gap: 28px; font-size: 10px; }
        .customer-row div { min-width: 150px; }
        .customer-label { display: block; margin-bottom: 3px; color: #888; font-size: 9px; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; }
        th { padding: 7px 4px; color: #666; border-bottom: 1px solid #cfc7b2; font-size: 8px; text-align: left; text-transform: uppercase; }
        td { padding: 7px 4px; border-bottom: 1px solid #e8e4da; font-size: 10px; }
        tr { break-inside: avoid; }
        .number { text-align: right; white-space: nowrap; }
        .summary { width: 48%; min-width: 250px; margin: 18px 0 0 auto; }
        .summary-row { display: flex; justify-content: space-between; padding: 5px 0; }
        .grand-total { margin-top: 4px; padding: 8px 0; border-top: 1px solid #aa8b3c; border-bottom: 1px solid #aa8b3c; font-size: 15px; font-weight: 700; }
        .signature { width: 180px; margin-top: 48px; padding-top: 5px; border-top: 1px solid #555; color: #666; font-size: 10px; text-align: center; }
        .footer { margin-top: 22px; color: #777; font-size: 10px; text-align: center; }
        @media print {
          body { background: white; }
          .preview-toolbar { display: none; }
          .invoice { width: 100%; max-width: 620px; min-height: 0; margin: 0 auto; padding: 0; box-shadow: none; }
        }
      </style></head><body>
        <div class="preview-toolbar">
          <strong>Invoice Preview</strong>
          <button type="button" onclick="window.print()">Print Invoice</button>
        </div>
        <main class="invoice">
        <header class="header">
          <h1 class="shop-name">${escapeHtml(settings.shop_name || 'SHAFI TIKKA')}</h1>
          <h2 class="invoice-title">SALE RECEIPT</h2>
          <div class="meta">
            <div>Invoice # ${escapeHtml(String(order.order_number))}</div>
            <div>Date ${escapeHtml(String(order.created_at))}</div>
            ${settings.shop_phone ? `<div>Shop Phone ${escapeHtml(settings.shop_phone)}</div>` : ''}
          </div>
          ${settings.shop_address ? `<div class="shop-contact">${escapeHtml(settings.shop_address)}</div>` : ''}
        </header>
        <section class="customer">
          <h3 class="section-title">CUSTOMER DETAILS</h3>
          <div class="customer-row">
            <div><span class="customer-label">Customer</span>${escapeHtml(String(order.customer_name || 'Walk-in Customer'))}</div>
            ${order.customer_phone ? `<div><span class="customer-label">Phone</span>${escapeHtml(String(order.customer_phone))}</div>` : ''}
          </div>
        </section>
        <section>
          <h3 class="section-title">SALE DETAILS</h3>
          <table>
            <thead><tr><th>Item</th><th>Name</th><th>Category</th><th class="number">Qty</th><th class="number">Price / Item</th><th class="number">Price</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </section>
        <section class="summary">
          <div class="summary-row"><span>Quantity</span><strong>${totalQuantity.toLocaleString()}</strong></div>
          <div class="summary-row"><span>Subtotal</span><span>Rs. ${Number(order.subtotal).toFixed(0)}</span></div>
          <div class="summary-row"><span>Discount</span><span>Rs. ${Number(order.discount).toFixed(0)}</span></div>
          <div class="summary-row grand-total"><span>Grand Total</span><span>Rs. ${Number(order.grand_total).toFixed(0)}</span></div>
        </section>
        <div class="signature">Owner's Signature</div>
        <footer class="footer">${escapeHtml(settings.receipt_footer || 'Thank you!')}</footer>
      </main></body></html>`

    const win = new BrowserWindow({
      show: false,
      width: 900,
      height: 1100,
      title: 'Invoice Preview',
      autoHideMenuBar: true,
      webPreferences: { sandbox: true },
    })
    try {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    } catch (error) {
      if (!win.isDestroyed()) win.destroy()
      throw error
    }
    win.show()
    win.focus()

    return { success: true }
  })

  // ── Dashboard ──
  ipcMain.handle('dashboard:stats', () => {
    const today = todayLocal()
    const stats = dayStats(db, today)
    const lowStock = db
      .prepare(`SELECT * FROM raw_materials WHERE current_stock <= min_stock ORDER BY current_stock ASC`)
      .all()
    const stockCount = db.prepare(`SELECT COUNT(*) as c FROM raw_materials`).get() as { c: number }
    const recent = db
      .prepare(
        `SELECT id, order_number, grand_total, payment_method, customer_name, created_at, status
         FROM orders ORDER BY id DESC LIMIT 10`
      )
      .all()
    const salesChart = db
      .prepare(
        `SELECT date(created_at) as day, SUM(grand_total) as total, COUNT(*) as orders
         FROM orders WHERE status='completed' AND created_at >= datetime('now','localtime','-13 days')
         GROUP BY date(created_at) ORDER BY day`
      )
      .all()
    return {
      ...stats,
      lowStock,
      lowStockCount: lowStock.length,
      materialCount: stockCount.c,
      recentTransactions: recent,
      salesChart,
    }
  })

  ipcMain.handle('reports:daily', (_e, date?: string) => {
    const d = date || todayLocal()
    const summary = dayStats(db, d)
    const orders = db
      .prepare(
        `SELECT * FROM orders WHERE date(created_at)=? ORDER BY id DESC`
      )
      .all(d)
    return { summary, orders }
  })

  // ── Raw materials ──
  ipcMain.handle('materials:list', (_e, search?: string) => {
    if (search) {
      return db
        .prepare(`SELECT * FROM raw_materials WHERE name LIKE ? ORDER BY name`)
        .all(`%${search}%`)
    }
    return db.prepare(`SELECT * FROM raw_materials ORDER BY name`).all()
  })

  ipcMain.handle(
    'materials:create',
    (
      _e,
      data: {
        name: string
        unit: string
        current_stock?: number
        min_stock?: number
        purchase_price?: number
        notes?: string
      }
    ) => {
      if (!data.name?.trim()) throw new Error('Name required')
      const r = db
        .prepare(
          `INSERT INTO raw_materials (name, unit, current_stock, min_stock, purchase_price, notes)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          data.name.trim(),
          data.unit || 'KG',
          data.current_stock ?? 0,
          data.min_stock ?? 0,
          data.purchase_price ?? 0,
          data.notes ?? null
        )
      const id = Number(r.lastInsertRowid)
      if ((data.current_stock ?? 0) > 0) {
        db.prepare(
          `INSERT INTO stock_movements (raw_material_id, movement_type, quantity, unit_price, notes)
           VALUES (?, 'in', ?, ?, 'Opening stock')`
        ).run(id, data.current_stock, data.purchase_price ?? 0)
      }
      return { id }
    }
  )

  ipcMain.handle(
    'materials:update',
    (
      _e,
      id: number,
      data: {
        name?: string
        unit?: string
        min_stock?: number
        purchase_price?: number
        notes?: string | null
      }
    ) => {
      const ex = db.prepare(`SELECT * FROM raw_materials WHERE id=?`).get(id) as Record<string, unknown> | undefined
      if (!ex) throw new Error('Not found')
      db.prepare(
        `UPDATE raw_materials SET name=?, unit=?, min_stock=?, purchase_price=?, notes=?,
         updated_at=datetime('now','localtime') WHERE id=?`
      ).run(
        data.name ?? ex.name,
        data.unit ?? ex.unit,
        data.min_stock ?? ex.min_stock,
        data.purchase_price ?? ex.purchase_price,
        data.notes !== undefined ? data.notes : ex.notes,
        id
      )
      return { success: true }
    }
  )

  ipcMain.handle('materials:delete', (_e, id: number) => {
    db.prepare(`DELETE FROM raw_materials WHERE id=?`).run(id)
    return { success: true }
  })

  ipcMain.handle(
    'materials:adjust',
    (
      _e,
      data: {
        raw_material_id: number
        quantity: number
        movement_type: 'in' | 'out' | 'adjustment' | 'wastage'
        unit_price?: number
        notes?: string
      }
    ) => {
      if (!data.quantity) throw new Error('Quantity required')
      let change = data.quantity
      if (data.movement_type === 'out' || data.movement_type === 'wastage') {
        change = -Math.abs(data.quantity)
      } else if (data.movement_type === 'in') {
        change = Math.abs(data.quantity)
      }
      adjustStock(db, data.raw_material_id, change, data.movement_type, {
        unitPrice: data.unit_price,
        notes: data.notes,
        referenceType: 'manual',
      })
      return { success: true }
    }
  )

  ipcMain.handle('materials:movements', (_e, materialId?: number) => {
    if (materialId) {
      return db
        .prepare(
          `SELECT sm.*, rm.name as material_name FROM stock_movements sm
           JOIN raw_materials rm ON rm.id=sm.raw_material_id
           WHERE sm.raw_material_id=? ORDER BY sm.id DESC LIMIT 200`
        )
        .all(materialId)
    }
    return db
      .prepare(
        `SELECT sm.*, rm.name as material_name FROM stock_movements sm
         JOIN raw_materials rm ON rm.id=sm.raw_material_id
         ORDER BY sm.id DESC LIMIT 200`
      )
      .all()
  })

  // ── Recipes ──
  ipcMain.handle('recipes:list', () => {
    const recipes = db
      .prepare(
        `SELECT r.*, p.name as product_name FROM recipes r
         JOIN products p ON p.id=r.product_id ORDER BY p.name`
      )
      .all() as Array<{ id: number }>
    const itemStmt = db.prepare(
      `SELECT ri.*, rm.name as material_name, rm.unit
       FROM recipe_items ri JOIN raw_materials rm ON rm.id=ri.raw_material_id
       WHERE ri.recipe_id=?`
    )
    return recipes.map((r) => ({ ...r, items: itemStmt.all(r.id) }))
  })

  ipcMain.handle(
    'recipes:save',
    (
      _e,
      data: {
        product_id: number
        notes?: string
        items: Array<{ raw_material_id: number; quantity: number }>
      }
    ) => {
      if (!data.product_id) throw new Error('Product required')
      const run = db.transaction(() => {
        const existing = db
          .prepare(`SELECT id FROM recipes WHERE product_id=?`)
          .get(data.product_id) as { id: number } | undefined
        let recipeId = existing?.id
        if (recipeId) {
          db.prepare(
            `UPDATE recipes SET notes=?, updated_at=datetime('now','localtime') WHERE id=?`
          ).run(data.notes ?? null, recipeId)
          db.prepare(`DELETE FROM recipe_items WHERE recipe_id=?`).run(recipeId)
        } else {
          const r = db
            .prepare(`INSERT INTO recipes (product_id, notes) VALUES (?, ?)`)
            .run(data.product_id, data.notes ?? null)
          recipeId = Number(r.lastInsertRowid)
        }
        const stmt = db.prepare(
          `INSERT INTO recipe_items (recipe_id, raw_material_id, quantity) VALUES (?, ?, ?)`
        )
        for (const item of data.items || []) {
          if (item.quantity > 0) stmt.run(recipeId, item.raw_material_id, item.quantity)
        }
        return { id: recipeId }
      })
      return run()
    }
  )

  ipcMain.handle('recipes:delete', (_e, id: number) => {
    db.prepare(`DELETE FROM recipes WHERE id=?`).run(id)
    return { success: true }
  })

  // ── Purchases ──
  ipcMain.handle('suppliers:list', () => db.prepare(`SELECT * FROM suppliers ORDER BY name`).all())

  ipcMain.handle('suppliers:create', (_e, data: { name: string; phone?: string; notes?: string }) => {
    if (!data.name?.trim()) throw new Error('Supplier name required')
    const r = db
      .prepare(`INSERT INTO suppliers (name, phone, notes) VALUES (?, ?, ?)`)
      .run(data.name.trim(), data.phone ?? null, data.notes ?? null)
    return { id: Number(r.lastInsertRowid) }
  })

  ipcMain.handle('purchases:list', (_e, filters?: { from?: string; to?: string }) => {
    let sql = `SELECT * FROM purchases WHERE 1=1`
    const params: unknown[] = []
    if (filters?.from) {
      sql += ` AND purchase_date>=?`
      params.push(filters.from)
    }
    if (filters?.to) {
      sql += ` AND purchase_date<=?`
      params.push(filters.to)
    }
    sql += ` ORDER BY id DESC`
    return db.prepare(sql).all(...params)
  })

  ipcMain.handle('purchases:get', (_e, id: number) => {
    const purchase = db.prepare(`SELECT * FROM purchases WHERE id=?`).get(id)
    if (!purchase) throw new Error('Purchase not found')
    const items = db
      .prepare(
        `SELECT pi.*, rm.name as material_name, rm.unit
         FROM purchase_items pi JOIN raw_materials rm ON rm.id=pi.raw_material_id
         WHERE pi.purchase_id=?`
      )
      .all(id)
    return { ...purchase, items }
  })

  ipcMain.handle(
    'purchases:create',
    (
      _e,
      data: {
        supplier_id?: number | null
        supplier_name?: string
        purchase_date?: string
        notes?: string
        items: Array<{ raw_material_id: number; quantity: number; unit_price: number }>
      }
    ) => {
      if (!data.items?.length) throw new Error('Add at least one material')
      const run = db.transaction(() => {
        const total = roundMoney(
          data.items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
        )
        const purchaseNumber = generatePurchaseNumber(db)
        let supplierName = data.supplier_name || null
        if (data.supplier_id) {
          const s = db.prepare(`SELECT name FROM suppliers WHERE id=?`).get(data.supplier_id) as
            | { name: string }
            | undefined
          supplierName = s?.name || supplierName
        }
        const r = db
          .prepare(
            `INSERT INTO purchases (purchase_number, supplier_id, supplier_name, purchase_date, total_amount, notes)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(
            purchaseNumber,
            data.supplier_id ?? null,
            supplierName,
            data.purchase_date || todayLocal(),
            total,
            data.notes ?? null
          )
        const purchaseId = Number(r.lastInsertRowid)
        const stmt = db.prepare(
          `INSERT INTO purchase_items (purchase_id, raw_material_id, quantity, unit_price, total_price)
           VALUES (?, ?, ?, ?, ?)`
        )
        for (const item of data.items) {
          const line = roundMoney(item.quantity * item.unit_price)
          stmt.run(purchaseId, item.raw_material_id, item.quantity, item.unit_price, line)
          adjustStock(db, item.raw_material_id, item.quantity, 'purchase', {
            unitPrice: item.unit_price,
            referenceType: 'purchase',
            referenceId: purchaseId,
            notes: `Purchase ${purchaseNumber}`,
          })
          db.prepare(
            `UPDATE raw_materials SET purchase_price=?, updated_at=datetime('now','localtime') WHERE id=?`
          ).run(item.unit_price, item.raw_material_id)
        }
        return { id: purchaseId, purchase_number: purchaseNumber, total_amount: total }
      })
      return run()
    }
  )

  // ── Expenses ──
  ipcMain.handle('expenses:list', (_e, filters?: { from?: string; to?: string }) => {
    let sql = `SELECT * FROM expenses WHERE 1=1`
    const params: unknown[] = []
    if (filters?.from) {
      sql += ` AND expense_date>=?`
      params.push(filters.from)
    }
    if (filters?.to) {
      sql += ` AND expense_date<=?`
      params.push(filters.to)
    }
    sql += ` ORDER BY expense_date DESC, id DESC`
    return db.prepare(sql).all(...params)
  })

  ipcMain.handle(
    'expenses:create',
    (
      _e,
      data: { title: string; amount: number; expense_date?: string; category?: string; description?: string }
    ) => {
      if (!data.title?.trim()) throw new Error('Expense name required')
      if (!data.amount || data.amount <= 0) throw new Error('Amount must be positive')
      const r = db
        .prepare(
          `INSERT INTO expenses (title, amount, expense_date, category, description)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(
          data.title.trim(),
          data.amount,
          data.expense_date || todayLocal(),
          data.category || 'Other',
          data.description ?? null
        )
      return { id: Number(r.lastInsertRowid) }
    }
  )

  ipcMain.handle(
    'expenses:update',
    (
      _e,
      id: number,
      data: { title?: string; amount?: number; expense_date?: string; category?: string; description?: string }
    ) => {
      const ex = db.prepare(`SELECT * FROM expenses WHERE id=?`).get(id) as Record<string, unknown> | undefined
      if (!ex) throw new Error('Not found')
      db.prepare(
        `UPDATE expenses SET title=?, amount=?, expense_date=?, category=?, description=? WHERE id=?`
      ).run(
        data.title ?? ex.title,
        data.amount ?? ex.amount,
        data.expense_date ?? ex.expense_date,
        data.category ?? ex.category,
        data.description !== undefined ? data.description : ex.description,
        id
      )
      return { success: true }
    }
  )

  ipcMain.handle('expenses:delete', (_e, id: number) => {
    db.prepare(`DELETE FROM expenses WHERE id=?`).run(id)
    return { success: true }
  })

  // ── Daily Closing ──
  ipcMain.handle('closing:preview', (_e, date?: string, openingCash = 0) => {
    const d = date || todayLocal()
    const stats = dayStats(db, d)
    const expectedCash = roundMoney(
      Number(openingCash) + stats.cashSales - stats.totalPurchases - stats.totalExpenses
    )
    // Note: purchases paid in cash reduce expected cash; COGS is for profit only (not double-counted in cash)
    return {
      ...stats,
      openingCash: Number(openingCash) || 0,
      expectedCash,
    }
  })

  ipcMain.handle(
    'closing:save',
    (
      _e,
      data: {
        closing_date?: string
        opening_cash: number
        actual_closing_cash: number
        notes?: string
      }
    ) => {
      const d = data.closing_date || todayLocal()
      const stats = dayStats(db, d)
      const opening = Number(data.opening_cash) || 0
      const expected = roundMoney(opening + stats.cashSales - stats.totalPurchases - stats.totalExpenses)
      const actual = Number(data.actual_closing_cash) || 0
      const difference = roundMoney(actual - expected)

      db.prepare(
        `INSERT INTO daily_closings (
          closing_date, opening_cash, cash_sales, card_sales, other_sales, total_sales, total_orders,
          total_discounts, total_purchases, total_expenses, cogs, gross_profit, net_profit,
          expected_cash, actual_closing_cash, cash_difference, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(closing_date) DO UPDATE SET
          opening_cash=excluded.opening_cash,
          cash_sales=excluded.cash_sales,
          card_sales=excluded.card_sales,
          other_sales=excluded.other_sales,
          total_sales=excluded.total_sales,
          total_orders=excluded.total_orders,
          total_discounts=excluded.total_discounts,
          total_purchases=excluded.total_purchases,
          total_expenses=excluded.total_expenses,
          cogs=excluded.cogs,
          gross_profit=excluded.gross_profit,
          net_profit=excluded.net_profit,
          expected_cash=excluded.expected_cash,
          actual_closing_cash=excluded.actual_closing_cash,
          cash_difference=excluded.cash_difference,
          notes=excluded.notes`
      ).run(
        d,
        opening,
        stats.cashSales,
        stats.cardSales,
        stats.otherSales,
        stats.totalSales,
        stats.totalOrders,
        stats.totalDiscounts,
        stats.totalPurchases,
        stats.totalExpenses,
        stats.cogs,
        stats.grossProfit,
        stats.netProfit,
        expected,
        actual,
        difference,
        data.notes ?? null
      )
      return { success: true, expectedCash: expected, cashDifference: difference, ...stats }
    }
  )

  ipcMain.handle('closing:list', () =>
    db.prepare(`SELECT * FROM daily_closings ORDER BY closing_date DESC LIMIT 90`).all()
  )

  ipcMain.handle('closing:get', (_e, date: string) =>
    db.prepare(`SELECT * FROM daily_closings WHERE closing_date=?`).get(date) || null
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
