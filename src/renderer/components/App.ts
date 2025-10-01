import { AppState, SavedConnection, SavedSqlScript, StoredConfiguration } from './common/types';
import { eventBus } from './common/EventBus';

// Import view components
import { DatabasesView } from './views/DatabasesView';
import { ScriptsView } from './views/ScriptsView';
import { ConfigurationsView } from './views/ConfigurationsView';
import { DatabaseCompareView } from './views/DatabaseCompareView';
import { SettingsView } from './views/SettingsView';

// Import modal components
import { ConnectionModal } from './modals/ConnectionModal';

export class App {
  private state: AppState = {
    isReplicating: false,
    currentJobId: null,
    configurations: [],
    selectedConfigId: null,
    connections: [],
    sqlScripts: [],
    activeView: 'databases'
  };

  // View components (lazy initialized)
  private _databasesView?: DatabasesView;
  private _scriptsView?: ScriptsView;
  private _configurationsView?: ConfigurationsView;
  private _databaseCompareView?: DatabaseCompareView;
  private _settingsView?: SettingsView;

  // Modal components
  private connectionModal!: ConnectionModal;

  // Navigation elements
  private navButtons!: NodeListOf<HTMLButtonElement>;
  private views!: NodeListOf<HTMLElement>;
  private viewTitle!: HTMLElement;
  private primaryActionBtn!: HTMLButtonElement;

  // Logs elements
  private logs!: HTMLElement;
  private clearLogsBtn!: HTMLButtonElement;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    // Initialize navigation elements
    this.navButtons = document.querySelectorAll('.nav-button');
    this.views = document.querySelectorAll('.view');
    this.viewTitle = document.getElementById('viewTitle') as HTMLElement;
    this.primaryActionBtn = document.getElementById('primaryActionBtn') as HTMLButtonElement;

    // Initialize logs elements
    this.logs = document.getElementById('logs') as HTMLElement;
    this.clearLogsBtn = document.getElementById('clearLogsBtn') as HTMLButtonElement;

    // Initialize view components (will be created lazily when needed)
    // this.databasesView = new DatabasesView();
    // this.scriptsView = new ScriptsView();
    // this.configurationsView = new ConfigurationsView();
    // this.databaseCompareView = new DatabaseCompareView();
    // this.settingsView = new SettingsView();

    // Initialize modal components
    this.connectionModal = new ConnectionModal();

    this.setupEventListeners();
    this.setupGlobalEventHandlers();
    
