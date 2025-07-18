import * as mssql from 'mssql';
import { Database } from 'sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { CustomError } from '../middleware/errorHandler';
import { secureStorageService } from './SecureStorageService';

export interface ReplicationConfig {
  connectionString: string;
  target: {
    targetType: 'sqlserver';
    connectionString: string; // Target SQL Server connection
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

// Extended interface for stored replication configs
export interface StoredReplicationRequest {
  configId: string; // Reference to stored replication config
}

export interface ReplicationStatus {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  message: string;
  startTime: Date;
  endTime?: Date;
  error?: string;
  configId?: string; // Track which stored config was used
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
      
      // Parse and validate connection string for local connections
      const config = this.parseConnectionString(connectionString);
      
      // Try multiple connection approaches for local SQL Server
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
      
      // Provide more specific error messages for common issues
      let enhancedMessage = errorMessage;
      if (errorMessage.includes('getaddrinfo ENOTFOUND') || errorMessage.includes('connect ECONNREFUSED')) {
        enhancedMessage = `Cannot connect to SQL Server. Common solutions:
1. Ensure SQL Server is running and accepting connections
2. For on-premises: Check if TCP/IP is enabled in SQL Server Configuration Manager
3. For Azure SQL: Verify the server name includes '.database.windows.net'
4. Check firewall settings (Azure SQL firewall rules or Windows Firewall)
5. Verify network connectivity and DNS resolution
Original error: ${errorMessage}`;
      } else if (errorMessage.includes('Login failed')) {
        enhancedMessage = `Authentication failed. Solutions:
1. Verify database exists and user has access
2. For on-premises with Trusted_Connection=True: ensure Windows Authentication is enabled
3. For Azure SQL: use SQL Authentication with valid username/password
4. Check SQL Server authentication mode (Windows/Mixed for on-premises)
5. For Azure SQL: verify user is added to the database
Original error: ${errorMessage}`;
      } else if (errorMessage.includes('timeout')) {
        enhancedMessage = `Connection timeout. Solutions:
1. For on-premises: Check if SQL Server Browser service is running (for named instances)
2. Verify network connectivity and DNS resolution
3. For Azure SQL: Check Azure SQL firewall rules
4. Try increasing connection timeout
5. For on-premises: Check if port 1433 is open
Original error: ${errorMessage}`;
      } else if (errorMessage.includes('certificate')) {
        enhancedMessage = `SSL/Certificate error. Solutions:
1. For on-premises: Add TrustServerCertificate=True to connection string
2. For Azure SQL: Use Encrypt=True (required for Azure SQL)
3. For on-premises development: Use Encrypt=False
4. Verify SSL certificates are properly configured
Original error: ${errorMessage}`;
      }
      
      logger.error('Connection test failed', { 
        error: errorMessage,
        enhancedMessage,
        connectionString: connectionString.replace(/password=[^;]*/i, 'password=***')
      });
      throw new CustomError(`Connection test failed: ${enhancedMessage}`, 400);
    } finally {
      if (pool) {
        await pool.close();
      }
    }
  }

  // Test stored connection
  async testStoredConnection(connectionId: string): Promise<ConnectionTestResult> {
    try {
      const connectionString = await secureStorageService.getConnectionString(connectionId);
      return await this.testConnection(connectionString);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to test stored connection', { error: errorMessage, connectionId });
      throw new CustomError(`Failed to test stored connection: ${errorMessage}`, 400);
    }
  }

