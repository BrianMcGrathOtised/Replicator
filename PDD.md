# 📜 Project Design Document (PDD)

## Project Title

**Local Data Replicator for MS SQL & Azure SQL**

---

## 1. Overview

### 1.1 Purpose

This Electron application enables users to connect to a remote **MS SQL Server** or **Azure SQL Database** using a connection string, replicate the database locally, and execute configuration scripts to adapt the data for local development or analysis.

### 1.2 Scope

- Input: SQL Server-compatible connection string (MSSQL or Azure SQL).
- Output: Local copy of the full remote database.
- Features:
  - Secure connection to MS SQL or Azure SQL.
  - Clone schema and data to a local SQL Server Express or SQLite DB.
  - Execute post-import configuration scripts.
  - Simple cross-platform UI for desktop users.

---

## 2. Functional Requirements

### 2.1 User Interface (UI)

- Electron-based desktop app
- UI components:
  - Connection string input field
  - Sync/Replicate button
  - Script execution options
  - Status and logs display

### 2.2 Features

| Feature                  | Description                                                          |
| ------------------------ | -------------------------------------------------------------------- |
| Connect to remote SQL DB | Connect via connection string (Azure SQL / MSSQL)                    |
| Full data replication    | Clone schema and data to local target                                |
| Run config scripts       | Execute JavaScript or SQL scripts locally                            |
| Logging                  | Show progress, success, and errors in-app                            |
| Select local DB type     | Option to target SQL Server Express or SQLite locally (configurable) |

---

## 3. Non-Functional Requirements

| Requirement     | Description                                                                 |
| --------------- | --------------------------------------------------------------------------- |
| Platform        | Windows/macOS/Linux via Electron                                            |
| Security        | No stored credentials; uses encrypted connection                            |
| Performance     | Handles up to \~1GB database efficiently                                    |
| Maintainability | Modular script engine and database access layer                             |
| Local DB Target | Defaults to SQLite for portability; option to use local SQL Server instance |

---

## 4. Architecture

### 4.1 Components

- **Frontend**: Electron + HTML/CSS/JS
- **Backend**: Node.js with MSSQL driver
- **DB Client Layer**: `mssql` (Node.js SQL Server client)
- **Local Target DB**: SQLite or SQL Server Express
- **Script Runner**: JavaScript (Node.js) or raw SQL

### 4.2 Data Flow

```
User enters connection string
↓
App connects to remote MS SQL/Azure SQL
↓
Schema and data exported
↓
Data imported to local target
↓
Config scripts executed
↓
Completion log shown
```

---

## 5. Technical Stack

| Layer     | Tech                                   |
| --------- | -------------------------------------- |
| UI        | Electron, JavaScript, HTML/CSS         |
| Backend   | Node.js, `mssql` library               |
| Local DB  | SQLite (default) or SQL Server Express |
| Scripts   | Node.js (JS modules) or SQL files      |
| Dev Tools | TypeScript (optional), Webpack, ESLint |

---

## 6. Security Considerations

- Credentials are input-only; never stored unencrypted.
- Secure connection strings recommended (using integrated security or token auth).
- Local DBs are user-accessible but can be encrypted optionally.
- Electron app is sandboxed; no internet access beyond DB connection.

---

## 7. Assumptions and Constraints

- Only MS SQL Server and Azure SQL are supported.
- Database size should not exceed reasonable desktop memory limits (\~2–5GB max).
- User must have permissions to read schema and data on the remote DB.
- Local environment must have adequate disk space and permissions for data writes.

---

## 8. Future Enhancements

- Integrated login for Azure Active Directory
- Scheduling for nightly or weekly sync
- UI-based script builder/editor
- Git-based versioning of config scripts
- Support for multiple target environments

---

## 9. Appendices

### A. Supported Database Types

- ✅ **Microsoft SQL Server**
- ✅ **Azure SQL Database**
- ❌ PostgreSQL, MySQL, MongoDB, Oracle – *Not supported*

### B. Example Script Flow

```sql
-- Remove sensitive info from local users table
UPDATE Users
SET Email = 'anon@example.com'
WHERE IsTestUser = 1;
```

```js
// JavaScript config script (Node.js)
async function run(db) {
  await db.query(`UPDATE Config SET IsDebug = 1 WHERE Environment = 'Local'`);
  console.log("Local debug flag enabled.");
}
```

