import * as mssql from 'mssql';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { storageService } from './StorageService';

export interface ReplicationConfig {
  connectionString: string;
  target: {
    targetType: 'sqlserver';
    connectionString: string;
    overwriteExisting?: boolean;
    backupBefore?: boolean;
    createNewDatabase?: boolean;
  };
  configScripts: string[];
  settings?: {
    includeData?: boolean;
    includeSchema?: boolean;
  };
}

export interface StoredReplicationRequest {
  configId: string;
}

export interface ReplicationStatus {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  message: string;
  startTime: Date;
  endTime?: Date;
  error?: string;
  configId?: string;
  configName?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  serverInfo: {
    productName: string;
    productVersion: string;
    databaseName: string;
  };
  tables: string[];
}

export class ReplicationService {
  private activeJobs: Map<string, ReplicationStatus> = new Map();

  async testConnection(connectionString: string): Promise<ConnectionTestResult> {
    let pool: mssql.ConnectionPool | undefined;
    
    try {
      logger.info('Testing database connection', { connectionString: connectionString.replace(/password=[^;]*/i, 'password=***') });
      
      // Parse and validate connection string
      const config = this.parseConnectionString(connectionString);
      
      // Try connection
      pool = await this.establishConnection(config, connectionString);
      
      // Get server information
      const serverInfoQuery = `
        SELECT 
          SERVERPROPERTY('ProductName') as ProductName,
          SERVERPROPERTY('ProductVersion') as ProductVersion,
          DB_NAME() as DatabaseName
      `;
      
      const serverInfoResult = await pool.request().query(serverInfoQuery);
      const serverInfo = serverInfoResult.recordset[0];
      
      // Get table list
      const tablesQuery = `
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
      `;
      
      const tablesResult = await pool.request().query(tablesQuery);
      const tables = tablesResult.recordset.map(row => row.TABLE_NAME);
      
      logger.info('Connection test successful', { 
        database: serverInfo.DatabaseName,
        tableCount: tables.length 
      });
      
      return {
        success: true,
        serverInfo: {
          productName: serverInfo.ProductName,
          productVersion: serverInfo.ProductVersion,
          databaseName: serverInfo.DatabaseName
        },
        tables
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Provide specific error messages for common issues
      let enhancedMessage = errorMessage;
      if (errorMessage.includes('getaddrinfo ENOTFOUND') || errorMessage.includes('connect ECONNREFUSED')) {
        enhancedMessage = `Cannot connect to SQL Server. Check that the server is running and accessible. Original error: ${errorMessage}`;
      } else if (errorMessage.includes('Login failed')) {
        enhancedMessage = `Authentication failed. Check credentials and database access. Original error: ${errorMessage}`;
      } else if (errorMessage.includes('timeout')) {
        enhancedMessage = `Connection timeout. Check network connectivity and server availability. Original error: ${errorMessage}`;
      }
      
      logger.error('Connection test failed', { 
        error: errorMessage,
        enhancedMessage,
        connectionString: connectionString.replace(/password=[^;]*/i, 'password=***')
      });
      throw new Error(`Connection test failed: ${enhancedMessage}`);
    } finally {
      if (pool) {
        await pool.close();
      }
    }
  }

  async testStoredConnection(connectionId: string): Promise<ConnectionTestResult> {
    try {
      const connectionString = await storageService.getConnectionString(connectionId);
      return await this.testConnection(connectionString);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to test stored connection', { error: errorMessage, connectionId });
      throw new Error(`Failed to test stored connection: ${errorMessage}`);
    }
  }

  private parseConnectionString(connectionString: string): mssql.config {
    try {
      const config: any = {
        trustServerCertificate: true,
        enableArithAbort: true,
        encrypt: false,
        requestTimeout: 30000,
        connectionTimeout: 30000
      };
      
      const pairs = connectionString.split(';').filter(pair => pair.trim());
      
      for (const pair of pairs) {
        const [key, value] = pair.split('=').map(s => s.trim());
        if (!key || value === undefined) continue;
        
        switch (key.toLowerCase()) {
          case 'server':
          case 'data source':
            config.server = value;
            
            if (value.includes('.database.windows.net')) {
              config.encrypt = true;
              config.trustServerCertificate = false;
            }
            
            if (value.includes('\\') && !value.includes('.database.windows.net')) {
              const [serverName, instanceName] = value.split('\\');
              config.server = serverName;
              config.options = {
                ...config.options,
                instanceName: instanceName
              };
            }
            break;
          case 'database':
          case 'initial catalog':
            config.database = value;
            break;
          case 'user id':
          case 'uid':
            config.user = value;
            break;
          case 'password':
          case 'pwd':
            config.password = value;
            break;
          case 'trusted_connection':
            if (value.toLowerCase() === 'true') {
              config.authentication = {
                type: 'ntlm'
              };
              delete config.user;
              delete config.password;
            }
            break;
          case 'trustservercertificate':
            config.trustServerCertificate = value.toLowerCase() === 'true';
            break;
          case 'encrypt':
            config.encrypt = value.toLowerCase() === 'true';
            break;
          case 'port':
            config.port = parseInt(value);
            break;
        }
      }
      
      if (!config.port && !config.options?.instanceName && !config.server.includes('.database.windows.net')) {
        config.port = 1433;
      }
      
      return config;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid connection string format: ${errorMessage}`);
    }
  }

  private async establishConnection(config: mssql.config, originalConnectionString: string): Promise<mssql.ConnectionPool> {
    const attempts = [];
    
    attempts.push(async () => {
      logger.info('Attempting connection with parsed config');
      const pool = new mssql.ConnectionPool(config);
      await pool.connect();
      return pool;
    });
    
    attempts.push(async () => {
      logger.info('Attempting connection with original connection string');
      const pool = new mssql.ConnectionPool(originalConnectionString);
      await pool.connect();
      return pool;
    });
    
    let lastError: Error | undefined;
    for (let i = 0; i < attempts.length; i++) {
      try {
        const pool = await attempts[i]();
        logger.info(`Connection successful on attempt ${i + 1}`);
        return pool;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn(`Connection attempt ${i + 1} failed: ${lastError.message}`);
      }
    }
    
    throw lastError || new Error('All connection attempts failed');
  }

  async startStoredReplication(request: StoredReplicationRequest): Promise<string> {
    try {
      const storedConfig = await storageService.getReplicationConfig(request.configId);
      const targetConnection = await storageService.getConnection(storedConfig.targetId);
      const sourceConnectionString = await storageService.getConnectionString(storedConfig.sourceConnectionId);
      const targetConnectionString = await storageService.getConnectionString(storedConfig.targetId);
      
      // Get config scripts content
      const configScripts: string[] = [];
      for (const scriptId of storedConfig.configScriptIds) {
        const script = await storageService.getScript(scriptId);
        configScripts.push(script.content);
      }
      
      if (!targetConnection.isTargetDatabase) {
        throw new Error('Target connection is not marked as a target database');
      }
      
      const replicationConfig: ReplicationConfig = {
        connectionString: sourceConnectionString,
        target: {
          targetType: 'sqlserver',
          connectionString: targetConnectionString,
          createNewDatabase: storedConfig.settings.includeSchema !== false,
          overwriteExisting: true,
          backupBefore: false
        },
        configScripts,
        settings: storedConfig.settings
      };
      
      const jobId = uuidv4();
      
      const status: ReplicationStatus = {
        jobId,
        status: 'pending',
        progress: 0,
        message: 'Stored replication job queued',
        startTime: new Date(),
        configId: request.configId,
        configName: storedConfig.name
      };
      
      this.activeJobs.set(jobId, status);
      
      // Start replication in background
      this.executeReplication(jobId, replicationConfig).then(() => {
        storageService.updateReplicationConfigLastRun(request.configId);
      }).catch(error => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Stored replication failed', { jobId, configId: request.configId, error: errorMessage });
        const currentStatus = this.activeJobs.get(jobId);
        if (currentStatus) {
          currentStatus.status = 'failed';
          currentStatus.error = errorMessage;
          currentStatus.endTime = new Date();
        }
      });
      
      logger.info('Stored replication job started', { jobId, configId: request.configId, configName: storedConfig.name });
      return jobId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to start stored replication', { error: errorMessage, configId: request.configId });
      throw new Error(`Failed to start stored replication: ${errorMessage}`);
    }
  }

  async getReplicationStatus(jobId: string): Promise<ReplicationStatus> {
    const status = this.activeJobs.get(jobId);
    if (!status) {
      throw new Error('Replication job not found');
    }
    return status;
  }

  async cancelReplication(jobId: string): Promise<void> {
    const status = this.activeJobs.get(jobId);
    if (!status) {
      throw new Error('Replication job not found');
    }
    
    if (status.status === 'running') {
      status.status = 'cancelled';
      status.message = 'Replication cancelled by user';
      status.endTime = new Date();
      logger.info('Replication cancelled', { jobId });
    }
  }

  private async executeReplication(jobId: string, config: ReplicationConfig): Promise<void> {
    const status = this.activeJobs.get(jobId)!;
    let sourcePool: mssql.ConnectionPool | undefined;
    
    try {
      status.status = 'running';
      status.message = 'Connecting to source database';
      
      sourcePool = new mssql.ConnectionPool(config.connectionString);
      await sourcePool.connect();
      
      status.progress = 10;
      status.message = 'Creating BACPAC export';
      
      const bacpacPath = await this.createBacpac(sourcePool, config, status);
      
      status.progress = 60;
      status.message = 'Setting up target database';
      
      const finalDatabaseName = await this.setupTargetDatabase(config.target);
      
      status.progress = 70;
      status.message = `Importing BACPAC to target database: ${finalDatabaseName}`;
      
      await this.importBacpac(bacpacPath, config.target, status);
      
      status.progress = 90;
      status.message = 'Executing configuration scripts';
      
      if (config.configScripts && config.configScripts.length > 0) {
        logger.info('Starting post-replication script execution', { 
          scriptCount: config.configScripts.length,
          targetDatabase: finalDatabaseName 
        });
        await this.executeConfigScripts(config.target, config.configScripts);
      }
      
      status.progress = 95;
      status.message = 'Cleaning up temporary files';
      
      await this.cleanupBacpac(bacpacPath);
      
      status.progress = 100;
      status.status = 'completed';
      status.message = 'Database replication completed successfully';
      status.endTime = new Date();
      
      logger.info('BACPAC-based replication completed', { jobId, bacpacPath });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('BACPAC replication execution failed', { jobId, error: errorMessage });
      throw error;
    } finally {
      if (sourcePool) {
        await sourcePool.close();
      }
    }
  }

  private async createBacpac(_sourcePool: mssql.ConnectionPool, config: ReplicationConfig, status: ReplicationStatus): Promise<string> {
    const { spawn } = require('child_process');
    const path = require('path');
    const fs = require('fs').promises;
    const { app } = require('electron');

    try {
      const dbNameMatch = config.connectionString.match(/(?:database|initial catalog)=([^;]+)/i);
      if (!dbNameMatch) {
        throw new Error('Could not extract database name from connection string');
      }
      
      const databaseName = dbNameMatch[1];
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const bacpacFileName = `${databaseName}_${timestamp}.bacpac`;
      
      // Use app temp directory
      const tempDir = path.join(app.getPath('temp'), 'rebaser-replication');
      const bacpacPath = path.join(tempDir, bacpacFileName);
      
      try {
        await fs.access(tempDir);
      } catch {
        await fs.mkdir(tempDir, { recursive: true });
      }

      logger.info('Starting BACPAC export', { databaseName, bacpacPath });

      const sqlpackageArgs = [
        '/Action:Export',
        `/SourceConnectionString:${config.connectionString}`,
        `/TargetFile:${bacpacPath}`,
        '/OverwriteFiles:True',
        '/Quiet:True'
      ];

      return new Promise((resolve, reject) => {
        const sqlpackage = spawn('sqlpackage', sqlpackageArgs, {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        sqlpackage.stdout.on('data', (data: any) => {
          stdout += data.toString();
          if (stdout.includes('Extracting schema')) {
            status.progress = 20;
            status.message = 'Extracting database schema';
          } else if (stdout.includes('Extracting data')) {
            status.progress = 40;
            status.message = 'Extracting database data';
          }
        });

        sqlpackage.stderr.on('data', (data: any) => {
          stderr += data.toString();
        });

        sqlpackage.on('close', (code: number) => {
          if (code === 0) {
            logger.info('BACPAC export completed successfully', { bacpacPath });
            resolve(bacpacPath);
          } else {
            logger.error('BACPAC export failed', { code, stderr, stdout });
            reject(new Error(`BACPAC export failed: ${stderr || stdout || `Exit code ${code}`}`));
          }
        });

        sqlpackage.on('error', (error: Error) => {
          logger.error('Failed to start sqlpackage process', { error: error.message });
          reject(new Error(`Failed to start sqlpackage: ${error.message}. Make sure SQL Server tools are installed.`));
        });
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('BACPAC creation failed', { error: errorMessage });
      throw new Error(`BACPAC creation failed: ${errorMessage}`);
    }
  }

  private async setupTargetDatabase(targetConfig: any): Promise<string> {
    try {
      const dbNameMatch = targetConfig.connectionString.match(/(?:database|initial catalog)=([^;]+)/i);
      if (!dbNameMatch) {
        throw new Error('Could not extract database name from connection string');
      }

      const originalDbName = dbNameMatch[1];
      let finalDbName = originalDbName;
      
      const masterConnString = targetConfig.connectionString.replace(/(?:database|initial catalog)=[^;]+/i, 'Initial Catalog=master');
      const masterPool = new mssql.ConnectionPool(masterConnString);
      await masterPool.connect();
      
      try {
        const checkDbQuery = `SELECT database_id FROM sys.databases WHERE name = @dbName`;
        const checkResult = await masterPool.request()
          .input('dbName', mssql.NVarChar, originalDbName)
          .query(checkDbQuery);

        if (checkResult.recordset.length > 0) {
          const timestamp = new Date().toISOString()
            .replace(/[-:]/g, '')
            .replace(/\..+/, '')
            .substring(0, 14);
          
          finalDbName = `${originalDbName}_${timestamp}`;
          logger.info('Database exists, creating new database with timestamp', { 
            originalDatabase: originalDbName, 
            newDatabase: finalDbName 
          });
        }

        if (finalDbName !== originalDbName || checkResult.recordset.length === 0) {
          const createDbQuery = `CREATE DATABASE [${finalDbName}]`;
          await masterPool.request().query(createDbQuery);
          logger.info('Created target database', { databaseName: finalDbName });
        }

        const updatedConnectionString = targetConfig.connectionString.replace(
          /(?:database|initial catalog)=[^;]+/i, 
          `Initial Catalog=${finalDbName}`
        );
        targetConfig.connectionString = updatedConnectionString;

      } finally {
        await masterPool.close();
      }
      
      return finalDbName;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Target database setup failed: ${errorMessage}`);
    }
  }

