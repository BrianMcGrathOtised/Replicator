import * as sql from 'mssql';
import log from 'electron-log';

export interface SchemaObject {
  name: string;
  type: string;
  schema: string;
  definition?: string;
  properties?: Record<string, any>;
}

export interface TableSchema {
  tableName: string;
  schemaName: string;
  columns: ColumnSchema[];
  indexes: IndexSchema[];
  constraints: ConstraintSchema[];
  triggers: TriggerSchema[];
}

export interface ColumnSchema {
  columnName: string;
  dataType: string;
  maxLength: number | null;
  precision: number | null;
  scale: number | null;
  isNullable: boolean;
  defaultValue: string | null;
  isIdentity: boolean;
  identitySeed: number | null;
  identityIncrement: number | null;
  collationName: string | null;
}

export interface IndexSchema {
  indexName: string;
  indexType: string;
  isUnique: boolean;
  isPrimaryKey: boolean;
  columns: string[];
  includedColumns: string[];
  filterDefinition: string | null;
}

export interface ConstraintSchema {
  constraintName: string;
  constraintType: string;
  definition: string;
  columns: string[];
  referencedTable: string | null;
  referencedColumns: string[] | null;
}

export interface TriggerSchema {
  triggerName: string;
  triggerType: string;
  definition: string;
  isEnabled: boolean;
}

export interface SchemaDifference {
  type: 'Table Missing' | 'Column Missing' | 'Column Type' | 'Index Missing' | 'Constraint Missing' | 'Trigger Missing' | 'Table Extra' | 'Column Extra' | 'Index Extra' | 'Constraint Extra' | 'Trigger Extra';
  objectName: string;
  difference: string;
  sourceValue: string;
  targetValue: string;
  severity: 'High' | 'Medium' | 'Low';
}

export interface TableRowCount {
  schemaName: string;
  tableName: string;
  rowCount: number;
}

export interface DataDifference {
  tableName: string;
  schemaName: string;
  differenceType: 'Row Count Mismatch' | 'Table Missing in Source' | 'Table Missing in Target' | 'Empty Table' | 'Large Difference';
  sourceRowCount: number;
  targetRowCount: number;
  difference: number;
  percentageDifference: number;
  description: string;
  severity: 'High' | 'Medium' | 'Low';
}

export interface DataComparisonResult {
  differences: DataDifference[];
  sourceTableCount: number;
  targetTableCount: number;
  totalRowCountSource: number;
  totalRowCountTarget: number;
  tablesCompared: number;
  totalDifferences: number;
}

export interface SchemaComparisonResult {
  differences: SchemaDifference[];
  sourceTableCount: number;
  targetTableCount: number;
  totalDifferences: number;
  schemaDifferences: number;
}

export interface CompleteComparisonResult {
  schemaComparison?: SchemaComparisonResult;
  dataComparison?: DataComparisonResult;
  totalDifferences: number;
  schemaDifferences: number;
  dataDifferences: number;
}

class SchemaComparisonService {
  
  /**
   * Test database connection
   */
  async testConnection(connectionString: string): Promise<boolean> {
    let pool: sql.ConnectionPool | null = null;
    
    try {
      log.info('Testing database connection');
      const safeConnectionString = connectionString.replace(/Password=[^;]+/i, 'Password=***');
      log.info(`Testing connection: ${safeConnectionString}`);
      
      pool = await sql.connect(connectionString);
      
      // Simple test query
      const result = await pool.request().query('SELECT 1 as test');
      const success = result.recordset.length > 0;
      
      log.info(`Connection test ${success ? 'successful' : 'failed'}`);
      return success;
      
    } catch (error) {
      log.error('Connection test failed:', error);
      return false;
    } finally {
      if (pool) {
        await pool.close();
      }
    }
  }
  
