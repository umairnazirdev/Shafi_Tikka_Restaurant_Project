import { app } from 'electron'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { runMigrations } from './schema'
import { seedDatabase } from './seed'

let dbInstance: Database.Database | null = null

export function getDatabasePath(): string {
  return join(app.getPath('userData'), 'shafi_tikka.db')
}

export function createDatabase(): Database.Database {
  const dbPath = getDatabasePath()
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  seedDatabase(db)
  dbInstance = db
  return db
}

export function getDb(): Database.Database {
  if (!dbInstance) throw new Error('Database not initialized')
  return dbInstance
}
