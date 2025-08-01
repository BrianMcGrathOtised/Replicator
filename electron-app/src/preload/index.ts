import { contextBridge, ipcRenderer } from 'electron';

// Define the API that will be exposed to the renderer process
interface ElectronAPI {
  // File system operations
  selectFile: () => Promise<string | null>;
  selectDirectory: () => Promise<string | null>;
  
  // App information
  getAppInfo: () => Promise<{
    name: string;
    version: string;
    electronVersion: string;
    nodeVersion: string;
  }>;
  
  // Connection management
  connections: {
    getAll: () => Promise<any>;
    get: (id: string) => Promise<any>;
    create: (request: any) => Promise<any>;
    update: (id: string, request: any) => Promise<any>;
    delete: (id: string) => Promise<any>;
  };

  // Script management
  scripts: {
    getAll: () => Promise<any>;
    get: (id: string) => Promise<any>;
    create: (request: any) => Promise<any>;
    update: (id: string, request: any) => Promise<any>;
    delete: (id: string) => Promise<any>;
  };

  // Configuration management
  configs: {
    getAll: () => Promise<any>;
    get: (id: string) => Promise<any>;
    create: (request: any) => Promise<any>;
    delete: (id: string) => Promise<any>;
  };

  // Replication operations
  replication: {
    testConnection: (connectionString: string) => Promise<any>;
    testStoredConnection: (connectionId: string) => Promise<any>;
    startStored: (request: { configId: string }) => Promise<any>;
    getStatus: (jobId: string) => Promise<any>;
    cancel: (jobId: string) => Promise<any>;
  };
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
const electronAPI: ElectronAPI = {
  selectFile: () => ipcRenderer.invoke('select-file'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  
  connections: {
    getAll: () => ipcRenderer.invoke('connections:get-all'),
    get: (id: string) => ipcRenderer.invoke('connections:get', id),
    create: (request: any) => ipcRenderer.invoke('connections:create', request),
    update: (id: string, request: any) => ipcRenderer.invoke('connections:update', id, request),
    delete: (id: string) => ipcRenderer.invoke('connections:delete', id),
  },

  scripts: {
    getAll: () => ipcRenderer.invoke('scripts:get-all'),
    get: (id: string) => ipcRenderer.invoke('scripts:get', id),
    create: (request: any) => ipcRenderer.invoke('scripts:create', request),
    update: (id: string, request: any) => ipcRenderer.invoke('scripts:update', id, request),
    delete: (id: string) => ipcRenderer.invoke('scripts:delete', id),
  },

  configs: {
    getAll: () => ipcRenderer.invoke('configs:get-all'),
    get: (id: string) => ipcRenderer.invoke('configs:get', id),
    create: (request: any) => ipcRenderer.invoke('configs:create', request),
    delete: (id: string) => ipcRenderer.invoke('configs:delete', id),
  },

  replication: {
    testConnection: (connectionString: string) => ipcRenderer.invoke('replication:test-connection', connectionString),
    testStoredConnection: (connectionId: string) => ipcRenderer.invoke('replication:test-stored-connection', connectionId),
    startStored: (request: { configId: string }) => ipcRenderer.invoke('replication:start-stored', request),
    getStatus: (jobId: string) => ipcRenderer.invoke('replication:get-status', jobId),
    cancel: (jobId: string) => ipcRenderer.invoke('replication:cancel', jobId),
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Type declaration for the global window object
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}