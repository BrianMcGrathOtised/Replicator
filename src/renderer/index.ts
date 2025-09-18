import './styles.css';

// Type declarations for window.electronAPI - matches preload interface
declare global {
  interface Window {
    electronAPI: {
      selectFile: () => Promise<string | null>;
      selectDirectory: () => Promise<string | null>;
      selectConfigFile: () => Promise<string | null>;
      saveConfigFile: (defaultName?: string) => Promise<string | null>;
      getAppInfo: () => Promise<{
        name: string;
        version: string;
        electronVersion: string;
        nodeVersion: string;
      }>;
      connections: {
        getAll: () => Promise<any>;
        get: (id: string) => Promise<any>;
        create: (request: any) => Promise<any>;
        update: (id: string, request: any) => Promise<any>;
        delete: (id: string) => Promise<any>;
      };
      scripts: {
        getAll: () => Promise<any>;
        get: (id: string) => Promise<any>;
        create: (request: any) => Promise<any>;
        update: (id: string, request: any) => Promise<any>;
        delete: (id: string) => Promise<any>;
      };
      configs: {
        getAll: () => Promise<any>;
        get: (id: string) => Promise<any>;
        create: (request: any) => Promise<any>;
        delete: (id: string) => Promise<any>;
      };
      replication: {
        testConnection: (connectionString: string) => Promise<any>;
        testStoredConnection: (connectionId: string) => Promise<any>;
        startStored: (request: { configId: string }) => Promise<any>;
        getStatus: (jobId: string) => Promise<any>;
        cancel: (jobId: string) => Promise<any>;
      };
      config: {
        export: (options?: any) => Promise<any>;
        import: (configData: any, options?: any) => Promise<any>;
        saveToFile: (filePath: string, configData: any) => Promise<any>;
        loadFromFile: (filePath: string) => Promise<any>;
      };
    };
  }
}

// Interfaces

interface AppState {
  isReplicating: boolean;
  currentJobId: string | null;
  configurations: StoredConfiguration[];
  selectedConfigId: string | null;
  connections: SavedConnection[];
  sqlScripts: SavedSqlScript[];
  activeTab: string;
}

interface StoredConfiguration {
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

interface SavedConnection {
  id: string;
  name: string;
  connectionString: string;
  description?: string;
  isAzure: boolean;
  isTargetDatabase: boolean;
  databaseName: string;
  createdAt: string;
  updatedAt: string;
}

interface SavedSqlScript {
  id: string;
  name: string;
  content: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

class DataReplicatorUI {
  private state: AppState = {
    isReplicating: false,
    currentJobId: null,
    configurations: [],
    selectedConfigId: null,
    connections: [],
    sqlScripts: [],
    activeTab: 'connections'
  };

  private elements = {
    // Tab management
    tabButtons: document.querySelectorAll('.tab-button'),
    tabContents: document.querySelectorAll('.tab-content'),
    
    // Saved items management
    addConnectionBtn: document.getElementById('addConnectionBtn') as HTMLButtonElement,
    addScriptBtn: document.getElementById('addScriptBtn') as HTMLButtonElement,
    connectionsList: document.getElementById('connectionsList') as HTMLDivElement,
    scriptsList: document.getElementById('scriptsList') as HTMLDivElement,
    
    // Configuration management
    addConfigBtn: document.getElementById('addConfigBtn') as HTMLButtonElement,
    configsList: document.getElementById('configsList') as HTMLDivElement,
    selectedConfigSelect: document.getElementById('selectedConfigSelect') as HTMLSelectElement,
    configDetails: document.getElementById('configDetails') as HTMLDivElement,
    configSource: document.getElementById('configSource') as HTMLSpanElement,
    configTarget: document.getElementById('configTarget') as HTMLSpanElement,
    configScripts: document.getElementById('configScripts') as HTMLSpanElement,
    configLastRun: document.getElementById('configLastRun') as HTMLSpanElement,
    
    // Replication control
    startReplicationBtn: document.getElementById('startReplicationBtn') as HTMLButtonElement,
    cancelReplicationBtn: document.getElementById('cancelReplicationBtn') as HTMLButtonElement,
    progressContainer: document.getElementById('progressContainer') as HTMLDivElement,
    progressFill: document.getElementById('progressFill') as HTMLDivElement,
    progressText: document.getElementById('progressText') as HTMLDivElement,
    statusMessage: document.getElementById('statusMessage') as HTMLDivElement,
    
    // Logs
    logs: document.getElementById('logs') as HTMLDivElement,
    clearLogsBtn: document.getElementById('clearLogsBtn') as HTMLButtonElement,
    
    // Status
    appInfo: document.getElementById('appInfo') as HTMLSpanElement,
    connectionStatus: document.getElementById('connectionStatus') as HTMLSpanElement,
    loadingOverlay: document.getElementById('loadingOverlay') as HTMLDivElement,
    
    // Settings
    settingsBtn: document.getElementById('settingsBtn') as HTMLButtonElement,
    settingsModal: document.getElementById('settingsModal') as HTMLDivElement,
    settingsModalCloseBtn: document.getElementById('settingsModalCloseBtn') as HTMLButtonElement,
    settingsModalCloseBtn2: document.getElementById('settingsModalCloseBtn2') as HTMLButtonElement,
    settingsTabButtons: document.querySelectorAll('.settings-tab-button'),
    settingsTabContents: document.querySelectorAll('.settings-tab-content'),
    exportConnections: document.getElementById('exportConnections') as HTMLInputElement,
    exportScripts: document.getElementById('exportScripts') as HTMLInputElement,
    exportConfigs: document.getElementById('exportConfigs') as HTMLInputElement,
    exportBtn: document.getElementById('exportBtn') as HTMLButtonElement,
    importMode: document.getElementById('importMode') as HTMLSelectElement,
    generateNewIds: document.getElementById('generateNewIds') as HTMLInputElement,
    importBtn: document.getElementById('importBtn') as HTMLButtonElement,
    appVersion: document.getElementById('appVersion') as HTMLSpanElement,
    
    // Import Preview Modal
    importPreviewModal: document.getElementById('importPreviewModal') as HTMLDivElement,
    importPreviewModalCloseBtn: document.getElementById('importPreviewModalCloseBtn') as HTMLButtonElement,
    importPreviewCancelBtn: document.getElementById('importPreviewCancelBtn') as HTMLButtonElement,
    importPreviewConfirmBtn: document.getElementById('importPreviewConfirmBtn') as HTMLButtonElement,
    importPreviewContent: document.getElementById('importPreviewContent') as HTMLDivElement,
    
    // Connection Modal
    connectionModal: document.getElementById('connectionModal') as HTMLDivElement,
    connectionModalCloseBtn: document.getElementById('connectionModalCloseBtn') as HTMLButtonElement,
    connectionModalCancelBtn: document.getElementById('connectionModalCancelBtn') as HTMLButtonElement,
    connectionModalSaveBtn: document.getElementById('connectionModalSaveBtn') as HTMLButtonElement,
    connectionName: document.getElementById('connectionName') as HTMLInputElement,
    serverType: document.getElementById('serverType') as HTMLSelectElement,
    server: document.getElementById('server') as HTMLInputElement,
    database: document.getElementById('database') as HTMLInputElement,
    username: document.getElementById('username') as HTMLInputElement,
    password: document.getElementById('password') as HTMLInputElement,
    port: document.getElementById('port') as HTMLInputElement,
    connectionDescription: document.getElementById('connectionDescription') as HTMLTextAreaElement,
    isTargetDatabase: document.getElementById('isTargetDatabase') as HTMLInputElement,
    testConnectionBtn: document.getElementById('testConnectionBtn') as HTMLButtonElement,
    
    // SQL Script Modal
    sqlScriptModal: document.getElementById('sqlScriptModal') as HTMLDivElement,
    sqlScriptModalCloseBtn: document.getElementById('sqlScriptModalCloseBtn') as HTMLButtonElement,
    sqlScriptModalCancelBtn: document.getElementById('sqlScriptModalCancelBtn') as HTMLButtonElement,
    sqlScriptModalSaveBtn: document.getElementById('sqlScriptModalSaveBtn') as HTMLButtonElement,
    sqlScriptName: document.getElementById('sqlScriptName') as HTMLInputElement,
    sqlScriptContent: document.getElementById('sqlScriptContent') as HTMLTextAreaElement,
    sqlScriptDescription: document.getElementById('sqlScriptDescription') as HTMLTextAreaElement,
    
    // Configuration Modal
    configModal: document.getElementById('configModal') as HTMLDivElement,
    configModalCloseBtn: document.getElementById('configModalCloseBtn') as HTMLButtonElement,
    configModalCancelBtn: document.getElementById('configModalCancelBtn') as HTMLButtonElement,
    configModalSaveBtn: document.getElementById('configModalSaveBtn') as HTMLButtonElement,
    configName: document.getElementById('configName') as HTMLInputElement,
    sourceConnection: document.getElementById('sourceConnection') as HTMLSelectElement,
    targetConnection: document.getElementById('targetConnection') as HTMLSelectElement,
    // createTargetDatabase checkbox removed - always create if doesn't exist
    scriptSelection: document.getElementById('scriptSelection') as HTMLDivElement,
  };

