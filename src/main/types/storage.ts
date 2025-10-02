// Storage type definitions for the simplified architecture

export interface StoredConnection {
  id: string;
  name: string;
  description?: string;
  server: string; // encrypted
  username: string; // encrypted
  password: string; // encrypted
  database: string; // encrypted
  port?: number;
  serverType: 'sqlserver' | 'azure-sql';
  isTargetDatabase?: boolean;
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
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredTarget {
  id: string;
  name: string;
  description?: string;
  targetType: string;
  configuration: {
    connectionId: string;
    overwriteExisting: boolean;
    backupBefore: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredReplicationConfig {
  id: string;
  name: string;
  description?: string;
  sourceConnectionId: string;
  targetId: string; // connection ID marked as target
  configScriptIds: string[];
  settings: {
    includeData?: boolean;
    includeSchema?: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
  lastRun?: Date;
}

export interface StorageData {
  connections: StoredConnection[];
  scripts: StoredScript[];
  targets: StoredTarget[];
  replicationConfigs: StoredReplicationConfig[];
  version: string;
  lastModified: Date;
}

// Request/Response types for IPC communication
export interface ConnectionInfo {
  id: string;
  name: string;
  description?: string;
  serverType: 'sqlserver' | 'azure-sql';
  server: string;
  username: string;
  password: string;
  database: string;
  port?: number;
  isTargetDatabase?: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastUsed?: Date;
}

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
  targetType: string;
  configuration: {
    connectionId: string;
    overwriteExisting: boolean;
    backupBefore: boolean;
  };
}

export interface UpdateTargetRequest {
  name?: string;
  description?: string;
  targetType?: string;
  configuration?: {
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
    includeData?: boolean;
    includeSchema?: boolean;
  };
}