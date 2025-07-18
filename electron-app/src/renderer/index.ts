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
        getReplicationStatus: (jobId: string) => Promise<any>;
        cancelReplication: (jobId: string) => Promise<any>;
      };
    };
  }
}

// Interfaces
interface AppState {
  isConnected: boolean;
  isReplicating: boolean;
  currentJobId: string | null;
  scripts: string[];
  activeTab: string;
  configMode: 'manual' | 'saved';
}

interface ConnectionInfo {
  id: string;
  name: string;
  description?: string;
  serverType: 'sqlserver' | 'azure-sql';
  serverName?: string;
  databaseName?: string;
  createdAt: string;
  updatedAt: string;
  lastUsed?: string;
}

interface StoredScript {
  id: string;
  name: string;
  description?: string;
  content: string;
  language: 'sql' | 'javascript' | 'typescript';
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

interface StoredTarget {
  id: string;
  name: string;
  description?: string;
  targetType: 'sqlite' | 'sqlserver';
  configuration: {
    filePath?: string;
    connectionId?: string;
    overwriteExisting?: boolean;
    backupBefore?: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

interface StoredReplicationConfig {
  id: string;
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
  createdAt: string;
  updatedAt: string;
  lastRun?: string;
}

class DataReplicatorUI {
  private state: AppState = {
    isConnected: false,
    isReplicating: false,
    currentJobId: null,
    scripts: [],
    activeTab: 'connections',
    configMode: 'manual'
  };

  private currentEditItem: any = null;
  private currentEditType: string = '';

  private elements = {
    connectionString: document.getElementById('connectionString') as HTMLTextAreaElement,
    testConnectionBtn: document.getElementById('testConnectionBtn') as HTMLButtonElement,
    saveCurrentConnectionBtn: document.getElementById('saveCurrentConnectionBtn') as HTMLButtonElement,
    savedConnectionSelect: document.getElementById('savedConnectionSelect') as HTMLSelectElement,
    targetType: document.getElementById('targetType') as HTMLSelectElement,
    targetFilePath: document.getElementById('targetFilePath') as HTMLInputElement,
    selectFileBtn: document.getElementById('selectFileBtn') as HTMLButtonElement,
    targetConnectionString: document.getElementById('targetConnectionString') as HTMLTextAreaElement,
    savedTargetConnectionSelect: document.getElementById('savedTargetConnectionSelect') as HTMLSelectElement,
    sqliteTarget: document.getElementById('sqliteTarget') as HTMLDivElement,
    sqlserverTarget: document.getElementById('sqlserverTarget') as HTMLDivElement,
    overwriteExisting: document.getElementById('overwriteExisting') as HTMLInputElement,
    backupBefore: document.getElementById('backupBefore') as HTMLInputElement,
    createNewDatabase: document.getElementById('createNewDatabase') as HTMLInputElement,
    includeData: document.getElementById('includeData') as HTMLInputElement,
    includeSchema: document.getElementById('includeSchema') as HTMLInputElement,
    scriptList: document.getElementById('scriptList') as HTMLDivElement,
    addScriptBtn: document.getElementById('addScriptBtn') as HTMLButtonElement,
    startReplicationBtn: document.getElementById('startReplicationBtn') as HTMLButtonElement,
    cancelReplicationBtn: document.getElementById('cancelReplicationBtn') as HTMLButtonElement,
    progressContainer: document.getElementById('progressContainer') as HTMLDivElement,
    progressFill: document.getElementById('progressFill') as HTMLDivElement,
    progressText: document.getElementById('progressText') as HTMLDivElement,
    statusMessage: document.getElementById('statusMessage') as HTMLDivElement,
    logs: document.getElementById('logs') as HTMLDivElement,
    clearLogsBtn: document.getElementById('clearLogsBtn') as HTMLButtonElement,
    appInfo: document.getElementById('appInfo') as HTMLSpanElement,
    connectionStatus: document.getElementById('connectionStatus') as HTMLSpanElement,
    loadingOverlay: document.getElementById('loadingOverlay') as HTMLDivElement,
    
    tabButtons: document.querySelectorAll('.tab-button'),
    tabContents: document.querySelectorAll('.tab-content'),
    
    addConnectionBtn: document.getElementById('addConnectionBtn') as HTMLButtonElement,
    addStoredScriptBtn: document.getElementById('addStoredScriptBtn') as HTMLButtonElement,
    addTargetBtn: document.getElementById('addTargetBtn') as HTMLButtonElement,
    addConfigBtn: document.getElementById('addConfigBtn') as HTMLButtonElement,
    connectionsList: document.getElementById('connectionsList') as HTMLDivElement,
    storedScriptsList: document.getElementById('storedScriptsList') as HTMLDivElement,
    targetsList: document.getElementById('targetsList') as HTMLDivElement,
    configsList: document.getElementById('configsList') as HTMLDivElement,
    
    configModeRadios: document.querySelectorAll('input[name="configMode"]'),
    manualConfig: document.getElementById('manualConfig') as HTMLDivElement,
    savedConfig: document.getElementById('savedConfig') as HTMLDivElement,
    savedConfigSelect: document.getElementById('savedConfigSelect') as HTMLSelectElement,
    selectedConfigDetails: document.getElementById('selectedConfigDetails') as HTMLDivElement,
    configSource: document.getElementById('configSource') as HTMLSpanElement,
    configTarget: document.getElementById('configTarget') as HTMLSpanElement,
    configScripts: document.getElementById('configScripts') as HTMLSpanElement,
    configLastRun: document.getElementById('configLastRun') as HTMLSpanElement,
    
    modalOverlay: document.getElementById('modalOverlay') as HTMLDivElement,
    modalTitle: document.getElementById('modalTitle') as HTMLHeadingElement,
    modalBody: document.getElementById('modalBody') as HTMLDivElement,
    modalCloseBtn: document.getElementById('modalCloseBtn') as HTMLButtonElement,
    modalCancelBtn: document.getElementById('modalCancelBtn') as HTMLButtonElement,
    modalSaveBtn: document.getElementById('modalSaveBtn') as HTMLButtonElement
  };

  constructor() {
    this.initializeEventListeners();
    this.loadAppInfo();
    this.loadStorageData();
    this.updateManualTargetTypeDisplay(); // Initialize target type display
    this.updateUI();
  }

  private initializeEventListeners(): void {
    this.elements.tabButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const target = e.target as HTMLButtonElement;
        const tabName = target.getAttribute('data-tab');
        if (tabName) {
          this.switchTab(tabName);
        }
      });
    });

    this.elements.testConnectionBtn.addEventListener('click', () => this.testConnection());
    this.elements.saveCurrentConnectionBtn.addEventListener('click', () => this.saveCurrentConnection());
    this.elements.savedConnectionSelect.addEventListener('change', () => this.loadSavedConnection());