  constructor() {
    this.init();
  }

  private clearCachedData() {
    // Clear any localStorage data that might conflict with storage.json
    // Since we now use storage.json exclusively for all data
    localStorage.removeItem('saved-configurations');
    localStorage.removeItem('saved-replication-configs');
    localStorage.removeItem('replication-configurations');
    localStorage.removeItem('configurations');
    localStorage.removeItem('saved-sql-scripts'); // Clear old script storage
    this.log('Cleared any cached data from localStorage');
  }

  private async init() {
    // Clear any potentially cached configuration data to prevent conflicts
    this.clearCachedData();
    this.validateElements();
    this.setupEventListeners();
    await this.loadAllData();
    this.updateUI();
    this.log('Data Replicator initialized');
  }

  private validateElements() {
    const missingElements: string[] = [];
    
    // Check connection modal elements
    if (!this.elements.connectionModal) missingElements.push('connectionModal');
    if (!this.elements.connectionName) missingElements.push('connectionName');
    if (!this.elements.server) missingElements.push('server');
    if (!this.elements.database) missingElements.push('database');
    if (!this.elements.username) missingElements.push('username');
    if (!this.elements.password) missingElements.push('password');
    if (!this.elements.port) missingElements.push('port');
    if (!this.elements.connectionDescription) missingElements.push('connectionDescription');
    if (!this.elements.isTargetDatabase) missingElements.push('isTargetDatabase');
    if (!this.elements.serverType) missingElements.push('serverType');
    if (!this.elements.testConnectionBtn) missingElements.push('testConnectionBtn');
    if (!this.elements.connectionModalSaveBtn) missingElements.push('connectionModalSaveBtn');
    if (!this.elements.connectionModalCancelBtn) missingElements.push('connectionModalCancelBtn');
    
    // Check config modal elements
    if (!this.elements.configModal) missingElements.push('configModal');
    if (!this.elements.configName) missingElements.push('configName');
    if (!this.elements.sourceConnection) missingElements.push('sourceConnection');
    if (!this.elements.targetConnection) missingElements.push('targetConnection');
    // createTargetDatabase checkbox removed - always create if doesn't exist
    if (!this.elements.scriptSelection) missingElements.push('scriptSelection');
    if (!this.elements.configModalSaveBtn) missingElements.push('configModalSaveBtn');
    if (!this.elements.configModalCancelBtn) missingElements.push('configModalCancelBtn');
    
    if (missingElements.length > 0) {
      this.log(`WARNING: Missing HTML elements: ${missingElements.join(', ')}`);
      console.error('Missing elements:', missingElements);
    } else {
      this.log('All required HTML elements found');
    }
  }

