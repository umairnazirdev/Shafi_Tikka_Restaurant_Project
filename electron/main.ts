import { app, BrowserWindow } from 'electron'
import type Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createDatabase } from './db/connection'
import { registerAllHandlers } from './ipc/index'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Avoid GPU process crashes on some Linux setups
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('no-sandbox')
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('remote-debugging-port', '9222')

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null
let db: Database.Database | undefined

function createWindow() {
  const preloadCjs = path.join(__dirname, 'preload.cjs')
  const preloadJs = path.join(__dirname, 'preload.js')
  const preloadMjs = path.join(__dirname, 'preload.mjs')
  const preloadPath = existsSync(preloadCjs)
    ? preloadCjs
    : existsSync(preloadJs)
      ? preloadJs
      : preloadMjs

  win = new BrowserWindow({
    title: 'Shafi Tikka',
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#111827',
    show: false,
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.webContents.on('preload-error', (_event, preload, error) => {
    console.error('Preload failed:', preload, error)
  })

  win.once('ready-to-show', () => {
    win?.maximize()
    win?.show()
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('before-quit', () => {
  try {
    db?.pragma('wal_checkpoint(TRUNCATE)')
    db?.close()
  } catch {
    // ignore
  }
})

app.whenReady().then(() => {
  db = createDatabase()
  registerAllHandlers(db)
  createWindow()
})