    // Load initial data and render
    this.loadAllData().then(() => {
      this.render();
    });
  }

  private render(): void {
    this.updateActiveView();
  }

  private setupEventListeners(): void {
    // Navigation handlers
    this.navButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Get the button element (in case click was on a child element)
        const buttonElement = (e.currentTarget as HTMLButtonElement);
        const viewName = buttonElement.dataset.view;
        
        if (viewName) {
          this.switchView(viewName);
        }
      });
    });

    // Primary action button handler
    this.primaryActionBtn.addEventListener('click', () => this.handlePrimaryAction());

    // Clear logs handler
    this.clearLogsBtn.addEventListener('click', () => this.clearLogs());
    
    // Script modal event listeners
    this.setupScriptModalListeners();
    
    // Configuration modal event listeners
    this.setupConfigModalListeners();
  }

  private setupScriptModalListeners(): void {
    const closeBtn = document.getElementById('sqlScriptModalCloseBtn');
    const cancelBtn = document.getElementById('sqlScriptModalCancelBtn');
    const saveBtn = document.getElementById('sqlScriptModalSaveBtn');
    
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hideSqlScriptModal());
    }
    
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.hideSqlScriptModal());
    }
    
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveSqlScript());
    }
  }

  private setupConfigModalListeners(): void {
    const closeBtn = document.getElementById('configModalCloseBtn');
    const cancelBtn = document.getElementById('configModalCancelBtn');
    const saveBtn = document.getElementById('configModalSaveBtn');
    
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hideConfigModal());
    }
    
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.hideConfigModal());
    }
    
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveConfiguration());
    }
  }

  private setupGlobalEventHandlers(): void {
    // Data refresh events
    eventBus.on('connections:refresh', async () => {
      await this.databasesView.loadConnections();
      this.state.connections = this.databasesView.getConnections();
      this.databaseCompareView.updateConnections(this.state.connections);
      this.configurationsView.updateConnections(this.state.connections);
    });
    
    eventBus.on('scripts:refresh', async () => {
      await this.scriptsView.loadSqlScripts();
      this.state.sqlScripts = this.scriptsView.getSqlScripts();
      this.configurationsView.updateSqlScripts(this.state.sqlScripts);
    });
    
    eventBus.on('configurations:refresh', async () => {
      await this.configurationsView.loadConfigurations();
      this.state.configurations = this.configurationsView.getConfigurations();
    });
    
    eventBus.on('data:refresh', () => this.loadAllData());

    // Modal events
    eventBus.on('connection:create', () => this.connectionModal.showForCreate());
    eventBus.on('connection:edit', (event) => this.connectionModal.showForEdit(event.data));
    eventBus.on('connection:create-target', () => this.connectionModal.showForTarget());

    // Replication events
    eventBus.on('replication:cancel', () => this.cancelReplication());
  }

  private switchView(viewName: string): void {
    this.state.activeView = viewName;
    this.updateActiveView();
  }

  private updateActiveView(): void {
    const viewConfig = {
      'databases': {
        title: 'Database Connections',
        actionText: 'Add Connection',
        component: this.databasesView
      },
      'scripts': {
        title: 'SQL Scripts',
        actionText: 'Add Script',
        component: this.scriptsView
      },
      'configurations': {
        title: 'Replication Configurations',
        actionText: 'Create Configuration',
        component: this.configurationsView
      },
      'database-compare': {
        title: 'Database Comparison',
        actionText: 'Compare Databases',
        component: this.databaseCompareView
      },
      'settings': {
        title: 'Settings',
        actionText: 'Import/Export',
        component: this.settingsView
      }
    };

    const config = viewConfig[this.state.activeView as keyof typeof viewConfig];
    if (!config) return;

    // Update navigation
    this.navButtons.forEach(button => {
      if (button.dataset.view === this.state.activeView) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    });

    // Update views
    this.views.forEach(view => {
      if (view.id === `${this.state.activeView}-view`) {
        view.classList.add('active');
        // Ensure component is initialized and rendered
        try {
          config.component.show(); // This will initialize if needed
          // Reset any display style that might interfere with CSS
          const container = document.getElementById(view.id);
          if (container) {
            container.style.display = '';
          }
        } catch (error) {
          console.error('Error showing component:', error);
        }
      } else {
        view.classList.remove('active');
      }
    });

    // Update header
    this.viewTitle.textContent = config.title;
    this.primaryActionBtn.textContent = config.actionText;

    // Hide primary action button for database compare view
    if (this.state.activeView === 'database-compare') {
      this.primaryActionBtn.style.display = 'none';
    } else {
      this.primaryActionBtn.style.display = 'inline-flex';
    }
  }

  private handlePrimaryAction(): void {
    switch (this.state.activeView) {
      case 'databases':
        this.connectionModal.showForCreate();
        break;
      case 'scripts':
        this.showSqlScriptModal();
        break;
      case 'configurations':
        this.showConfigModal();
        break;
      case 'settings':
        // Settings view handles its own actions
        break;
    }
  }

  private async loadAllData(): Promise<void> {
    try {
      // Load connections first
      await this.databasesView.loadConnections();
      this.state.connections = this.databasesView.getConnections();
      
      // Load scripts
      await this.scriptsView.loadSqlScripts();
      this.state.sqlScripts = this.scriptsView.getSqlScripts();
      
      // Load configurations
      await this.configurationsView.loadConfigurations();
      this.state.configurations = this.configurationsView.getConfigurations();
      
      // Update other views with the loaded data
      this.databaseCompareView.updateConnections(this.state.connections);
      this.configurationsView.updateConnections(this.state.connections);
      this.configurationsView.updateSqlScripts(this.state.sqlScripts);
      
      this.log('All data loaded successfully');
    } catch (error) {
      console.error('Failed to load data:', error);
      this.log(`Failed to load data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private log(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.innerHTML = `<span class="log-timestamp">[${timestamp}]</span> ${message}`;
    
    this.logs.appendChild(logEntry);
    this.logs.scrollTop = this.logs.scrollHeight;
  }

  private clearLogs(): void {
    this.logs.innerHTML = '';
  }

  // Temporary methods for modals that haven't been extracted yet
  private showSqlScriptModal(script?: SavedSqlScript): void {
    const modal = document.getElementById('sqlScriptModal') as HTMLElement;
    const titleElement = document.getElementById('sqlScriptModalTitle') as HTMLElement;
    const nameInput = document.getElementById('sqlScriptName') as HTMLInputElement;
    const contentInput = document.getElementById('sqlScriptContent') as HTMLTextAreaElement;
    const descriptionInput = document.getElementById('sqlScriptDescription') as HTMLTextAreaElement;
    
    if (!modal || !titleElement || !nameInput || !contentInput || !descriptionInput) {
      console.error('Script modal elements not found');
      return;
    }
    
    // Store the script ID being edited for later use
    (modal as any).editingScriptId = script?.id || null;
    
    // Reset form
    nameInput.value = '';
    contentInput.value = '';
    descriptionInput.value = '';
    
    if (script) {
      // Edit mode
      nameInput.value = script.name;
      contentInput.value = script.content;
      descriptionInput.value = script.description || '';
      titleElement.textContent = 'Edit SQL Script';
    } else {
      // Add mode
      titleElement.textContent = 'Create SQL Script';
    }
    
    modal.style.display = 'flex';
    nameInput.focus();
  }

  private hideSqlScriptModal(): void {
    const modal = document.getElementById('sqlScriptModal') as HTMLElement;
    if (modal) {
      modal.style.display = 'none';
      // Clear the editing script ID
      (modal as any).editingScriptId = null;
    }
  }

  private async saveSqlScript(): Promise<void> {
    const modal = document.getElementById('sqlScriptModal') as HTMLElement;
    const nameInput = document.getElementById('sqlScriptName') as HTMLInputElement;
    const contentInput = document.getElementById('sqlScriptContent') as HTMLTextAreaElement;
    const descriptionInput = document.getElementById('sqlScriptDescription') as HTMLTextAreaElement;
    const saveBtn = document.getElementById('sqlScriptModalSaveBtn') as HTMLButtonElement;
    
    if (!modal || !nameInput || !contentInput || !descriptionInput || !saveBtn) {
      console.error('Script modal elements not found');
      return;
    }
    
    const name = nameInput.value.trim();
    const content = contentInput.value.trim();
    const description = descriptionInput.value.trim();
    
    if (!name || !content) {
      alert('Please fill in script name and content');
      return;
    }
    
    const editingScriptId = (modal as any).editingScriptId;
    const isEditing = !!editingScriptId;
    
    saveBtn.disabled = true;
    saveBtn.textContent = isEditing ? 'Updating...' : 'Creating...';
    
    try {
      const scriptData = {
        name,
        content,
        description: description || undefined
      };
      
      let result;
      if (isEditing) {
        result = await window.electronAPI.scripts.update(editingScriptId, scriptData);
      } else {
        result = await window.electronAPI.scripts.create(scriptData);
      }
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      this.log(`Script "${name}" ${isEditing ? 'updated' : 'created'} successfully`);
      
      // Emit event to refresh scripts (consistent with connection refresh pattern)
      eventBus.emit('scripts:refresh');
      
      this.hideSqlScriptModal();
      
    } catch (error) {
      console.error(`Failed to ${isEditing ? 'update' : 'create'} script:`, error);
      alert(`Failed to ${isEditing ? 'update' : 'create'} script: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = isEditing ? 'Update Script' : 'Create Script';
    }
  }

  // Public methods for global access (backward compatibility)
  public async editConnection(connectionId: string): Promise<void> {
    try {
      const connection = this.state.connections.find(c => c.id === connectionId);
      if (!connection) {
        console.error('Connection not found:', connectionId);
        return;
      }

      // Fetch the full connection details (decrypted from server)
      const result = await window.electronAPI.connections.get(connectionId);
      if (!result.success) {
        throw new Error(`Failed to fetch connection details: ${result.error}`);
      }

      const fullConnection: SavedConnection = {
        id: connection.id,
        name: connection.name,
        connectionString: result.data.connectionString || '',
        description: connection.description || '',
        isAzure: connection.isAzure,
        isTargetDatabase: connection.isTargetDatabase,
        databaseName: connection.databaseName,
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt
      };

      this.connectionModal.showForEdit(fullConnection);
    } catch (error) {
      console.error('Failed to edit connection:', error);
      alert(`Failed to edit connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async deleteConnection(connectionId: string): Promise<void> {
    const connection = this.state.connections.find(c => c.id === connectionId);
    if (!connection) return;

    if (!confirm(`Are you sure you want to delete the connection "${connection.name}"?`)) return;

    try {
      const result = await window.electronAPI.connections.delete(connectionId);
      if (!result.success) {
        throw new Error(result.error);
      }

      this.log(`Connection "${connection.name}" deleted successfully`);
      
      // Refresh connections
      await this.databasesView.loadConnections();
    } catch (error) {
      console.error('Failed to delete connection:', error);
      alert(`Failed to delete connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async editScript(scriptId: string): Promise<void> {
    try {
      const script = this.state.sqlScripts.find(s => s.id === scriptId);
      if (!script) {
        console.error('Script not found:', scriptId);
        return;
      }

      // Fetch the full script details from the backend
      const result = await window.electronAPI.scripts.get(scriptId);
      if (!result.success) {
        throw new Error(`Failed to fetch script details: ${result.error}`);
      }

      const fullScript: SavedSqlScript = {
        id: script.id,
        name: script.name,
        content: result.data.content || '',
        description: script.description || '',
        createdAt: script.createdAt,
        updatedAt: script.updatedAt
      };

      this.showSqlScriptModal(fullScript);
    } catch (error) {
      console.error('Failed to edit script:', error);
      alert(`Failed to edit script: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async deleteScript(scriptId: string): Promise<void> {
    const script = this.state.sqlScripts.find(s => s.id === scriptId);
    if (!script) return;

    if (!confirm(`Are you sure you want to delete the script "${script.name}"?`)) return;

    try {
      const result = await window.electronAPI.scripts.delete(scriptId);
      if (!result.success) {
        throw new Error(result.error);
      }

      this.log(`Script "${script.name}" deleted successfully`);
      
      // Emit event to refresh scripts (consistent with connection refresh pattern)
      eventBus.emit('scripts:refresh');
    } catch (error) {
      console.error('Failed to delete script:', error);
      alert(`Failed to delete script: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async runConfiguration(configId: string): Promise<void> {
    this.log(`runConfiguration called with ID: ${configId}`);
    const config = this.state.configurations.find(c => c.id === configId);
    if (!config) {
      this.log(`Configuration with ID ${configId} not found in current state`);
      console.error('Configuration not found:', configId);
      console.error('Available configurations:', this.state.configurations);
      alert('Configuration not found');
      return;
    }

    if (this.state.isReplicating) {
      alert('A replication is already in progress. Please wait for it to complete.');
      return;
    }

    try {
      // Set the selected config for tracking
      this.state.selectedConfigId = configId;
      
      // Start the replication
      this.state.isReplicating = true;
      this.log(`Starting replication for configuration "${config.name}"...`);

      // Emit event to show progress bar
      eventBus.emit('replication:started', { configName: config.name });

      // Use the stored configuration IPC which handles connection string decryption
      const result = await window.electronAPI.replication.startStored({ configId: configId });
      
      if (!result.success) {
        throw new Error(result.error);
      }
      this.state.currentJobId = result.data.jobId;
      this.log(`Replication started with job ID: ${result.data.jobId} for configuration "${config.name}"`);
      
      // Start polling for status
      this.pollReplicationStatus();
      
    } catch (error) {
      this.state.isReplicating = false;
      this.state.selectedConfigId = null;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Run configuration error: ${errorMessage}`);
      alert(`Failed to start replication: ${errorMessage}`);
      eventBus.emit('replication:failed', { error: errorMessage });
    }
  }

  private async pollReplicationStatus(): Promise<void> {
    if (!this.state.currentJobId || !this.state.isReplicating) return;

    try {
      console.log('Fetching status for job:', this.state.currentJobId);
      const result = await window.electronAPI.replication.getStatus(this.state.currentJobId);
      
      if (!result.success) {
        throw new Error(`Failed to get replication status: ${result.error}`);
      }

      const status = result.data;
      
      this.log(`Replication progress: ${Math.round(status.progress || 0)}% - ${status.message || 'Processing...'}`);
      
      // Emit progress event for the progress bar
      eventBus.emit('replication:progress', {
        progress: status.progress || 0,
        message: status.message || 'Processing...'
      });

      if (status.status === 'completed') {
        this.state.isReplicating = false;
        this.state.currentJobId = null;
        this.log('Replication completed successfully');
        
        // Update last run time for the configuration that was run
        if (this.state.selectedConfigId) {
          const config = this.state.configurations.find(c => c.id === this.state.selectedConfigId);
          if (config) {
            config.lastRun = new Date().toISOString();
            config.updatedAt = new Date().toISOString();
            // Update the configuration in the view
            await this.configurationsView.loadConfigurations();
            this.state.configurations = this.configurationsView.getConfigurations();
          }
        }
        this.state.selectedConfigId = null;
        eventBus.emit('replication:completed', {});
      } else if (status.status === 'failed') {
        this.state.isReplicating = false;
        this.state.currentJobId = null;
        this.state.selectedConfigId = null;
        alert(`Replication failed: ${status.message || 'Unknown error'}`);
        eventBus.emit('replication:failed', { error: status.message || 'Unknown error' });
      } else {
        // Continue polling
        setTimeout(() => this.pollReplicationStatus(), 1000);
      }
    } catch (error) {
      alert(`Status check failed: ${error instanceof Error ? error.message : String(error)}`);
      setTimeout(() => this.pollReplicationStatus(), 2000);
    }
  }

  private async cancelReplication(): Promise<void> {
    if (!this.state.currentJobId || !this.state.isReplicating) {
      return;
    }

    if (!confirm('Are you sure you want to cancel the current replication?')) {
      return;
    }

    try {
      const result = await window.electronAPI.replication.cancel(this.state.currentJobId);
      if (result.success) {
        this.state.isReplicating = false;
        this.state.currentJobId = null;
        this.state.selectedConfigId = null;
        this.log('Replication cancelled by user');
        eventBus.emit('replication:failed', { error: 'Cancelled by user' });
      } else {
        throw new Error(result.error || 'Failed to cancel replication');
      }
    } catch (error) {
      console.error('Failed to cancel replication:', error);
      alert(`Failed to cancel replication: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async editConfiguration(configId: string): Promise<void> {
    const config = this.state.configurations.find(c => c.id === configId);
    if (!config) {
      console.error('Configuration not found:', configId);
      console.error('Available configurations:', this.state.configurations);
      return;
    }

    console.log('Editing configuration:', config);
    this.showConfigModal(config);
  }

  public async deleteConfiguration(configId: string): Promise<void> {
    const config = this.state.configurations.find(c => c.id === configId);
    if (!config) {
      console.error('Configuration not found:', configId);
      return;
    }

    if (!confirm(`Are you sure you want to delete the configuration "${config.name}"?`)) {
      return;
    }

    try {
      const result = await window.electronAPI.configs.delete(configId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete configuration');
      }

      // Refresh configurations data
      await this.configurationsView.loadConfigurations();
      this.state.configurations = this.configurationsView.getConfigurations();
      
      this.log(`Configuration "${config.name}" deleted successfully`);
    } catch (error) {
      console.error('Failed to delete configuration:', error);
      alert(`Failed to delete configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public showCreateConfigurationModal(): void {
    this.showConfigModal();
  }

  private showConfigModal(config?: StoredConfiguration): void {
    console.log('showConfigModal called with config:', config);
    
    const modal = document.getElementById('configModal') as HTMLElement;
    const titleElement = document.getElementById('configModalTitle') as HTMLElement;
    const nameInput = document.getElementById('configName') as HTMLInputElement;
    const sourceSelect = document.getElementById('sourceConnection') as HTMLSelectElement;
    const targetSelect = document.getElementById('targetConnection') as HTMLSelectElement;
    const scriptSelection = document.getElementById('scriptSelection') as HTMLElement;
    
    console.log('Modal elements found:', {
      modal: !!modal,
      titleElement: !!titleElement,
      nameInput: !!nameInput,
      sourceSelect: !!sourceSelect,
      targetSelect: !!targetSelect,
      scriptSelection: !!scriptSelection
    });
    
    if (!modal || !titleElement || !nameInput || !sourceSelect || !targetSelect || !scriptSelection) {
      console.error('Configuration modal elements not found');
      console.error('Missing elements:', {
        modal: !modal,
        titleElement: !titleElement,
        nameInput: !nameInput,
        sourceSelect: !sourceSelect,
        targetSelect: !targetSelect,
        scriptSelection: !scriptSelection
      });
      return;
    }
    
    // Store the config ID being edited for later use
    (modal as any).editingConfigId = config?.id || null;
    console.log('Set editingConfigId to:', (modal as any).editingConfigId);
    
    // Reset form
    this.resetConfigModal();
    
    // Update dropdowns with current data
    this.updateConfigModalDropdowns();
    
    if (config) {
      // Edit mode
      console.log('Populating form for edit mode with config:', config);
      nameInput.value = config.name;
      sourceSelect.value = config.sourceConnectionId;
      targetSelect.value = config.targetId;
      titleElement.textContent = 'Edit Configuration';
      
      console.log('Set form values:', {
        name: nameInput.value,
        source: sourceSelect.value,
        target: targetSelect.value
      });
      
      // Select the scripts
      console.log('Selecting scripts:', config.scriptIds);
      config.scriptIds.forEach(scriptId => {
        const checkbox = document.getElementById(`script-${scriptId}`) as HTMLInputElement;
        if (checkbox) {
          checkbox.checked = true;
          console.log('Checked script:', scriptId);
        } else {
          console.warn('Script checkbox not found for:', scriptId);
        }
      });
    } else {
      // Create mode
      titleElement.textContent = 'Create Configuration';
    }
    
    modal.style.display = 'flex';
    nameInput.focus();
  }

  private resetConfigModal(): void {
    const nameInput = document.getElementById('configName') as HTMLInputElement;
    const sourceSelect = document.getElementById('sourceConnection') as HTMLSelectElement;
    const targetSelect = document.getElementById('targetConnection') as HTMLSelectElement;
    
    if (nameInput) nameInput.value = '';
    if (sourceSelect) sourceSelect.value = '';
    if (targetSelect) targetSelect.value = '';
    
    // Uncheck all script checkboxes
    const checkboxes = document.querySelectorAll('#scriptSelection input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      (checkbox as HTMLInputElement).checked = false;
    });
  }

  private updateConfigModalDropdowns(): void {
    const sourceSelect = document.getElementById('sourceConnection') as HTMLSelectElement;
    const targetSelect = document.getElementById('targetConnection') as HTMLSelectElement;
    const scriptSelection = document.getElementById('scriptSelection') as HTMLElement;
    
    if (!sourceSelect || !targetSelect || !scriptSelection) {
      console.error('Dropdown elements not found in updateConfigModalDropdowns');
      return;
    }
    
    console.log('Updating dropdowns with connections:', this.state.connections);
    console.log('Updating dropdowns with scripts:', this.state.sqlScripts);
    
    // Update source connections (all connections)
    sourceSelect.innerHTML = '<option value="">Select saved connection...</option>';
    this.state.connections.forEach(conn => {
      const option = document.createElement('option');
      option.value = conn.id;
      option.textContent = `${conn.name} (${conn.databaseName})`;
      sourceSelect.appendChild(option);
    });
    console.log('Source select options added:', sourceSelect.options.length);
    
    // Update target connections (only target databases)
    targetSelect.innerHTML = '<option value="">Select saved connection...</option>';
    this.state.connections.filter(conn => conn.isTargetDatabase).forEach(conn => {
      const option = document.createElement('option');
      option.value = conn.id;
      option.textContent = `${conn.name} (${conn.databaseName})`;
      targetSelect.appendChild(option);
    });
    console.log('Target select options added:', targetSelect.options.length);
    
    // Update script selection
    scriptSelection.innerHTML = '';
    if (this.state.sqlScripts.length === 0) {
      scriptSelection.innerHTML = '<p style="color: #64748b; font-style: italic;">No scripts available. Create scripts first to include them in configurations.</p>';
      console.log('No scripts available, showing empty message');
    } else {
      const scriptsContainer = document.createElement('div');
      scriptsContainer.style.border = '1px solid #d1d5db';
      scriptsContainer.style.borderRadius = '0.375rem';
      scriptsContainer.style.padding = '0.75rem';
      scriptsContainer.style.backgroundColor = '#f9fafb';
      scriptsContainer.style.maxHeight = '200px';
      scriptsContainer.style.overflowY = 'auto';
      
      this.state.sqlScripts.forEach((script, index) => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.alignItems = 'flex-start';
        div.style.marginBottom = index < this.state.sqlScripts.length - 1 ? '0.75rem' : '0';
        div.style.padding = '0.5rem';
        div.style.backgroundColor = '#ffffff';
        div.style.border = '1px solid #e5e7eb';
        div.style.borderRadius = '0.25rem';
        div.style.cursor = 'pointer';
        div.style.transition = 'all 0.15s ease-in-out';
        
        // Hover effect
        div.addEventListener('mouseenter', () => {
          div.style.backgroundColor = '#f3f4f6';
          div.style.borderColor = '#d1d5db';
        });
        div.addEventListener('mouseleave', () => {
          div.style.backgroundColor = '#ffffff';
          div.style.borderColor = '#e5e7eb';
        });
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `script-${script.id}`;
        checkbox.value = script.id;
        checkbox.style.marginRight = '0.75rem';
        checkbox.style.marginTop = '0.125rem';
        checkbox.style.flexShrink = '0';
        checkbox.style.width = '16px';
        checkbox.style.height = '16px';
        
        const contentDiv = document.createElement('div');
        contentDiv.style.flex = '1';
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = script.name;
        nameSpan.style.fontWeight = '600';
        nameSpan.style.color = '#111827';
        nameSpan.style.display = 'block';
        nameSpan.style.marginBottom = '0.25rem';
        nameSpan.style.fontSize = '0.875rem';
        
        contentDiv.appendChild(nameSpan);
        
        if (script.description) {
          const descSpan = document.createElement('span');
          descSpan.textContent = script.description;
          descSpan.style.fontSize = '0.75rem';
          descSpan.style.color = '#6b7280';
          descSpan.style.display = 'block';
          contentDiv.appendChild(descSpan);
        }
        
        // Make the entire div clickable
        div.addEventListener('click', (e) => {
          if (e.target !== checkbox) {
            checkbox.checked = !checkbox.checked;
          }
        });
        
        div.appendChild(checkbox);
        div.appendChild(contentDiv);
        scriptsContainer.appendChild(div);
      });
      
      scriptSelection.appendChild(scriptsContainer);
      console.log('Script selection updated, scripts container created with', this.state.sqlScripts.length, 'scripts');
    }
  }

  private hideConfigModal(): void {
    const modal = document.getElementById('configModal') as HTMLElement;
    if (modal) {
      modal.style.display = 'none';
      // Clear the editing config ID
      (modal as any).editingConfigId = null;
    }
  }

  private async saveConfiguration(): Promise<void> {
    const modal = document.getElementById('configModal') as HTMLElement;
    const nameInput = document.getElementById('configName') as HTMLInputElement;
    const sourceSelect = document.getElementById('sourceConnection') as HTMLSelectElement;
    const targetSelect = document.getElementById('targetConnection') as HTMLSelectElement;
    const saveBtn = document.getElementById('configModalSaveBtn') as HTMLButtonElement;
    
    if (!modal || !nameInput || !sourceSelect || !targetSelect || !saveBtn) {
      console.error('Configuration modal elements not found');
      return;
    }
    
    const name = nameInput.value.trim();
    const sourceConnectionId = sourceSelect.value;
    const targetConnectionId = targetSelect.value;
    
    if (!name || !sourceConnectionId || !targetConnectionId) {
      alert('Please fill in all required fields');
      return;
    }
    
    // Get selected script IDs
    const selectedScripts: string[] = [];
    const checkboxes = document.querySelectorAll('#scriptSelection input[type="checkbox"]:checked');
    checkboxes.forEach(checkbox => {
      selectedScripts.push((checkbox as HTMLInputElement).value);
    });
    
    const editingConfigId = (modal as any).editingConfigId;
    const isEditing = !!editingConfigId;
    
    // Prepare configuration data
    const configData = {
      name,
      sourceConnectionId,
      targetId: targetConnectionId,
      configScriptIds: selectedScripts, // Fixed: was 'scriptIds', should be 'configScriptIds'
      createTargetDatabase: true, // This might not be used by the backend
      settings: {
        includeData: true,
        includeSchema: true
      }
    };
    
    saveBtn.disabled = true;
    saveBtn.textContent = isEditing ? 'Updating...' : 'Creating...';
    
    try {
      let result;
      if (isEditing) {
        // For editing, we need to delete the old config and create a new one
        // since there's no update method in the API
        console.log('Deleting existing configuration:', editingConfigId);
        const deleteResult = await window.electronAPI.configs.delete(editingConfigId);
        if (!deleteResult.success) {
          throw new Error(`Failed to delete existing configuration: ${deleteResult.error}`);
        }
        console.log('Creating updated configuration with data:', configData);
        result = await window.electronAPI.configs.create(configData);
      } else {
        console.log('Creating new configuration with data:', configData);
        result = await window.electronAPI.configs.create(configData);
      }
      
      console.log('Configuration save result:', result);
      
      if (result.success) {
        this.hideConfigModal();
        // Refresh configurations data
        await this.configurationsView.loadConfigurations();
        this.state.configurations = this.configurationsView.getConfigurations();
        
        // Make sure ConfigurationsView has the latest connection and script data
        this.configurationsView.updateConnections(this.state.connections);
        this.configurationsView.updateSqlScripts(this.state.sqlScripts);
        
        const action = isEditing ? 'updated' : 'created';
        console.log(`Configuration "${name}" ${action} successfully`);
      } else {
        throw new Error(result.error || 'Failed to save configuration');
      }
    } catch (error) {
      console.error('Failed to save configuration:', error);
      console.error('Configuration data that failed:', configData);
      alert(`Failed to save configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = isEditing ? 'Update Configuration' : 'Save Configuration';
    }
  }

  // Getters for state access
  get connections(): SavedConnection[] {
    return this.state.connections;
  }

  get sqlScripts(): SavedSqlScript[] {
    return this.state.sqlScripts;
  }

  get configurations(): StoredConfiguration[] {
    return this.state.configurations;
  }

  // Lazy getters for view components
  private get databasesView(): DatabasesView {
    if (!this._databasesView) {
      this._databasesView = new DatabasesView();
    }
    return this._databasesView;
  }

  private get scriptsView(): ScriptsView {
    if (!this._scriptsView) {
      this._scriptsView = new ScriptsView();
    }
    return this._scriptsView;
  }

  private get configurationsView(): ConfigurationsView {
    if (!this._configurationsView) {
      this._configurationsView = new ConfigurationsView();
    }
    return this._configurationsView;
  }

  private get databaseCompareView(): DatabaseCompareView {
    if (!this._databaseCompareView) {
      this._databaseCompareView = new DatabaseCompareView();
    }
    return this._databaseCompareView;
  }

  private get settingsView(): SettingsView {
    if (!this._settingsView) {
      this._settingsView = new SettingsView();
    }
    return this._settingsView;
  }

  // Utility methods (kept for potential future use)
  // private formatDate(dateString: string): string {
  //   return new Date(dateString).toLocaleDateString();
  // }

  // private escapeHtml(text: string): string {
  //   const div = document.createElement('div');
  //   div.textContent = text;
  //   return div.innerHTML;
  // }
}
