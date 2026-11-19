import type Database from 'better-sqlite3'

export function todayLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function nowLocal(): string {
  const d = new Date()
  return `${todayLocal()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

export function roundMoney(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

export function getSetting(db: Database.Database, key: string, fallback = ''): string {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as
    | { value: string }
    | undefined
  return row?.value ?? fallback
}

export function allowNegativeStock(db: Database.Database): boolean {
  return getSetting(db, 'allow_negative_stock', '1') === '1'
}

export function generateOrderNumber(db: Database.Database): string {
  const date = todayLocal().replace(/-/g, '')
  const row = db
    .prepare(`SELECT COUNT(*) as c FROM orders WHERE date(created_at) = date('now','localtime')`)
    .get() as { c: number }
  return `ST-${date}-${String(row.c + 1).padStart(4, '0')}`
}

export function generatePurchaseNumber(db: Database.Database): string {
  const date = todayLocal().replace(/-/g, '')
  const row = db
    .prepare(`SELECT COUNT(*) as c FROM purchases WHERE date(created_at) = date('now','localtime')`)
    .get() as { c: number }
  return `PUR-${date}-${String(row.c + 1).padStart(3, '0')}`
}
