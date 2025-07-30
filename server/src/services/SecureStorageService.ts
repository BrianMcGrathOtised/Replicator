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
        
        // Migrate legacy connection string format if needed
        const migrated = this.migrateLegacyConnections(parsedData);
        if (migrated) {
          logger.info('Migrated legacy connection format to new structure');
        }
        
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
      parts.push('Encrypt=False'); // Can be overridden if needed
      parts.push('TrustServerCertificate=True');
      parts.push('Connection Timeout=30');
    }
    
    return parts.join(';');
  }

  private migrateLegacyConnections(data: any): boolean {
    let migrated = false;
    
    if (data.connections && Array.isArray(data.connections)) {
      for (const conn of data.connections) {
        // Check if this is a legacy connection with connectionString
        if (conn.connectionString && !conn.server) {
          try {
            // Decrypt the old connection string
            const decryptedConnectionString = encryptionService.decrypt(conn.connectionString);
            
            // Parse the connection string to extract components
            const components = this.parseConnectionStringForMigration(decryptedConnectionString);
            
            if (components.server && components.username && components.password && components.database) {
              // Update the connection object with new structure
              conn.server = encryptionService.encrypt(components.server);
              conn.username = encryptionService.encrypt(components.username);
              conn.password = encryptionService.encrypt(components.password);
              conn.database = encryptionService.encrypt(components.database);
              if (components.port) {
                conn.port = components.port;
              }
              
              // Remove the old connectionString field
              delete conn.connectionString;
              
              migrated = true;
              logger.info('Migrated legacy connection', { id: conn.id, name: conn.name });
            }
          } catch (error) {
            logger.warn('Failed to migrate connection, keeping as-is', { id: conn.id, error: error instanceof Error ? error.message : String(error) });
          }
        }
      }
    }
    
    // Save if migrated
    if (migrated) {
      this.saveData(data);
    }
    
    return migrated;
  }

  private parseConnectionStringForMigration(connectionString: string): {
    server?: string;
    username?: string;
    password?: string;
    database?: string;
    port?: number;
  } {
    const result: any = {};
    
    try {
      const pairs = connectionString.split(';').filter(pair => pair.trim());
      
      for (const pair of pairs) {
        const [key, value] = pair.split('=').map(s => s.trim());
        if (!key || !value) continue;
        
        switch (key.toLowerCase()) {
          case 'server':
          case 'data source':
            // Handle server with port format like "server,port"
            if (value.includes(',')) {
              const [server, port] = value.split(',');
              result.server = server.trim();
              result.port = parseInt(port.trim(), 10);
            } else {
              result.server = value;
            }
            break;
          case 'database':
          case 'initial catalog':
            result.database = value;
            break;
          case 'user id':
          case 'uid':
            result.username = value;
            break;
          case 'password':
          case 'pwd':
            result.password = value;
            break;
        }
      }
    } catch (error) {
      logger.warn('Failed to parse connection string for migration', { error: error instanceof Error ? error.message : String(error) });
    }
    
    return result;
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
      if (request.server) connection.server = encryptionService.encrypt(request.server);
      if (request.username) connection.username = encryptionService.encrypt(request.username);
      if (request.password) connection.password = encryptionService.encrypt(request.password);
      if (request.database) connection.database = encryptionService.encrypt(request.database);
      if (request.port !== undefined) connection.port = request.port;
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

  async updateReplicationConfig(id: string, request: CreateReplicationConfigRequest): Promise<StoredReplicationConfig> {
    try {
      const config = this.data.replicationConfigs.find(c => c.id === id);
      if (!config) {
        throw new CustomError('Replication config not found', 404);
      }
      
      // Validate references if they changed
      if (request.sourceConnectionId !== config.sourceConnectionId) {
        const sourceConnection = this.data.connections.find(c => c.id === request.sourceConnectionId);
        if (!sourceConnection) {
          throw new CustomError('Source connection not found', 400);
        }
      }
      
      if (request.targetId !== config.targetId) {
        const target = this.data.targets.find(t => t.id === request.targetId);
        if (!target) {
          throw new CustomError('Target not found', 400);
        }
      }
      
      for (const scriptId of request.configScriptIds) {
        const script = this.data.scripts.find(s => s.id === scriptId);
        if (!script) {
          throw new CustomError(`Script with ID ${scriptId} not found`, 400);
        }
      }
      
      // Update the config
      config.name = request.name;
      if (request.description !== undefined) {
        config.description = request.description;
      }
      config.sourceConnectionId = request.sourceConnectionId;
      config.targetId = request.targetId;
      config.configScriptIds = request.configScriptIds;
      config.settings = request.settings;
      config.updatedAt = new Date();
      
      this.saveData();
      
      logger.info('Replication config updated', { id, name: request.name });
      return { ...config };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to update replication config', { error: errorMessage, id });
      throw new CustomError('Failed to update replication config', 500);
    }
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