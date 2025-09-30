import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron';
import * as path from 'path';
// Simple development detection
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
import log from 'electron-log';
import { storageService } from './services/StorageService';
import { replicationService } from './services/ReplicationService';
import { schemaComparisonService } from './services/SchemaComparisonService';

// Configure logging
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

class DataReplicatorApp {
  private mainWindow: BrowserWindow | null = null;

  constructor() {
    this.initializeApp();
  }

  private initializeApp(): void {
    // Handle app ready
    app.whenReady().then(() => {
      // Remove default menu bar
      Menu.setApplicationMenu(null);
      
      this.createMainWindow();
      this.setupIpcHandlers();
    });

    // Handle window closed
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        this.cleanup();
        app.quit();
      }
    });

    // Handle app activate (macOS)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow();
      }
    });

    // Handle before quit
    app.on('before-quit', () => {
      this.cleanup();
    });
  }

  private createMainWindow(): void {
    log.info('Creating main window');

    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../preload/index.js')
      },
      icon: path.join(__dirname, '../../assets/icon.png'),
      show: false,
      titleBarStyle: 'default'
    });

    // Load the app
    if (isDev) {
      this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
      this.mainWindow.webContents.openDevTools();
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    // Show window when ready
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
      log.info('Main window shown');
    });

    // Handle window closed
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    // Handle external links
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });
  }

  // Removed server startup - now using direct IPC communication

  private setupIpcHandlers(): void {
    // Handle file selection
    ipcMain.handle('select-file', async () => {
      if (!this.mainWindow) return null;

      const result = await dialog.showOpenDialog(this.mainWindow, {
        properties: ['openFile'],
        filters: [
          { name: 'SQL Scripts', extensions: ['sql'] },
          { name: 'JavaScript Files', extensions: ['js'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      return result.canceled ? null : result.filePaths[0];
    });

    // Handle directory selection
    ipcMain.handle('select-directory', async () => {
      if (!this.mainWindow) return null;

      const result = await dialog.showOpenDialog(this.mainWindow, {
        properties: ['openDirectory']
      });

      return result.canceled ? null : result.filePaths[0];
    });

    // Configuration file dialogs
    ipcMain.handle('select-config-file', async () => {
      if (!this.mainWindow) return null;

      const result = await dialog.showOpenDialog(this.mainWindow, {
        properties: ['openFile'],
        filters: [
          { name: 'JSON Configuration Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      return result.canceled ? null : result.filePaths[0];
    });

    ipcMain.handle('save-config-file', async (_, defaultName?: string) => {
      if (!this.mainWindow) return null;

      const result = await dialog.showSaveDialog(this.mainWindow, {
        defaultPath: defaultName || 'replicator-config.json',
        filters: [
          { name: 'JSON Configuration Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      return result.canceled ? null : result.filePath;
    });

    // Handle app info
    ipcMain.handle('get-app-info', () => {
      return {
        name: app.getName(),
        version: app.getVersion(),
        electronVersion: process.versions.electron,
        nodeVersion: process.versions.node
      };
    });

    // Connection management IPC handlers
    ipcMain.handle('connections:get-all', async () => {
      try {
        return { success: true, data: await storageService.getConnections() };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle('connections:get', async (_, id: string) => {
      try {
        return { success: true, data: await storageService.getConnection(id) };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle('connections:create', async (_, request) => {
      try {
        return { success: true, data: await storageService.createConnection(request) };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle('connections:update', async (_, id: string, request) => {
      try {
        return { success: true, data: await storageService.updateConnection(id, request) };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle('connections:delete', async (_, id: string) => {
      try {
        await storageService.deleteConnection(id);
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // Script management IPC handlers
    ipcMain.handle('scripts:get-all', async () => {
      try {
        return { success: true, data: await storageService.getScripts() };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle('scripts:get', async (_, id: string) => {
      try {
        return { success: true, data: await storageService.getScript(id) };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle('scripts:create', async (_, request) => {
      try {
        return { success: true, data: await storageService.createScript(request) };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle('scripts:update', async (_, id: string, request) => {
      try {
        return { success: true, data: await storageService.updateScript(id, request) };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle('scripts:delete', async (_, id: string) => {
      try {
        await storageService.deleteScript(id);
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // Replication config management IPC handlers
    ipcMain.handle('configs:get-all', async () => {
      try {
        return { success: true, data: await storageService.getReplicationConfigs() };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle('configs:get', async (_, id: string) => {
      try {
        return { success: true, data: await storageService.getReplicationConfig(id) };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle('configs:create', async (_, request) => {
      try {
        return { success: true, data: await storageService.createReplicationConfig(request) };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle('configs:delete', async (_, id: string) => {
      try {
        await storageService.deleteReplicationConfig(id);
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // Replication operation IPC handlers
    ipcMain.handle('replication:test-connection', async (_, connectionString: string) => {
      try {
        return { success: true, data: await replicationService.testConnection(connectionString) };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle('replication:test-stored-connection', async (_, connectionId: string) => {
      try {
        return { success: true, data: await replicationService.testStoredConnection(connectionId) };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle('replication:start-stored', async (_, request: { configId: string }) => {
      try {
        const jobId = await replicationService.startStoredReplication(request);
        return { success: true, data: { jobId } };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle('replication:get-status', async (_, jobId: string) => {
      try {
        return { success: true, data: await replicationService.getReplicationStatus(jobId) };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle('replication:cancel', async (_, jobId: string) => {
      try {
        await replicationService.cancelReplication(jobId);
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // Configuration import/export
    ipcMain.handle('config:export', async (_, options: any) => {
      try {
        const configData = await storageService.exportConfiguration(options);
        return { success: true, data: configData };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle('config:import', async (_, configData: any, options: any) => {
      try {
        const result = await storageService.importConfiguration(configData, options);
        return { success: true, data: result };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // File I/O for config files
    ipcMain.handle('config:save-to-file', async (_, filePath: string, configData: any) => {
      try {
        const fs = require('fs').promises;
        await fs.writeFile(filePath, JSON.stringify(configData, null, 2), 'utf8');
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle('config:load-from-file', async (_, filePath: string) => {
      try {
        const fs = require('fs').promises;
        const fileContent = await fs.readFile(filePath, 'utf8');
        const configData = JSON.parse(fileContent);
        return { success: true, data: configData };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // General file writing handler
    ipcMain.handle('write-file', async (_, filePath: string, content: string) => {
      try {
        const fs = require('fs').promises;
        await fs.writeFile(filePath, content, 'utf8');
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // Schema comparison handlers
    ipcMain.handle('schema:compare', async (_, sourceConnectionId: string, targetConnectionId: string) => {
      try {
        // Get connection strings with decrypted credentials
        const sourceConnectionString = await storageService.getConnectionString(sourceConnectionId);
        const targetConnectionString = await storageService.getConnectionString(targetConnectionId);
        
        // Perform schema comparison
        const result = await schemaComparisonService.compareSchemas(sourceConnectionString, targetConnectionString);
        
        return { success: true, data: result };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle('schema:extract', async (_, connectionId: string) => {
      try {
        // Get connection string with decrypted credentials
        const connectionString = await storageService.getConnectionString(connectionId);
        
        // Extract schema
        const schema = await schemaComparisonService.extractDatabaseSchema(connectionString);
        
        return { success: true, data: schema };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // Data comparison handlers
    ipcMain.handle('data:compare', async (_, sourceConnectionId: string, targetConnectionId: string) => {
      try {
        // Get connection strings with decrypted credentials
        const sourceConnectionString = await storageService.getConnectionString(sourceConnectionId);
        const targetConnectionString = await storageService.getConnectionString(targetConnectionId);
        
        // Perform data comparison
        const result = await schemaComparisonService.compareData(sourceConnectionString, targetConnectionString);
        
        return { success: true, data: result };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle('data:extract-row-counts', async (_, connectionId: string) => {
      try {
        // Get connection string with decrypted credentials
        const connectionString = await storageService.getConnectionString(connectionId);
        
        // Extract row counts
        const rowCounts = await schemaComparisonService.extractTableRowCounts(connectionString);
        
        return { success: true, data: rowCounts };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });
  }


  private cleanup(): void {
    log.info('Cleaning up application');
    // No server process to clean up anymore
  }
}

// Initialize the application
new DataReplicatorApp(); 