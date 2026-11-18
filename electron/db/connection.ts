import { app } from 'electron'
import Database from 'better-sqlite3'
import { join } from 'node:path'

export function createDatabase(): Database.Database {
  const dbPath = join(app.getPath('userData'), 'pos.db')
  const db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE,
      barcode TEXT UNIQUE,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      stock INTEGER DEFAULT 0,
      synced INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
  `)

  return db
}
