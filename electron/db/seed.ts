import type Database from 'better-sqlite3'
import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const MENU_PRODUCTS: Array<{
  name: string
  price: number
  category: string
  order: number
  image: string
}> = [
  { name: 'Beef Kabab Khoye Wala', price: 120, category: 'BBQ', order: 1, image: 'beef-kabab.jpg' },
  { name: 'Chicken Kabab Khoye Wala', price: 120, category: 'BBQ', order: 2, image: 'chicken-kabab.jpg' },
  { name: 'Beef Tikka', price: 170, category: 'BBQ', order: 3, image: 'beef-tikka.jpg' },
  { name: 'Chicken Tikka', price: 200, category: 'BBQ', order: 4, image: 'chicken-tikka.jpg' },
  { name: 'Chicken Malai Boti', price: 240, category: 'Chicken', order: 5, image: 'malai-boti.jpg' },
  { name: 'Niblet', price: 220, category: 'Chicken', order: 6, image: 'niblet.jpg' },
  { name: 'Chicken Piece', price: 400, category: 'Chicken', order: 7, image: 'chicken-piece.jpg' },
  { name: 'Salad', price: 30, category: 'Sides', order: 8, image: 'salad.jpg' },
  { name: 'Special Raita', price: 50, category: 'Sides', order: 9, image: 'raita.jpg' },
  { name: 'Naan', price: 35, category: 'Sides', order: 10, image: 'naan.jpg' },
  { name: 'Bottle', price: 80, category: 'Drinks', order: 11, image: 'bottle.jpg' },
]

function productImagesDir(): string {
  const dir = join(app.getPath('userData'), 'products')
  mkdirSync(dir, { recursive: true })
  return dir
}

function resolveBundledImage(filename: string): string | null {
  const candidates = [
    join(process.env.VITE_PUBLIC || '', 'products', filename),
    join(process.env.APP_ROOT || '', 'public', 'products', filename),
    join(app.getAppPath(), 'dist', 'products', filename),
    join(app.getAppPath(), 'public', 'products', filename),
  ]
  for (const path of candidates) {
    if (path && existsSync(path)) return path
  }
  return null
}

function ensureProductImage(filename: string): string | null {
  const dest = join(productImagesDir(), filename)
  if (existsSync(dest)) return dest
  const source = resolveBundledImage(filename)
  if (!source) return null
  copyFileSync(source, dest)
  return dest
}

export function seedDatabase(db: Database.Database): void {
  // Always keep shop details aligned with the printed menu
  const settings: Record<string, string> = {
    shop_name: 'SHAFI TIKKA SHOP',
    shop_address: '',
    shop_phone: '0300-9430225, 0306-4753731, 0322-4832130, 0322-4976401, 0321-9410763',
    currency: 'PKR',
    currency_symbol: 'Rs.',
    receipt_width: '80',
    receipt_footer: 'Shafi Tikka Shop – Shukriya!',
    allow_negative_stock: '1',
    printer_silent: '0',
  }
  const setStmt = db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now','localtime'))
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
  )
  for (const [k, v] of Object.entries(settings)) setStmt.run(k, v)

  for (const name of ['BBQ', 'Chicken', 'Sides', 'Drinks']) {
    db.prepare(`INSERT INTO categories (name, sort_order) VALUES (?, ?) ON CONFLICT(name) DO NOTHING`).run(
      name,
      ['BBQ', 'Chicken', 'Sides', 'Drinks'].indexOf(name) + 1
    )
  }

  const cats = Object.fromEntries(
    (db.prepare('SELECT id, name FROM categories').all() as { id: number; name: string }[]).map((c) => [
      c.name,
      c.id,
    ])
  )

  const existing = db.prepare('SELECT id, name FROM products').all() as Array<{ id: number; name: string }>
  if (existing.length === 0) {
    const insert = db.prepare(
      `INSERT INTO products (name, category_id, selling_price, purchase_cost, image_path, is_available, sort_order)
       VALUES (?, ?, ?, 0, ?, 1, ?)`
    )
    for (const p of MENU_PRODUCTS) {
      insert.run(p.name, cats[p.category], p.price, ensureProductImage(p.image), p.order)
    }
  } else {
    // Upgrade older seeded names/prices/images to match the printed menu
    const renameMap: Record<string, string> = {
      'Chicken Kabab': 'Chicken Kabab Khoye Wala',
      'Beef Kabab': 'Beef Kabab Khoye Wala',
      'Chicken Pieces': 'Chicken Piece',
      Nuggets: 'Niblet',
    }
    for (const [oldName, newName] of Object.entries(renameMap)) {
      db.prepare(`UPDATE products SET name=? WHERE name=?`).run(newName, oldName)
    }

    const update = db.prepare(
      `UPDATE products SET
         category_id=?, selling_price=?, image_path=COALESCE(?, image_path),
         is_available=1, sort_order=?, updated_at=datetime('now','localtime')
       WHERE name=?`
    )
    const insert = db.prepare(
      `INSERT INTO products (name, category_id, selling_price, purchase_cost, image_path, is_available, sort_order)
       VALUES (?, ?, ?, 0, ?, 1, ?)`
    )
    const byName = new Set(
      (db.prepare('SELECT name FROM products').all() as Array<{ name: string }>).map((p) => p.name)
    )

    for (const p of MENU_PRODUCTS) {
      const image = ensureProductImage(p.image)
      if (byName.has(p.name)) {
        update.run(cats[p.category], p.price, image, p.order, p.name)
      } else {
        insert.run(p.name, cats[p.category], p.price, image, p.order)
      }
    }
  }

  const materialCount = db.prepare('SELECT COUNT(*) as c FROM raw_materials').get() as { c: number }
  if (materialCount.c === 0) {
    const materials = [
      { name: 'Chicken', unit: 'KG', min: 5 },
      { name: 'Beef', unit: 'KG', min: 5 },
      { name: 'Oil', unit: 'Liter', min: 2 },
      { name: 'Spices', unit: 'KG', min: 1 },
      { name: 'Flour', unit: 'KG', min: 5 },
      { name: 'Yogurt', unit: 'KG', min: 2 },
      { name: 'Vegetables', unit: 'KG', min: 3 },
      { name: 'Soft Drinks', unit: 'Piece', min: 12 },
    ]
    const matStmt = db.prepare(
      `INSERT INTO raw_materials (name, unit, current_stock, min_stock, purchase_price)
       VALUES (?, ?, 0, ?, 0)`
    )
    for (const m of materials) matStmt.run(m.name, m.unit, m.min)
  }
}
