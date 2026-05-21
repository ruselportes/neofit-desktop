# NeoFit Admin Dashboard - Desktop Application

A self-contained desktop application for managing the NeoFit Fitness Gym, built using **React (TypeScript)**, **Vite**, **Electron**, **Express**, and **SQLite**.

This desktop version replaces the original PHP Laravel, Docker, and MySQL setup with a fully local, lightweight app package.

---

## Key Features

- **Standalone Execution**: Runs completely locally on Windows. No Docker, local web server, PHP, or external database installations required.
- **Embedded Database**: Uses SQLite via `better-sqlite3`. The database initializes automatically on first run.
- **Self-Seeding & Dummy Data**: Installs a default admin user, initial settings configuration, and seeds dummy members with past check-in records upon first launch.
- **Visual Month Calendar**: Beautiful month calendar inside Member Details modal, showing attendance highlight dots and clicked day information.
- **Smart Plan & Membership Renewal**: Simple renewals directly inside Member Details. Automatically defaults to the day after expiry if current plan/membership is still active, preserving paid days.
- **Date-Filtered Attendance Log**: Track and filter historical check-in logs using a date picker in the Attendance tab (manual check-ins are disabled on past dates).
- **Responsive Layouts**: Fully responsive design scaling cleanly on desktops, tablets, and mobile screens (supports landscape mobile vertical scrolling, table wrappers, and column stacking).
- **Security & Safety**: Employs context isolation between Electron processes and preloaded secure API bridges.

---

## Tech Stack

- **Frontend**: React 19, Vite 8, TypeScript
- **Backend API**: Node.js, Express 5
- **Database**: SQLite (`better-sqlite3`)
- **Desktop Wrapper**: Electron 36, `electron-builder` (packaging)

---

## Project Structure

```text
├── dist/                   # Compiled frontend build output
├── release/                # Compiled Electron desktop package output
├── server/
│   └── index.cjs           # Express API Server & SQLite DB setup
├── src/
│   ├── views/              # React Views (Dashboard, Members, Attendance, Rates, Settings, Login)
│   ├── api.ts              # API layer with dynamic environment routing
│   ├── App.tsx             # App layout, routing, and state manager
│   └── main.tsx            # Entry point (includes global emoji input filters)
├── electron-builder.yml    # Build & Packaging configuration
├── electron-main.cjs       # Electron main lifecycle process
├── electron-preload.cjs    # Electron preload IPC/security bridge
└── package.json            # Node project configuration
```

---

## Getting Started

### Prerequisites

- **Node.js**: (LTS v20+ recommended)

### Installation

Install all required NPM packages, including development and native modules:

```bash
npm install
```

---

## Running the Application

### 1. Web Development Mode (Vite Dev Server)
Runs the React frontend on `http://localhost:5173` and the Express API server on `http://localhost:3001` concurrently.

```bash
npm run dev
```

### 2. Electron Development Mode
Launches Vite, starts the local API backend, and boots up the Electron desktop shell displaying the development hot-reloaded interface:

```bash
npm run electron:dev
```

---

## Default Login Credentials

Upon the database's first run, the local SQLite database (`neofit.db`) auto-seeds the following administrator account:

- **Email**: `admin@neofit.com`
- **Password**: `admin123`

---

## Database File Locations

- **Development Mode**: `neofit.db` is stored inside the project root folder.
- **Production Mode (Packaged App)**: `neofit.db` is stored safely inside the local user's app data directory (e.g., `%APPDATA%/NeoFit Admin/neofit.db`).

---

## Building & Packaging

### 1. Compile the React Frontend
Compiles components and generates production web assets into the `dist/` directory:

```bash
npm run build
```

### 2. Build Unpacked Desktop Application (Portable Directory)
Generates the unpacked standalone Windows directory structure inside `release/win-unpacked/` (includes `NeoFit Admin.exe`):

```bash
npx electron-builder --win dir
```

### 3. Build Windows Installer (NSIS Setup)
Generates a distributable installer package (`.exe` setup file) in the `release/` directory:

```bash
npm run build:win
```

> [!IMPORTANT]  
> If building the NSIS installer or running `electron-builder` toolchain downloads for the first time, you must run your terminal in **Administrator Mode** or ensure **Windows Developer Mode** is enabled. This is required because `electron-builder` downloads cross-platform toolchains containing macOS symbolic links, which require special permissions to extract under Windows.
