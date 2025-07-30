// Shared data service for managing in-memory storage
interface SavedConnection {
  id: string;
  name: string;
  connectionString: string;
  isAzure: boolean;
  isTargetDatabase: boolean;
  databaseName: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

interface SavedSqlScript {
  id: string;
  name: string;
  content: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredConfiguration {
  id: string;
  name: string;
  sourceConnectionId: string;
  targetConnectionId: string;
  createTargetDatabase: boolean;
  scriptIds: string[];
  createdAt: string;
  updatedAt: string;
  lastRun?: string;
}

class DataService {
  private connections: SavedConnection[] = [];
  private scripts: SavedSqlScript[] = [];
  private configurations: StoredConfiguration[] = [];

  // Connection methods
  getConnections(): SavedConnection[] {
    return this.connections;
  }

  getConnection(id: string): SavedConnection | undefined {
    return this.connections.find(c => c.id === id);
  }

  addConnection(connection: SavedConnection): void {
    this.connections.push(connection);
  }

  updateConnection(id: string, updates: Partial<SavedConnection>): SavedConnection | null {
    const index = this.connections.findIndex(c => c.id === id);
    if (index === -1) return null;
    
    this.connections[index] = { ...this.connections[index], ...updates };
    return this.connections[index];
  }

  deleteConnection(id: string): SavedConnection | null {
    const index = this.connections.findIndex(c => c.id === id);
    if (index === -1) return null;
    
    return this.connections.splice(index, 1)[0];
  }

  // Script methods
  getScripts(): SavedSqlScript[] {
    return this.scripts;
  }

  getScript(id: string): SavedSqlScript | undefined {
    return this.scripts.find(s => s.id === id);
  }

  addScript(script: SavedSqlScript): void {
    this.scripts.push(script);
  }

  updateScript(id: string, updates: Partial<SavedSqlScript>): SavedSqlScript | null {
    const index = this.scripts.findIndex(s => s.id === id);
    if (index === -1) return null;
    
    this.scripts[index] = { ...this.scripts[index], ...updates };
    return this.scripts[index];
  }

  deleteScript(id: string): SavedSqlScript | null {
    const index = this.scripts.findIndex(s => s.id === id);
    if (index === -1) return null;
    
    return this.scripts.splice(index, 1)[0];
  }

  // Configuration methods
  getConfigurations(): StoredConfiguration[] {
    return this.configurations;
  }

  getConfiguration(id: string): StoredConfiguration | undefined {
    return this.configurations.find(c => c.id === id);
  }

  addConfiguration(configuration: StoredConfiguration): void {
    this.configurations.push(configuration);
  }

  updateConfiguration(id: string, updates: Partial<StoredConfiguration>): StoredConfiguration | null {
    const index = this.configurations.findIndex(c => c.id === id);
    if (index === -1) return null;
    
    this.configurations[index] = { ...this.configurations[index], ...updates };
    return this.configurations[index];
  }

  deleteConfiguration(id: string): StoredConfiguration | null {
    const index = this.configurations.findIndex(c => c.id === id);
    if (index === -1) return null;
    
    return this.configurations.splice(index, 1)[0];
  }
}

// Export singleton instance
export const dataService = new DataService();
export { SavedConnection, SavedSqlScript, StoredConfiguration }; 