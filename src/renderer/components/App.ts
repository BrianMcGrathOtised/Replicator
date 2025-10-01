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

  private setupGlobalEventHandlers(): void {
    // Data refresh events
    eventBus.on('connections:refresh', async () => {
      await this.databasesView.loadConnections();
      this.state.connections = this.databasesView.getConnections();
      this.databaseCompareView.updateConnections(this.state.connections);
    });
    
    eventBus.on('scripts:refresh', async () => {
      await this.scriptsView.loadSqlScripts();
      this.state.sqlScripts = this.scriptsView.getSqlScripts();
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
      
      // Update database compare view with connections
      this.databaseCompareView.updateConnections(this.state.connections);
      
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
      titleElement.textContent = 'Add SQL Script';
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
    saveBtn.textContent = isEditing ? 'Updating...' : 'Saving...';
    
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
      
      // Refresh scripts
      await this.scriptsView.loadSqlScripts();
      this.state.sqlScripts = this.scriptsView.getSqlScripts();
      
      this.hideSqlScriptModal();
      
    } catch (error) {
      console.error(`Failed to ${isEditing ? 'update' : 'save'} script:`, error);
      alert(`Failed to ${isEditing ? 'update' : 'save'} script: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = isEditing ? 'Update Script' : 'Save Script';
    }
  }

  private showConfigModal(): void {
    // TODO: Implement ConfigModal component
    console.log('Show Config Modal - not yet implemented');
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
      
      // Refresh scripts
      await this.scriptsView.loadSqlScripts();
      this.state.sqlScripts = this.scriptsView.getSqlScripts();
    } catch (error) {
      console.error('Failed to delete script:', error);
      alert(`Failed to delete script: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async runConfiguration(configId: string): Promise<void> {
    // TODO: Implement configuration running
    console.log('Run configuration:', configId);
  }

  public async editConfiguration(configId: string): Promise<void> {
    // TODO: Implement configuration editing
    console.log('Edit configuration:', configId);
  }

  public async deleteConfiguration(configId: string): Promise<void> {
    // TODO: Implement configuration deletion
    console.log('Delete configuration:', configId);
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
