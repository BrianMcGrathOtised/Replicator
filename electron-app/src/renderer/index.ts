import './styles.css';

// API Base URL
const API_BASE = 'http://localhost:3001/api';

// Type declarations for window.electronAPI
declare global {
  interface Window {
    electronAPI: {
      selectFile: () => Promise<string | null>;
      selectDirectory: () => Promise<string | null>;
      getAppInfo: () => Promise<{
        name: string;
        version: string;
        electronVersion: string;
        nodeVersion: string;
      }>;
      api: {
        testConnection: (connectionString: string) => Promise<any>;
        startReplication: (config: any) => Promise<any>;
        startStoredReplication: (configId: string) => Promise<any>;
        getReplicationStatus: (jobId: string) => Promise<any>;
        cancelReplication: (jobId: string) => Promise<any>;
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
  targetConnectionId: string;
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
    createTargetDatabase: document.getElementById('createTargetDatabase') as HTMLInputElement,
    scriptSelection: document.getElementById('scriptSelection') as HTMLDivElement,
  };

  constructor() {
    this.init();
  }

  private async init() {
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
    if (!this.elements.serverType) missingElements.push('serverType');
    if (!this.elements.testConnectionBtn) missingElements.push('testConnectionBtn');
    if (!this.elements.connectionModalSaveBtn) missingElements.push('connectionModalSaveBtn');
    if (!this.elements.connectionModalCancelBtn) missingElements.push('connectionModalCancelBtn');
    
    // Check config modal elements
    if (!this.elements.configModal) missingElements.push('configModal');
    if (!this.elements.configName) missingElements.push('configName');
    if (!this.elements.sourceConnection) missingElements.push('sourceConnection');
    if (!this.elements.targetConnection) missingElements.push('targetConnection');
    if (!this.elements.createTargetDatabase) missingElements.push('createTargetDatabase');
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
    
    // Prevent form submission from interfering with input
    const configForm = document.getElementById('configForm') as HTMLFormElement;
    if (configForm) {
      configForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveConfiguration();
      });
    }
    

    
    // Modal click outside to close
    [this.elements.connectionModal, this.elements.sqlScriptModal, this.elements.configModal].forEach(modal => {
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
          !this.elements.username || !this.elements.password || !this.elements.serverType) {
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
        isTargetDatabase: false, // This will be handled differently
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
      
      const response = await fetch(`${API_BASE}/replication/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionString })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      const result = await response.json();
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
    this.resetSqlScriptModal();
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

    const script: SavedSqlScript = {
      id: this.generateId(),
      name,
      content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...(description && { description })
    };

    try {
      await this.saveSqlScriptToStorage(script);
      this.updateScriptsList();
      this.updateConfigModalDropdowns();
      this.hideSqlScriptModal();
      this.log(`Script "${name}" saved successfully`);
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
  }

  private resetConfigModal() {
    // Clear form fields
    if (this.elements.configName) this.elements.configName.value = '';
    if (this.elements.sourceConnection) this.elements.sourceConnection.value = '';
    if (this.elements.targetConnection) this.elements.targetConnection.value = '';
    if (this.elements.createTargetDatabase) this.elements.createTargetDatabase.checked = true;
    
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
    
    // Add "Create New" option for source
    const createSourceOption = document.createElement('option');
    createSourceOption.value = 'CREATE_NEW';
    createSourceOption.textContent = '+ Create New Connection';
    createSourceOption.style.fontStyle = 'italic';
    createSourceOption.style.color = '#007acc';
    this.elements.sourceConnection.appendChild(createSourceOption);
    
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

    // Update target connections (local only)
    this.elements.targetConnection.innerHTML = '<option value="">Select saved connection...</option>';
    
    // Add "Create New" option for target
    const createTargetOption = document.createElement('option');
    createTargetOption.value = 'CREATE_NEW';
    createTargetOption.textContent = '+ Create New Target Connection';
    createTargetOption.style.fontStyle = 'italic';
    createTargetOption.style.color = '#007acc';
    this.elements.targetConnection.appendChild(createTargetOption);
    
    // Separate target databases from regular local connections
    const localConnections = this.state.connections.filter(conn => !conn.isAzure);
    const targetDatabases = localConnections.filter(conn => conn.isTargetDatabase);
    const otherLocalConnections = localConnections.filter(conn => !conn.isTargetDatabase);
    
    // Add target databases first
    if (targetDatabases.length > 0) {
      const separatorOption = document.createElement('option');
      separatorOption.disabled = true;
      separatorOption.textContent = '── Target Databases ──';
      this.elements.targetConnection.appendChild(separatorOption);
      
      targetDatabases.forEach(conn => {
        const option = document.createElement('option');
        option.value = conn.id;
        option.textContent = `🎯 ${conn.name} (${conn.databaseName})`;
        this.elements.targetConnection.appendChild(option);
      });
    }
    
    // Add other local connections
    if (otherLocalConnections.length > 0) {
      const separatorOption = document.createElement('option');
      separatorOption.disabled = true;
      separatorOption.textContent = '── Other Local Connections ──';
      this.elements.targetConnection.appendChild(separatorOption);
      
      otherLocalConnections.forEach(conn => {
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
      const targetConnectionId = this.elements.targetConnection?.value || '';
      const createTargetDatabase = this.elements.createTargetDatabase?.checked || false;

      if (!name || !sourceConnectionId || !targetConnectionId) {
        this.showError('Please fill in all required fields');
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
        targetConnectionId,
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
    const targetConnection = this.state.connections.find(c => c.id === config.targetConnectionId);
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
      
      // Use the stored configuration endpoint which handles connection string decryption
      const response = await fetch(`${API_BASE}/replication/start-stored`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configId: this.state.selectedConfigId })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      const result = await response.json();
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
      const cancelUrl = `${API_BASE}/replication/cancel/${this.state.currentJobId}`;
      console.log('Sending cancel request to:', cancelUrl);
      const response = await fetch(cancelUrl, {
        method: 'POST'
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to cancel replication (${response.status}): ${errorText}`);
      }

      this.log('Replication cancelled');
    } catch (error) {
      this.showError(`Failed to cancel replication: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async pollReplicationStatus() {
    if (!this.state.currentJobId || !this.state.isReplicating) return;

    try {
      const statusUrl = `${API_BASE}/replication/status/${this.state.currentJobId}`;
      console.log('Fetching status from:', statusUrl);
      const response = await fetch(statusUrl);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get replication status (${response.status}): ${errorText}`);
      }

      const result = await response.json();
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
            <div><strong>Target:</strong> ${this.getConnectionName(config.targetConnectionId)}</div>
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
      const response = await fetch(`${API_BASE}/storage/connections`);
      if (!response.ok) {
        throw new Error(`Failed to fetch connections: ${response.statusText}`);
      }

      const connections = await response.json();
      if (Array.isArray(connections)) {
        this.state.connections = connections.map(conn => ({
          id: conn.id,
          name: conn.name,
          connectionString: '', // Connection string will be fetched when needed
          description: conn.description || '',
          isAzure: conn.serverType === 'azure-sql',
          isTargetDatabase: false, // This will be handled differently
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
      const stored = localStorage.getItem('saved-sql-scripts');
      if (stored) {
        this.state.sqlScripts = JSON.parse(stored);
      }
    } catch (error) {
      this.log('Failed to load SQL scripts from storage');
      this.state.sqlScripts = [];
    }
  }

  private async loadConfigurations() {
    try {
      // For now, still use localStorage but add server API as future enhancement
      const stored = localStorage.getItem('replication-configurations');
      if (stored) {
        this.state.configurations = JSON.parse(stored);
        this.log(`Loaded ${this.state.configurations.length} configurations from localStorage`);
      }
    } catch (error) {
      this.log('Failed to load configurations from storage');
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
        serverType: connection.isAzure ? 'azure-sql' : 'sqlserver'
      };

      const response = await fetch(`${API_BASE}/storage/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error: ${errorText}`);
      }

      const savedConnection = await response.json();
      
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
        serverType: connection.isAzure ? 'azure-sql' : 'sqlserver'
      };

      const response = await fetch(`${API_BASE}/storage/connections/${connectionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error: ${errorText}`);
      }

      const savedConnection = await response.json();
      
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
      const index = this.state.sqlScripts.findIndex(s => s.id === script.id);
      if (index >= 0) {
        this.state.sqlScripts[index] = script;
      } else {
        this.state.sqlScripts.push(script);
      }
      
      localStorage.setItem('saved-sql-scripts', JSON.stringify(this.state.sqlScripts));
    } catch (error) {
      throw new Error('Failed to save SQL script to storage');
    }
  }

  private async saveConfigurationToStorage(config: StoredConfiguration) {
    try {
      const index = this.state.configurations.findIndex(c => c.id === config.id);
      if (index >= 0) {
        this.state.configurations[index] = config;
      } else {
        this.state.configurations.push(config);
      }
      
      localStorage.setItem('replication-configurations', JSON.stringify(this.state.configurations));
      this.log(`Configuration "${config.name}" saved to localStorage`);
    } catch (error) {
      throw new Error('Failed to save configuration to storage');
    }
  }

  private async updateConfigurationToStorage(configId: string, config: StoredConfiguration) {
    try {
      const index = this.state.configurations.findIndex(c => c.id === configId);
      if (index >= 0) {
        this.state.configurations[index] = config;
      } else {
        // Fallback: add if not found (shouldn't happen in normal flow)
        this.state.configurations.push(config);
      }
      
      localStorage.setItem('replication-configurations', JSON.stringify(this.state.configurations));
      this.log(`Configuration "${config.name}" updated in localStorage`);
    } catch (error) {
      throw new Error('Failed to update configuration in storage');
    }
  }

  // Public methods for onclick handlers
  public async editConnection(connectionId: string) {
    const connection = this.state.connections.find(c => c.id === connectionId);
    if (!connection) return;

    try {
      // Fetch the full connection details (decrypted from server)
      const response = await fetch(`${API_BASE}/storage/connections/${connectionId}`);
      if (response.ok) {
        const serverConnection = await response.json();
        
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
        const errorText = await response.text();
        this.showError(`Could not fetch connection details: ${errorText}`);
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
      const response = await fetch(`${API_BASE}/storage/connections/${connectionId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error: ${errorText}`);
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
      this.state.sqlScripts = this.state.sqlScripts.filter(s => s.id !== scriptId);
      localStorage.setItem('saved-sql-scripts', JSON.stringify(this.state.sqlScripts));
      this.updateUI();
      this.log(`Script "${script.name}" deleted successfully`);
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
        if (this.elements.targetConnection) this.elements.targetConnection.value = config.targetConnectionId;
        if (this.elements.createTargetDatabase) this.elements.createTargetDatabase.checked = config.createTargetDatabase;
        
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
    const config = this.state.configurations.find(c => c.id === configId);
    if (!config) return;

    if (!confirm(`Are you sure you want to delete the configuration "${config.name}"?`)) return;

    try {
      this.state.configurations = this.state.configurations.filter(c => c.id !== configId);
      localStorage.setItem('replication-configurations', JSON.stringify(this.state.configurations));
      
      // Clear selection if this config was selected
      if (this.state.selectedConfigId === configId) {
        this.state.selectedConfigId = null;
        this.elements.selectedConfigSelect.value = '';
        this.elements.configDetails.style.display = 'none';
      }
      
      this.updateUI();
      this.log(`Configuration "${config.name}" deleted successfully`);
    } catch (error) {
      this.showError(`Failed to delete configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Utility Methods
  private hideAllModals() {
    this.hideConnectionModal();
    this.hideSqlScriptModal();
    this.hideConfigModal();
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