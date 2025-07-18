import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { encryptionService } from '../utils/encryption';
import { logger } from '../utils/logger';
import { CustomError } from '../middleware/errorHandler';
import {
  StorageData,
  StoredConnection,
  StoredScript,
  StoredTarget,
  StoredReplicationConfig,
  ConnectionInfo,
  CreateConnectionRequest,
  UpdateConnectionRequest,
  CreateScriptRequest,
  UpdateScriptRequest,
  CreateTargetRequest,
  UpdateTargetRequest,
  CreateReplicationConfigRequest
} from '../types/storage';

export class SecureStorageService {
  private dataFilePath: string;
  private data: StorageData;

  constructor() {
    const dataDir = path.join(process.cwd(), 'data');
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
          version: '1.0.0',
          lastModified: new Date()
        };
        this.saveData(defaultData);
        return defaultData;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to load storage data', { error: errorMessage });
      throw new CustomError('Failed to initialize secure storage', 500);
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
      throw new CustomError('Failed to save data to secure storage', 500);
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

  private extractConnectionInfo(connectionString: string): { serverName?: string; databaseName?: string } {
    try {
      const pairs = connectionString.split(';').filter(pair => pair.trim());
      let serverName: string | undefined;
      let databaseName: string | undefined;
      
      for (const pair of pairs) {
        const [key, value] = pair.split('=').map(s => s.trim());
        if (!key || !value) continue;
        
        switch (key.toLowerCase()) {
          case 'server':
          case 'data source':
            serverName = value;
            break;
          case 'database':
          case 'initial catalog':
            databaseName = value;
            break;
        }
      }
      
      return { 
        ...(serverName && { serverName }),
        ...(databaseName && { databaseName })
      };
    } catch {
      return {};
    }
  }