  // SQL queries for extracting schema information
  private readonly ROW_COUNT_QUERY = `
    SELECT 
      s.name as schemaName,
      t.name as tableName,
      CAST(SUM(p.rows) AS BIGINT) as tableRowCount
    FROM sys.tables t
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.partitions p ON t.object_id = p.object_id
    WHERE p.index_id IN (0, 1)
      AND t.type = 'U'
    GROUP BY s.name, t.name
    ORDER BY s.name, t.name
  `;

  private readonly ROW_COUNT_QUERY_FALLBACK = `
    SELECT 
      SCHEMA_NAME(t.schema_id) as schemaName,
      t.name as tableName,
      CAST(SUM(CASE WHEN i.index_id < 2 THEN p.rows ELSE 0 END) AS BIGINT) as tableRowCount
    FROM sys.tables t
    INNER JOIN sys.partitions p ON t.object_id = p.object_id
    INNER JOIN sys.indexes i ON p.object_id = i.object_id AND p.index_id = i.index_id
    WHERE t.type = 'U'
    GROUP BY t.schema_id, t.name
    ORDER BY SCHEMA_NAME(t.schema_id), t.name
  `;

  private readonly ROW_COUNT_QUERY_SIMPLE = `
    SELECT 
      TABLE_SCHEMA as schemaName,
      TABLE_NAME as tableName,
      0 as tableRowCount
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_SCHEMA, TABLE_NAME
  `;

  private readonly TABLES_QUERY = `
    SELECT 
      t.TABLE_SCHEMA as schemaName,
      t.TABLE_NAME as tableName,
      t.TABLE_TYPE as tableType
    FROM INFORMATION_SCHEMA.TABLES t
    WHERE t.TABLE_TYPE = 'BASE TABLE'
    ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME
  `;

  private readonly COLUMNS_QUERY = `
    SELECT 
      c.TABLE_SCHEMA as schemaName,
      c.TABLE_NAME as tableName,
      c.COLUMN_NAME as columnName,
      c.DATA_TYPE as dataType,
      c.CHARACTER_MAXIMUM_LENGTH as maxLength,
      c.NUMERIC_PRECISION as precision,
      c.NUMERIC_SCALE as scale,
      c.IS_NULLABLE as isNullable,
      c.COLUMN_DEFAULT as defaultValue,
      c.COLLATION_NAME as collationName,
      COLUMNPROPERTY(OBJECT_ID(c.TABLE_SCHEMA + '.' + c.TABLE_NAME), c.COLUMN_NAME, 'IsIdentity') as isIdentity,
      IDENT_SEED(c.TABLE_SCHEMA + '.' + c.TABLE_NAME) as identitySeed,
      IDENT_INCR(c.TABLE_SCHEMA + '.' + c.TABLE_NAME) as identityIncrement
    FROM INFORMATION_SCHEMA.COLUMNS c
    INNER JOIN INFORMATION_SCHEMA.TABLES t ON c.TABLE_NAME = t.TABLE_NAME AND c.TABLE_SCHEMA = t.TABLE_SCHEMA
    WHERE t.TABLE_TYPE = 'BASE TABLE'
    ORDER BY c.TABLE_SCHEMA, c.TABLE_NAME, c.ORDINAL_POSITION
  `;

  private readonly INDEXES_QUERY = `
    SELECT 
      s.name as schemaName,
      t.name as tableName,
      i.name as indexName,
      i.type_desc as indexType,
      i.is_unique as isUnique,
      i.is_primary_key as isPrimaryKey,
      i.filter_definition as filterDefinition,
      STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) as columns,
      STRING_AGG(CASE WHEN ic.is_included_column = 1 THEN c.name END, ', ') as includedColumns
    FROM sys.indexes i
    INNER JOIN sys.tables t ON i.object_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
    INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
    WHERE i.type > 0 -- Exclude heaps
    GROUP BY s.name, t.name, i.name, i.type_desc, i.is_unique, i.is_primary_key, i.filter_definition
    ORDER BY s.name, t.name, i.name
  `;

