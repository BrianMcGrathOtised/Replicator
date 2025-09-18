# Local Data Replicator

A self-contained TypeScript-based Electron desktop application for replicating MS SQL Server and Azure SQL databases locally.

## Architecture

This is a standalone Electron application with direct database connectivity:
- **Electron App** (`electron-app/`): Self-contained desktop application
  - **Main Process**: Handles database operations, storage, and business logic
  - **Renderer Process**: User interface and presentation layer
  - **Preload Scripts**: Secure communication bridge between main and renderer

## Prerequisites

- Node.js 18 or higher
- npm or yarn
- SQL Server (for target database)

## Quick Start

1. Install dependencies:
   ```bash
   npm run install:all
   ```

2. Start development:
   ```bash
   npm run dev
   ```

3. Build for production:
   ```bash
   npm run build
   ```

4. Package application:
   ```bash
   npm run package
   ```

## Key Features

- **Database Replication**: Replicate MS SQL Server and Azure SQL databases using BACPAC technology
- **Configuration Management**: Save and manage database connections, SQL scripts, and replication configurations
- **Settings Import/Export**: Export your configurations to share with team members or backup settings. Import configurations from JSON files for quick setup
- **Secure Storage**: All sensitive data is encrypted and stored locally in `data/storage.json` [[memory:4758196]]
- **Post-Replication Scripts**: Run custom SQL scripts after replication completes

## Project Structure

```
├── electron-app/          # Standalone Electron application
│   ├── src/
│   │   ├── main/         # Main process (database operations, storage)
│   │   │   ├── services/ # Business logic and database services
│   │   │   ├── utils/    # Encryption, logging utilities
│   │   │   └── types/    # TypeScript type definitions
│   │   ├── renderer/     # Renderer process (UI)
│   │   └── preload/      # IPC communication bridge
│   └── package.json
└── package.json          # Root project configuration
```

## Features

- ✅ Direct connection to MS SQL Server and Azure SQL Database
- ✅ Self-contained application with no external server dependencies
- ✅ Encrypted local storage for connection information
- ✅ Full schema and data replication to local database
- ✅ Post-import configuration script execution
- ✅ Cross-platform desktop application (Windows, macOS, Linux)
- ✅ Secure IPC communication between processes
- ✅ TypeScript throughout the application

## Development

```bash
cd electron-app
npm run dev
```

This will start the Electron application in development mode with hot reloading.

## Security

- ✅ Connection credentials are encrypted using AES-256-CBC
- ✅ Local storage uses secure file-based encryption
- ✅ Sandboxed Electron renderer environment
- ✅ Secure IPC communication between main and renderer processes
- ✅ No network server exposure - completely offline operation
- ✅ Connection strings are encrypted at rest

## License

Private Project 