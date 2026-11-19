import type Database from 'better-sqlite3'
import { allowNegativeStock, roundMoney } from '../utils/helpers'

export function adjustStock(
  db: Database.Database,
  rawMaterialId: number,
  quantityChange: number,
  movementType: 'in' | 'out' | 'purchase' | 'recipe' | 'adjustment' | 'wastage',
  opts: {
    unitPrice?: number
    referenceType?: string
    referenceId?: number
    notes?: string
  } = {}
): void {
  const item = db
    .prepare(`SELECT id, name, current_stock FROM raw_materials WHERE id = ?`)
    .get(rawMaterialId) as { id: number; name: string; current_stock: number } | undefined

  if (!item) throw new Error('Raw material not found')

  const newStock = roundMoney(item.current_stock + quantityChange)
  if (newStock < -0.0001 && !allowNegativeStock(db)) {
    throw new Error(`Insufficient stock for "${item.name}". Available: ${item.current_stock}`)
  }

  db.prepare(
    `UPDATE raw_materials SET current_stock = ?, updated_at = datetime('now','localtime') WHERE id = ?`
  ).run(newStock, rawMaterialId)

  db.prepare(
    `INSERT INTO stock_movements
      (raw_material_id, movement_type, quantity, unit_price, reference_type, reference_id, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    rawMaterialId,
    movementType,
    quantityChange,
    opts.unitPrice ?? 0,
    opts.referenceType ?? null,
    opts.referenceId ?? null,
    opts.notes ?? null
  )
}

/** Deduct recipe ingredients for an order. Returns total COGS. */
export function deductRecipesForOrder(db: Database.Database, orderId: number): number {
  const items = db
    .prepare(
      `SELECT product_id, quantity, product_name FROM order_items WHERE order_id = ? AND product_id IS NOT NULL`
    )
    .all(orderId) as Array<{ product_id: number; quantity: number; product_name: string }>

  let totalCogs = 0

  for (const item of items) {
    const recipe = db
      .prepare(`SELECT id FROM recipes WHERE product_id = ?`)
      .get(item.product_id) as { id: number } | undefined
    if (!recipe) continue

    const recipeItems = db
      .prepare(
        `SELECT ri.raw_material_id, ri.quantity, rm.purchase_price, rm.name
         FROM recipe_items ri
         JOIN raw_materials rm ON rm.id = ri.raw_material_id
         WHERE ri.recipe_id = ?`
      )
      .all(recipe.id) as Array<{
      raw_material_id: number
      quantity: number
      purchase_price: number
      name: string
    }>

    for (const ri of recipeItems) {
      const used = ri.quantity * item.quantity
      const cost = used * (ri.purchase_price || 0)
      totalCogs += cost
      adjustStock(db, ri.raw_material_id, -used, 'recipe', {
        unitPrice: ri.purchase_price,
        referenceType: 'order',
        referenceId: orderId,
        notes: `Used for ${item.product_name} x${item.quantity}`,
      })
    }
  }

  return roundMoney(totalCogs)
}

export function restoreRecipesForOrder(db: Database.Database, orderId: number): void {
  const movements = db
    .prepare(
      `SELECT raw_material_id, quantity FROM stock_movements
       WHERE movement_type = 'recipe' AND reference_type = 'order' AND reference_id = ?`
    )
    .all(orderId) as Array<{ raw_material_id: number; quantity: number }>

  for (const m of movements) {
    // recipe movements are negative; restore by reversing
    adjustStock(db, m.raw_material_id, -m.quantity, 'adjustment', {
      referenceType: 'order_cancel',
      referenceId: orderId,
      notes: 'Restored after order cancel',
    })
  }
}