  // Connection management
  async createConnection(request: CreateConnectionRequest): Promise<ConnectionInfo> {
    try {
      const id = uuidv4();
      const now = new Date();
      
      // Encrypt the connection string
      const encryptedConnectionString = encryptionService.encrypt(request.connectionString);
      
      const connection: StoredConnection = {
        id,
        name: request.name,
        ...(request.description && { description: request.description }),
        connectionString: encryptedConnectionString,
        serverType: request.serverType,
        createdAt: now,
        updatedAt: now
      };
      
      this.data.connections.push(connection);
      this.saveData();
      
      // Extract server info for response
      const { serverName, databaseName } = this.extractConnectionInfo(request.connectionString);
      
      logger.info('Connection created', { id, name: request.name });
      
      return {
        id,
        name: request.name,
        ...(request.description && { description: request.description }),
        serverType: request.serverType,
        ...(serverName && { serverName }),
        ...(databaseName && { databaseName }),
        createdAt: now,
        updatedAt: now
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to create connection', { error: errorMessage });
      throw new CustomError('Failed to create connection', 500);
    }
  }

  async getConnections(): Promise<ConnectionInfo[]> {
    try {
      return this.data.connections.map(conn => {
        // Decrypt connection string to extract info
        const decryptedConnectionString = encryptionService.decrypt(conn.connectionString);
        const { serverName, databaseName } = this.extractConnectionInfo(decryptedConnectionString);
        
        return {
          id: conn.id,
          name: conn.name,
          ...(conn.description && { description: conn.description }),
          serverType: conn.serverType,
          ...(serverName && { serverName }),
          ...(databaseName && { databaseName }),
          createdAt: conn.createdAt,
          updatedAt: conn.updatedAt,
          ...(conn.lastUsed && { lastUsed: conn.lastUsed })
        };
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to get connections', { error: errorMessage });
      throw new CustomError('Failed to retrieve connections', 500);
    }
  }

  async getConnection(id: string): Promise<ConnectionInfo> {
    const connection = this.data.connections.find(c => c.id === id);
    if (!connection) {
      throw new CustomError('Connection not found', 404);
    }
    
    try {
      const decryptedConnectionString = encryptionService.decrypt(connection.connectionString);
      const { serverName, databaseName } = this.extractConnectionInfo(decryptedConnectionString);
      
      return {
        id: connection.id,
        name: connection.name,
        ...(connection.description && { description: connection.description }),
        serverType: connection.serverType,
        ...(serverName && { serverName }),
        ...(databaseName && { databaseName }),
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
        ...(connection.lastUsed && { lastUsed: connection.lastUsed })
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to decrypt connection', { error: errorMessage, id });
      throw new CustomError('Failed to retrieve connection', 500);
    }
  }

  async getConnectionString(id: string): Promise<string> {
    const connection = this.data.connections.find(c => c.id === id);
    if (!connection) {
      throw new CustomError('Connection not found', 404);
    }
    
    try {
      const decryptedConnectionString = encryptionService.decrypt(connection.connectionString);
      
      // Update last used timestamp
      connection.lastUsed = new Date();
      this.saveData();
      
      return decryptedConnectionString;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to decrypt connection string', { error: errorMessage, id });
      throw new CustomError('Failed to retrieve connection string', 500);
    }
  }

  async updateConnection(id: string, request: UpdateConnectionRequest): Promise<ConnectionInfo> {
    const connection = this.data.connections.find(c => c.id === id);
    if (!connection) {
      throw new CustomError('Connection not found', 404);
    }
    
    try {
      // Update fields
      if (request.name) connection.name = request.name;
      if (request.description !== undefined) connection.description = request.description;
      if (request.serverType) connection.serverType = request.serverType;
      if (request.connectionString) {
        connection.connectionString = encryptionService.encrypt(request.connectionString);
      }
      connection.updatedAt = new Date();
      
      this.saveData();
      
      // Get updated connection info
      const decryptedConnectionString = encryptionService.decrypt(connection.connectionString);
      const { serverName, databaseName } = this.extractConnectionInfo(decryptedConnectionString);
      
      logger.info('Connection updated', { id, name: connection.name });
      
      return {
        id: connection.id,
        name: connection.name,
        ...(connection.description && { description: connection.description }),
        serverType: connection.serverType,
        ...(serverName && { serverName }),
        ...(databaseName && { databaseName }),
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
        ...(connection.lastUsed && { lastUsed: connection.lastUsed })
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to update connection', { error: errorMessage, id });
      throw new CustomError('Failed to update connection', 500);
    }
  }

  async deleteConnection(id: string): Promise<void> {
    const index = this.data.connections.findIndex(c => c.id === id);
    if (index === -1) {
      throw new CustomError('Connection not found', 404);
    }
    
    // Check if connection is used by any targets or replication configs
    const usedByTargets = this.data.targets.some(t => t.configuration.connectionId === id);
    const usedByConfigs = this.data.replicationConfigs.some(c => c.sourceConnectionId === id);
    
    if (usedByTargets || usedByConfigs) {
      throw new CustomError('Connection is in use by targets or replication configurations', 400);
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
      throw new CustomError('Failed to create script', 500);
    }
  }

  async getScripts(): Promise<StoredScript[]> {
    return [...this.data.scripts];
  }

  async getScript(id: string): Promise<StoredScript> {
    const script = this.data.scripts.find(s => s.id === id);
    if (!script) {
      throw new CustomError('Script not found', 404);
    }
    return { ...script };
  }

  async updateScript(id: string, request: UpdateScriptRequest): Promise<StoredScript> {
    const script = this.data.scripts.find(s => s.id === id);
    if (!script) {
      throw new CustomError('Script not found', 404);
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
      throw new CustomError('Script not found', 404);
    }
    
    // Check if script is used by any replication configs
    const usedByConfigs = this.data.replicationConfigs.some(c => c.configScriptIds.includes(id));
    if (usedByConfigs) {
      throw new CustomError('Script is in use by replication configurations', 400);
    }
    
    this.data.scripts.splice(index, 1);
    this.saveData();
    
    logger.info('Script deleted', { id });
  }

  // Target management
  async createTarget(request: CreateTargetRequest): Promise<StoredTarget> {
    try {
      const id = uuidv4();
      const now = new Date();
      
      // Validate connection reference if provided
      if (request.configuration.connectionId) {
        const connectionExists = this.data.connections.some(c => c.id === request.configuration.connectionId);
        if (!connectionExists) {
          throw new CustomError('Referenced connection not found', 400);
        }
      }
      
      const target: StoredTarget = {
        id,
        name: request.name,
        ...(request.description && { description: request.description }),
        targetType: request.targetType,
        configuration: request.configuration,
        createdAt: now,
        updatedAt: now
      };
      
      this.data.targets.push(target);
      this.saveData();
      
      logger.info('Target created', { id, name: request.name });
      return target;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to create target', { error: errorMessage });
      throw new CustomError('Failed to create target', 500);
    }
  }

  async getTargets(): Promise<StoredTarget[]> {
    return [...this.data.targets];
  }

  async getTarget(id: string): Promise<StoredTarget> {
    const target = this.data.targets.find(t => t.id === id);
    if (!target) {
      throw new CustomError('Target not found', 404);
    }
    return { ...target };
  }

  async updateTarget(id: string, request: UpdateTargetRequest): Promise<StoredTarget> {
    const target = this.data.targets.find(t => t.id === id);
    if (!target) {
      throw new CustomError('Target not found', 404);
    }
    
    // Validate connection reference if provided
    if (request.configuration?.connectionId) {
      const connectionExists = this.data.connections.some(c => c.id === request.configuration!.connectionId);
      if (!connectionExists) {
        throw new CustomError('Referenced connection not found', 400);
      }
    }
    
    if (request.name) target.name = request.name;
    if (request.description !== undefined) target.description = request.description;
    if (request.targetType) target.targetType = request.targetType;
    if (request.configuration) {
      target.configuration = { ...target.configuration, ...request.configuration };
    }
    target.updatedAt = new Date();
    
    this.saveData();
    
    logger.info('Target updated', { id, name: target.name });
    return { ...target };
  }

  async deleteTarget(id: string): Promise<void> {
    const index = this.data.targets.findIndex(t => t.id === id);
    if (index === -1) {
      throw new CustomError('Target not found', 404);
    }
    
    // Check if target is used by any replication configs
    const usedByConfigs = this.data.replicationConfigs.some(c => c.targetId === id);
    if (usedByConfigs) {
      throw new CustomError('Target is in use by replication configurations', 400);
    }
    
    this.data.targets.splice(index, 1);
    this.saveData();
    
    logger.info('Target deleted', { id });
  }

  // Replication config management
  async createReplicationConfig(request: CreateReplicationConfigRequest): Promise<StoredReplicationConfig> {
    try {
      const id = uuidv4();
      const now = new Date();
      
      // Validate references
      const sourceConnection = this.data.connections.find(c => c.id === request.sourceConnectionId);
      if (!sourceConnection) {
        throw new CustomError('Source connection not found', 400);
      }
      
      const target = this.data.targets.find(t => t.id === request.targetId);
      if (!target) {
        throw new CustomError('Target not found', 400);
      }
      
      for (const scriptId of request.configScriptIds) {
        const script = this.data.scripts.find(s => s.id === scriptId);
        if (!script) {
          throw new CustomError(`Script with ID ${scriptId} not found`, 400);
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
      throw new CustomError('Failed to create replication config', 500);
    }
  }

  async getReplicationConfigs(): Promise<StoredReplicationConfig[]> {
    return [...this.data.replicationConfigs];
  }

  async getReplicationConfig(id: string): Promise<StoredReplicationConfig> {
    const config = this.data.replicationConfigs.find(c => c.id === id);
    if (!config) {
      throw new CustomError('Replication config not found', 404);
    }
    return { ...config };
  }

  async updateReplicationConfigLastRun(id: string): Promise<void> {
    const config = this.data.replicationConfigs.find(c => c.id === id);
    if (!config) {
      throw new CustomError('Replication config not found', 404);
    }
    
    config.lastRun = new Date();
    this.saveData();
  }

  async deleteReplicationConfig(id: string): Promise<void> {
    const index = this.data.replicationConfigs.findIndex(c => c.id === id);
    if (index === -1) {
      throw new CustomError('Replication config not found', 404);
    }
    
    this.data.replicationConfigs.splice(index, 1);
    this.saveData();
    
    logger.info('Replication config deleted', { id });
  }
}

// Export singleton instance
export const secureStorageService = new SecureStorageService(); 