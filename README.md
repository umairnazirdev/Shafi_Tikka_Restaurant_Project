# Shafi Tikka POS

Simple offline desktop POS and daily business management for **SHAFI TIKKA**.

Built with Electron, React, TypeScript, Vite, and SQLite (`better-sqlite3`).

## Features

- Fast counter POS with product cards, cart, discount, cash/card/other payments
- Thermal receipt printing (58mm / 80mm)
- Product & category management with editable PKR prices
- Raw material stock, purchases, and recipe-based stock deduction
- Expenses, daily sales report, and daily cash closing
- Dashboard with real SQLite statistics
- Database backup & restore

## Setup

Requires Node.js 20 or 22.

```sh
npm install
npx electron-builder install-app-deps
npm run dev
```

## Build

```sh
# Linux AppImage
npm run build:linux

# Windows NSIS installer (needs Wine when building on Linux)
npm run build:win
```

Installers are written to `release/<version>/`.

## Database

SQLite file is stored in Electron `userData` (not inside the install folder):

- Linux: `~/.config/Shafi Tikka/shafi_tikka.db`
- Windows: `%APPDATA%/Shafi Tikka/shafi_tikka.db`

On first launch the app creates tables and seeds the Shafi Tikka menu products.

## Profit calculation

- **COGS** comes from recipe ingredient costs when an order is completed
- **Gross profit** = sales − COGS
- **Net profit** = gross profit − expenses
- Purchases increase stock/cost basis; they are **not** subtracted again as COGS
