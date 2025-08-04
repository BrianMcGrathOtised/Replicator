# Configuration Import/Export System

This document explains how to use the configuration import/export functionality in the Local Data Replicator application.

## Overview

The configuration system allows you to:
- **Export** your current connections, scripts, and replication configurations to a JSON file
- **Import** configurations from a JSON file to quickly set up the application
- **Share** configuration files with team members for consistent setups
- **Backup** your configuration for disaster recovery

## Export Configuration

### From the Application UI
1. Go to **Settings** → **Export Configuration**
2. Choose what to export:
   - ✅ **Connections**: Database connection settings
   - ✅ **Scripts**: SQL and JavaScript configuration scripts
   - ✅ **Replication Configs**: Predefined replication setups
3. Select specific items or export all
4. Choose a save location for the `.json` file
5. Click **Export**

### Export Options
- **Include Connections**: Export database connection configurations
- **Include Scripts**: Export SQL and JavaScript scripts
- **Include Configs**: Export replication configuration templates
- **Selected Items Only**: Export only checked items instead of all items

## Import Configuration

### From the Application UI
1. Go to **Settings** → **Import Configuration**
2. Select a configuration JSON file
3. Choose import mode:
   - **Merge**: Combine with existing configurations (default)
   - **Replace**: Overwrite existing items with same names
   - **Skip Duplicates**: Keep existing items, only add new ones
4. Review the preview of items to be imported
5. Click **Import**

### Import Modes
- **Merge Mode**: Updates existing items with same names, adds new items
- **Replace Mode**: Completely replaces existing items with imported versions
- **Skip Duplicates**: Only imports items that don't already exist

## Configuration File Format

Configuration files are JSON formatted with the following structure:

```json
{
  "connections": [
    {
      "id": "unique-id",
      "name": "Connection Name",
      "description": "Optional description",
      "server": "encrypted_server_string",
      "username": "encrypted_username",
      "password": "encrypted_password",
      "database": "encrypted_database_name",
      "port": 1433,
      "serverType": "sqlserver" | "azure-sql",
      "isTargetDatabase": false,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "scripts": [
    {
      "id": "unique-id",
      "name": "Script Name",
      "description": "Optional description",
      "content": "SQL or JavaScript content",
      "language": "sql" | "javascript" | "typescript",
      "tags": ["tag1", "tag2"],
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "replicationConfigs": [
    {
      "id": "unique-id",
      "name": "Config Name",
      "description": "Optional description",
      "sourceConnectionId": "source-connection-id",
      "targetId": "target-connection-id",
      "configScriptIds": ["script-id-1", "script-id-2"],
      "settings": {
        "includeData": true,
        "includeSchema": true
      },
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "metadata": {
    "exportedAt": "2024-01-01T00:00:00.000Z",
    "version": "2.0.0",
    "itemCounts": {
      "connections": 3,
      "scripts": 2,
      "configs": 1
    }
  }
}
```

## Security Considerations

### Encrypted Data
- **Connection strings** are encrypted in exported files
- **Passwords** are encrypted using AES-256 encryption
- **Server names** and **database names** are also encrypted

### Sharing Configuration Files
- Configuration files can be safely shared as sensitive data is encrypted
- Recipients will need the same encryption key (built into the application)
- Consider additional security measures for highly sensitive environments

## Use Cases

### 1. Team Setup
**Scenario**: Onboard new team members with standardized database connections

**Steps**:
1. Senior developer exports a configuration with company database connections
2. New team member imports the configuration file
3. All connections and scripts are automatically set up

### 2. Environment Migration
**Scenario**: Move from development to staging environment setup

**Steps**:
1. Export current development configuration
2. Edit the JSON file to update server names/databases for staging
3. Import the modified configuration for staging setup

### 3. Backup and Recovery
**Scenario**: Backup configuration before major changes

**Steps**:
1. Export full configuration as backup
2. Make experimental changes to application
3. If needed, import backup configuration to restore previous state

### 4. Multi-Environment Management
**Scenario**: Maintain separate configurations for different clients/projects

**Steps**:
1. Create separate configuration files for each client
2. Import the appropriate configuration when switching projects
3. Use "Replace" mode to completely switch contexts

## Best Practices

### File Naming
- Use descriptive names: `client-abc-dev-config.json`
- Include version/date: `company-config-v2.1-2024-01.json`
- Specify environment: `staging-environment-config.json`

### Configuration Management
- **Version control**: Store configuration files in version control
- **Documentation**: Include README files explaining each configuration
- **Testing**: Test imported configurations before using in production
- **Regular exports**: Create regular backups of working configurations

### Team Collaboration
- **Standard configs**: Maintain team-wide standard configuration files
- **Change tracking**: Document changes when updating shared configurations
- **Access control**: Limit who can create/modify shared configuration files

## API Reference

### Export Configuration
```javascript
// Export all configurations
const result = await window.electronAPI.config.export();

// Export specific items
const result = await window.electronAPI.config.export({
  includeConnections: true,
  includeScripts: false,
  includeConfigs: true,
  selectedConnectionIds: ['conn-1', 'conn-2']
});
```

### Import Configuration
```javascript
// Import with default merge mode
const result = await window.electronAPI.config.import(configData);

// Import with specific options
const result = await window.electronAPI.config.import(configData, {
  mergeMode: 'replace',
  generateNewIds: true
});
```

### File Operations
```javascript
// Save configuration to file
await window.electronAPI.config.saveToFile(filePath, configData);

// Load configuration from file
const result = await window.electronAPI.config.loadFromFile(filePath);

// File dialogs
const filePath = await window.electronAPI.selectConfigFile();
const savePath = await window.electronAPI.saveConfigFile('my-config.json');
```

## Troubleshooting

### Import Errors
- **Invalid JSON**: Ensure the file is valid JSON format
- **Missing fields**: Check that required fields are present
- **Version mismatch**: Ensure configuration is from compatible version

### Export Issues
- **Permission denied**: Check write permissions to target directory
- **Disk space**: Ensure sufficient disk space for export file
- **Large configs**: Large configurations may take time to export

### Configuration Conflicts
- **Duplicate names**: Use different merge modes to handle duplicates
- **Missing references**: Ensure referenced connections/scripts exist
- **ID conflicts**: Enable "Generate New IDs" option if needed

For additional support, contact your IT team or refer to the main application documentation.