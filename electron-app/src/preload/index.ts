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
  
  // API communication
  api: {
    testConnection: (connectionString: string) => Promise<any>;
    startReplication: (config: any) => Promise<any>;
    startStoredReplication: (configId: string) => Promise<any>;
    getReplicationStatus: (jobId: string) => Promise<any>;
    cancelReplication: (jobId: string) => Promise<any>;
  };
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
const electronAPI: ElectronAPI = {
  selectFile: () => ipcRenderer.invoke('select-file'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  
  api: {
    testConnection: async (connectionString: string) => {
      return fetch('http://localhost:3001/api/replication/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ connectionString })
      }).then(res => res.json());
    },
    
    startReplication: async (config: any) => {
      return fetch('http://localhost:3001/api/replication/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config)
      }).then(res => res.json());
    },
    
    startStoredReplication: async (configId: string) => {
      return fetch('http://localhost:3001/api/replication/start-stored', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ configId })
      }).then(res => res.json());
    },
    
    getReplicationStatus: async (jobId: string) => {
      return fetch(`http://localhost:3001/api/replication/status/${jobId}`)
        .then(res => res.json());
    },
    
    cancelReplication: async (jobId: string) => {
      return fetch(`http://localhost:3001/api/replication/cancel/${jobId}`, {
        method: 'POST'
      }).then(res => res.json());
    }
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Type declaration for the global window object
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
} 