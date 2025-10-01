// Shared interfaces for components

export interface AppState {
  isReplicating: boolean;
  currentJobId: string | null;
  configurations: StoredConfiguration[];
  selectedConfigId: string | null;
  connections: SavedConnection[];
  sqlScripts: SavedSqlScript[];
  activeView: string;
}

export interface StoredConfiguration {
  id: string;
  name: string;
  sourceConnectionId: string;
  targetId: string; // Changed from targetId to match server
  createTargetDatabase: boolean;
  scriptIds: string[];
  createdAt: string;
  updatedAt: string;
  lastRun?: string;
}

export interface SavedConnection {
  id: string;
  name: string;
  connectionString: string;
  description: string;
  isAzure: boolean;
  isTargetDatabase: boolean;
  databaseName: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavedSqlScript {
  id: string;
  name: string;
  content: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComparisonResult {
  schemaDifferences: SchemaDifference[];
  dataDifferences: DataDifference[];
  summary: ComparisonSummary;
}

export interface SchemaDifference {
  type: string;
  objectName: string;
  difference: string;
  sourceValue: string;
  targetValue: string;
}

export interface DataDifference {
  table: string;
  differenceType: string;
  sourceRows: number;
  targetRows: number;
  difference: number;
  description: string;
}

export interface ComparisonSummary {
  totalDifferences: number;
  schemaDifferences: number;
  dataDifferences: number;
  comparedAt: string;
  sourceDatabase: string;
  targetDatabase: string;
}

// Event types for component communication
export interface ComponentEvent {
  type: string;
  data?: any;
}

export type EventHandler = (event: ComponentEvent) => void;
