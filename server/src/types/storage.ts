export interface StoredConnection {
  id: string;
  name: string;
  description?: string;
  server: string; // Will be encrypted when stored
  username: string; // Will be encrypted when stored
  password: string; // Will be encrypted when stored
  database: string; // Will be encrypted when stored
  port?: number; // Optional, defaults will be used based on serverType
  serverType: 'sqlserver' | 'azure-sql';
  isTargetDatabase?: boolean; // Whether this connection can be used as a replication target
  createdAt: Date;
  updatedAt: Date;
  lastUsed?: Date;
}

export interface StoredScript {
  id: string;
  name: string;
  description?: string;
  content: string;
  language: 'sql' | 'javascript' | 'typescript';
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredTarget {
  id: string;
  name: string;
  description?: string;
  targetType: 'sqlite' | 'sqlserver';
  configuration: {
    // For SQLite
    filePath?: string;
    // For SQL Server
    connectionId?: string; // Reference to StoredConnection
    // Common settings
    overwriteExisting?: boolean;
    backupBefore?: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredReplicationConfig {
  id: string;
  name: string;
  description?: string;
  sourceConnectionId: string; // Reference to StoredConnection
  targetId: string; // Reference to StoredTarget
  configScriptIds: string[]; // References to StoredScript
  settings: {
    includeTables?: string[];
    excludeTables?: string[];
    includeData?: boolean;
    includeSchema?: boolean;
    batchSize?: number;
  };
  createdAt: Date;
  updatedAt: Date;
  lastRun?: Date;
}

// For API responses (decrypted data)
export interface ConnectionInfo {
  id: string;
  name: string;
  description?: string;
  serverType: 'sqlserver' | 'azure-sql';
  server: string;
  username: string;
  database: string;
  port?: number;
  isTargetDatabase?: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastUsed?: Date;
}

// For secure storage in JSON files
export interface StorageData {
  connections: StoredConnection[];
  scripts: StoredScript[];
  targets: StoredTarget[];
  replicationConfigs: StoredReplicationConfig[];
  version: string;
  lastModified: Date;
}

// API request/response types
export interface CreateConnectionRequest {
  name: string;
  description?: string;
  server: string;
  username: string;
  password: string;
  database: string;
  port?: number;
  serverType: 'sqlserver' | 'azure-sql';
  isTargetDatabase?: boolean;
}

export interface UpdateConnectionRequest {
  name?: string;
  description?: string;
  server?: string;
  username?: string;
  password?: string;
  database?: string;
  port?: number;
  serverType?: 'sqlserver' | 'azure-sql';
  isTargetDatabase?: boolean;
}

export interface CreateScriptRequest {
  name: string;
  description?: string;
  content: string;
  language: 'sql' | 'javascript' | 'typescript';
  tags?: string[];
}

export interface UpdateScriptRequest {
  name?: string;
  description?: string;
  content?: string;
  language?: 'sql' | 'javascript' | 'typescript';
  tags?: string[];
}

export interface CreateTargetRequest {
  name: string;
  description?: string;
  targetType: 'sqlite' | 'sqlserver';
  configuration: {
    filePath?: string;
    connectionId?: string;
    overwriteExisting?: boolean;
    backupBefore?: boolean;
  };
}

export interface UpdateTargetRequest {
  name?: string;
  description?: string;
  targetType?: 'sqlite' | 'sqlserver';
  configuration?: {
    filePath?: string;
    connectionId?: string;
    overwriteExisting?: boolean;
    backupBefore?: boolean;
  };
}

export interface CreateReplicationConfigRequest {
  name: string;
  description?: string;
  sourceConnectionId: string;
  targetId: string;
  configScriptIds: string[];
  settings: {
    includeTables?: string[];
    excludeTables?: string[];
    includeData?: boolean;
    includeSchema?: boolean;
    batchSize?: number;
  };
} 