  private setupEventListeners() {
    // Tab management
    this.elements.tabButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const target = e.target as HTMLButtonElement;
        const tabName = target.getAttribute('data-tab');
        if (tabName) {
          this.switchTab(tabName);
        }
      });
    });
    
    // Saved items management
    this.elements.addConnectionBtn.addEventListener('click', () => this.showConnectionModal());
    this.elements.addScriptBtn.addEventListener('click', () => this.showSqlScriptModal());
    
    // Configuration management
    this.elements.addConfigBtn.addEventListener('click', () => this.showConfigModal());
    this.elements.selectedConfigSelect.addEventListener('change', () => this.onConfigSelectionChange());
    
    // Replication control
    this.elements.startReplicationBtn.addEventListener('click', () => this.startReplication());
    this.elements.cancelReplicationBtn.addEventListener('click', () => this.cancelReplication());
    
    // Logs
    this.elements.clearLogsBtn.addEventListener('click', () => this.clearLogs());
    
    // Connection Modal
    this.elements.connectionModalCloseBtn.addEventListener('click', () => this.hideConnectionModal());
    this.elements.connectionModalCancelBtn.addEventListener('click', () => this.hideConnectionModal());
    this.elements.connectionModalSaveBtn.addEventListener('click', () => this.saveConnection());
    this.elements.testConnectionBtn.addEventListener('click', () => this.testConnection());
    
    // SQL Script Modal
    this.elements.sqlScriptModalCloseBtn.addEventListener('click', () => this.hideSqlScriptModal());
    this.elements.sqlScriptModalCancelBtn.addEventListener('click', () => this.hideSqlScriptModal());
    this.elements.sqlScriptModalSaveBtn.addEventListener('click', () => this.saveSqlScript());
    
    // Configuration Modal
    this.elements.configModalCloseBtn.addEventListener('click', () => this.hideConfigModal());
    this.elements.configModalCancelBtn.addEventListener('click', () => this.hideConfigModal());
    this.elements.configModalSaveBtn.addEventListener('click', () => this.saveConfiguration());
    this.elements.sourceConnection.addEventListener('change', () => this.onSourceConnectionChange());
    this.elements.targetConnection.addEventListener('change', () => this.onTargetConnectionChange());
    
    // Settings Modal
    this.elements.settingsBtn.addEventListener('click', () => this.showSettingsModal());
    this.elements.settingsModalCloseBtn.addEventListener('click', () => this.hideSettingsModal());
    this.elements.settingsModalCloseBtn2.addEventListener('click', () => this.hideSettingsModal());
    this.elements.exportBtn.addEventListener('click', () => this.exportConfiguration());
    this.elements.importBtn.addEventListener('click', () => this.importConfiguration());
    
    // Settings tab management
    this.elements.settingsTabButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const target = e.target as HTMLButtonElement;
        const tabName = target.getAttribute('data-tab');
        if (tabName) {
          this.switchSettingsTab(tabName);
        }
      });
    });
    
    // Import Preview Modal
    this.elements.importPreviewModalCloseBtn.addEventListener('click', () => this.hideImportPreviewModal());
    this.elements.importPreviewCancelBtn.addEventListener('click', () => this.hideImportPreviewModal());
    this.elements.importPreviewConfirmBtn.addEventListener('click', () => this.confirmImport());
    
    // Prevent form submission from interfering with input
    const configForm = document.getElementById('configForm') as HTMLFormElement;
    if (configForm) {
      configForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveConfiguration();
      });
    }
    

    
    // Modal click outside to close
    [this.elements.connectionModal, this.elements.sqlScriptModal, this.elements.configModal, 
     this.elements.settingsModal, this.elements.importPreviewModal].forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.hideAllModals();
        }
      });
    });
  }

  // Tab Management
  private switchTab(tabName: string) {
    this.state.activeTab = tabName;
    
    this.elements.tabButtons.forEach(button => {
      if (button.getAttribute('data-tab') === tabName) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    });

    this.elements.tabContents.forEach(content => {
      if (content.id === `${tabName}-tab`) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });
  }

  // Connection Management
  private showConnectionModal(connection?: SavedConnection) {
    try {
      if (!this.elements.connectionModal) {
        this.showError('Connection modal not available');
        return;
      }

      this.resetConnectionModal();
      
      // Store the connection ID being edited for later use in save
      (this.elements.connectionModal as any).editingConnectionId = connection?.id || null;
      
      if (connection) {
        if (this.elements.connectionName) this.elements.connectionName.value = connection.name;
        if (this.elements.connectionDescription) this.elements.connectionDescription.value = connection.description || '';
        
        // If we have a connection string, try to parse it to populate fields
        if (connection.connectionString) {
          const parts = this.parseConnectionString(connection.connectionString);
          if (this.elements.server) this.elements.server.value = parts.server || '';
          if (this.elements.database) this.elements.database.value = parts.database || '';
          if (this.elements.username) this.elements.username.value = parts.username || '';
          if (this.elements.password) this.elements.password.value = parts.password || '';
          if (this.elements.port) this.elements.port.value = parts.port ? parts.port.toString() : '';
        }
        
        if (this.elements.serverType) this.elements.serverType.value = connection.isAzure ? 'azure-sql' : 'sqlserver';
        if (this.elements.isTargetDatabase) this.elements.isTargetDatabase.checked = connection.isTargetDatabase;
        
        const titleElement = document.getElementById('connectionModalTitle') as HTMLElement;
        if (titleElement) titleElement.textContent = 'Edit Database Connection';
      }
      
      this.elements.connectionModal.style.display = 'flex';
    } catch (error) {
      this.showError(`Error opening connection modal: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private hideConnectionModal() {
    this.elements.connectionModal.style.display = 'none';
    // Clear the editing connection ID
    (this.elements.connectionModal as any).editingConnectionId = null;
    this.resetConnectionModal();
    // Update UI when modal is closed to reflect any changes
    this.updateConnectionsList();
    this.updateConfigSelect();
  }

  private resetConnectionModal() {
    try {
      if (this.elements.connectionName) this.elements.connectionName.value = '';
      if (this.elements.server) this.elements.server.value = '';
      if (this.elements.database) this.elements.database.value = '';
      if (this.elements.username) this.elements.username.value = '';
      if (this.elements.password) this.elements.password.value = '';
      if (this.elements.port) this.elements.port.value = '';
      if (this.elements.connectionDescription) this.elements.connectionDescription.value = '';
      if (this.elements.isTargetDatabase) this.elements.isTargetDatabase.checked = false;
      if (this.elements.serverType) this.elements.serverType.value = 'sqlserver';
      
      const titleElement = document.getElementById('connectionModalTitle') as HTMLElement;
      if (titleElement) titleElement.textContent = 'Add Database Connection';
    } catch (error) {
      this.log(`Error resetting connection modal: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async saveConnection() {
    try {
      if (!this.elements.connectionName || !this.elements.server || !this.elements.database || 
          !this.elements.username || !this.elements.password || !this.elements.serverType || 
          !this.elements.isTargetDatabase) {
        this.showError('Connection form elements not available');
        return;
      }

      const name = this.elements.connectionName.value.trim();
      const server = this.elements.server.value.trim();
      const database = this.elements.database.value.trim();
      const username = this.elements.username.value.trim();
      const password = this.elements.password.value.trim();
      const port = this.elements.port?.value.trim() || '';
      const description = this.elements.connectionDescription?.value.trim() || '';
      const isTargetDatabase = this.elements.isTargetDatabase.checked;
      const serverType = this.elements.serverType.value;

      if (!name || !server || !database || !username || !password) {
        this.showError('Please fill in all required fields');
        return;
      }

      const isAzure = serverType === 'azure-sql';
      
      // Build connection string for local storage and testing
      let connectionString = `Server=${server}`;
      if (port) {
        connectionString += `,${port}`;
      }
      connectionString += `;Database=${database};User ID=${username};Password=${password}`;
      
      if (isAzure) {
        connectionString += ';Encrypt=True;TrustServerCertificate=False;';
      } else {
        connectionString += ';TrustServerCertificate=True;';
      }

      // Check if we're editing an existing connection
      const editingConnectionId = (this.elements.connectionModal as any).editingConnectionId;
      
      const connection: SavedConnection = {
        id: editingConnectionId || this.generateId(),
        name,
        connectionString,
        isAzure,
        isTargetDatabase,
        databaseName: database,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...(description && { description })
      };

      if (editingConnectionId) {
        await this.updateConnectionToStorage(editingConnectionId, connection);
      } else {
        await this.saveConnectionToStorage(connection);
      }
      this.updateConnectionsList();
      this.updateConfigModalDropdowns();
      
      // If config modal is open, auto-select the new connection
      if (this.elements.configModal.style.display === 'flex') {
        // Check if this is a target connection (local) or source connection
        if (!isAzure) {
          // Local connection - can be used as target
          this.elements.targetConnection.value = connection.id;
        }
        // Can always be used as source
        if (this.elements.sourceConnection.value === '') {
          this.elements.sourceConnection.value = connection.id;
        }
      }
      
      this.hideConnectionModal();
      this.log(`Connection "${name}" saved successfully`);
    } catch (error) {
      this.showError(`Failed to save connection: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async testConnection() {
    try {
      if (!this.elements.server || !this.elements.database || !this.elements.username || 
          !this.elements.password || !this.elements.serverType) {
        this.showError('Connection form elements not available');
        return;
      }

      const server = this.elements.server.value.trim();
      const database = this.elements.database.value.trim();
      const username = this.elements.username.value.trim();
      const password = this.elements.password.value.trim();
      const port = this.elements.port?.value.trim() || '';
      const serverType = this.elements.serverType.value;

    if (!server || !database || !username || !password) {
      this.showError('Please fill in all connection fields first');
      return;
    }

    // Build connection string
    let connectionString = `Server=${server}`;
    if (port) {
      connectionString += `,${port}`;
    }
    connectionString += `;Database=${database};User ID=${username};Password=${password}`;
    
    if (serverType === 'azure-sql') {
      connectionString += ';Encrypt=True;TrustServerCertificate=False;';
    } else {
      connectionString += ';TrustServerCertificate=True;';
    }

    const button = this.elements.testConnectionBtn;
    const originalText = button.textContent;
    
    try {
      button.textContent = 'Testing...';
      button.disabled = true;
      
      const result = await window.electronAPI.replication.testConnection(connectionString);
      
      if (!result.success) {
        throw new Error(result.error);
      }
      this.log(`Connection test successful: ${result.data.serverInfo.databaseName} (${result.data.tables.length} tables)`);
      button.textContent = '✓ Connected';
      button.style.color = 'green';
      
      setTimeout(() => {
        button.textContent = originalText;
        button.style.color = '';
      }, 3000);
      
    } catch (error) {
      this.showError(`Connection failed: ${error instanceof Error ? error.message : String(error)}`);
      button.textContent = '✗ Failed';
      button.style.color = 'red';
      
      setTimeout(() => {
        button.textContent = originalText;
        button.style.color = '';
      }, 3000);
    } finally {
      button.disabled = false;
    }
    } catch (error) {
      this.showError(`Error in test connection: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // SQL Script Management
  private showSqlScriptModal(script?: SavedSqlScript) {
    this.resetSqlScriptModal();
    
    // Store the script ID being edited for later use in save
    (this.elements.sqlScriptModal as any).editingScriptId = script?.id || null;
    
    if (script) {
      this.elements.sqlScriptName.value = script.name;
      this.elements.sqlScriptContent.value = script.content;
      this.elements.sqlScriptDescription.value = script.description || '';
      (document.getElementById('sqlScriptModalTitle') as HTMLElement).textContent = 'Edit SQL Script';
    }
    this.elements.sqlScriptModal.style.display = 'flex';
  }

  private hideSqlScriptModal() {
    this.elements.sqlScriptModal.style.display = 'none';
    // Clear the editing script ID
    (this.elements.sqlScriptModal as any).editingScriptId = null;
    this.resetSqlScriptModal();
    // Update UI when modal is closed to reflect any changes
    this.updateScriptsList();
  }

  private resetSqlScriptModal() {
    this.elements.sqlScriptName.value = '';
    this.elements.sqlScriptContent.value = '';
    this.elements.sqlScriptDescription.value = '';
    (document.getElementById('sqlScriptModalTitle') as HTMLElement).textContent = 'Add SQL Script';
  }

  private async saveSqlScript() {
    const name = this.elements.sqlScriptName.value.trim();
    const content = this.elements.sqlScriptContent.value.trim();
    const description = this.elements.sqlScriptDescription.value.trim();

    if (!name || !content) {
      this.showError('Please fill in name and script content');
      return;
    }

    // Check if we're editing an existing script
    const editingScriptId = (this.elements.sqlScriptModal as any).editingScriptId;

    const script: SavedSqlScript = {
      id: editingScriptId || this.generateId(),
      name,
      content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...(description && { description })
    };

    try {
      if (editingScriptId) {
        await this.updateSqlScriptToStorage(editingScriptId, script);
      } else {
        await this.saveSqlScriptToStorage(script);
      }
      this.updateConfigModalDropdowns();
      this.hideSqlScriptModal();
      
      const action = editingScriptId ? 'updated' : 'saved';
      this.log(`Script "${name}" ${action} successfully`);
    } catch (error) {
      this.showError(`Failed to save script: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Configuration Management
  private showConfigModal() {
    this.resetConfigModal();
    this.updateConfigModalDropdowns();
    this.elements.configModal.style.display = 'flex';
    
    // Focus the name input
    setTimeout(() => {
      if (this.elements.configName) {
        this.elements.configName.focus();
      }
    }, 100);
  }

  private onSourceConnectionChange() {
    if (this.elements.sourceConnection.value === 'CREATE_NEW') {
      this.elements.sourceConnection.value = ''; // Reset selection
      this.showConnectionModal();
    }
  }

  private onTargetConnectionChange() {
    if (this.elements.targetConnection.value === 'CREATE_NEW') {
      this.elements.targetConnection.value = ''; // Reset selection
      this.showConnectionModalForTarget();
    }
  }

  private showConnectionModalForTarget() {
    this.resetConnectionModal();
    // Pre-fill with local connection template
    this.elements.server.value = 'localhost';
    this.elements.database.value = 'MyDatabase';
    this.elements.serverType.value = 'sqlserver';
    (document.getElementById('connectionModalTitle') as HTMLElement).textContent = 'Add Target Database Connection';
    this.elements.connectionModal.style.display = 'flex';
  }

  private hideConfigModal() {
    this.elements.configModal.style.display = 'none';
    // Clear the editing config ID
    (this.elements.configModal as any).editingConfigId = null;
    this.resetConfigModal();
    // Update UI when modal is closed to reflect any changes
    this.updateConfigurationsList();
    this.updateConfigSelect();
  }

  private resetConfigModal() {
    // Clear form fields
    if (this.elements.configName) this.elements.configName.value = '';
    if (this.elements.sourceConnection) this.elements.sourceConnection.value = '';
    if (this.elements.targetConnection) this.elements.targetConnection.value = '';
    // createTargetDatabase checkbox removed - always create if doesn't exist
    
    // Clear all script checkboxes
    const checkboxes = this.elements.scriptSelection?.querySelectorAll('input[type="checkbox"]');
    checkboxes?.forEach(checkbox => {
      (checkbox as HTMLInputElement).checked = false;
    });
    
    // Reset title
    const titleElement = document.getElementById('configModalTitle') as HTMLElement;
    if (titleElement) titleElement.textContent = 'Add Replication Configuration';
  }

  private updateConfigModalDropdowns() {
    // Update source connections (any type)
    this.elements.sourceConnection.innerHTML = '<option value="">Select saved connection...</option>';
    
    
    // Add separator
    if (this.state.connections.length > 0) {
      const separatorOption = document.createElement('option');
      separatorOption.disabled = true;
      separatorOption.textContent = '────────────────────';
      this.elements.sourceConnection.appendChild(separatorOption);
    }
    
    this.state.connections.forEach(conn => {
      const option = document.createElement('option');
      option.value = conn.id;
      option.textContent = `${conn.name} (${conn.databaseName})`;
      this.elements.sourceConnection.appendChild(option);
    });

    // Update target connections dropdown (only connections flagged as target databases)
    this.elements.targetConnection.innerHTML = '<option value="">Select target database...</option>';
    
    // Filter connections that are marked as target databases
    const targetConnections = this.state.connections.filter(conn => conn.isTargetDatabase);
    
    if (targetConnections.length === 0) {
      const noTargetsOption = document.createElement('option');
      noTargetsOption.disabled = true;
      noTargetsOption.textContent = 'No target databases available - mark connections as targets first';
      noTargetsOption.style.fontStyle = 'italic';
      noTargetsOption.style.color = '#999';
      this.elements.targetConnection.appendChild(noTargetsOption);
    } else {
      targetConnections.forEach(conn => {
        const option = document.createElement('option');
        option.value = conn.id;
        option.textContent = `${conn.name} (${conn.databaseName})`;
        this.elements.targetConnection.appendChild(option);
      });
    }

    // Update script selection
    if (this.state.sqlScripts.length === 0) {
      this.elements.scriptSelection.innerHTML = '<p class="empty-state">No saved scripts available</p>';
    } else {
      this.elements.scriptSelection.innerHTML = this.state.sqlScripts.map(script => `
        <div class="script-checkbox">
          <input type="checkbox" id="script-${script.id}" value="${script.id}">
          <label for="script-${script.id}">${this.escapeHtml(script.name)}</label>
          ${script.description ? `<small>${this.escapeHtml(script.description)}</small>` : ''}
        </div>
      `).join('');
    }
  }

  private async saveConfiguration() {
    try {
      const name = this.elements.configName?.value?.trim() || '';
      const sourceConnectionId = this.elements.sourceConnection?.value || '';
      const targetId = this.elements.targetConnection?.value || '';
      const createTargetDatabase = true; // Always create target database if it doesn't exist

      if (!name) {
        this.showError('Configuration name is required');
        return;
      }
      
      if (!sourceConnectionId) {
        this.showError('Source connection is required');
        return;
      }
      
      if (!targetId) {
        this.showError('Target is required');
        return;
      }

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(sourceConnectionId)) {
        this.showError('Invalid source connection ID format');
        return;
      }
      
      if (!uuidRegex.test(targetId)) {
        this.showError('Invalid target ID format');
        return;
      }

      const selectedScriptIds: string[] = [];
      this.elements.scriptSelection?.querySelectorAll('input[type="checkbox"]:checked').forEach(checkbox => {
        selectedScriptIds.push((checkbox as HTMLInputElement).value);
      });


      // Check if we're editing an existing configuration
      const editingConfigId = (this.elements.configModal as any).editingConfigId;
      
      const config: StoredConfiguration = {
        id: editingConfigId || this.generateId(),
        name,
        sourceConnectionId,
        targetId: targetId,
        createTargetDatabase,
        scriptIds: selectedScriptIds,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (editingConfigId) {
        // Update existing configuration
        const existingConfig = this.state.configurations.find(c => c.id === editingConfigId);
        if (existingConfig) {
          config.createdAt = existingConfig.createdAt; // Keep original creation date
        }
        await this.updateConfigurationToStorage(editingConfigId, config);
      } else {
        await this.saveConfigurationToStorage(config);
      }
      
      this.updateConfigurationsList();
      this.updateConfigSelect();
      this.hideConfigModal();
      
      const action = editingConfigId ? 'updated' : 'saved';
      this.log(`Configuration "${name}" ${action} successfully`);
    } catch (error) {
      this.showError(`Failed to save configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Configuration Selection
  private onConfigSelectionChange() {
    const configId = this.elements.selectedConfigSelect.value;
    this.state.selectedConfigId = configId;
    
    if (configId) {
      const config = this.state.configurations.find(c => c.id === configId);
      if (config) {
        this.displayConfigDetails(config);
        this.elements.startReplicationBtn.disabled = false;
      }
    } else {
      this.elements.configDetails.style.display = 'none';
      this.elements.startReplicationBtn.disabled = true;
    }
  }

  private displayConfigDetails(config: StoredConfiguration) {
    const sourceConnection = this.state.connections.find(c => c.id === config.sourceConnectionId);
    const targetConnection = this.state.connections.find(c => c.id === config.targetId);
    const scripts = this.state.sqlScripts.filter(s => config.scriptIds.includes(s.id));

    this.elements.configSource.textContent = sourceConnection 
      ? `${sourceConnection.name} (${sourceConnection.databaseName})`
      : 'Connection not found';
    this.elements.configTarget.textContent = targetConnection 
      ? `${targetConnection.name} (${targetConnection.databaseName})`
      : 'Connection not found';
    this.elements.configScripts.textContent = scripts.length > 0 
      ? `${scripts.length} script(s): ${scripts.map(s => s.name).join(', ')}`
      : 'None';
    this.elements.configLastRun.textContent = config.lastRun 
      ? this.formatDate(new Date(config.lastRun))
      : 'Never';
    
    this.elements.configDetails.style.display = 'block';
  }

  // Replication Control
  private async startReplication() {
    if (!this.state.selectedConfigId) {
      this.showError('Please select a configuration first');
      return;
    }

    const config = this.state.configurations.find(c => c.id === this.state.selectedConfigId);
    if (!config) {
      this.showError('Selected configuration not found');
      return;
    }

    try {
      this.state.isReplicating = true;
      this.updateReplicationButtons();
      this.showProgress(0, 'Starting replication...');
      
      // Use the stored configuration IPC which handles connection string decryption
      const result = await window.electronAPI.replication.startStored({ configId: this.state.selectedConfigId });
      
      if (!result.success) {
        throw new Error(result.error);
      }
      this.state.currentJobId = result.data.jobId;
      this.log(`Replication started with job ID: ${result.data.jobId}`);
      
      // Start polling for status
      this.pollReplicationStatus();
      
    } catch (error) {
      this.state.isReplicating = false;
      this.updateReplicationButtons();
      this.hideProgress();
      this.showError(`Failed to start replication: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async cancelReplication() {
    if (!this.state.currentJobId) return;

    try {
      console.log('Sending cancel request for job:', this.state.currentJobId);
      const result = await window.electronAPI.replication.cancel(this.state.currentJobId);

      if (!result.success) {
        throw new Error(`Failed to cancel replication: ${result.error}`);
      }

      this.log('Replication cancelled');
    } catch (error) {
      this.showError(`Failed to cancel replication: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async pollReplicationStatus() {
    if (!this.state.currentJobId || !this.state.isReplicating) return;

    try {
      console.log('Fetching status for job:', this.state.currentJobId);
      const result = await window.electronAPI.replication.getStatus(this.state.currentJobId);
      
      if (!result.success) {
        throw new Error(`Failed to get replication status: ${result.error}`);
      }

      const status = result.data;
      
      this.showProgress(status.progress || 0, status.message || 'Processing...');
      
      if (status.status === 'completed') {
        this.state.isReplicating = false;
        this.state.currentJobId = null;
        this.updateReplicationButtons();
        this.hideProgress();
        this.log('Replication completed successfully');
        
        // Update last run time
        if (this.state.selectedConfigId) {
          const config = this.state.configurations.find(c => c.id === this.state.selectedConfigId);
          if (config) {
            config.lastRun = new Date().toISOString();
            config.updatedAt = new Date().toISOString();
            await this.saveConfigurationToStorage(config);
            this.displayConfigDetails(config);
          }
        }
      } else if (status.status === 'failed') {
        this.state.isReplicating = false;
        this.state.currentJobId = null;
        this.updateReplicationButtons();
        this.hideProgress();
        this.showError(`Replication failed: ${status.message || 'Unknown error'}`);
      } else {
        // Continue polling
        setTimeout(() => this.pollReplicationStatus(), 1000);
      }
    } catch (error) {
      this.showError(`Status check failed: ${error instanceof Error ? error.message : String(error)}`);
      setTimeout(() => this.pollReplicationStatus(), 2000);
    }
  }

  // UI Updates
  private updateReplicationButtons() {
    this.elements.startReplicationBtn.disabled = this.state.isReplicating || !this.state.selectedConfigId;
    this.elements.cancelReplicationBtn.disabled = !this.state.isReplicating;
  }

  private showProgress(progress: number, message: string) {
    this.elements.progressContainer.style.display = 'block';
    this.elements.progressFill.style.width = `${progress}%`;
    this.elements.progressText.textContent = `${Math.round(progress)}%`;
    this.elements.statusMessage.textContent = message;
  }

  private hideProgress() {
    this.elements.progressContainer.style.display = 'none';
  }

  private updateUI() {
    this.updateConnectionsList();
    this.updateScriptsList();
    this.updateConfigurationsList();
    this.updateConfigSelect();
    this.updateReplicationButtons();
  }

  private updateConnectionsList() {
    if (this.state.connections.length === 0) {
      this.elements.connectionsList.innerHTML = '<div class="empty-state">No saved connections</div>';
    } else {
      this.elements.connectionsList.innerHTML = this.state.connections.map(conn => `
        <div class="storage-item">
          <div class="item-header">
            <h4>${this.escapeHtml(conn.name)}</h4>
            <div class="item-actions">
              <button class="btn btn-small btn-secondary" onclick="dataReplicatorUI.editConnection('${conn.id}')">Edit</button>
              <button class="btn btn-small btn-danger" onclick="dataReplicatorUI.deleteConnection('${conn.id}')">Delete</button>
            </div>
          </div>
          <div class="item-details">
            <div><strong>Database:</strong> ${this.escapeHtml(conn.databaseName)}</div>
            <div><strong>Type:</strong> ${conn.isAzure ? 'Azure SQL' : 'SQL Server'}${conn.isTargetDatabase ? ' (Target)' : ''}</div>
            ${conn.description ? `<div><strong>Description:</strong> ${this.escapeHtml(conn.description)}</div>` : ''}
            <div><strong>Created:</strong> ${this.formatDate(new Date(conn.createdAt))}</div>
          </div>
        </div>
      `).join('');
    }
  }

  private updateScriptsList() {
    if (this.state.sqlScripts.length === 0) {
      this.elements.scriptsList.innerHTML = '<div class="empty-state">No saved scripts</div>';
    } else {
      this.elements.scriptsList.innerHTML = this.state.sqlScripts.map(script => `
        <div class="storage-item">
          <div class="item-header">
            <h4>${this.escapeHtml(script.name)}</h4>
            <div class="item-actions">
              <button class="btn btn-small btn-secondary" onclick="dataReplicatorUI.editScript('${script.id}')">Edit</button>
              <button class="btn btn-small btn-danger" onclick="dataReplicatorUI.deleteScript('${script.id}')">Delete</button>
            </div>
          </div>
          <div class="item-details">
            ${script.description ? `<div><strong>Description:</strong> ${this.escapeHtml(script.description)}</div>` : ''}
            <div><strong>Length:</strong> ${script.content.length} characters</div>
            <div><strong>Created:</strong> ${this.formatDate(new Date(script.createdAt))}</div>
          </div>
        </div>
      `).join('');
    }
  }

  private updateConfigurationsList() {
    if (this.state.configurations.length === 0) {
      this.elements.configsList.innerHTML = '<div class="empty-state">No configurations created yet</div>';
    } else {
      this.elements.configsList.innerHTML = this.state.configurations.map(config => `
        <div class="config-item">
          <div class="config-header">
            <h4>${this.escapeHtml(config.name)}</h4>
            <div class="config-actions">
              <button class="btn btn-small btn-secondary" onclick="dataReplicatorUI.editConfiguration('${config.id}')">Edit</button>
              <button class="btn btn-small btn-danger" onclick="dataReplicatorUI.deleteConfiguration('${config.id}')">Delete</button>
            </div>
          </div>
          <div class="config-summary">
            <div><strong>Source:</strong> ${this.getConnectionName(config.sourceConnectionId)}</div>
            <div><strong>Target:</strong> ${this.getConnectionName(config.targetId)}</div>
            <div><strong>Scripts:</strong> ${config.scriptIds.length}</div>
            <div><strong>Last Run:</strong> ${config.lastRun ? this.formatDate(new Date(config.lastRun)) : 'Never'}</div>
          </div>
        </div>
      `).join('');
    }
  }

  private updateConfigSelect() {
    const currentValue = this.elements.selectedConfigSelect.value;
    this.elements.selectedConfigSelect.innerHTML = '<option value="">Choose a configuration...</option>';
    
    this.state.configurations.forEach(config => {
      const option = document.createElement('option');
      option.value = config.id;
      option.textContent = config.name;
      this.elements.selectedConfigSelect.appendChild(option);
    });
    
    // Restore selection if still valid
    if (currentValue && this.state.configurations.some(c => c.id === currentValue)) {
      this.elements.selectedConfigSelect.value = currentValue;
      this.state.selectedConfigId = currentValue;
    }
  }

  // Storage Management
  private async loadAllData() {
    await Promise.all([
      this.loadConnections(),
      this.loadSqlScripts(),
      this.loadConfigurations()
    ]);
  }

  private async loadConnections() {
    try {
      const result = await window.electronAPI.connections.getAll();
      if (!result.success) {
        throw new Error(`Failed to fetch connections: ${result.error}`);
      }

      const connections = result.data;
      if (Array.isArray(connections)) {
        this.state.connections = connections.map(conn => ({
          id: conn.id,
          name: conn.name,
          connectionString: '', // Connection string will be fetched when needed
          description: conn.description || '',
          isAzure: conn.serverType === 'azure-sql',
          isTargetDatabase: conn.isTargetDatabase || false,
          databaseName: conn.database || 'Unknown',
          createdAt: conn.createdAt,
          updatedAt: conn.updatedAt
        }));
        this.log(`Loaded ${this.state.connections.length} connections from storage.json`);
      } else {
        throw new Error('Invalid connections data structure');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.log(`Failed to load connections from storage.json: ${errorMessage}`);
      this.state.connections = [];
    }
  }



  private async loadSqlScripts() {
    try {
      const result = await window.electronAPI.scripts.getAll();
      if (!result.success) {
        throw new Error(`Failed to fetch scripts: ${result.error}`);
      }

      const scripts = result.data;
      if (Array.isArray(scripts)) {
        this.state.sqlScripts = scripts.map(script => ({
          id: script.id,
          name: script.name,
          content: script.content,
          description: script.description || '',
          language: script.language,
          tags: script.tags || [],
          createdAt: script.createdAt,
          updatedAt: script.updatedAt
        }));
        this.log(`Loaded ${this.state.sqlScripts.length} scripts from storage.json`);
      } else {
        throw new Error('Invalid scripts data structure');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.log(`Failed to load scripts from storage.json: ${errorMessage}`);
      this.state.sqlScripts = [];
    }
  }

  private async loadConfigurations() {
    try {
      const result = await window.electronAPI.configs.getAll();
      if (!result.success) {
        throw new Error(`Failed to fetch configurations: ${result.error}`);
      }

      const serverConfigurations = result.data;
      if (Array.isArray(serverConfigurations)) {
        // Transform server format to frontend format
        this.state.configurations = serverConfigurations.map(serverConfig => ({
          id: serverConfig.id,
          name: serverConfig.name,
          sourceConnectionId: serverConfig.sourceConnectionId,
          targetId: serverConfig.targetId, // Keep targetId as is
          createTargetDatabase: serverConfig.settings?.includeSchema || false,
          scriptIds: serverConfig.configScriptIds || [], // Map configScriptIds back to scriptIds
          createdAt: serverConfig.createdAt,
          updatedAt: serverConfig.updatedAt,
          lastRun: serverConfig.lastRun
        }));
        this.log(`Loaded ${this.state.configurations.length} configurations from storage.json:`);
        this.state.configurations.forEach(config => {
          this.log(`  - ${config.name} (ID: ${config.id})`);
        });
      } else {
        throw new Error('Invalid configurations data structure');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.log(`Failed to load configurations from storage.json: ${errorMessage}`);
      this.state.configurations = [];
    }
  }

  private async saveConnectionToStorage(connection: SavedConnection) {
    try {
      // Get individual fields directly from form
      const server = this.elements.server.value.trim();
      const database = this.elements.database.value.trim();
      const username = this.elements.username.value.trim();
      const password = this.elements.password.value.trim();
      const port = this.elements.port.value.trim();
      
      const requestData = {
        name: connection.name,
        description: connection.description,
        server: server,
        username: username,
        password: password,
        database: database,
        port: port ? parseInt(port) : undefined,
        serverType: connection.isAzure ? 'azure-sql' : 'sqlserver',
        isTargetDatabase: connection.isTargetDatabase
      };

      const result = await window.electronAPI.connections.create(requestData);

      if (!result.success) {
        throw new Error(`Server error: ${result.error}`);
      }

      const savedConnection = result.data;
      
      // Update local state
      const localConnection = {
        id: savedConnection.id,
        name: savedConnection.name,
        connectionString: connection.connectionString, // Keep original for local use
        description: savedConnection.description || '',
        isAzure: savedConnection.serverType === 'azure-sql',
        isTargetDatabase: connection.isTargetDatabase,
        databaseName: database || 'Unknown',
        createdAt: savedConnection.createdAt,
        updatedAt: savedConnection.updatedAt
      };

      const index = this.state.connections.findIndex(c => c.id === connection.id);
      if (index >= 0) {
        this.state.connections[index] = localConnection;
      } else {
        this.state.connections.push(localConnection);
      }
      
      this.log(`Connection "${connection.name}" saved to storage.json`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.log(`Failed to save connection: ${errorMessage}`);
      throw new Error(`Failed to save connection to storage: ${errorMessage}`);
    }
  }

  private async updateConnectionToStorage(connectionId: string, connection: SavedConnection) {
    try {
      // Get individual fields directly from form
      const server = this.elements.server.value.trim();
      const database = this.elements.database.value.trim();
      const username = this.elements.username.value.trim();
      const password = this.elements.password.value.trim();
      const port = this.elements.port.value.trim();
      
      const requestData = {
        name: connection.name,
        description: connection.description,
        server: server,
        username: username,
        password: password,
        database: database,
        port: port ? parseInt(port) : undefined,
        serverType: connection.isAzure ? 'azure-sql' : 'sqlserver',
        isTargetDatabase: connection.isTargetDatabase
      };

      const result = await window.electronAPI.connections.update(connectionId, requestData);

      if (!result.success) {
        throw new Error(`Server error: ${result.error}`);
      }

      const savedConnection = result.data;
      
      // Update local state
      const localConnection = {
        id: savedConnection.id,
        name: savedConnection.name,
        connectionString: connection.connectionString, // Keep original for local use
        description: savedConnection.description || '',
        isAzure: savedConnection.serverType === 'azure-sql',
        isTargetDatabase: connection.isTargetDatabase,
        databaseName: database || 'Unknown',
        createdAt: savedConnection.createdAt,
        updatedAt: savedConnection.updatedAt
      };

      const index = this.state.connections.findIndex(c => c.id === connectionId);
      if (index >= 0) {
        this.state.connections[index] = localConnection;
      }
      
      this.log(`Connection "${connection.name}" updated in storage.json`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.log(`Failed to update connection: ${errorMessage}`);
      throw new Error(`Failed to update connection in storage: ${errorMessage}`);
    }
  }

  private parseConnectionString(connectionString: string): {
    server?: string;
    username?: string;
    password?: string;
    database?: string;
    port?: number;
  } {
    const parts: any = {};
    
    // Extract server
    const serverMatch = connectionString.match(/Server=([^;]+)/i);
    if (serverMatch) parts.server = serverMatch[1];
    
    // Extract database
    const databaseMatch = connectionString.match(/(?:Database|Initial Catalog)=([^;]+)/i);
    if (databaseMatch) parts.database = databaseMatch[1];
    
    // Extract username
    const userMatch = connectionString.match(/(?:User ID|UID)=([^;]+)/i);
    if (userMatch) parts.username = userMatch[1];
    
    // Extract password
    const passwordMatch = connectionString.match(/(?:Password|PWD)=([^;]+)/i);
    if (passwordMatch) parts.password = passwordMatch[1];
    
    // Extract port (if specified)
    if (parts.server && parts.server.includes(',')) {
      const [server, port] = parts.server.split(',');
      parts.server = server;
      parts.port = parseInt(port);
    } else if (parts.server && parts.server.includes(':')) {
      const [server, port] = parts.server.split(':');
      parts.server = server;
      parts.port = parseInt(port);
    }
    
    return parts;
  }

  private async saveSqlScriptToStorage(script: SavedSqlScript) {
    try {
      const requestData = {
        name: script.name,
        description: script.description || '',
        content: script.content,
        language: 'sql', // Default to SQL
        tags: []
      };

      const result = await window.electronAPI.scripts.create(requestData);

      if (!result.success) {
        throw new Error(`Server error: ${result.error}`);
      }

      const savedScript = result.data;
      
      // Update local state
      const localScript = {
        id: savedScript.id,
        name: savedScript.name,
        content: savedScript.content,
        description: savedScript.description || '',
        createdAt: savedScript.createdAt,
        updatedAt: savedScript.updatedAt
      };

      const index = this.state.sqlScripts.findIndex(s => s.id === script.id);
      if (index >= 0) {
        this.state.sqlScripts[index] = localScript;
      } else {
        this.state.sqlScripts.push(localScript);
      }
      
      this.log(`Script "${script.name}" saved to storage.json`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.log(`Failed to save script: ${errorMessage}`);
      throw new Error(`Failed to save script to storage: ${errorMessage}`);
    }
  }

  private async updateSqlScriptToStorage(scriptId: string, script: SavedSqlScript) {
    try {
      const requestData = {
        name: script.name,
        description: script.description || '',
        content: script.content,
        language: 'sql', // Default to SQL
        tags: []
      };

      const result = await window.electronAPI.scripts.update(scriptId, requestData);

      if (!result.success) {
        throw new Error(`Server error: ${result.error}`);
      }

      const updatedScript = result.data;
      
      // Update local state
      const localScript = {
        id: updatedScript.id,
        name: updatedScript.name,
        content: updatedScript.content,
        description: updatedScript.description || '',
        createdAt: updatedScript.createdAt,
        updatedAt: updatedScript.updatedAt
      };

      const index = this.state.sqlScripts.findIndex(s => s.id === scriptId);
      if (index >= 0) {
        this.state.sqlScripts[index] = localScript;
      }
      
      this.log(`Script "${script.name}" updated in storage.json`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.log(`Failed to update script: ${errorMessage}`);
      throw new Error(`Failed to update script in storage: ${errorMessage}`);
    }
  }

  private async saveConfigurationToStorage(config: StoredConfiguration) {
    try {
      // Transform frontend config to server format
      const serverConfig = {
        name: config.name,
        // Don't include description field since we don't need it
        sourceConnectionId: config.sourceConnectionId,
        targetId: config.targetId, // Use the selected target ID
        configScriptIds: config.scriptIds, // Map scriptIds to configScriptIds
        settings: {
          includeData: true,
          includeSchema: config.createTargetDatabase
        }
      };

      const result = await window.electronAPI.configs.create(serverConfig);

      if (!result.success) {
        this.log(`Server error: ${result.error}`);
        throw new Error(`Server error: ${result.error}`);
      }

      const savedConfig = result.data;
      
      // Update the config with the server-generated ID and data
      const updatedConfig: StoredConfiguration = {
        id: savedConfig.id, // Use the server-generated UUID
        name: savedConfig.name,
        sourceConnectionId: savedConfig.sourceConnectionId,
        targetId: savedConfig.targetId,
        createTargetDatabase: savedConfig.settings?.includeSchema || false,
        scriptIds: savedConfig.configScriptIds || [],
        createdAt: savedConfig.createdAt,
        updatedAt: savedConfig.updatedAt,
        lastRun: savedConfig.lastRun
      };
      
      // Update local state with the corrected configuration
      const index = this.state.configurations.findIndex(c => c.id === config.id);
      if (index >= 0) {
        this.state.configurations[index] = updatedConfig;
      } else {
        this.state.configurations.push(updatedConfig);
      }

      
      // Close the modal which will trigger UI updates
      this.hideConfigModal();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to save configuration to storage: ${errorMessage}`);
    }
  }

  private async updateConfigurationToStorage(configId: string, config: StoredConfiguration) {
    try {
      // Transform frontend config to server format
      const serverConfig = {
        name: config.name,
        // Don't include description field since we don't need it
        sourceConnectionId: config.sourceConnectionId,
        targetId: config.targetId, // Use the selected target ID
        configScriptIds: config.scriptIds, // Map scriptIds to configScriptIds
        settings: {
          includeData: true,
          includeSchema: config.createTargetDatabase
        }
      };

      this.log(`Attempting to update configuration: ${configId}`);
      this.log(`PUT body: ${JSON.stringify(serverConfig, null, 2)}`);
      
      // Note: Configuration updates are not currently supported in the simplified architecture
      // For now, we'll delete and recreate the configuration
      await window.electronAPI.configs.delete(configId);
      const result = await window.electronAPI.configs.create(serverConfig);

      if (!result.success) {
        throw new Error(`Server error: ${result.error}`);
      }

      const updatedConfig = result.data;
      
      // Transform server response back to frontend format
      const frontendConfig: StoredConfiguration = {
        id: updatedConfig.id,
        name: updatedConfig.name,
        sourceConnectionId: updatedConfig.sourceConnectionId,
        targetId: updatedConfig.targetId,
        createTargetDatabase: updatedConfig.settings?.includeSchema || false,
        scriptIds: updatedConfig.configScriptIds || [],
        createdAt: updatedConfig.createdAt,
        updatedAt: updatedConfig.updatedAt,
        lastRun: updatedConfig.lastRun
      };
      
      // Update local state
      const index = this.state.configurations.findIndex(c => c.id === configId);
      if (index >= 0) {
        this.state.configurations[index] = frontendConfig;
      } else {
        // Fallback: add if not found (shouldn't happen in normal flow)
        this.state.configurations.push(frontendConfig);
      }
      
      this.log(`Configuration "${config.name}" updated in storage.json`);
      
      // Close the modal which will trigger UI updates
      this.hideConfigModal();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.log(`Update configuration error: ${errorMessage}`);
      if (error instanceof Error && error.message === 'Failed to fetch') {
        this.log('Network error - server may be down or unreachable');
      }
      throw new Error(`Failed to update configuration in storage: ${errorMessage}`);
    }
  }

  // Public methods for onclick handlers
  public async editConnection(connectionId: string) {
    const connection = this.state.connections.find(c => c.id === connectionId);
    if (!connection) return;

    try {
      // Fetch the full connection details (decrypted from server)
      const result = await window.electronAPI.connections.get(connectionId);
      if (result.success) {
        const serverConnection = result.data;
        
        // Show modal and populate with decrypted server data
        this.resetConnectionModal();
        
        // Store the connection ID being edited
        (this.elements.connectionModal as any).editingConnectionId = connectionId;
        
        if (this.elements.connectionName) this.elements.connectionName.value = serverConnection.name || '';
        if (this.elements.connectionDescription) this.elements.connectionDescription.value = serverConnection.description || '';
        if (this.elements.serverType) this.elements.serverType.value = serverConnection.serverType || 'sqlserver';
        
        // Populate the decrypted connection details
        if (this.elements.server) this.elements.server.value = serverConnection.server || '';
        if (this.elements.database) this.elements.database.value = serverConnection.database || '';
        if (this.elements.username) this.elements.username.value = serverConnection.username || '';
        // Don't populate password for security - user will need to re-enter
        if (this.elements.password) this.elements.password.value = '';
        if (this.elements.port) this.elements.port.value = serverConnection.port ? serverConnection.port.toString() : '';
        
        const titleElement = document.getElementById('connectionModalTitle') as HTMLElement;
        if (titleElement) titleElement.textContent = 'Edit Database Connection';
        
        if (this.elements.connectionModal) this.elements.connectionModal.style.display = 'flex';
        
        this.log(`Editing connection "${serverConnection.name}" - please re-enter password for security`);
      } else {
        this.showError(`Could not fetch connection details: ${result.error}`);
      }
    } catch (error) {
      this.showError(`Error fetching connection details: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async deleteConnection(connectionId: string) {
    const connection = this.state.connections.find(c => c.id === connectionId);
    if (!connection) return;

    if (!confirm(`Are you sure you want to delete the connection "${connection.name}"?`)) return;

    try {
      const result = await window.electronAPI.connections.delete(connectionId);

      if (!result.success) {
        throw new Error(`Server error: ${result.error}`);
      }

      // Remove from local state
      this.state.connections = this.state.connections.filter(c => c.id !== connectionId);
      this.updateUI();
      this.log(`Connection "${connection.name}" deleted from storage.json`);
    } catch (error) {
      this.showError(`Failed to delete connection: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public editScript(scriptId: string) {
    const script = this.state.sqlScripts.find(s => s.id === scriptId);
    if (!script) return;
    this.showSqlScriptModal(script);
  }

  public async deleteScript(scriptId: string) {
    const script = this.state.sqlScripts.find(s => s.id === scriptId);
    if (!script) return;

    if (!confirm(`Are you sure you want to delete the script "${script.name}"?`)) return;

    try {
      const result = await window.electronAPI.scripts.delete(scriptId);

      if (!result.success) {
        throw new Error(`Server error: ${result.error}`);
      }

      // Remove from local state
      this.state.sqlScripts = this.state.sqlScripts.filter(s => s.id !== scriptId);
      this.updateUI();
      this.log(`Script "${script.name}" deleted from storage.json`);
    } catch (error) {
      this.showError(`Failed to delete script: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async editConfiguration(configId: string) {
    const config = this.state.configurations.find(c => c.id === configId);
    if (!config) return;

    try {
      // Store the config ID being edited first
      (this.elements.configModal as any).editingConfigId = configId;
      
      // Show modal first (this will reset and update dropdowns)
      this.showConfigModal();
      
      // Then populate with existing data after modal is shown
      setTimeout(() => {
        if (this.elements.configName) this.elements.configName.value = config.name;
        if (this.elements.sourceConnection) this.elements.sourceConnection.value = config.sourceConnectionId;
        if (this.elements.targetConnection) this.elements.targetConnection.value = config.targetId;
        // createTargetDatabase checkbox removed - always create if doesn't exist
        
        // Select the scripts
        config.scriptIds.forEach(scriptId => {
          const checkbox = document.getElementById(`script-${scriptId}`) as HTMLInputElement;
          if (checkbox) checkbox.checked = true;
        });
        
        // Update title
        const titleElement = document.getElementById('configModalTitle') as HTMLElement;
        if (titleElement) titleElement.textContent = 'Edit Replication Configuration';
        
        this.log(`Editing configuration "${config.name}"`);
      }, 150);
      
    } catch (error) {
      this.showError(`Error editing configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async deleteConfiguration(configId: string) {
    this.log(`deleteConfiguration called with ID: ${configId}`);
    const config = this.state.configurations.find(c => c.id === configId);
    if (!config) {
      this.log(`Configuration with ID ${configId} not found in current state`);
      this.log('Available configurations:');
      this.state.configurations.forEach(c => {
        this.log(`  - ${c.name} (ID: ${c.id})`);
      });
      return;
    }

    if (!confirm(`Are you sure you want to delete the configuration "${config.name}"?`)) return;

    try {
      this.log(`Attempting to delete configuration: ${configId}`);
      
      const result = await window.electronAPI.configs.delete(configId);

      if (!result.success) {
        throw new Error(`Server error: ${result.error}`);
      }

      // Update local state
      this.state.configurations = this.state.configurations.filter(c => c.id !== configId);
      
      // Clear selection if this config was selected
      if (this.state.selectedConfigId === configId) {
        this.state.selectedConfigId = null;
        this.elements.selectedConfigSelect.value = '';
        this.elements.configDetails.style.display = 'none';
      }
      
      this.updateUI();
      this.log(`Configuration "${config.name}" deleted successfully from storage.json`);
      
      // Optionally refresh configurations from server to ensure sync
      await this.loadConfigurations();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Delete configuration error: ${errorMessage}`);
      if (error instanceof Error && error.message === 'Failed to fetch') {
        this.log('Network error - server may be down or unreachable');
      }
      this.showError(`Failed to delete configuration: ${errorMessage}`);
    }
  }

  // Settings Modal Methods
  private async showSettingsModal() {
    this.elements.settingsModal.style.display = 'flex';
    // Load app version
    try {
      const appInfo = await window.electronAPI.getAppInfo();
      this.elements.appVersion.textContent = `${appInfo.name} v${appInfo.version}`;
    } catch (error) {
      this.elements.appVersion.textContent = 'Unknown';
    }
  }

  private hideSettingsModal() {
    this.elements.settingsModal.style.display = 'none';
  }

  private switchSettingsTab(tabName: string) {
    this.elements.settingsTabButtons.forEach(button => {
      if (button.getAttribute('data-tab') === tabName) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    });

    this.elements.settingsTabContents.forEach(content => {
      if (content.id === `${tabName}-tab`) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });
  }

  private async exportConfiguration() {
    try {
      const exportOptions = {
        includeConnections: this.elements.exportConnections.checked,
        includeScripts: this.elements.exportScripts.checked,
        includeConfigs: this.elements.exportConfigs.checked
      };

      // Get the configuration data
      const result = await window.electronAPI.config.export(exportOptions);
      if (!result.success) {
        throw new Error(result.error);
      }

      const configData = result.data;
      
      // Show save dialog
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
      const defaultName = `replicator-config-${timestamp}.json`;
      const filePath = await window.electronAPI.saveConfigFile(defaultName);
      
      if (filePath) {
        // Save to file
        const saveResult = await window.electronAPI.config.saveToFile(filePath, configData);
        if (!saveResult.success) {
          throw new Error(saveResult.error);
        }

        this.log(`Configuration exported successfully to: ${filePath}`);
        this.log(`Exported ${configData.metadata.itemCounts.connections} connections, ${configData.metadata.itemCounts.scripts} scripts, ${configData.metadata.itemCounts.configs} configurations`);
      }
    } catch (error) {
      this.showError(`Failed to export configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async importConfiguration() {
    try {
      // Show file selection dialog
      const filePath = await window.electronAPI.selectConfigFile();
      if (!filePath) return;

      // Load configuration from file
      const loadResult = await window.electronAPI.config.loadFromFile(filePath);
      if (!loadResult.success) {
        throw new Error(loadResult.error);
      }

      const configData = loadResult.data;
      
      // Validate the configuration data
      if (!configData || typeof configData !== 'object') {
        throw new Error('Invalid configuration file format');
      }

      // Store the configuration data for later import
      (this.elements.importPreviewModal as any).pendingImportData = configData;
      
      // Show preview modal
      this.showImportPreviewModal(configData);
      
    } catch (error) {
      this.showError(`Failed to load configuration file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private showImportPreviewModal(configData: any) {
    // Generate preview content
    const previewHTML = this.generateImportPreview(configData);
    this.elements.importPreviewContent.innerHTML = previewHTML;
    this.elements.importPreviewModal.style.display = 'flex';
  }

  private hideImportPreviewModal() {
    this.elements.importPreviewModal.style.display = 'none';
    (this.elements.importPreviewModal as any).pendingImportData = null;
  }

  private generateImportPreview(configData: any): string {
    const mergeMode = this.elements.importMode.value;
    const generateNewIds = this.elements.generateNewIds.checked;

    let html = '<div class="import-summary">';
    html += '<h5>Import Summary</h5>';
    html += '<div class="import-summary-stats">';
    
    if (configData.connections) {
      html += `<div class="import-summary-stat">
        <div class="import-summary-stat-value">${configData.connections.length}</div>
        <div class="import-summary-stat-label">Connections</div>
      </div>`;
    }
    
    if (configData.scripts) {
      html += `<div class="import-summary-stat">
        <div class="import-summary-stat-value">${configData.scripts.length}</div>
        <div class="import-summary-stat-label">Scripts</div>
      </div>`;
    }
    
    if (configData.replicationConfigs) {
      html += `<div class="import-summary-stat">
        <div class="import-summary-stat-value">${configData.replicationConfigs.length}</div>
        <div class="import-summary-stat-label">Configurations</div>
      </div>`;
    }
    
    html += '</div></div>';

    // Show connections preview
    if (configData.connections && configData.connections.length > 0) {
      html += '<div class="import-preview-section">';
      html += '<h5>Database Connections</h5>';
      
      configData.connections.forEach((conn: any) => {
        const existing = this.state.connections.find(c => c.name === conn.name || (!generateNewIds && c.id === conn.id));
        let status = 'new';
        if (existing) {
          status = mergeMode === 'skip-duplicates' ? 'skip' : 'update';
        }
        
        html += `<div class="preview-item">
          <div class="preview-item-info">
            <div class="preview-item-name">${this.escapeHtml(conn.name)}</div>
            <div class="preview-item-details">Database: ${this.escapeHtml(conn.database || 'Unknown')}</div>
          </div>
          <div class="preview-item-status ${status}">${status.toUpperCase()}</div>
        </div>`;
      });
      
      html += '</div>';
    }

    // Show scripts preview
    if (configData.scripts && configData.scripts.length > 0) {
      html += '<div class="import-preview-section">';
      html += '<h5>Scripts</h5>';
      
      configData.scripts.forEach((script: any) => {
        const existing = this.state.sqlScripts.find(s => s.name === script.name || (!generateNewIds && s.id === script.id));
        let status = 'new';
        if (existing) {
          status = mergeMode === 'skip-duplicates' ? 'skip' : 'update';
        }
        
        html += `<div class="preview-item">
          <div class="preview-item-info">
            <div class="preview-item-name">${this.escapeHtml(script.name)}</div>
            <div class="preview-item-details">Language: ${script.language || 'SQL'}</div>
          </div>
          <div class="preview-item-status ${status}">${status.toUpperCase()}</div>
        </div>`;
      });
      
      html += '</div>';
    }

    // Show replication configs preview
    if (configData.replicationConfigs && configData.replicationConfigs.length > 0) {
      html += '<div class="import-preview-section">';
      html += '<h5>Replication Configurations</h5>';
      
      configData.replicationConfigs.forEach((config: any) => {
        const existing = this.state.configurations.find(c => c.name === config.name || (!generateNewIds && c.id === config.id));
        let status = 'new';
        if (existing) {
          status = mergeMode === 'skip-duplicates' ? 'skip' : 'update';
        }
        
        html += `<div class="preview-item">
          <div class="preview-item-info">
            <div class="preview-item-name">${this.escapeHtml(config.name)}</div>
            <div class="preview-item-details">Source to Target replication</div>
          </div>
          <div class="preview-item-status ${status}">${status.toUpperCase()}</div>
        </div>`;
      });
      
      html += '</div>';
    }

    return html;
  }

  private async confirmImport() {
    try {
      const configData = (this.elements.importPreviewModal as any).pendingImportData;
      if (!configData) {
        throw new Error('No configuration data to import');
      }

      const importOptions = {
        mergeMode: this.elements.importMode.value,
        generateNewIds: this.elements.generateNewIds.checked
      };

      // Perform the import
      const result = await window.electronAPI.config.import(configData, importOptions);
      if (!result.success) {
        throw new Error(result.error);
      }

      const importResult = result.data;
      
      // Refresh all data from storage
      await this.loadAllData();
      this.updateUI();
      
      this.hideImportPreviewModal();
      this.hideSettingsModal();
      
      this.log(`Configuration imported successfully!`);
      this.log(`Imported: ${importResult.imported.connections} connections, ${importResult.imported.scripts} scripts, ${importResult.imported.configs} configurations`);
      if (importResult.skipped.connections + importResult.skipped.scripts + importResult.skipped.configs > 0) {
        this.log(`Skipped: ${importResult.skipped.connections} connections, ${importResult.skipped.scripts} scripts, ${importResult.skipped.configs} configurations`);
      }
      if (importResult.errors.length > 0) {
        importResult.errors.forEach((error: string) => this.log(`Import warning: ${error}`));
      }
      
    } catch (error) {
      this.showError(`Failed to import configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Utility Methods
  private hideAllModals() {
    this.hideConnectionModal();
    this.hideSqlScriptModal();
    this.hideConfigModal();
    this.hideSettingsModal();
    this.hideImportPreviewModal();
  }

  private getConnectionName(connectionId: string): string {
    const connection = this.state.connections.find(c => c.id === connectionId);
    return connection ? `${connection.name} (${connection.databaseName})` : 'Unknown Connection';
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private formatDate(date: Date): string {
    return date.toLocaleString();
  }

  private log(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.innerHTML = `<span class="log-timestamp">[${timestamp}]</span> ${this.escapeHtml(message)}`;
    
    this.elements.logs.appendChild(logEntry);
    this.elements.logs.scrollTop = this.elements.logs.scrollHeight;
  }

  private showError(message: string) {
    this.log(`ERROR: ${message}`);
    console.error(message);
  }

  private clearLogs() {
    this.elements.logs.innerHTML = '';
  }


}

// Initialize the application
const dataReplicatorUI = new DataReplicatorUI();

// Make it globally available for onclick handlers
(window as any).dataReplicatorUI = dataReplicatorUI; 