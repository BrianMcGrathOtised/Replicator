# Local Data Replicator

A TypeScript-based Electron application for replicating MS SQL Server and Azure SQL databases locally.

## Architecture

This project consists of two main components:
- **Electron App** (`electron-app/`): TypeScript-based desktop application UI
- **Express Server** (`server/`): TypeScript Node.js backend handling database operations

## Prerequisites

- Node.js 18 or higher
- npm or yarn
- SQL Server Express (optional, defaults to SQLite)

## Quick Start

1. Install all dependencies:
   ```bash
   npm run install:all
   ```

2. Start development servers:
   ```bash
   npm run dev
   ```

3. Build for production:
   ```bash
   npm run build
   ```

## Project Structure

```
├── electron-app/          # Electron TypeScript application
│   ├── src/
│   │   ├── main/         # Main process
│   │   ├── renderer/     # Renderer process
│   │   └── preload/      # Preload scripts
│   └── package.json
├── server/               # Express TypeScript server
│   ├── src/
│   │   ├── routes/       # API routes
│   │   ├── services/     # Business logic
│   │   └── types/        # TypeScript types
│   └── package.json
└── package.json          # Root workspace configuration
```

## Features

- ✅ Secure connection to MS SQL Server and Azure SQL Database
- ✅ Full schema and data replication to local database
- ✅ Post-import configuration script execution
- ✅ Cross-platform desktop UI
- ✅ TypeScript throughout the stack
- ✅ Local SQLite or SQL Server Express target options

## Development

Each component can be developed independently:

### Electron App
```bash
cd electron-app
npm run dev
```

### Express Server
```bash
cd server
npm run dev
```

## Security

- Connection strings are input-only and never stored
- Secure encrypted connections recommended
- Local databases are user-accessible with optional encryption
- Sandboxed Electron environment

## License

Private Project 