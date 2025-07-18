import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron';
import * as path from 'path';
// Simple development detection
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
import { ChildProcess } from 'child_process';
import log from 'electron-log';

// Configure logging
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

class DataReplicatorApp {
  private mainWindow: BrowserWindow | null = null;
  private serverProcess: ChildProcess | null = null;

  constructor() {
    this.initializeApp();
  }

  private initializeApp(): void {
    // Handle app ready
    app.whenReady().then(() => {
      // Remove default menu bar
      Menu.setApplicationMenu(null);
      
      this.createMainWindow();
      this.startBackendServer();
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

  private startBackendServer(): void {
    log.info('Skipping backend server startup - assuming it is already running');
    // The backend server should be started separately via npm run dev:server
    // This avoids port conflicts and makes debugging easier
  }

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

    // Handle app info
    ipcMain.handle('get-app-info', () => {
      return {
        name: app.getName(),
        version: app.getVersion(),
        electronVersion: process.versions.electron,
        nodeVersion: process.versions.node
      };
    });
  }

  private cleanup(): void {
    log.info('Cleaning up application');

    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }
  }
}

// Initialize the application
new DataReplicatorApp(); 