  private parseConnectionString(connectionString: string): mssql.config {
    try {
      // Handle both connection string formats
      if (connectionString.includes('=')) {
        // Parse key-value connection string
        const config: any = {
          trustServerCertificate: true,
          enableArithAbort: true,
          encrypt: false, // Default for on-premises, will be overridden for Azure
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
              
              // Auto-detect Azure SQL
              if (value.includes('.database.windows.net')) {
                config.encrypt = true; // Azure SQL requires encryption
                config.trustServerCertificate = false; // Use proper certificates for Azure
              }
              
              // Handle named instances for on-premises SQL Server
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
                // Remove user/password if using trusted connection
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
            case 'integrated security':
              if (value.toLowerCase() === 'true' || value.toLowerCase() === 'sspi') {
                config.authentication = {
                  type: 'ntlm'
                };
                delete config.user;
                delete config.password;
              }
              break;
          }
        }
        
        // Set default port for standard SQL Server (not for Azure or named instances)
        if (!config.port && !config.options?.instanceName && !config.server.includes('.database.windows.net')) {
          config.port = 1433;
        }
        
        // Additional options for local/on-premises SQL Server
        if ((config.server === 'localhost' || config.server === '.' || config.server === '(local)' || config.server === '127.0.0.1') && 
            !config.server.includes('.database.windows.net')) {
          config.options = {
            ...config.options,
            enableArithAbort: true,
            trustServerCertificate: true
          };
          
          // For trusted connections, ensure proper authentication
          if (config.authentication?.type === 'ntlm') {
            config.options.trustedConnection = true;
          }
        }
        
        logger.info('Parsed connection config', {
          server: config.server,
          database: config.database,
          port: config.port,
          instanceName: config.options?.instanceName,
          authentication: config.authentication?.type,
          encrypt: config.encrypt,
          trustServerCertificate: config.trustServerCertificate,
          isAzureSQL: config.server.includes('.database.windows.net')
        });
        
        return config;
      } else {
        // Assume it's already a valid connection string or config object
        return connectionString as any;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid connection string format: ${errorMessage}`);
    }
  }

  private async establishConnection(config: mssql.config, originalConnectionString: string): Promise<mssql.ConnectionPool> {
    const attempts = [];
    
    // Attempt 1: Use parsed config (optimized for Azure SQL and MS SQL Server)
    attempts.push(async () => {
      logger.info('Attempting connection with parsed config');
      const pool = new mssql.ConnectionPool(config);
      await pool.connect();
      return pool;
    });
    
    // Attempt 2: Try direct connection string (fallback)
    attempts.push(async () => {
      logger.info('Attempting connection with original connection string');
      const pool = new mssql.ConnectionPool(originalConnectionString);
      await pool.connect();
      return pool;
    });
    
    // Try each connection method
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

  async startReplication(config: ReplicationConfig): Promise<string> {
    const jobId = uuidv4();
    
    const status: ReplicationStatus = {
      jobId,
      status: 'pending',
      progress: 0,
      message: 'Replication job queued',
      startTime: new Date()
    };
    
    this.activeJobs.set(jobId, status);
    
    // Start replication in background
    this.executeReplication(jobId, config).catch(error => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Replication failed', { jobId, error: errorMessage });
      const currentStatus = this.activeJobs.get(jobId);
      if (currentStatus) {
        currentStatus.status = 'failed';
        currentStatus.error = errorMessage;
        currentStatus.endTime = new Date();
      }
    });
    
    logger.info('Replication job started', { jobId });
    return jobId;
  }

  // Start replication from stored configuration
  async startStoredReplication(request: StoredReplicationRequest): Promise<string> {
    try {
      // Get stored replication configuration
      const storedConfig = await secureStorageService.getReplicationConfig(request.configId);
      const target = await secureStorageService.getTarget(storedConfig.targetId);
      const connectionString = await secureStorageService.getConnectionString(storedConfig.sourceConnectionId);
      
      // Get config scripts content
      const configScripts: string[] = [];
      for (const scriptId of storedConfig.configScriptIds) {
        const script = await secureStorageService.getScript(scriptId);
        configScripts.push(script.content);
      }
      
      // Build replication config
      const targetConfig: any = {
        targetType: target.targetType,
        createNewDatabase: storedConfig.settings.includeSchema !== false
      };
      
      if (target.configuration.filePath) {
        targetConfig.filePath = target.configuration.filePath;
      }
      
      if (target.configuration.connectionId) {
        targetConfig.connectionString = await secureStorageService.getConnectionString(target.configuration.connectionId);
      }
      
      if (target.configuration.overwriteExisting !== undefined) {
        targetConfig.overwriteExisting = target.configuration.overwriteExisting;
      }
      
      if (target.configuration.backupBefore !== undefined) {
        targetConfig.backupBefore = target.configuration.backupBefore;
      }

      const replicationConfig: ReplicationConfig = {
        connectionString,
        target: targetConfig,
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
        // Update last run timestamp on success
        secureStorageService.updateReplicationConfigLastRun(request.configId);
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
      throw new CustomError(`Failed to start stored replication: ${errorMessage}`, 400);
    }
  }

  async getReplicationStatus(jobId: string): Promise<ReplicationStatus> {
    const status = this.activeJobs.get(jobId);
    if (!status) {
      throw new CustomError('Replication job not found', 404);
    }
    return status;
  }

  async cancelReplication(jobId: string): Promise<void> {
    const status = this.activeJobs.get(jobId);
    if (!status) {
      throw new CustomError('Replication job not found', 404);
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
      
      // Connect to source database
      sourcePool = new mssql.ConnectionPool(config.connectionString);
      await sourcePool.connect();
      
      status.progress = 10;
      status.message = 'Creating BACPAC export';
      
      // Create BACPAC file from source database
      const bacpacPath = await this.createBacpac(sourcePool, config, status);
      
      status.progress = 60;
      status.message = 'Setting up target database';
      
      // Setup target database (create if needed, update connection string if database name changes)
      const finalDatabaseName = await this.setupTargetDatabase(config.target);
      
      status.progress = 70;
      status.message = `Importing BACPAC to target database: ${finalDatabaseName}`;
      
      // Import BACPAC to target
      await this.importBacpac(bacpacPath, config.target, status);
      
      status.progress = 90;
      status.message = 'Executing configuration scripts';
      
      // Execute configuration scripts if any
      if (config.configScripts && config.configScripts.length > 0) {
        await this.executeConfigScripts(config.target, config.configScripts);
      }
      
      status.progress = 95;
      status.message = 'Cleaning up temporary files';
      
      // Clean up BACPAC file
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

  private async createBacpac(sourcePool: mssql.ConnectionPool, config: ReplicationConfig, status: ReplicationStatus): Promise<string> {
    const { spawn } = require('child_process');
    const path = require('path');
    const fs = require('fs').promises;

    try {
      // Extract database name from connection string (supports both Database= and Initial Catalog=)
      logger.info('Parsing connection string for database name', { 
        connectionString: config.connectionString.replace(/password=[^;]*/i, 'password=***') 
      });
      
      const dbNameMatch = config.connectionString.match(/(?:database|initial catalog)=([^;]+)/i);
      if (!dbNameMatch) {
        throw new Error('Could not extract database name from connection string. Expected "Database=" or "Initial Catalog=" parameter.');
      }
      
      const databaseName = dbNameMatch[1];
      logger.info('Extracted database name', { databaseName });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const bacpacFileName = `${databaseName}_${timestamp}.bacpac`;
      const bacpacPath = path.join(process.cwd(), 'temp', bacpacFileName);
      
      // Ensure temp directory exists
      const tempDir = path.dirname(bacpacPath);
      try {
        await fs.access(tempDir);
      } catch {
        await fs.mkdir(tempDir, { recursive: true });
      }

      logger.info('Starting BACPAC export', { databaseName, bacpacPath });

      // Build sqlpackage command for export
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
          // Update progress based on output if possible
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
      // Only SQL Server targets are supported for BACPAC replication
      if (targetConfig.targetType !== 'sqlserver') {
        throw new Error('Only SQL Server targets are supported for BACPAC replication');
      }

      const dbNameMatch = targetConfig.connectionString.match(/(?:database|initial catalog)=([^;]+)/i);
      if (!dbNameMatch) {
        throw new Error('Could not extract database name from connection string');
      }

      const originalDbName = dbNameMatch[1];
      let finalDbName = originalDbName;
      
      // Switch to master to manage databases
      const masterConnString = targetConfig.connectionString.replace(/(?:database|initial catalog)=[^;]+/i, 'Initial Catalog=master');
      const masterPool = new mssql.ConnectionPool(masterConnString);
      await masterPool.connect();
      
      try {
        // Check if original database exists and has user objects
        const checkDbQuery = `SELECT database_id FROM sys.databases WHERE name = @dbName`;
        const checkResult = await masterPool.request()
          .input('dbName', mssql.NVarChar, originalDbName)
          .query(checkDbQuery);

        if (checkResult.recordset.length > 0) {
          // Database exists, check if it has user objects
          const checkTablesQuery = `
            SELECT COUNT(*) as tableCount 
            FROM [${originalDbName}].INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE'
          `;
          
          try {
            const tablesResult = await masterPool.request().query(checkTablesQuery);
            const hasUserObjects = tablesResult.recordset[0].tableCount > 0;

            if (hasUserObjects) {
              // Create new database with timestamp suffix
              const timestamp = new Date().toISOString()
                .replace(/[-:]/g, '')
                .replace(/\..+/, '')
                .substring(0, 14); // YYYYMMDDHHMMSS
              
              finalDbName = `${originalDbName}_${timestamp}`;
              logger.info('Database exists with user objects, creating new database with timestamp', { 
                originalDatabase: originalDbName, 
                newDatabase: finalDbName 
              });
            } else {
              logger.info('Database exists but is empty, will use existing database', { databaseName: originalDbName });
            }
          } catch (error) {
            // If we can't check tables (maybe permission issues), create new database with timestamp anyway
            const timestamp = new Date().toISOString()
              .replace(/[-:]/g, '')
              .replace(/\..+/, '')
              .substring(0, 14);
            
            finalDbName = `${originalDbName}_${timestamp}`;
            logger.warn('Could not check existing database contents, creating new database with timestamp', { 
              originalDatabase: originalDbName, 
              newDatabase: finalDbName,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        } else if (targetConfig.createNewDatabase) {
          logger.info('Database does not exist, will create new database', { databaseName: originalDbName });
        }

        // Create the database if it doesn't exist (either original name or timestamped name)
        if (finalDbName !== originalDbName || checkResult.recordset.length === 0) {
          const createDbQuery = `CREATE DATABASE [${finalDbName}]`;
          await masterPool.request().query(createDbQuery);
          logger.info('Created target database', { databaseName: finalDbName });
        }

        // Update the connection string to use the final database name
        const updatedConnectionString = targetConfig.connectionString.replace(
          /(?:database|initial catalog)=[^;]+/i, 
          `Initial Catalog=${finalDbName}`
        );
        targetConfig.connectionString = updatedConnectionString;

      } finally {
        await masterPool.close();
      }
      
      logger.info('Target SQL Server database setup completed', { finalDatabaseName: finalDbName });
      return finalDbName;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Target database setup failed: ${errorMessage}`);
    }
  }

  private async importBacpac(bacpacPath: string, targetConfig: any, status: ReplicationStatus): Promise<void> {
    try {
      // Only SQL Server targets are supported
      if (targetConfig.targetType !== 'sqlserver') {
        throw new Error('Only SQL Server targets are supported for BACPAC import');
      }
      
      await this.importBacpacToSqlServer(bacpacPath, targetConfig, status);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('BACPAC import failed', { error: errorMessage, bacpacPath });
      throw new Error(`BACPAC import failed: ${errorMessage}`);
    }
  }

  private async importBacpacToSqlServer(bacpacPath: string, targetConfig: any, status: ReplicationStatus): Promise<void> {
    const { spawn } = require('child_process');

    return new Promise((resolve, reject) => {
      const sqlpackageArgs = [
        '/Action:Import',
        `/SourceFile:${bacpacPath}`,
        `/TargetConnectionString:${targetConfig.connectionString}`,
        '/Quiet:True'
      ];

      logger.info('Starting BACPAC import to SQL Server', { bacpacPath, target: 'SQL Server' });

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
          logger.info('BACPAC import to SQL Server completed successfully');
          resolve();
        } else {
          logger.error('BACPAC import to SQL Server failed', { code, stderr, stdout });
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
      // Don't fail the entire operation if cleanup fails
      logger.warn('Failed to cleanup BACPAC file', { bacpacPath, error: (error as Error).message });
    }
  }

  private async executeConfigScripts(targetConfig: any, scripts: string[]): Promise<void> {
    if (!scripts || scripts.length === 0) {
      return;
    }

    logger.info('Executing configuration scripts', { scriptCount: scripts.length });
    
    // Only SQL Server targets are supported
    if (targetConfig.targetType !== 'sqlserver') {
      throw new Error('Configuration script execution is only supported for SQL Server targets');
    }

    const targetPool = new mssql.ConnectionPool(targetConfig.connectionString);
    await targetPool.connect();
    
    try {
      for (const script of scripts) {
        logger.info('Executing configuration script', { script });
        await targetPool.request().query(script);
      }
    } finally {
      await targetPool.close();
    }
    
    logger.info('Configuration scripts executed successfully');
  }
} 