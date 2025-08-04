import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { encryptionService } from '../utils/encryption';
import { logger } from '../utils/logger';
import {
  StorageData,
  StoredConnection,
  StoredScript,
  StoredReplicationConfig,
  ConnectionInfo,
  CreateConnectionRequest,
  UpdateConnectionRequest,
  CreateScriptRequest,
  UpdateScriptRequest,
  CreateReplicationConfigRequest
} from '../types/storage';

export class StorageService {
  private dataFilePath: string;
  private data: StorageData;

  constructor() {
    // Use app.getPath for user data directory
    const userDataPath = app.getPath('userData');
    const dataDir = path.join(userDataPath, 'data');
    this.dataFilePath = path.join(dataDir, 'storage.json');
    this.data = this.loadData();
  }

  private loadData(): StorageData {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dataFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Load existing data or create default
      if (fs.existsSync(this.dataFilePath)) {
        const rawData = fs.readFileSync(this.dataFilePath, 'utf8');
        const parsedData = JSON.parse(rawData);
        
        // Convert date strings back to Date objects
        this.convertDatesFromStorage(parsedData);
        
        logger.info('Loaded storage data', { 
          connections: parsedData.connections.length,
          scripts: parsedData.scripts.length,
          targets: parsedData.targets.length,
          configs: parsedData.replicationConfigs.length
        });
        
        return parsedData;
      } else {
        const defaultData: StorageData = {
          connections: [],
          scripts: [],
          targets: [],
          replicationConfigs: [],
          version: '2.0.0',
          lastModified: new Date()
        };
        this.saveData(defaultData);
        return defaultData;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to load storage data', { error: errorMessage });
      throw new Error('Failed to initialize storage');
    }
  }

  private saveData(data?: StorageData): void {
    try {
      const dataToSave = data || this.data;
      dataToSave.lastModified = new Date();
      
      const jsonData = JSON.stringify(dataToSave, null, 2);
      fs.writeFileSync(this.dataFilePath, jsonData, { mode: 0o600 });
      
      logger.debug('Storage data saved successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to save storage data', { error: errorMessage });
      throw new Error('Failed to save data to storage');
    }
  }

  private convertDatesFromStorage(data: any): void {
    // Convert date strings back to Date objects
    data.lastModified = new Date(data.lastModified);
    
    data.connections.forEach((conn: any) => {
      conn.createdAt = new Date(conn.createdAt);
      conn.updatedAt = new Date(conn.updatedAt);
      if (conn.lastUsed) conn.lastUsed = new Date(conn.lastUsed);
    });
    
    data.scripts.forEach((script: any) => {
      script.createdAt = new Date(script.createdAt);
      script.updatedAt = new Date(script.updatedAt);
    });
    
    data.targets.forEach((target: any) => {
      target.createdAt = new Date(target.createdAt);
      target.updatedAt = new Date(target.updatedAt);
    });
    
    data.replicationConfigs.forEach((config: any) => {
      config.createdAt = new Date(config.createdAt);
      config.updatedAt = new Date(config.updatedAt);
      if (config.lastRun) config.lastRun = new Date(config.lastRun);
    });
  }

  private buildConnectionString(config: {
    server: string;
    username: string;
    password: string;
    database: string;
    port?: number;
    serverType: 'sqlserver' | 'azure-sql';
  }): string {
    const parts: string[] = [];
    
    // Server with optional port
    if (config.port) {
      parts.push(`Server=${config.server},${config.port}`);
    } else {
      parts.push(`Server=${config.server}`);
    }
    
    // Database
    parts.push(`Database=${config.database}`);
    
    // Authentication
    parts.push(`User Id=${config.username}`);
    parts.push(`Password=${config.password}`);
    
    // Connection settings based on server type
    if (config.serverType === 'azure-sql') {
      parts.push('Encrypt=True');
      parts.push('TrustServerCertificate=False');
      parts.push('Connection Timeout=30');
    } else {
      // SQL Server on-premises defaults
      parts.push('Encrypt=False');
      parts.push('TrustServerCertificate=True');
      parts.push('Connection Timeout=30');
    }
    
    return parts.join(';');
  }