  private async importBacpac(bacpacPath: string, targetConfig: any, status: ReplicationStatus): Promise<void> {
    const { spawn } = require('child_process');

    return new Promise((resolve, reject) => {
      const sqlpackageArgs = [
        '/Action:Import',
        `/SourceFile:${bacpacPath}`,
        `/TargetConnectionString:${targetConfig.connectionString}`,
        '/Quiet:True'
      ];

      logger.info('Starting BACPAC import to SQL Server', { bacpacPath });

      const sqlpackage = spawn('sqlpackage', sqlpackageArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      sqlpackage.stdout.on('data', (data: any) => {
        stdout += data.toString();
        if (stdout.includes('Importing')) {
          status.progress = 80;
          status.message = 'Importing data to SQL Server';
        }
      });

      sqlpackage.stderr.on('data', (data: any) => {
        stderr += data.toString();
      });

      sqlpackage.on('close', (code: number) => {
        if (code === 0) {
          logger.info('BACPAC import completed successfully');
          resolve();
        } else {
          logger.error('BACPAC import failed', { code, stderr, stdout });
          reject(new Error(`BACPAC import failed: ${stderr || stdout || `Exit code ${code}`}`));
        }
      });

      sqlpackage.on('error', (error: Error) => {
        reject(new Error(`Failed to start sqlpackage for import: ${error.message}`));
      });
    });
  }

  private async cleanupBacpac(bacpacPath: string): Promise<void> {
    const fs = require('fs').promises;
    
    try {
      await fs.unlink(bacpacPath);
      logger.info('Cleaned up BACPAC file', { bacpacPath });
    } catch (error) {
      logger.warn('Failed to cleanup BACPAC file', { bacpacPath, error: (error as Error).message });
    }
  }

  private async executeConfigScripts(targetConfig: any, scripts: string[]): Promise<void> {
    if (!scripts || scripts.length === 0) {
      return;
    }

    const targetPool = new mssql.ConnectionPool(targetConfig.connectionString);
    await targetPool.connect();
    
    try {
      for (let i = 0; i < scripts.length; i++) {
        const script = scripts[i];
        logger.info(`Executing script ${i + 1}/${scripts.length}`, { 
          scriptPreview: script.substring(0, 100) + (script.length > 100 ? '...' : ''),
          scriptLength: script.length 
        });
        await targetPool.request().query(script);
        logger.info(`Script ${i + 1}/${scripts.length} completed successfully`);
      }
    } finally {
      await targetPool.close();
    }
  }
}

export const replicationService = new ReplicationService();