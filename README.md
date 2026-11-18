# POS App

Electron desktop POS starter using React, TypeScript, and a local SQLite database.

## Setup

Requires Node.js 20 or 22. Install dependencies and start the desktop app:

```sh
npm install
npx electron-builder install-app-deps
npm run dev
```

`better-sqlite3` is a native module, so `install-app-deps` rebuilds it for the
Electron version used by this project. On Windows, install Visual Studio Build
Tools with **Desktop development with C++** only if a compatible prebuilt
binary is unavailable.

## Windows installer

Build the x64 Windows NSIS installer with:

```sh
npm run build:win
```

The installer is written to `release/<version>/`. Building on Linux requires
Wine with 32-bit support (electron-builder runs a 32-bit resource editor).
On Ubuntu, enable the i386 architecture if needed and install `wine32:i386`
alongside `wine64`. If the existing Wine prefix cannot run the required
executables, use a separate 64-bit prefix without changing the existing one:

```sh
WINEARCH=win64 WINEPREFIX="$HOME/.wine-pos-build" npm run build:win
```

`better-sqlite3` also needs a compatible Windows x64 prebuilt binary for the
Electron version. If one is unavailable, build on Windows with the C++ build
tools installed. After cross-building (even if it fails), run
`npx electron-builder install-app-deps` before returning to Linux development
if the local native dependency was rebuilt for Windows.

## Database and product lookup

The database is created at Electron's `userData/pos.db` location when the main
process starts. The initial schema is defined in
[`electron/db/connection.ts`](./electron/db/connection.ts).

The renderer uses the narrow preload API; it never opens SQLite directly:

```ts
const product = await window.api.findByBarcode('123456')
```

The corresponding IPC handler is registered in `electron/main.ts` and exposes
only the product lookup operation.