  // Connection management
  async createConnection(request: CreateConnectionRequest): Promise<ConnectionInfo> {
    try {
      const id = uuidv4();
      const now = new Date();
      
      // Encrypt the sensitive connection fields
      const encryptedServer = encryptionService.encrypt(request.server);
      const encryptedUsername = encryptionService.encrypt(request.username);
      const encryptedPassword = encryptionService.encrypt(request.password);
      const encryptedDatabase = encryptionService.encrypt(request.database);
      
      const connection: StoredConnection = {
        id,
        name: request.name,
        ...(request.description && { description: request.description }),
        server: encryptedServer,
        username: encryptedUsername,
        password: encryptedPassword,
        database: encryptedDatabase,
        ...(request.port && { port: request.port }),
        serverType: request.serverType,
        ...(request.isTargetDatabase !== undefined && { isTargetDatabase: request.isTargetDatabase }),
        createdAt: now,
        updatedAt: now
      };
      
      this.data.connections.push(connection);
      this.saveData();
      
      logger.info('Connection created', { id, name: request.name, server: request.server });
      
      return {
        id,
        name: request.name,
        ...(request.description && { description: request.description }),
        serverType: request.serverType,
        server: request.server,
        username: request.username,
        database: request.database,
        ...(request.port && { port: request.port }),
        ...(request.isTargetDatabase !== undefined && { isTargetDatabase: request.isTargetDatabase }),
        createdAt: now,
        updatedAt: now
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to create connection', { error: errorMessage });
      throw new Error('Failed to create connection');
    }
  }

  async getConnections(): Promise<ConnectionInfo[]> {
    try {
      return this.data.connections.map(conn => {
        // Decrypt connection fields
        const decryptedServer = encryptionService.decrypt(conn.server);
        const decryptedUsername = encryptionService.decrypt(conn.username);
        const decryptedDatabase = encryptionService.decrypt(conn.database);
        
        return {
          id: conn.id,
          name: conn.name,
          ...(conn.description && { description: conn.description }),
          serverType: conn.serverType,
          server: decryptedServer,
          username: decryptedUsername,
          database: decryptedDatabase,
          ...(conn.port && { port: conn.port }),
          ...(conn.isTargetDatabase !== undefined && { isTargetDatabase: conn.isTargetDatabase }),
          createdAt: conn.createdAt,
          updatedAt: conn.updatedAt,
          ...(conn.lastUsed && { lastUsed: conn.lastUsed })
        };
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to get connections', { error: errorMessage });
      throw new Error('Failed to retrieve connections');
    }
  }

  async getConnection(id: string): Promise<ConnectionInfo> {
    const connection = this.data.connections.find(c => c.id === id);
    if (!connection) {
      throw new Error('Connection not found');
    }
    
    try {
      const decryptedServer = encryptionService.decrypt(connection.server);
      const decryptedUsername = encryptionService.decrypt(connection.username);
      const decryptedDatabase = encryptionService.decrypt(connection.database);
      
      return {
        id: connection.id,
        name: connection.name,
        ...(connection.description && { description: connection.description }),
        serverType: connection.serverType,
        server: decryptedServer,
        username: decryptedUsername,
        database: decryptedDatabase,
        ...(connection.port && { port: connection.port }),
        ...(connection.isTargetDatabase !== undefined && { isTargetDatabase: connection.isTargetDatabase }),
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
        ...(connection.lastUsed && { lastUsed: connection.lastUsed })
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to decrypt connection', { error: errorMessage, id });
      throw new Error('Failed to retrieve connection');
    }
  }

  async getConnectionString(id: string): Promise<string> {
    const connection = this.data.connections.find(c => c.id === id);
    if (!connection) {
      throw new Error('Connection not found');
    }
    
    try {
      const decryptedServer = encryptionService.decrypt(connection.server);
      const decryptedUsername = encryptionService.decrypt(connection.username);
      const decryptedPassword = encryptionService.decrypt(connection.password);
      const decryptedDatabase = encryptionService.decrypt(connection.database);
      
      // Build connection string from components
      const connectionString = this.buildConnectionString({
        server: decryptedServer,
        username: decryptedUsername,
        password: decryptedPassword,
        database: decryptedDatabase,
        ...(connection.port && { port: connection.port }),
        serverType: connection.serverType
      });
      
      // Update last used timestamp
      connection.lastUsed = new Date();
      this.saveData();
      
      return connectionString;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to build connection string', { error: errorMessage, id });
      throw new Error('Failed to retrieve connection string');
    }
  }

  async updateConnection(id: string, request: UpdateConnectionRequest): Promise<ConnectionInfo> {
    const connection = this.data.connections.find(c => c.id === id);
    if (!connection) {
      throw new Error('Connection not found');
    }
    
    try {
      // Update fields
      if (request.name) connection.name = request.name;
      if (request.description !== undefined) connection.description = request.description;
      if (request.serverType) connection.serverType = request.serverType;
      if (request.server) connection.server = encryptionService.encrypt(request.server);
      if (request.username) connection.username = encryptionService.encrypt(request.username);
      if (request.password) connection.password = encryptionService.encrypt(request.password);
      if (request.database) connection.database = encryptionService.encrypt(request.database);
      if (request.port !== undefined) connection.port = request.port;
      if (request.isTargetDatabase !== undefined) connection.isTargetDatabase = request.isTargetDatabase;
      connection.updatedAt = new Date();
      
      this.saveData();
      
      // Get updated connection info
      const decryptedServer = encryptionService.decrypt(connection.server);
      const decryptedUsername = encryptionService.decrypt(connection.username);
      const decryptedDatabase = encryptionService.decrypt(connection.database);
      
      logger.info('Connection updated', { id, name: connection.name });
      
      return {
        id: connection.id,
        name: connection.name,
        ...(connection.description && { description: connection.description }),
        serverType: connection.serverType,
        server: decryptedServer,
        username: decryptedUsername,
        database: decryptedDatabase,
        ...(connection.port && { port: connection.port }),
        ...(connection.isTargetDatabase !== undefined && { isTargetDatabase: connection.isTargetDatabase }),
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
        ...(connection.lastUsed && { lastUsed: connection.lastUsed })
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to update connection', { error: errorMessage, id });
      throw new Error('Failed to update connection');
    }
  }

  async deleteConnection(id: string): Promise<void> {
    const index = this.data.connections.findIndex(c => c.id === id);
    if (index === -1) {
      throw new Error('Connection not found');
    }
    
    // Check if connection is used by any targets or replication configs
    const usedByTargets = this.data.targets.some(t => t.configuration.connectionId === id);
    const usedByConfigs = this.data.replicationConfigs.some(c => c.sourceConnectionId === id || c.targetId === id);
    
    if (usedByTargets || usedByConfigs) {
      throw new Error('Connection is in use by targets or replication configurations');
    }
    
    this.data.connections.splice(index, 1);
    this.saveData();
    
    logger.info('Connection deleted', { id });
  }

  // Script management
  async createScript(request: CreateScriptRequest): Promise<StoredScript> {
    try {
      const id = uuidv4();
      const now = new Date();
      
      const script: StoredScript = {
        id,
        name: request.name,
        ...(request.description && { description: request.description }),
        content: request.content,
        language: request.language,
        tags: request.tags || [],
        createdAt: now,
        updatedAt: now
      };
      
      this.data.scripts.push(script);
      this.saveData();
      
      logger.info('Script created', { id, name: request.name });
      return script;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to create script', { error: errorMessage });
      throw new Error('Failed to create script');
    }
  }

  async getScripts(): Promise<StoredScript[]> {
    return [...this.data.scripts];
  }

  async getScript(id: string): Promise<StoredScript> {
    const script = this.data.scripts.find(s => s.id === id);
    if (!script) {
      throw new Error('Script not found');
    }
    return { ...script };
  }

  async updateScript(id: string, request: UpdateScriptRequest): Promise<StoredScript> {
    const script = this.data.scripts.find(s => s.id === id);
    if (!script) {
      throw new Error('Script not found');
    }
    
    if (request.name) script.name = request.name;
    if (request.description !== undefined) script.description = request.description;
    if (request.content) script.content = request.content;
    if (request.language) script.language = request.language;
    if (request.tags !== undefined) script.tags = request.tags;
    script.updatedAt = new Date();
    
    this.saveData();
    
    logger.info('Script updated', { id, name: script.name });
    return { ...script };
  }

  async deleteScript(id: string): Promise<void> {
    const index = this.data.scripts.findIndex(s => s.id === id);
    if (index === -1) {
      throw new Error('Script not found');
    }
    
    // Check if script is used by any replication configs
    const usedByConfigs = this.data.replicationConfigs.some(c => c.configScriptIds.includes(id));
    if (usedByConfigs) {
      throw new Error('Script is in use by replication configurations');
    }
    
    this.data.scripts.splice(index, 1);
    this.saveData();
    
    logger.info('Script deleted', { id });
  }

  // Replication config management
  async createReplicationConfig(request: CreateReplicationConfigRequest): Promise<StoredReplicationConfig> {
    try {
      const id = uuidv4();
      const now = new Date();
      
      // Validate references
      const sourceConnection = this.data.connections.find(c => c.id === request.sourceConnectionId);
      if (!sourceConnection) {
        throw new Error('Source connection not found');
      }
      
      const targetConnection = this.data.connections.find(c => c.id === request.targetId);
      if (!targetConnection) {
        throw new Error('Target connection not found');
      }
      
      if (!targetConnection.isTargetDatabase) {
        throw new Error('Connection is not marked as a target database');
      }
      
      for (const scriptId of request.configScriptIds) {
        const script = this.data.scripts.find(s => s.id === scriptId);
        if (!script) {
          throw new Error(`Script with ID ${scriptId} not found`);
        }
      }
      
      const config: StoredReplicationConfig = {
        id,
        name: request.name,
        ...(request.description && { description: request.description }),
        sourceConnectionId: request.sourceConnectionId,
        targetId: request.targetId,
        configScriptIds: request.configScriptIds,
        settings: request.settings,
        createdAt: now,
        updatedAt: now
      };
      
      this.data.replicationConfigs.push(config);
      this.saveData();
      
      logger.info('Replication config created', { id, name: request.name });
      return config;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to create replication config', { error: errorMessage });
      throw new Error('Failed to create replication config');
    }
  }

  async getReplicationConfigs(): Promise<StoredReplicationConfig[]> {
    return [...this.data.replicationConfigs];
  }

  async getReplicationConfig(id: string): Promise<StoredReplicationConfig> {
    const config = this.data.replicationConfigs.find(c => c.id === id);
    if (!config) {
      throw new Error('Replication config not found');
    }
    return { ...config };
  }

  async updateReplicationConfigLastRun(id: string): Promise<void> {
    const config = this.data.replicationConfigs.find(c => c.id === id);
    if (!config) {
      throw new Error('Replication config not found');
    }
    
    config.lastRun = new Date();
    this.saveData();
  }

  async deleteReplicationConfig(id: string): Promise<void> {
    const index = this.data.replicationConfigs.findIndex(c => c.id === id);
    if (index === -1) {
      throw new Error('Replication config not found');
    }
    
    this.data.replicationConfigs.splice(index, 1);
    this.saveData();
    
    logger.info('Replication config deleted', { id });
  }

  // Configuration export/import functionality
  async exportConfiguration(options: {
    includeConnections?: boolean;
    includeScripts?: boolean;
    includeConfigs?: boolean;
    selectedConnectionIds?: string[];
    selectedScriptIds?: string[];
    selectedConfigIds?: string[];
  } = {}): Promise<{
    connections: StoredConnection[];
    scripts: StoredScript[];
    replicationConfigs: StoredReplicationConfig[];
    metadata: {
      exportedAt: Date;
      version: string;
      itemCounts: {
        connections: number;
        scripts: number;
        configs: number;
      };
    };
  }> {
    try {
      const {
        includeConnections = true,
        includeScripts = true,
        includeConfigs = true,
        selectedConnectionIds,
        selectedScriptIds,
        selectedConfigIds
      } = options;

      let connections: StoredConnection[] = [];
      let scripts: StoredScript[] = [];
      let replicationConfigs: StoredReplicationConfig[] = [];

      // Export connections
      if (includeConnections) {
        connections = selectedConnectionIds
          ? this.data.connections.filter(c => selectedConnectionIds.includes(c.id))
          : [...this.data.connections];
      }

      // Export scripts
      if (includeScripts) {
        scripts = selectedScriptIds
          ? this.data.scripts.filter(s => selectedScriptIds.includes(s.id))
          : [...this.data.scripts];
      }

      // Export replication configs
      if (includeConfigs) {
        replicationConfigs = selectedConfigIds
          ? this.data.replicationConfigs.filter(r => selectedConfigIds.includes(r.id))
          : [...this.data.replicationConfigs];
      }

      const exportData = {
        connections,
        scripts,
        replicationConfigs,
        metadata: {
          exportedAt: new Date(),
          version: this.data.version,
          itemCounts: {
            connections: connections.length,
            scripts: scripts.length,
            configs: replicationConfigs.length
          }
        }
      };

      logger.info('Configuration exported', {
        connections: connections.length,
        scripts: scripts.length,
        configs: replicationConfigs.length
      });

      return exportData;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to export configuration', { error: errorMessage });
      throw new Error('Failed to export configuration');
    }
  }

  async importConfiguration(configData: {
    connections?: StoredConnection[];
    scripts?: StoredScript[];
    replicationConfigs?: StoredReplicationConfig[];
  }, options: {
    mergeMode?: 'replace' | 'merge' | 'skip-duplicates';
    generateNewIds?: boolean;
  } = {}): Promise<{
    imported: {
      connections: number;
      scripts: number;
      configs: number;
    };
    skipped: {
      connections: number;
      scripts: number;
      configs: number;
    };
    errors: string[];
  }> {
    try {
      const { mergeMode = 'merge', generateNewIds = true } = options;
      const result = {
        imported: { connections: 0, scripts: 0, configs: 0 },
        skipped: { connections: 0, scripts: 0, configs: 0 },
        errors: [] as string[]
      };

      // Helper function to generate new IDs if needed
      const processItem = <T extends { id: string; name: string }>(item: T): T => {
        if (generateNewIds) {
          return { ...item, id: uuidv4() };
        }
        return item;
      };

      // Import connections
      if (configData.connections) {
        for (const connection of configData.connections) {
          try {
            const existingIndex = this.data.connections.findIndex(c => 
              c.name === connection.name || (!generateNewIds && c.id === connection.id)
            );

            if (existingIndex >= 0) {
              if (mergeMode === 'replace') {
                this.data.connections[existingIndex] = processItem({
                  ...connection,
                  updatedAt: new Date()
                });
                result.imported.connections++;
              } else if (mergeMode === 'skip-duplicates') {
                result.skipped.connections++;
              } else { // merge mode
                // Update existing connection
                this.data.connections[existingIndex] = processItem({
                  ...this.data.connections[existingIndex],
                  ...connection,
                  updatedAt: new Date()
                });
                result.imported.connections++;
              }
            } else {
              // Add new connection
              this.data.connections.push(processItem({
                ...connection,
                createdAt: new Date(),
                updatedAt: new Date()
              }));
              result.imported.connections++;
            }
          } catch (error) {
            const errorMsg = `Failed to import connection "${connection.name}": ${error instanceof Error ? error.message : String(error)}`;
            result.errors.push(errorMsg);
            logger.warn(errorMsg);
          }
        }
      }

      // Import scripts
      if (configData.scripts) {
        for (const script of configData.scripts) {
          try {
            const existingIndex = this.data.scripts.findIndex(s => 
              s.name === script.name || (!generateNewIds && s.id === script.id)
            );

            if (existingIndex >= 0) {
              if (mergeMode === 'replace') {
                this.data.scripts[existingIndex] = processItem({
                  ...script,
                  updatedAt: new Date()
                });
                result.imported.scripts++;
              } else if (mergeMode === 'skip-duplicates') {
                result.skipped.scripts++;
              } else { // merge mode
                this.data.scripts[existingIndex] = processItem({
                  ...this.data.scripts[existingIndex],
                  ...script,
                  updatedAt: new Date()
                });
                result.imported.scripts++;
              }
            } else {
              // Add new script
              this.data.scripts.push(processItem({
                ...script,
                createdAt: new Date(),
                updatedAt: new Date()
              }));
              result.imported.scripts++;
            }
          } catch (error) {
            const errorMsg = `Failed to import script "${script.name}": ${error instanceof Error ? error.message : String(error)}`;
            result.errors.push(errorMsg);
            logger.warn(errorMsg);
          }
        }
      }

      // Import replication configs
      if (configData.replicationConfigs) {
        for (const config of configData.replicationConfigs) {
          try {
            const existingIndex = this.data.replicationConfigs.findIndex(r => 
              r.name === config.name || (!generateNewIds && r.id === config.id)
            );

            if (existingIndex >= 0) {
              if (mergeMode === 'replace') {
                this.data.replicationConfigs[existingIndex] = processItem({
                  ...config,
                  updatedAt: new Date()
                });
                result.imported.configs++;
              } else if (mergeMode === 'skip-duplicates') {
                result.skipped.configs++;
              } else { // merge mode
                this.data.replicationConfigs[existingIndex] = processItem({
                  ...this.data.replicationConfigs[existingIndex],
                  ...config,
                  updatedAt: new Date()
                });
                result.imported.configs++;
              }
            } else {
              // Add new config
              this.data.replicationConfigs.push(processItem({
                ...config,
                createdAt: new Date(),
                updatedAt: new Date()
              }));
              result.imported.configs++;
            }
          } catch (error) {
            const errorMsg = `Failed to import config "${config.name}": ${error instanceof Error ? error.message : String(error)}`;
            result.errors.push(errorMsg);
            logger.warn(errorMsg);
          }
        }
      }

      // Save changes if any imports were successful
      if (result.imported.connections > 0 || result.imported.scripts > 0 || result.imported.configs > 0) {
        this.saveData();
      }

      logger.info('Configuration imported', {
        imported: result.imported,
        skipped: result.skipped,
        errors: result.errors.length
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to import configuration', { error: errorMessage });
      throw new Error('Failed to import configuration');
    }
  }
}

// Export singleton instance
export const storageService = new StorageService();