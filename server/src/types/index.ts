export interface DatabaseConfig {
  type: 'sqlite' | 'sqlserver';
  connectionString?: string;
  filePath?: string;
}

export interface TableSchema {
  name: string;
  columns: ColumnInfo[];
  primaryKeys: string[];
  foreignKeys: ForeignKeyInfo[];
  indexes: IndexInfo[];
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  isNullable: boolean;
  defaultValue?: string;
  isIdentity?: boolean;
  maxLength?: number;
  precision?: number;
  scale?: number;
}

export interface ForeignKeyInfo {
  name: string;
  columnName: string;
  referencedTable: string;
  referencedColumn: string;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimaryKey: boolean;
}

export interface ReplicationProgress {
  totalTables: number;
  completedTables: number;
  currentTable?: string;
  totalRows?: number;
  processedRows?: number;
  estimatedTimeRemaining?: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
} 