import './styles.css';
import { App } from './components/App';

// Type declarations for window.electronAPI - matches preload interface
declare global {
  interface Window {
    electronAPI: {
      selectFile: () => Promise<string | null>;
      selectDirectory: () => Promise<string | null>;
      selectConfigFile: () => Promise<string | null>;
      saveConfigFile: (defaultName?: string) => Promise<string | null>;
      writeFile: (filePath: string, content: string) => Promise<any>;
      getAppInfo: () => Promise<{
        name: string;
        version: string;
        electronVersion: string;
        nodeVersion: string;
      }>;
      connections: {
        getAll: () => Promise<any>;
        get: (id: string) => Promise<any>;
        create: (request: any) => Promise<any>;
        update: (id: string, request: any) => Promise<any>;
        delete: (id: string) => Promise<any>;
      };
      scripts: {
        getAll: () => Promise<any>;
        get: (id: string) => Promise<any>;
        create: (request: any) => Promise<any>;
        update: (id: string, request: any) => Promise<any>;
        delete: (id: string) => Promise<any>;
      };
      configs: {
        getAll: () => Promise<any>;
        get: (id: string) => Promise<any>;
        create: (request: any) => Promise<any>;
        delete: (id: string) => Promise<any>;
      };
      replication: {
        testConnection: (connectionString: string) => Promise<any>;
        testStoredConnection: (connectionId: string) => Promise<any>;
        startStored: (request: { configId: string }) => Promise<any>;
        getStatus: (jobId: string) => Promise<any>;
        cancel: (jobId: string) => Promise<any>;
      };
      config: {
        export: (options?: any) => Promise<any>;
        import: (configData: any, options?: any) => Promise<any>;
        saveToFile: (filePath: string, configData: any) => Promise<any>;
        loadFromFile: (filePath: string) => Promise<any>;
      };
      schema: {
        compare: (sourceConnectionId: string, targetConnectionId: string) => Promise<any>;
        extract: (connectionId: string) => Promise<any>;
      };
      data: {
        compare: (sourceConnectionId: string, targetConnectionId: string) => Promise<any>;
        extractRowCounts: (connectionId: string) => Promise<any>;
      };
    };
    dataReplicatorUI: App;
  }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  
  // Make app globally accessible for backward compatibility with onclick handlers
  window.dataReplicatorUI = app;
  
  console.log('Data Replicator UI initialized with component system');
});