  private readonly CONSTRAINTS_QUERY = `
    SELECT 
      s.name as schemaName,
      t.name as tableName,
      con.name as constraintName,
      con.type_desc as constraintType,
      con.definition,
      STRING_AGG(c.name, ', ') as columns,
      rt.name as referencedTable,
      STRING_AGG(rc.name, ', ') as referencedColumns
    FROM sys.check_constraints con
    INNER JOIN sys.tables t ON con.parent_object_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    LEFT JOIN sys.columns c ON con.parent_object_id = c.object_id
    LEFT JOIN sys.foreign_keys fk ON con.object_id = fk.object_id
    LEFT JOIN sys.tables rt ON fk.referenced_object_id = rt.object_id
    LEFT JOIN sys.columns rc ON fk.referenced_object_id = rc.object_id
    GROUP BY s.name, t.name, con.name, con.type_desc, con.definition, rt.name
    
    UNION ALL
    
    SELECT 
      s.name as schemaName,
      t.name as tableName,
      fk.name as constraintName,
      'FOREIGN_KEY' as constraintType,
      NULL as definition,
      STRING_AGG(c.name, ', ') as columns,
      rt.name as referencedTable,
      STRING_AGG(rc.name, ', ') as referencedColumns
    FROM sys.foreign_keys fk
    INNER JOIN sys.tables t ON fk.parent_object_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
    INNER JOIN sys.columns c ON fkc.parent_object_id = c.object_id AND fkc.parent_column_id = c.column_id
    INNER JOIN sys.tables rt ON fk.referenced_object_id = rt.object_id
    INNER JOIN sys.columns rc ON fkc.referenced_object_id = rc.object_id AND fkc.referenced_column_id = rc.column_id
    GROUP BY s.name, t.name, fk.name, rt.name
    ORDER BY schemaName, tableName, constraintName
  `;

  private readonly TRIGGERS_QUERY = `
    SELECT 
      s.name as schemaName,
      t.name as tableName,
      tr.name as triggerName,
      tr.type_desc as triggerType,
      m.definition,
      tr.is_disabled as isDisabled
    FROM sys.triggers tr
    INNER JOIN sys.tables t ON tr.parent_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.sql_modules m ON tr.object_id = m.object_id
    ORDER BY s.name, t.name, tr.name
  `;