    this.elements.addConnectionBtn.addEventListener('click', () => this.showConnectionForm());
    this.elements.addStoredScriptBtn.addEventListener('click', () => this.showScriptForm());
    this.elements.addTargetBtn.addEventListener('click', () => this.showTargetForm());
    this.elements.addConfigBtn.addEventListener('click', () => this.showConfigForm());

    this.elements.configModeRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        this.state.configMode = target.value as 'manual' | 'saved';
        this.updateConfigMode();
      });
    });

    this.elements.savedConfigSelect.addEventListener('change', () => this.loadSelectedConfig());

    this.elements.targetType.addEventListener('change', () => this.updateManualTargetTypeDisplay());
    this.elements.selectFileBtn.addEventListener('click', () => this.selectTargetFile());
    this.elements.savedTargetConnectionSelect.addEventListener('change', () => this.loadSavedTargetConnection());

    this.elements.addScriptBtn.addEventListener('click', () => this.addScript());

    this.elements.startReplicationBtn.addEventListener('click', () => this.startReplication());
    this.elements.cancelReplicationBtn.addEventListener('click', () => this.cancelReplication());

    this.elements.clearLogsBtn.addEventListener('click', () => this.clearLogs());

    this.elements.connectionString.addEventListener('input', () => this.validateForm());

    this.elements.modalCloseBtn.addEventListener('click', () => this.hideModal());
    this.elements.modalCancelBtn.addEventListener('click', () => this.hideModal());
    this.elements.modalSaveBtn.addEventListener('click', () => this.saveModalForm());
    this.elements.modalOverlay.addEventListener('click', (e) => {
      if (e.target === this.elements.modalOverlay) {
        this.hideModal();
      }
    });
  }

  private switchTab(tabName: string): void {
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

    this.loadTabData(tabName);
  }

  private async loadTabData(tabName: string): Promise<void> {
    switch (tabName) {
      case 'connections':
        await this.loadConnections();
        break;
      case 'scripts':
        await this.loadStoredScripts();
        break;
      case 'targets':
        await this.loadTargets();
        break;
      case 'configs':
        await this.loadConfigs();
        break;
    }
  }

  private async loadStorageData(): Promise<void> {
    await this.loadConnections();
    await this.loadStoredScripts();
    await this.loadTargets();
    await this.loadConfigs();
    await this.populateDropdowns();
  }

  private async loadConnections(): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/storage/connections`);
      const connections: ConnectionInfo[] = await response.json();
      this.renderConnections(connections);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error loading connections: ${errorMessage}`, 'error');
    }
  }

  private async loadStoredScripts(): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/storage/scripts`);
      const scripts: StoredScript[] = await response.json();
      this.renderStoredScripts(scripts);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error loading scripts: ${errorMessage}`, 'error');
    }
  }

  private async loadTargets(): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/storage/targets`);
      const targets: StoredTarget[] = await response.json();
      this.renderTargets(targets);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error loading targets: ${errorMessage}`, 'error');
    }
  }

  private async loadConfigs(): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/storage/replication-configs`);
      const configs: StoredReplicationConfig[] = await response.json();
      this.renderConfigs(configs);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error loading replication configs: ${errorMessage}`, 'error');
    }
  }

  private renderConnections(connections: ConnectionInfo[]): void {
    const container = this.elements.connectionsList;
    
    if (connections.length === 0) {
      container.innerHTML = '<div class="empty-state">No saved connections</div>';
      return;
    }

    container.innerHTML = connections.map(conn => `
      <div class="storage-item" data-id="${conn.id}">
        <div class="storage-item-header">
          <div>
            <h4 class="storage-item-title">${this.escapeHtml(conn.name)}</h4>
            <div class="storage-item-meta">
              <span class="connection-type-badge ${conn.serverType}">${conn.serverType.toUpperCase()}</span>
              ${conn.lastUsed ? `Last used: ${this.formatDate(conn.lastUsed)}` : 'Never used'}
            </div>
          </div>
        </div>
        ${conn.description ? `<div class="storage-item-description">${this.escapeHtml(conn.description)}</div>` : ''}
        <div class="storage-item-details">
          ${conn.serverName ? `<div class="storage-item-detail"><label>Server</label><span>${this.escapeHtml(conn.serverName)}</span></div>` : ''}
          ${conn.databaseName ? `<div class="storage-item-detail"><label>Database</label><span>${this.escapeHtml(conn.databaseName)}</span></div>` : ''}
          <div class="storage-item-detail"><label>Created</label><span>${this.formatDate(conn.createdAt)}</span></div>
        </div>
        <div class="storage-item-actions">
          <button class="btn btn-secondary" onclick="dataReplicatorUI.testStoredConnection('${conn.id}')">Test</button>
          <button class="btn btn-secondary" onclick="dataReplicatorUI.editConnection('${conn.id}')">Edit</button>
          <button class="btn btn-danger" onclick="dataReplicatorUI.deleteConnection('${conn.id}')">Delete</button>
        </div>
      </div>
    `).join('');
  }

  private renderStoredScripts(scripts: StoredScript[]): void {
    const container = this.elements.storedScriptsList;
    
    if (scripts.length === 0) {
      container.innerHTML = '<div class="empty-state">No saved scripts</div>';
      return;
    }

    container.innerHTML = scripts.map(script => `
      <div class="storage-item" data-id="${script.id}">
        <div class="storage-item-header">
          <div>
            <h4 class="storage-item-title">${this.escapeHtml(script.name)}</h4>
            <div class="storage-item-meta">
              <span class="language-badge ${script.language}">${script.language.toUpperCase()}</span>
              Created: ${this.formatDate(script.createdAt)}
            </div>
          </div>
        </div>
        ${script.description ? `<div class="storage-item-description">${this.escapeHtml(script.description)}</div>` : ''}
        <div class="storage-item-details">
          <div class="storage-item-detail"><label>Content Length</label><span>${script.content.length} characters</span></div>
          ${script.tags && script.tags.length > 0 ? `<div class="storage-item-detail"><label>Tags</label><span>${script.tags.join(', ')}</span></div>` : ''}
          <div class="storage-item-detail"><label>Updated</label><span>${this.formatDate(script.updatedAt)}</span></div>
        </div>
        <div class="storage-item-actions">
          <button class="btn btn-secondary" onclick="dataReplicatorUI.viewScript('${script.id}')">View</button>
          <button class="btn btn-secondary" onclick="dataReplicatorUI.editScript('${script.id}')">Edit</button>
          <button class="btn btn-danger" onclick="dataReplicatorUI.deleteScript('${script.id}')">Delete</button>
        </div>
      </div>
    `).join('');
  }

  private renderTargets(targets: StoredTarget[]): void {
    const container = this.elements.targetsList;
    
    if (targets.length === 0) {
      container.innerHTML = '<div class="empty-state">No saved targets</div>';
      return;
    }

    container.innerHTML = targets.map(target => `
      <div class="storage-item" data-id="${target.id}">
        <div class="storage-item-header">
          <div>
            <h4 class="storage-item-title">${this.escapeHtml(target.name)}</h4>
            <div class="storage-item-meta">
              <span class="target-type-badge ${target.targetType}">${target.targetType.toUpperCase()}</span>
              Created: ${this.formatDate(target.createdAt)}
            </div>
          </div>
        </div>
        ${target.description ? `<div class="storage-item-description">${this.escapeHtml(target.description)}</div>` : ''}
        <div class="storage-item-details">
          ${target.configuration.filePath ? `<div class="storage-item-detail"><label>File Path</label><span>${this.escapeHtml(target.configuration.filePath)}</span></div>` : ''}
          ${target.configuration.connectionId ? `<div class="storage-item-detail"><label>Connection</label><span>Linked connection</span></div>` : ''}
          <div class="storage-item-detail"><label>Overwrite</label><span>${target.configuration.overwriteExisting ? 'Yes' : 'No'}</span></div>
          <div class="storage-item-detail"><label>Backup</label><span>${target.configuration.backupBefore ? 'Yes' : 'No'}</span></div>
        </div>
        <div class="storage-item-actions">
          <button class="btn btn-secondary" onclick="dataReplicatorUI.editTarget('${target.id}')">Edit</button>
          <button class="btn btn-danger" onclick="dataReplicatorUI.deleteTarget('${target.id}')">Delete</button>
        </div>
      </div>
    `).join('');
  }

  private renderConfigs(configs: StoredReplicationConfig[]): void {
    const container = this.elements.configsList;
    
    if (configs.length === 0) {
      container.innerHTML = '<div class="empty-state">No saved configurations</div>';
      return;
    }

    container.innerHTML = configs.map(config => `
      <div class="storage-item" data-id="${config.id}">
        <div class="storage-item-header">
          <div>
            <h4 class="storage-item-title">${this.escapeHtml(config.name)}</h4>
            <div class="storage-item-meta">
              ${config.lastRun ? `Last run: ${this.formatDate(config.lastRun)}` : 'Never run'}
            </div>
          </div>
        </div>
        ${config.description ? `<div class="storage-item-description">${this.escapeHtml(config.description)}</div>` : ''}
        <div class="storage-item-details">
          <div class="storage-item-detail"><label>Scripts</label><span>${config.configScriptIds.length} script(s)</span></div>
          <div class="storage-item-detail"><label>Include Data</label><span>${config.settings.includeData !== false ? 'Yes' : 'No'}</span></div>
          <div class="storage-item-detail"><label>Include Schema</label><span>${config.settings.includeSchema !== false ? 'Yes' : 'No'}</span></div>
          <div class="storage-item-detail"><label>Created</label><span>${this.formatDate(config.createdAt)}</span></div>
        </div>
        <div class="storage-item-actions">
          <button class="btn btn-primary" onclick="dataReplicatorUI.runStoredConfig('${config.id}')">Run</button>
          <button class="btn btn-secondary" onclick="dataReplicatorUI.editConfig('${config.id}')">Edit</button>
          <button class="btn btn-danger" onclick="dataReplicatorUI.deleteConfig('${config.id}')">Delete</button>
        </div>
      </div>
    `).join('');
  }

  private showModal(title: string, content: string): void {
    this.elements.modalTitle.textContent = title;
    this.elements.modalBody.innerHTML = content;
    this.elements.modalOverlay.style.display = 'flex';
  }

  private hideModal(): void {
    this.elements.modalOverlay.style.display = 'none';
    this.currentEditItem = null;
    this.currentEditType = '';
  }

  private showConnectionForm(connection?: ConnectionInfo): void {
    this.currentEditItem = connection;
    this.currentEditType = 'connection';
    
    const title = connection ? 'Edit Connection' : 'Add Connection';
    const form = `
      <form class="modal-form" id="connectionForm">
        <div class="form-group">
          <label for="connName">Name *</label>
          <input type="text" id="connName" required value="${connection?.name || ''}">
        </div>
        <div class="form-group">
          <label for="connDescription">Description</label>
          <textarea id="connDescription" placeholder="Optional description">${connection?.description || ''}</textarea>
        </div>
        <div class="form-group">
          <label for="connServerType">Server Type *</label>
          <select id="connServerType" required>
            <option value="sqlserver" ${connection?.serverType === 'sqlserver' ? 'selected' : ''}>SQL Server</option>
            <option value="azure-sql" ${connection?.serverType === 'azure-sql' ? 'selected' : ''}>Azure SQL</option>
          </select>
        </div>
        <div class="form-group">
          <label for="connString">Connection String *</label>
          <textarea id="connString" required placeholder="Server=...;Database=...;" rows="3"></textarea>
        </div>
      </form>
    `;
    
    this.showModal(title, form);
  }

  private showScriptForm(script?: StoredScript): void {
    this.currentEditItem = script;
    this.currentEditType = 'script';
    
    const title = script ? 'Edit Script' : 'Add Script';
    const form = `
      <form class="modal-form" id="scriptForm">
        <div class="form-row">
          <div class="form-group">
            <label for="scriptName">Name *</label>
            <input type="text" id="scriptName" required value="${script?.name || ''}">
          </div>
          <div class="form-group">
            <label for="scriptLanguage">Language *</label>
            <select id="scriptLanguage" required>
              <option value="sql" ${script?.language === 'sql' ? 'selected' : ''}>SQL</option>
              <option value="javascript" ${script?.language === 'javascript' ? 'selected' : ''}>JavaScript</option>
              <option value="typescript" ${script?.language === 'typescript' ? 'selected' : ''}>TypeScript</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label for="scriptDescription">Description</label>
          <textarea id="scriptDescription" placeholder="Optional description">${script?.description || ''}</textarea>
        </div>
        <div class="form-group">
          <label for="scriptContent">Content *</label>
          <textarea id="scriptContent" class="script-editor" required placeholder="Enter your script content...">${script?.content || ''}</textarea>
        </div>
        <div class="form-group">
          <label>Tags</label>
          <div class="tag-input" id="scriptTags">
            ${script?.tags?.map(tag => `
              <span class="tag">${this.escapeHtml(tag)}<button type="button" class="tag-remove" onclick="this.parentElement.remove()">&times;</button></span>
            `).join('') || ''}
            <input type="text" class="tag-input-field" placeholder="Add tag and press Enter..." onkeydown="dataReplicatorUI.handleTagInput(event)">
          </div>
        </div>
      </form>
    `;
    
    this.showModal(title, form);
  }

  private showTargetForm(target?: StoredTarget): void {
    this.currentEditItem = target;
    this.currentEditType = 'target';
    
    const title = target ? 'Edit Target' : 'Add Target';
    const form = `
      <form class="modal-form" id="targetForm">
        <div class="form-row">
          <div class="form-group">
            <label for="targetName">Name *</label>
            <input type="text" id="targetName" required value="${target?.name || ''}">
          </div>
          <div class="form-group">
            <label for="targetType">Target Type *</label>
            <select id="targetType" required onchange="dataReplicatorUI.updateTargetTypeFields(this.value)">
              <option value="sqlite" ${target?.targetType === 'sqlite' ? 'selected' : ''}>SQLite</option>
              <option value="sqlserver" ${target?.targetType === 'sqlserver' ? 'selected' : ''}>SQL Server</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label for="targetDescription">Description</label>
          <textarea id="targetDescription" placeholder="Optional description">${target?.description || ''}</textarea>
        </div>
        <div id="sqliteFields" class="form-group" style="display: ${target?.targetType === 'sqlite' ? 'block' : 'none'}">
          <label for="targetFilePath">SQLite File Path *</label>
          <input type="text" id="targetFilePath" placeholder="path/to/database.sqlite" value="${target?.configuration.filePath || ''}">
        </div>
        <div id="sqlserverFields" class="form-group" style="display: ${target?.targetType === 'sqlserver' ? 'block' : 'none'}">
          <label for="targetConnectionId">Connection *</label>
          <select id="targetConnectionId">
            <option value="">Select a connection...</option>
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>
              <input type="checkbox" id="targetOverwrite" ${target?.configuration.overwriteExisting ? 'checked' : ''}>
              Overwrite existing data
            </label>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" id="targetBackup" ${target?.configuration.backupBefore ? 'checked' : ''}>
              Backup before replication
            </label>
          </div>
        </div>
      </form>
    `;
    
    this.showModal(title, form);
    this.populateConnectionDropdown('targetConnectionId', target?.configuration.connectionId);
  }

  private showConfigForm(config?: StoredReplicationConfig): void {
    this.currentEditItem = config;
    this.currentEditType = 'config';
    
    const title = config ? 'Edit Configuration' : 'Add Configuration';
    const form = `
      <form class="modal-form" id="configForm">
        <div class="form-group">
          <label for="configName">Name *</label>
          <input type="text" id="configName" required value="${config?.name || ''}">
        </div>
        <div class="form-group">
          <label for="configDescription">Description</label>
          <textarea id="configDescription" placeholder="Optional description">${config?.description || ''}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="configSourceConnection">Source Connection *</label>
            <select id="configSourceConnection" required>
              <option value="">Select source connection...</option>
            </select>
          </div>
          <div class="form-group">
            <label for="configTarget">Target *</label>
            <select id="configTarget" required>
              <option value="">Select target...</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label for="configScripts">Configuration Scripts</label>
          <select id="configScripts" multiple style="height: 120px;">
          </select>
          <small>Hold Ctrl/Cmd to select multiple scripts</small>
        </div>
        <div class="form-group">
          <label>Replication Settings</label>
          <div class="form-row">
            <label>
              <input type="checkbox" id="configIncludeData" ${config?.settings.includeData !== false ? 'checked' : ''}>
              Include Data
            </label>
            <label>
              <input type="checkbox" id="configIncludeSchema" ${config?.settings.includeSchema !== false ? 'checked' : ''}>
              Include Schema
            </label>
          </div>
        </div>
        <div class="form-group">
          <label for="configBatchSize">Batch Size</label>
          <input type="number" id="configBatchSize" min="1" max="10000" placeholder="1000" value="${config?.settings.batchSize || ''}">
        </div>
      </form>
    `;
    
    this.showModal(title, form);
    this.populateConfigFormDropdowns(config);
  }

  private async loadSavedConnection(): Promise<void> {
    const selectedId = this.elements.savedConnectionSelect.value;
    if (!selectedId) {
      this.elements.connectionString.value = '';
      return;
    }

    try {
      const connectionString = await fetch(`${API_BASE}/storage/connections/${selectedId}/connection-string`);
      if (connectionString.ok) {
        const data = await connectionString.text();
        this.elements.connectionString.value = data;
        this.validateForm();
        this.log('Loaded saved connection', 'info');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error loading saved connection: ${errorMessage}`, 'error');
    }
  }

  private async loadSelectedConfig(): Promise<void> {
    const selectedId = this.elements.savedConfigSelect.value;
    if (!selectedId) {
      this.elements.selectedConfigDetails.style.display = 'none';
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/storage/replication-configs/${selectedId}`);
      if (response.ok) {
        const config: StoredReplicationConfig = await response.json();
        
        // Load related data for display
        const [connectionRes, targetRes] = await Promise.all([
          fetch(`${API_BASE}/storage/connections/${config.sourceConnectionId}`),
          fetch(`${API_BASE}/storage/targets/${config.targetId}`)
        ]);

        const connection: ConnectionInfo = await connectionRes.json();
        const target: StoredTarget = await targetRes.json();

        // Update display
        this.elements.configSource.textContent = `${connection.name} (${connection.serverName || 'Unknown'})`;
        this.elements.configTarget.textContent = `${target.name} (${target.targetType})`;
        this.elements.configScripts.textContent = `${config.configScriptIds.length} script(s)`;
        this.elements.configLastRun.textContent = config.lastRun ? this.formatDate(config.lastRun) : 'Never';
        
        this.elements.selectedConfigDetails.style.display = 'block';
        this.validateForm();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error loading selected config: ${errorMessage}`, 'error');
    }
  }

  private async populateDropdowns(): Promise<void> {
    await this.populateConnectionSelect();
    await this.populateConfigSelect();
  }

  private async populateConnectionSelect(): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/storage/connections`);
      const connections: ConnectionInfo[] = await response.json();
      
      // Populate saved connection dropdown
      this.elements.savedConnectionSelect.innerHTML = '<option value="">Use saved connection...</option>';
      connections.forEach(conn => {
        const option = document.createElement('option');
        option.value = conn.id;
        option.textContent = `${conn.name} (${conn.serverName || 'Unknown server'})`;
        this.elements.savedConnectionSelect.appendChild(option);
      });

      // Populate saved target connection dropdown
      this.elements.savedTargetConnectionSelect.innerHTML = '<option value="">Use saved connection...</option>';
      connections.forEach(conn => {
        const option = document.createElement('option');
        option.value = conn.id;
        option.textContent = `${conn.name} (${conn.serverName || 'Unknown server'})`;
        this.elements.savedTargetConnectionSelect.appendChild(option);
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error loading connections for dropdown: ${errorMessage}`, 'error');
    }
  }

  private async populateConfigSelect(): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/storage/replication-configs`);
      const configs: StoredReplicationConfig[] = await response.json();
      
      this.elements.savedConfigSelect.innerHTML = '<option value="">Choose a saved configuration...</option>';
      configs.forEach(config => {
        const option = document.createElement('option');
        option.value = config.id;
        option.textContent = config.name;
        this.elements.savedConfigSelect.appendChild(option);
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error loading configs for dropdown: ${errorMessage}`, 'error');
    }
  }

  private async populateConnectionDropdown(selectId: string, selectedValue?: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/storage/connections`);
      const connections: ConnectionInfo[] = await response.json();
      
      const select = document.getElementById(selectId) as HTMLSelectElement;
      select.innerHTML = '<option value="">Select a connection...</option>';
      
      connections.forEach(conn => {
        const option = document.createElement('option');
        option.value = conn.id;
        option.textContent = `${conn.name} (${conn.serverName || 'Unknown'})`;
        if (selectedValue === conn.id) {
          option.selected = true;
        }
        select.appendChild(option);
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error populating connection dropdown: ${errorMessage}`, 'error');
    }
  }

  private async populateConfigFormDropdowns(config?: StoredReplicationConfig): Promise<void> {
    try {
      // Load connections
      const connectionsResponse = await fetch(`${API_BASE}/storage/connections`);
      const connections: ConnectionInfo[] = await connectionsResponse.json();
      
      const sourceSelect = document.getElementById('configSourceConnection') as HTMLSelectElement;
      sourceSelect.innerHTML = '<option value="">Select source connection...</option>';
      connections.forEach(conn => {
        const option = document.createElement('option');
        option.value = conn.id;
        option.textContent = `${conn.name} (${conn.serverName || 'Unknown'})`;
        if (config?.sourceConnectionId === conn.id) {
          option.selected = true;
        }
        sourceSelect.appendChild(option);
      });

      // Load targets
      const targetsResponse = await fetch(`${API_BASE}/storage/targets`);
      const targets: StoredTarget[] = await targetsResponse.json();
      
      const targetSelect = document.getElementById('configTarget') as HTMLSelectElement;
      targetSelect.innerHTML = '<option value="">Select target...</option>';
      targets.forEach(target => {
        const option = document.createElement('option');
        option.value = target.id;
        option.textContent = `${target.name} (${target.targetType})`;
        if (config?.targetId === target.id) {
          option.selected = true;
        }
        targetSelect.appendChild(option);
      });

      // Load scripts
      const scriptsResponse = await fetch(`${API_BASE}/storage/scripts`);
      const scripts: StoredScript[] = await scriptsResponse.json();
      
      const scriptsSelect = document.getElementById('configScripts') as HTMLSelectElement;
      scriptsSelect.innerHTML = '';
      scripts.forEach(script => {
        const option = document.createElement('option');
        option.value = script.id;
        option.textContent = `${script.name} (${script.language})`;
        if (config?.configScriptIds.includes(script.id)) {
          option.selected = true;
        }
        scriptsSelect.appendChild(option);
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error populating config form dropdowns: ${errorMessage}`, 'error');
    }
  }

  private async testConnection(): Promise<void> {
    const connectionString = this.elements.connectionString.value.trim();
    
    if (!connectionString) {
      this.log('Please enter a connection string', 'error');
      return;
    }

    this.showLoading(true);
    this.elements.testConnectionBtn.disabled = true;

    try {
      this.log('Testing database connection...', 'info');
      
      const response = await fetch(`${API_BASE}/replication/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionString })
      });

      if (response.ok) {
        const result = await response.json();
        this.state.isConnected = true;
        this.log(`Connection successful! Database: ${result.data.serverInfo.databaseName}`, 'success');
        this.log(`Found ${result.data.tables.length} tables`, 'info');
        this.elements.connectionStatus.textContent = 'Connected';
        this.elements.connectionStatus.className = 'status-connected';
      } else {
        const error = await response.text();
        this.state.isConnected = false;
        this.log(`Connection failed: ${error}`, 'error');
        this.elements.connectionStatus.textContent = 'Connection Failed';
        this.elements.connectionStatus.className = 'status-disconnected';
      }
    } catch (error) {
      this.state.isConnected = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Connection error: ${errorMessage}`, 'error');
      this.elements.connectionStatus.textContent = 'Connection Error';
      this.elements.connectionStatus.className = 'status-disconnected';
    } finally {
      this.showLoading(false);
      this.elements.testConnectionBtn.disabled = false;
      this.updateUI();
    }
  }

  private async saveCurrentConnection(): Promise<void> {
    const connectionString = this.elements.connectionString.value.trim();
    if (!connectionString) {
      this.log('Please enter a connection string first', 'error');
      return;
    }

    // Create a simple form to get name and type
    const name = prompt('Enter a name for this connection:');
    if (!name) return;

    const serverType = confirm('Is this an Azure SQL connection? (Cancel for SQL Server)') ? 'azure-sql' : 'sqlserver';

    try {
      const response = await fetch(`${API_BASE}/storage/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          serverType,
          connectionString
        })
      });

      if (response.ok) {
        this.populateDropdowns();
        this.log('Connection saved successfully', 'success');
      } else {
        const error = await response.text();
        this.log(`Failed to save connection: ${error}`, 'error');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error saving connection: ${errorMessage}`, 'error');
    }
  }

  private async addScript(): Promise<void> {
    // For manual script addition (file selection)
    try {
      const scriptPath = await window.electronAPI.selectFile();
      
      if (scriptPath) {
        this.state.scripts.push(scriptPath);
        this.updateScriptList();
        this.log(`Added script: ${scriptPath}`, 'info');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error adding script: ${errorMessage}`, 'error');
    }
  }

  private updateScriptList(): void {
    if (this.state.scripts.length === 0) {
      this.elements.scriptList.innerHTML = '<p class="empty-state">No scripts added</p>';
    } else {
      this.elements.scriptList.innerHTML = this.state.scripts
        .map((script, index) => {
          const fileName = script.split(/[/\\]/).pop();
          return `
            <div class="script-item">
              <span class="script-name">${fileName}</span>
              <button class="script-remove" onclick="dataReplicatorUI.removeScript(${index})">Remove</button>
            </div>
          `;
        })
        .join('');
    }
  }

  public removeScript(index: number): void {
    const removedScript = this.state.scripts[index];
    this.state.scripts.splice(index, 1);
    this.updateScriptList();
    this.log(`Removed script: ${removedScript}`, 'info');
  }

  private async startReplication(): Promise<void> {
    if (this.state.configMode === 'saved') {
      const configId = this.elements.savedConfigSelect.value;
      if (configId) {
        await this.runStoredConfig(configId);
      } else {
        this.log('Please select a configuration', 'error');
      }
      return;
    }

    // Manual replication
    const connectionString = this.elements.connectionString.value.trim();
    const targetType = this.elements.targetType.value;

    if (!connectionString) {
      this.log('Please enter a connection string', 'error');
      return;
    }

    // Build target configuration
    let targetConfig: any = {
      targetType,
      overwriteExisting: this.elements.overwriteExisting.checked,
      backupBefore: this.elements.backupBefore.checked,
      createNewDatabase: this.elements.createNewDatabase.checked
    };

    if (targetType === 'sqlite') {
      const filePath = this.elements.targetFilePath.value.trim();
      if (!filePath) {
        this.log('Please specify a SQLite database file path', 'error');
        return;
      }
      targetConfig.filePath = filePath;
    } else if (targetType === 'sqlserver') {
      const targetConnectionString = this.elements.targetConnectionString.value.trim();
      if (!targetConnectionString) {
        this.log('Please specify a target SQL Server connection string', 'error');
        return;
      }
      targetConfig.connectionString = targetConnectionString;
    }

    this.state.isReplicating = true;
    this.showLoading(true);
    this.updateUI();

    try {
      this.log('Starting database replication...', 'info');
      
      const config = {
        connectionString,
        target: targetConfig,
        configScripts: this.state.scripts,
        settings: {
          includeData: this.elements.includeData.checked,
          includeSchema: this.elements.includeSchema.checked
        }
      };

      const response = await fetch(`${API_BASE}/replication/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      if (response.ok) {
        const result = await response.json();
        this.state.currentJobId = result.data.jobId;
        this.log(`Replication started with job ID: ${result.data.jobId}`, 'success');
        this.elements.progressContainer.style.display = 'block';
        this.startProgressMonitoring();
      } else {
        const error = await response.text();
        throw new Error(error);
      }
    } catch (error) {
      this.state.isReplicating = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Failed to start replication: ${errorMessage}`, 'error');
      this.updateUI();
    } finally {
      this.showLoading(false);
    }
  }

  private async cancelReplication(): Promise<void> {
    if (!this.state.currentJobId) return;

    try {
      this.log('Cancelling replication...', 'info');
      
      const response = await fetch(`${API_BASE}/replication/cancel/${this.state.currentJobId}`, {
        method: 'POST'
      });

      if (response.ok) {
        this.log('Replication cancelled', 'warning');
      } else {
        const error = await response.text();
        this.log(`Failed to cancel replication: ${error}`, 'error');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error cancelling replication: ${errorMessage}`, 'error');
    }
  }

  private startProgressMonitoring(): void {
    if (!this.state.currentJobId) return;

    const monitorProgress = async () => {
      try {
        const response = await fetch(`${API_BASE}/replication/status/${this.state.currentJobId}`);
        
        if (response.ok) {
          const result = await response.json();
          const status = result.data;
          
          this.updateProgress(status.progress, status.message);
          
          if (status.status === 'completed') {
            this.state.isReplicating = false;
            this.state.currentJobId = null;
            this.log('Replication completed successfully!', 'success');
            this.elements.progressContainer.style.display = 'none';
            this.updateUI();
            return;
          }
          
          if (status.status === 'failed') {
            this.state.isReplicating = false;
            this.state.currentJobId = null;
            this.log(`Replication failed: ${status.error}`, 'error');
            this.elements.progressContainer.style.display = 'none';
            this.updateUI();
            return;
          }
          
          if (status.status === 'cancelled') {
            this.state.isReplicating = false;
            this.state.currentJobId = null;
            this.elements.progressContainer.style.display = 'none';
            this.updateUI();
            return;
          }
          
          // Continue monitoring if still running
          if (this.state.isReplicating) {
            setTimeout(monitorProgress, 2000);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.log(`Error monitoring progress: ${errorMessage}`, 'error');
        if (this.state.isReplicating) {
          setTimeout(monitorProgress, 5000); // Retry less frequently on error
        }
      }
    };

    setTimeout(monitorProgress, 1000);
  }

  private updateProgress(progress: number, message: string): void {
    this.elements.progressFill.style.width = `${progress}%`;
    this.elements.progressText.textContent = `${progress}%`;
    this.elements.statusMessage.textContent = message;
  }

  private async clearLogs(): Promise<void> {
    this.elements.logs.innerHTML = '';
  }

  private async updateConfigMode(): Promise<void> {
    if (this.state.configMode === 'manual') {
      this.elements.manualConfig.style.display = 'block';
      this.elements.savedConfig.style.display = 'none';
    } else {
      this.elements.manualConfig.style.display = 'none';
      this.elements.savedConfig.style.display = 'block';
    }
    this.validateForm();
  }

  public async updateTargetTypeFields(value: string): Promise<void> {
    const sqliteFields = document.getElementById('sqliteFields') as HTMLDivElement;
    const sqlserverFields = document.getElementById('sqlserverFields') as HTMLDivElement;
    
    if (value === 'sqlite') {
      sqliteFields.style.display = 'block';
      sqlserverFields.style.display = 'none';
    } else {
      sqliteFields.style.display = 'none';
      sqlserverFields.style.display = 'block';
    }
  }

  public async handleTagInput(event: KeyboardEvent): Promise<void> {
    if (event.key === 'Enter') {
      event.preventDefault();
      const input = event.target as HTMLInputElement;
      const tag = input.value.trim();
      
      if (tag) {
        const tagElement = document.createElement('span');
        tagElement.className = 'tag';
        tagElement.innerHTML = `${this.escapeHtml(tag)}<button type="button" class="tag-remove" onclick="this.parentElement.remove()">&times;</button>`;
        
        input.parentElement?.insertBefore(tagElement, input);
        input.value = '';
      }
    }
  }

  // Implement remaining CRUD operations for completeness
  public async editScript(id: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/storage/scripts/${id}`);
      const script: StoredScript = await response.json();
      this.showScriptForm(script);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error loading script: ${errorMessage}`, 'error');
    }
  }

  public async deleteScript(id: string): Promise<void> {
    if (!confirm('Are you sure you want to delete this script?')) return;
    
    try {
      const response = await fetch(`${API_BASE}/storage/scripts/${id}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        this.loadStoredScripts();
        this.log('Script deleted successfully', 'success');
      } else {
        const error = await response.text();
        this.log(`Failed to delete script: ${error}`, 'error');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error deleting script: ${errorMessage}`, 'error');
    }
  }

  public async viewScript(id: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/storage/scripts/${id}`);
      const script: StoredScript = await response.json();
      
      this.showModal(`View Script: ${script.name}`, `
        <div class="script-view">
          <div class="script-meta">
            <p><strong>Language:</strong> ${script.language}</p>
            <p><strong>Created:</strong> ${this.formatDate(script.createdAt)}</p>
            ${script.description ? `<p><strong>Description:</strong> ${this.escapeHtml(script.description)}</p>` : ''}
            ${script.tags && script.tags.length > 0 ? `<p><strong>Tags:</strong> ${script.tags.join(', ')}</p>` : ''}
          </div>
          <pre class="script-content">${this.escapeHtml(script.content)}</pre>
        </div>
      `);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error loading script: ${errorMessage}`, 'error');
    }
  }

  public async editTarget(id: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/storage/targets/${id}`);
      const target: StoredTarget = await response.json();
      this.showTargetForm(target);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error loading target: ${errorMessage}`, 'error');
    }
  }

  public async deleteTarget(id: string): Promise<void> {
    if (!confirm('Are you sure you want to delete this target?')) return;
    
    try {
      const response = await fetch(`${API_BASE}/storage/targets/${id}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        this.loadTargets();
        this.populateDropdowns();
        this.log('Target deleted successfully', 'success');
      } else {
        const error = await response.text();
        this.log(`Failed to delete target: ${error}`, 'error');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error deleting target: ${errorMessage}`, 'error');
    }
  }

  public async editConfig(id: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/storage/replication-configs/${id}`);
      const config: StoredReplicationConfig = await response.json();
      this.showConfigForm(config);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error loading config: ${errorMessage}`, 'error');
    }
  }

  public async deleteConfig(id: string): Promise<void> {
    if (!confirm('Are you sure you want to delete this configuration?')) return;
    
    try {
      const response = await fetch(`${API_BASE}/storage/replication-configs/${id}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        this.loadConfigs();
        this.populateDropdowns();
        this.log('Configuration deleted successfully', 'success');
      } else {
        const error = await response.text();
        this.log(`Failed to delete configuration: ${error}`, 'error');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error deleting configuration: ${errorMessage}`, 'error');
    }
  }

  private log(message: string, level: 'info' | 'error' | 'success' | 'warning' = 'info'): void {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.innerHTML = `
      <span class="log-timestamp">${timestamp}</span>
      <span class="log-level-${level}">${message}</span>
    `;
    
    this.elements.logs.appendChild(logEntry);
    this.elements.logs.scrollTop = this.elements.logs.scrollHeight;
  }

  private escapeHtml(html: string): string {
    const div = document.createElement('div');
    div.textContent = html;
    return div.innerHTML;
  }

  private formatDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString();
    } catch (error) {
      return dateStr;
    }
  }

  private validateForm(): void {
    const hasConnectionString = this.elements.connectionString.value.trim().length > 0;
    const hasSelectedConfig = this.state.configMode === 'saved' && this.elements.savedConfigSelect.value;
    
    let hasValidTarget = false;
    
    if (this.state.configMode === 'manual') {
      const targetType = this.elements.targetType.value;
      if (targetType === 'sqlite') {
        hasValidTarget = this.elements.targetFilePath.value.trim().length > 0;
      } else if (targetType === 'sqlserver') {
        hasValidTarget = this.elements.targetConnectionString.value.trim().length > 0;
      }
    }
    
    const canStart = (this.state.configMode === 'manual' && hasConnectionString && hasValidTarget) || 
                     (this.state.configMode === 'saved' && hasSelectedConfig);
    
    this.elements.startReplicationBtn.disabled = !canStart || this.state.isReplicating;
  }

  private showLoading(show: boolean): void {
    this.elements.loadingOverlay.style.display = show ? 'flex' : 'none';
  }

  private updateUI(): void {
    this.validateForm();
    this.elements.cancelReplicationBtn.disabled = !this.state.isReplicating;
    this.elements.startReplicationBtn.disabled = this.state.isReplicating;
  }

  public async runStoredConfig(id: string): Promise<void> {
    try {
      this.log(`Starting replication from stored configuration...`, 'info');
      
      const response = await fetch(`${API_BASE}/replication/start-stored`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configId: id })
      });
      
      if (response.ok) {
        const result = await response.json();
        this.state.currentJobId = result.data.jobId;
        this.state.isReplicating = true;
        this.log(`Replication started with job ID: ${result.data.jobId}`, 'success');
        this.elements.progressContainer.style.display = 'block';
        this.startProgressMonitoring();
        this.updateUI();
      } else {
        const error = await response.text();
        this.log(`Failed to start replication: ${error}`, 'error');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error starting replication: ${errorMessage}`, 'error');
    }
  }

  private async loadAppInfo(): Promise<void> {
    try {
      const appInfo = await window.electronAPI.getAppInfo();
      this.elements.appInfo.textContent = `${appInfo.name} v${appInfo.version}`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.log(`Error loading app info: ${errorMessage}`, 'error');
    }
  }

  private async saveModalForm(): Promise<void> {
    try {
      switch (this.currentEditType) {
        case 'connection':
          await this.saveConnectionForm();
          break;
        case 'script':
          await this.saveScriptForm();
          break;
        case 'target':
          await this.saveTargetForm();
          break;
        case 'config':
          await this.saveConfigForm();
          break;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error saving: ${errorMessage}`, 'error');
    }
  }

  private async saveConnectionForm(): Promise<void> {
    const nameEl = document.getElementById('connName') as HTMLInputElement;
    const descEl = document.getElementById('connDescription') as HTMLTextAreaElement;
    const typeEl = document.getElementById('connServerType') as HTMLSelectElement;
    const connStringEl = document.getElementById('connString') as HTMLTextAreaElement;

    const data = {
      name: nameEl.value.trim(),
      description: descEl.value.trim() || undefined,
      serverType: typeEl.value as 'sqlserver' | 'azure-sql',
      connectionString: connStringEl.value.trim()
    };

    if (!data.name || !data.connectionString) {
      this.log('Name and connection string are required', 'error');
      return;
    }

    const url = this.currentEditItem 
      ? `${API_BASE}/storage/connections/${this.currentEditItem.id}`
      : `${API_BASE}/storage/connections`;
    const method = this.currentEditItem ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      this.hideModal();
      this.loadConnections();
      this.populateDropdowns();
      this.log(`Connection ${this.currentEditItem ? 'updated' : 'created'} successfully`, 'success');
    } else {
      const error = await response.text();
      throw new Error(error);
    }
  }

  private async saveScriptForm(): Promise<void> {
    const nameEl = document.getElementById('scriptName') as HTMLInputElement;
    const descEl = document.getElementById('scriptDescription') as HTMLTextAreaElement;
    const langEl = document.getElementById('scriptLanguage') as HTMLSelectElement;
    const contentEl = document.getElementById('scriptContent') as HTMLTextAreaElement;
    const tagsContainer = document.getElementById('scriptTags') as HTMLDivElement;

    const tags = Array.from(tagsContainer.querySelectorAll('.tag')).map(
      tag => tag.textContent?.replace('×', '').trim()
    ).filter(Boolean);

    const data = {
      name: nameEl.value.trim(),
      description: descEl.value.trim() || undefined,
      language: langEl.value as 'sql' | 'javascript' | 'typescript',
      content: contentEl.value,
      tags
    };

    if (!data.name || !data.content) {
      this.log('Name and content are required', 'error');
      return;
    }

    const url = this.currentEditItem 
      ? `${API_BASE}/storage/scripts/${this.currentEditItem.id}`
      : `${API_BASE}/storage/scripts`;
    const method = this.currentEditItem ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      this.hideModal();
      this.loadStoredScripts();
      this.populateDropdowns();
      this.log(`Script ${this.currentEditItem ? 'updated' : 'created'} successfully`, 'success');
    } else {
      const error = await response.text();
      throw new Error(error);
    }
  }

  private async saveTargetForm(): Promise<void> {
    const nameEl = document.getElementById('targetName') as HTMLInputElement;
    const descEl = document.getElementById('targetDescription') as HTMLTextAreaElement;
    const typeEl = document.getElementById('targetType') as HTMLSelectElement;
    const filePathEl = document.getElementById('targetFilePath') as HTMLInputElement;
    const connIdEl = document.getElementById('targetConnectionId') as HTMLSelectElement;
    const overwriteEl = document.getElementById('targetOverwrite') as HTMLInputElement;
    const backupEl = document.getElementById('targetBackup') as HTMLInputElement;

    const data = {
      name: nameEl.value.trim(),
      description: descEl.value.trim() || undefined,
      targetType: typeEl.value as 'sqlite' | 'sqlserver',
      configuration: {
        filePath: typeEl.value === 'sqlite' ? filePathEl.value.trim() : undefined,
        connectionId: typeEl.value === 'sqlserver' ? connIdEl.value : undefined,
        overwriteExisting: overwriteEl.checked,
        backupBefore: backupEl.checked
      }
    };

    if (!data.name) {
      this.log('Name is required', 'error');
      return;
    }

    if (data.targetType === 'sqlite' && !data.configuration.filePath) {
      this.log('File path is required for SQLite targets', 'error');
      return;
    }

    if (data.targetType === 'sqlserver' && !data.configuration.connectionId) {
      this.log('Connection is required for SQL Server targets', 'error');
      return;
    }

    const url = this.currentEditItem 
      ? `${API_BASE}/storage/targets/${this.currentEditItem.id}`
      : `${API_BASE}/storage/targets`;
    const method = this.currentEditItem ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      this.hideModal();
      this.loadTargets();
      this.populateDropdowns();
      this.log(`Target ${this.currentEditItem ? 'updated' : 'created'} successfully`, 'success');
    } else {
      const error = await response.text();
      throw new Error(error);
    }
  }

  private async saveConfigForm(): Promise<void> {
    const nameEl = document.getElementById('configName') as HTMLInputElement;
    const descEl = document.getElementById('configDescription') as HTMLTextAreaElement;
    const sourceEl = document.getElementById('configSourceConnection') as HTMLSelectElement;
    const targetEl = document.getElementById('configTarget') as HTMLSelectElement;
    const scriptsEl = document.getElementById('configScripts') as HTMLSelectElement;
    const includeDataEl = document.getElementById('configIncludeData') as HTMLInputElement;
    const includeSchemaEl = document.getElementById('configIncludeSchema') as HTMLInputElement;
    const batchSizeEl = document.getElementById('configBatchSize') as HTMLInputElement;

    const selectedScripts = Array.from(scriptsEl.selectedOptions).map(option => option.value);

    const data = {
      name: nameEl.value.trim(),
      description: descEl.value.trim() || undefined,
      sourceConnectionId: sourceEl.value,
      targetId: targetEl.value,
      configScriptIds: selectedScripts,
      settings: {
        includeData: includeDataEl.checked,
        includeSchema: includeSchemaEl.checked,
        batchSize: batchSizeEl.value ? parseInt(batchSizeEl.value) : undefined
      }
    };

    if (!data.name || !data.sourceConnectionId || !data.targetId) {
      this.log('Name, source connection, and target are required', 'error');
      return;
    }

    const response = await fetch(`${API_BASE}/storage/replication-configs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      this.hideModal();
      this.loadConfigs();
      this.populateDropdowns();
      this.log('Configuration created successfully', 'success');
    } else {
      const error = await response.text();
      throw new Error(error);
    }
  }

  public async testStoredConnection(id: string): Promise<void> {
    try {
      this.log(`Testing stored connection...`, 'info');
      
      const response = await fetch(`${API_BASE}/replication/test-stored-connection/${id}`, {
        method: 'POST'
      });
      
      if (response.ok) {
        const result = await response.json();
        this.log(`Connection test successful! Database: ${result.data.serverInfo.databaseName}`, 'success');
        this.log(`Found ${result.data.tables.length} tables`, 'info');
      } else {
        const error = await response.text();
        this.log(`Connection test failed: ${error}`, 'error');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error testing connection: ${errorMessage}`, 'error');
    }
  }

  public async editConnection(id: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/storage/connections/${id}`);
      const connection: ConnectionInfo = await response.json();
      this.showConnectionForm(connection);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error loading connection: ${errorMessage}`, 'error');
    }
  }

  public async deleteConnection(id: string): Promise<void> {
    if (!confirm('Are you sure you want to delete this connection?')) return;
    
    try {
      const response = await fetch(`${API_BASE}/storage/connections/${id}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        this.loadConnections();
        this.populateDropdowns();
        this.log('Connection deleted successfully', 'success');
      } else {
        const error = await response.text();
        this.log(`Failed to delete connection: ${error}`, 'error');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error deleting connection: ${errorMessage}`, 'error');
    }
  }

  private updateManualTargetTypeDisplay(): void {
    const targetType = this.elements.targetType.value;
    
    if (targetType === 'sqlite') {
      this.elements.sqliteTarget.style.display = 'block';
      this.elements.sqlserverTarget.style.display = 'none';
    } else {
      this.elements.sqliteTarget.style.display = 'none';
      this.elements.sqlserverTarget.style.display = 'block';
    }
    
    this.validateForm();
  }

  private async selectTargetFile(): Promise<void> {
    try {
      const filePath = await window.electronAPI.selectFile();
      if (filePath) {
        this.elements.targetFilePath.value = filePath;
        this.validateForm();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error selecting file: ${errorMessage}`, 'error');
    }
  }

  private async loadSavedTargetConnection(): Promise<void> {
    const selectedId = this.elements.savedTargetConnectionSelect.value;
    if (!selectedId) {
      this.elements.targetConnectionString.value = '';
      return;
    }

    try {
      const connectionString = await fetch(`${API_BASE}/storage/connections/${selectedId}/connection-string`);
      if (connectionString.ok) {
        const data = await connectionString.text();
        this.elements.targetConnectionString.value = data;
        this.validateForm();
        this.log('Loaded saved target connection', 'info');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error loading saved target connection: ${errorMessage}`, 'error');
    }
  }
}

// Make the instance globally available for onclick handlers
const dataReplicatorUI = new DataReplicatorUI();
(window as any).dataReplicatorUI = dataReplicatorUI; 