  /**
   * Extract table row counts from a database
   */
  async extractTableRowCounts(connectionString: string): Promise<TableRowCount[]> {
    let pool: sql.ConnectionPool | null = null;
    
    try {
      log.info('Connecting to database for row count extraction');
      const safeConnectionString = connectionString.replace(/Password=[^;]+/i, 'Password=***');
      log.info(`Connection string: ${safeConnectionString}`);
      
      pool = await sql.connect(connectionString);
      log.info('Successfully connected to database');
      
      // Get table row counts - try queries in order of preference
      let rowCountResult;
      let queryUsed = 'primary';
      
      try {
        log.info('Attempting primary row count query...');
        rowCountResult = await pool.request().query(this.ROW_COUNT_QUERY);
      } catch (primaryError) {
        log.warn('Primary row count query failed, trying fallback query...', primaryError);
        try {
          rowCountResult = await pool.request().query(this.ROW_COUNT_QUERY_FALLBACK);
          queryUsed = 'fallback';
        } catch (fallbackError) {
          log.warn('Fallback row count query failed, trying simple query...', fallbackError);
          try {
            rowCountResult = await pool.request().query(this.ROW_COUNT_QUERY_SIMPLE);
            queryUsed = 'simple';
            log.warn('Using simple query - row counts will be 0 (table structure only)');
          } catch (simpleError) {
            log.error('All row count queries failed', { primaryError, fallbackError, simpleError });
            throw new Error(`Failed to execute any row count query: ${simpleError instanceof Error ? simpleError.message : String(simpleError)}`);
          }
        }
      }
      
      log.info(`Row count query successful using ${queryUsed} method`);
      
      const rowCounts: TableRowCount[] = rowCountResult.recordset.map((row: any) => ({
        schemaName: row.schemaName,
        tableName: row.tableName,
        rowCount: parseInt(row.tableRowCount) || 0
      }));
      
      log.info(`Extracted row counts for ${rowCounts.length} tables`);
      return rowCounts;
      
    } catch (error) {
      log.error('Failed to extract table row counts:', error);
      throw new Error(`Failed to extract table row counts: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (pool) {
        await pool.close();
      }
    }
  }

  /**
   * Extract complete schema information from a database
   */
  async extractDatabaseSchema(connectionString: string): Promise<TableSchema[]> {
    let pool: sql.ConnectionPool | null = null;
    
    try {
      log.info('Connecting to database for schema extraction');
      // Log connection attempt without exposing credentials
      const safeConnectionString = connectionString.replace(/Password=[^;]+/i, 'Password=***');
      log.info(`Connection string: ${safeConnectionString}`);
      
      pool = await sql.connect(connectionString);
      log.info('Successfully connected to database');
      
      // Get all tables
      const tablesResult = await pool.request().query(this.TABLES_QUERY);
      const tables = tablesResult.recordset;
      
      // Get all columns
      const columnsResult = await pool.request().query(this.COLUMNS_QUERY);
      const columns = columnsResult.recordset;
      
      // Get all indexes
      const indexesResult = await pool.request().query(this.INDEXES_QUERY);
      const indexes = indexesResult.recordset;
      
      // Get all constraints
      const constraintsResult = await pool.request().query(this.CONSTRAINTS_QUERY);
      const constraints = constraintsResult.recordset;
      
      // Get all triggers
      const triggersResult = await pool.request().query(this.TRIGGERS_QUERY);
      const triggers = triggersResult.recordset;
      
      // Build table schemas
      const tableSchemas: TableSchema[] = tables.map(table => {
        const tableColumns = columns.filter(c => 
          c.schemaName === table.schemaName && c.tableName === table.tableName
        ).map(c => ({
          columnName: c.columnName,
          dataType: c.dataType,
          maxLength: c.maxLength,
          precision: c.precision,
          scale: c.scale,
          isNullable: c.isNullable === 'YES',
          defaultValue: c.defaultValue,
          isIdentity: c.isIdentity === 1,
          identitySeed: c.identitySeed,
          identityIncrement: c.identityIncrement,
          collationName: c.collationName
        }));
        
        const tableIndexes = indexes.filter(i => 
          i.schemaName === table.schemaName && i.tableName === table.tableName
        ).map(i => ({
          indexName: i.indexName,
          indexType: i.indexType,
          isUnique: i.isUnique,
          isPrimaryKey: i.isPrimaryKey,
          columns: i.columns ? i.columns.split(', ') : [],
          includedColumns: i.includedColumns ? i.includedColumns.split(', ').filter(Boolean) : [],
          filterDefinition: i.filterDefinition
        }));
        
        const tableConstraints = constraints.filter(c => 
          c.schemaName === table.schemaName && c.tableName === table.tableName
        ).map(c => ({
          constraintName: c.constraintName,
          constraintType: c.constraintType,
          definition: c.definition || '',
          columns: c.columns ? c.columns.split(', ') : [],
          referencedTable: c.referencedTable,
          referencedColumns: c.referencedColumns ? c.referencedColumns.split(', ') : null
        }));
        
        const tableTriggers = triggers.filter(t => 
          t.schemaName === table.schemaName && t.tableName === table.tableName
        ).map(t => ({
          triggerName: t.triggerName,
          triggerType: t.triggerType,
          definition: t.definition,
          isEnabled: !t.isDisabled
        }));
        
        return {
          tableName: table.tableName,
          schemaName: table.schemaName,
          columns: tableColumns,
          indexes: tableIndexes,
          constraints: tableConstraints,
          triggers: tableTriggers
        };
      });
      
      log.info(`Extracted schema for ${tableSchemas.length} tables`);
      return tableSchemas;
      
    } catch (error) {
      log.error('Error extracting database schema:', error);
      throw error;
    } finally {
      if (pool) {
        await pool.close();
      }
    }
  }

  /**
   * Compare schemas between two databases
   */
  async compareSchemas(sourceConnectionString: string, targetConnectionString: string): Promise<SchemaComparisonResult> {
    try {
      log.info('Starting schema comparison');
      
      // Test connections first
      log.info('Testing source database connection...');
      const sourceConnected = await this.testConnection(sourceConnectionString);
      if (!sourceConnected) {
        throw new Error('Failed to connect to source database');
      }
      
      log.info('Testing target database connection...');
      const targetConnected = await this.testConnection(targetConnectionString);
      if (!targetConnected) {
        throw new Error('Failed to connect to target database');
      }
      
      // Extract schemas from both databases
      log.info('Extracting source database schema...');
      const sourceSchema = await this.extractDatabaseSchema(sourceConnectionString);
      log.info(`Source schema extracted: ${sourceSchema.length} tables`);
      
      log.info('Extracting target database schema...');
      const targetSchema = await this.extractDatabaseSchema(targetConnectionString);
      log.info(`Target schema extracted: ${targetSchema.length} tables`);
      
      const differences: SchemaDifference[] = [];
      
      // Compare tables
      this.compareTables(sourceSchema, targetSchema, differences);
      
      // Compare columns for matching tables
      this.compareColumns(sourceSchema, targetSchema, differences);
      
      // Compare indexes for matching tables
      this.compareIndexes(sourceSchema, targetSchema, differences);
      
      // Compare constraints for matching tables
      this.compareConstraints(sourceSchema, targetSchema, differences);
      
      // Compare triggers for matching tables
      this.compareTriggers(sourceSchema, targetSchema, differences);
      
      const result: SchemaComparisonResult = {
        differences,
        sourceTableCount: sourceSchema.length,
        targetTableCount: targetSchema.length,
        totalDifferences: differences.length,
        schemaDifferences: differences.length
      };
      
      log.info(`Schema comparison completed. Found ${differences.length} differences`);
      return result;
      
    } catch (error) {
      log.error('Error comparing schemas:', error);
      throw error;
    }
  }

  private compareTables(sourceSchema: TableSchema[], targetSchema: TableSchema[], differences: SchemaDifference[]) {
    // Find missing tables in target
    sourceSchema.forEach(sourceTable => {
      const targetTable = targetSchema.find(t => 
        t.tableName === sourceTable.tableName && t.schemaName === sourceTable.schemaName
      );
      
      if (!targetTable) {
        differences.push({
          type: 'Table Missing',
          objectName: `${sourceTable.schemaName}.${sourceTable.tableName}`,
          difference: 'Table exists in source but not in target',
          sourceValue: 'EXISTS',
          targetValue: 'MISSING',
          severity: 'High'
        });
      }
    });
    
    // Find extra tables in target
    targetSchema.forEach(targetTable => {
      const sourceTable = sourceSchema.find(t => 
        t.tableName === targetTable.tableName && t.schemaName === targetTable.schemaName
      );
      
      if (!sourceTable) {
        differences.push({
          type: 'Table Extra',
          objectName: `${targetTable.schemaName}.${targetTable.tableName}`,
          difference: 'Table exists in target but not in source',
          sourceValue: 'MISSING',
          targetValue: 'EXISTS',
          severity: 'Medium'
        });
      }
    });
  }

  private compareColumns(sourceSchema: TableSchema[], targetSchema: TableSchema[], differences: SchemaDifference[]) {
    sourceSchema.forEach(sourceTable => {
      const targetTable = targetSchema.find(t => 
        t.tableName === sourceTable.tableName && t.schemaName === sourceTable.schemaName
      );
      
      if (!targetTable) return; // Table doesn't exist, already handled
      
      // Compare columns
      sourceTable.columns.forEach(sourceColumn => {
        const targetColumn = targetTable.columns.find(c => c.columnName === sourceColumn.columnName);
        
        if (!targetColumn) {
          differences.push({
            type: 'Column Missing',
            objectName: `${sourceTable.schemaName}.${sourceTable.tableName}.${sourceColumn.columnName}`,
            difference: 'Column exists in source but not in target',
            sourceValue: `${sourceColumn.dataType}${sourceColumn.maxLength ? `(${sourceColumn.maxLength})` : ''}`,
            targetValue: 'MISSING',
            severity: 'High'
          });
        } else {
          // Compare column properties
          if (sourceColumn.dataType !== targetColumn.dataType || 
              sourceColumn.maxLength !== targetColumn.maxLength ||
              sourceColumn.precision !== targetColumn.precision ||
              sourceColumn.scale !== targetColumn.scale) {
            
            const sourceType = this.formatColumnType(sourceColumn);
            const targetType = this.formatColumnType(targetColumn);
            
            differences.push({
              type: 'Column Type',
              objectName: `${sourceTable.schemaName}.${sourceTable.tableName}.${sourceColumn.columnName}`,
              difference: 'Column data type differs',
              sourceValue: sourceType,
              targetValue: targetType,
              severity: 'High'
            });
          }
          
          if (sourceColumn.isNullable !== targetColumn.isNullable) {
            differences.push({
              type: 'Column Type',
              objectName: `${sourceTable.schemaName}.${sourceTable.tableName}.${sourceColumn.columnName}`,
              difference: 'Column nullability differs',
              sourceValue: sourceColumn.isNullable ? 'NULL' : 'NOT NULL',
              targetValue: targetColumn.isNullable ? 'NULL' : 'NOT NULL',
              severity: 'Medium'
            });
          }
        }
      });
      
      // Find extra columns in target
      targetTable.columns.forEach(targetColumn => {
        const sourceColumn = sourceTable.columns.find(c => c.columnName === targetColumn.columnName);
        
        if (!sourceColumn) {
          differences.push({
            type: 'Column Extra',
            objectName: `${targetTable.schemaName}.${targetTable.tableName}.${targetColumn.columnName}`,
            difference: 'Column exists in target but not in source',
            sourceValue: 'MISSING',
            targetValue: `${targetColumn.dataType}${targetColumn.maxLength ? `(${targetColumn.maxLength})` : ''}`,
            severity: 'Medium'
          });
        }
      });
    });
  }

  private compareIndexes(sourceSchema: TableSchema[], targetSchema: TableSchema[], differences: SchemaDifference[]) {
    sourceSchema.forEach(sourceTable => {
      const targetTable = targetSchema.find(t => 
        t.tableName === sourceTable.tableName && t.schemaName === sourceTable.schemaName
      );
      
      if (!targetTable) return;
      
      sourceTable.indexes.forEach(sourceIndex => {
        const targetIndex = targetTable.indexes.find(i => i.indexName === sourceIndex.indexName);
        
        if (!targetIndex) {
          differences.push({
            type: 'Index Missing',
            objectName: `${sourceTable.schemaName}.${sourceTable.tableName}.${sourceIndex.indexName}`,
            difference: 'Index exists in source but not in target',
            sourceValue: `${sourceIndex.indexType} (${sourceIndex.columns.join(', ')})`,
            targetValue: 'MISSING',
            severity: sourceIndex.isPrimaryKey ? 'High' : 'Medium'
          });
        }
      });
    });
  }

  private compareConstraints(sourceSchema: TableSchema[], targetSchema: TableSchema[], differences: SchemaDifference[]) {
    sourceSchema.forEach(sourceTable => {
      const targetTable = targetSchema.find(t => 
        t.tableName === sourceTable.tableName && t.schemaName === sourceTable.schemaName
      );
      
      if (!targetTable) return;
      
      sourceTable.constraints.forEach(sourceConstraint => {
        const targetConstraint = targetTable.constraints.find(c => c.constraintName === sourceConstraint.constraintName);
        
        if (!targetConstraint) {
          differences.push({
            type: 'Constraint Missing',
            objectName: `${sourceTable.schemaName}.${sourceTable.tableName}.${sourceConstraint.constraintName}`,
            difference: 'Constraint exists in source but not in target',
            sourceValue: `${sourceConstraint.constraintType}: ${sourceConstraint.definition || sourceConstraint.columns.join(', ')}`,
            targetValue: 'MISSING',
            severity: 'High'
          });
        }
      });
    });
  }

  private compareTriggers(sourceSchema: TableSchema[], targetSchema: TableSchema[], differences: SchemaDifference[]) {
    sourceSchema.forEach(sourceTable => {
      const targetTable = targetSchema.find(t => 
        t.tableName === sourceTable.tableName && t.schemaName === sourceTable.schemaName
      );
      
      if (!targetTable) return;
      
      sourceTable.triggers.forEach(sourceTrigger => {
        const targetTrigger = targetTable.triggers.find(t => t.triggerName === sourceTrigger.triggerName);
        
        if (!targetTrigger) {
          differences.push({
            type: 'Trigger Missing',
            objectName: `${sourceTable.schemaName}.${sourceTable.tableName}.${sourceTrigger.triggerName}`,
            difference: 'Trigger exists in source but not in target',
            sourceValue: `${sourceTrigger.triggerType} (${sourceTrigger.isEnabled ? 'Enabled' : 'Disabled'})`,
            targetValue: 'MISSING',
            severity: 'Low'
          });
        }
      });
    });
  }

  private formatColumnType(column: ColumnSchema): string {
    let type = column.dataType;
    
    if (column.maxLength && column.maxLength > 0) {
      type += `(${column.maxLength === -1 ? 'MAX' : column.maxLength})`;
    } else if (column.precision && column.scale !== null) {
      type += `(${column.precision},${column.scale})`;
    } else if (column.precision) {
      type += `(${column.precision})`;
    }
    
    return type;
  }

  /**
   * Compare data between two databases by analyzing row counts
   */
  async compareData(sourceConnectionString: string, targetConnectionString: string): Promise<DataComparisonResult> {
    try {
      log.info('Starting data comparison (row counts)');
      
      // Test connections first
      log.info('Testing source database connection for data comparison...');
      const sourceConnected = await this.testConnection(sourceConnectionString);
      if (!sourceConnected) {
        throw new Error('Failed to connect to source database for data comparison');
      }
      
      log.info('Testing target database connection for data comparison...');
      const targetConnected = await this.testConnection(targetConnectionString);
      if (!targetConnected) {
        throw new Error('Failed to connect to target database for data comparison');
      }
      
      // Extract row counts from both databases
      log.info('Extracting source database row counts...');
      const sourceRowCounts = await this.extractTableRowCounts(sourceConnectionString);
      log.info(`Source row counts extracted: ${sourceRowCounts.length} tables`);
      
      log.info('Extracting target database row counts...');
      const targetRowCounts = await this.extractTableRowCounts(targetConnectionString);
      log.info(`Target row counts extracted: ${targetRowCounts.length} tables`);
      
      const differences: DataDifference[] = [];
      
      // Compare row counts
      this.compareRowCounts(sourceRowCounts, targetRowCounts, differences);
      
      // Calculate totals
      const totalRowCountSource = sourceRowCounts.reduce((sum, table) => sum + table.rowCount, 0);
      const totalRowCountTarget = targetRowCounts.reduce((sum, table) => sum + table.rowCount, 0);
      
      const result: DataComparisonResult = {
        differences,
        sourceTableCount: sourceRowCounts.length,
        targetTableCount: targetRowCounts.length,
        totalRowCountSource,
        totalRowCountTarget,
        tablesCompared: Math.max(sourceRowCounts.length, targetRowCounts.length),
        totalDifferences: differences.length
      };
      
      log.info(`Data comparison completed: ${differences.length} differences found`);
      return result;
      
    } catch (error) {
      log.error('Data comparison failed:', error);
      throw new Error(`Data comparison failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Compare row counts between source and target databases
   */
  private compareRowCounts(sourceRowCounts: TableRowCount[], targetRowCounts: TableRowCount[], differences: DataDifference[]) {
    // Create maps for easier lookup
    const sourceMap = new Map<string, TableRowCount>();
    const targetMap = new Map<string, TableRowCount>();
    
    sourceRowCounts.forEach(table => {
      const key = `${table.schemaName}.${table.tableName}`;
      sourceMap.set(key, table);
    });
    
    targetRowCounts.forEach(table => {
      const key = `${table.schemaName}.${table.tableName}`;
      targetMap.set(key, table);
    });
    
    // Check tables in source
    sourceRowCounts.forEach(sourceTable => {
      const key = `${sourceTable.schemaName}.${sourceTable.tableName}`;
      const targetTable = targetMap.get(key);
      
      if (!targetTable) {
        // Table missing in target
        differences.push({
          tableName: sourceTable.tableName,
          schemaName: sourceTable.schemaName,
          differenceType: 'Table Missing in Target',
          sourceRowCount: sourceTable.rowCount,
          targetRowCount: 0,
          difference: sourceTable.rowCount,
          percentageDifference: 100,
          description: `Table exists in source with ${sourceTable.rowCount.toLocaleString()} rows but is missing in target`,
          severity: sourceTable.rowCount > 0 ? 'High' : 'Medium'
        });
      } else {
        // Compare row counts
        const difference = Math.abs(sourceTable.rowCount - targetTable.rowCount);
        
        if (difference > 0) {
          const maxRows = Math.max(sourceTable.rowCount, targetTable.rowCount);
          const percentageDifference = maxRows > 0 ? (difference / maxRows) * 100 : 0;
          
          let differenceType: DataDifference['differenceType'] = 'Row Count Mismatch';
          let severity: DataDifference['severity'] = 'Low';
          
          // Determine severity and type
          if (sourceTable.rowCount === 0 || targetTable.rowCount === 0) {
            differenceType = 'Empty Table';
            severity = 'Medium';
          } else if (percentageDifference > 50) {
            differenceType = 'Large Difference';
            severity = 'High';
          } else if (percentageDifference > 10) {
            severity = 'Medium';
          }
          
          let description = `Row count difference: Source has ${sourceTable.rowCount.toLocaleString()}, Target has ${targetTable.rowCount.toLocaleString()}`;
          if (percentageDifference > 0) {
            description += ` (${percentageDifference.toFixed(1)}% difference)`;
          }
          
          differences.push({
            tableName: sourceTable.tableName,
            schemaName: sourceTable.schemaName,
            differenceType,
            sourceRowCount: sourceTable.rowCount,
            targetRowCount: targetTable.rowCount,
            difference,
            percentageDifference,
            description,
            severity
          });
        }
      }
    });
    
    // Check for tables that exist only in target
    targetRowCounts.forEach(targetTable => {
      const key = `${targetTable.schemaName}.${targetTable.tableName}`;
      if (!sourceMap.has(key)) {
        differences.push({
          tableName: targetTable.tableName,
          schemaName: targetTable.schemaName,
          differenceType: 'Table Missing in Source',
          sourceRowCount: 0,
          targetRowCount: targetTable.rowCount,
          difference: targetTable.rowCount,
          percentageDifference: 100,
          description: `Table exists in target with ${targetTable.rowCount.toLocaleString()} rows but is missing in source`,
          severity: targetTable.rowCount > 0 ? 'High' : 'Medium'
        });
      }
    });
    
    // Sort differences by severity and difference amount
    differences.sort((a, b) => {
      const severityOrder = { 'High': 3, 'Medium': 2, 'Low': 1 };
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.difference - a.difference;
    });
  }
}

export const schemaComparisonService = new SchemaComparisonService();
