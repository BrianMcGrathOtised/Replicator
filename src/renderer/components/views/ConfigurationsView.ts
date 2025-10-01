import { BaseComponent } from '../common/BaseComponent';
import { StoredConfiguration, SavedConnection, SavedSqlScript } from '../common/types';
import { eventBus } from '../common/EventBus';

export class ConfigurationsView extends BaseComponent {
  private configurations: StoredConfiguration[] = [];
  private connections: SavedConnection[] = [];
  private configurationsTable!: HTMLTableElement;
  private configurationsTableBody!: HTMLTableSectionElement;
  private configurationsEmptyState!: HTMLElement;
  private progressContainer!: HTMLElement;
  private progressTitle!: HTMLElement;
  private progressFill!: HTMLElement;
  private progressPercent!: HTMLElement;
  private progressMessage!: HTMLElement;
  private cancelBtn!: HTMLButtonElement;

  constructor() {
    super('configurations-view');
  }

  initialize(): void {
    this.configurationsTable = this.container.querySelector('#configurationsTable') as HTMLTableElement;
    this.configurationsTableBody = this.container.querySelector('#configurationsTableBody') as HTMLTableSectionElement;
    this.configurationsEmptyState = this.container.querySelector('#configurationsEmptyState') as HTMLElement;
    this.progressContainer = this.container.querySelector('#configProgressContainer') as HTMLElement;
    this.progressTitle = this.container.querySelector('#configProgressTitle') as HTMLElement;
    this.progressFill = this.container.querySelector('#configProgressFill') as HTMLElement;
    this.progressPercent = this.container.querySelector('#configProgressPercent') as HTMLElement;
    this.progressMessage = this.container.querySelector('#configProgressMessage') as HTMLElement;
    this.cancelBtn = this.container.querySelector('#cancelConfigBtn') as HTMLButtonElement;

    if (!this.configurationsTable || !this.configurationsTableBody || !this.configurationsEmptyState) {
      throw new Error('Required DOM elements not found in configurations view');
    }

    // Progress bar elements are optional (they might not exist in older HTML)
    if (this.progressContainer && this.cancelBtn) {
      this.cancelBtn.addEventListener('click', () => {
        eventBus.emit('replication:cancel', {});
      });
    }

    // Listen for data updates
    eventBus.on('configurations:updated', (event) => {
      this.configurations = event.data || [];
      this.render();
    });

    eventBus.on('configurations:loaded', (event) => {
      this.configurations = event.data || [];
      this.render();
    });

    eventBus.on('connections:loaded', (event) => {
      this.connections = event.data || [];
      this.render();
    });

    eventBus.on('connections:updated', (event) => {
      this.connections = event.data || [];
      this.render();
    });

    // Listen for replication progress updates
    eventBus.on('replication:progress', (event) => {
      this.updateProgress(event.data);
    });

    eventBus.on('replication:started', (event) => {
      this.showProgress(event.data.configName);
    });

    eventBus.on('replication:completed', () => {
      this.hideProgress();
    });

    eventBus.on('replication:failed', () => {
      this.hideProgress();
    });
  }

  render(): void {
    // Only render if component is initialized
    if (!this.isInitialized) {
      return;
    }
    
    // Only restore content if the container was completely replaced by loading/error state
    // Check if the container's only child is a loading-state or error-state div
    const children = this.container.children;
    const hasOnlyLoadingOrError = children.length === 1 && 
      (children[0].classList.contains('loading-state') || children[0].classList.contains('error-state'));
    
    if (hasOnlyLoadingOrError) {
      this.restoreOriginalContent();
    }
    
    this.updateConfigurationsList();
  }

  private restoreOriginalContent(): void {
    // Check if we need to restore the original content structure
    const table = this.container.querySelector('#configurationsTable');
    if (!table) {
      // The container was replaced by loading/error state, restore original structure to match index.html
      this.container.innerHTML = `
        <div class="view-content">
          <!-- Progress Bar Container -->
          <div id="configProgressContainer" class="progress-container" style="display: none;">
            <div class="progress-header">
              <h4 id="configProgressTitle">Running Configuration...</h4>
              <button id="cancelConfigBtn" class="btn btn-danger btn-small">Cancel</button>
            </div>
            <div class="progress-bar-wrapper">
              <div class="progress-bar">
                <div id="configProgressFill" class="progress-fill"></div>
              </div>
              <div class="progress-text">
                <span id="configProgressPercent">0%</span>
                <span id="configProgressMessage">Initializing...</span>
              </div>
            </div>
          </div>
          
          <div class="table-container">
            <table class="data-table" id="configurationsTable" style="display: none;">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Source</th>
                  <th>Target</th>
                  <th>Scripts</th>
                  <th>Last Run</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="configurationsTableBody">
              </tbody>
            </table>
            <div class="empty-state" id="configurationsEmptyState">
              <div class="empty-icon">⚙️</div>
              <h3>No Replication Configurations</h3>
              <p>Create your first replication configuration to start syncing databases.</p>
              <button class="btn btn-primary" onclick="dataReplicatorUI.showCreateConfigurationModal()">Create Configuration</button>
            </div>
          </div>
        </div>
      `;
      
      // Re-initialize the DOM element references
      this.configurationsTable = this.container.querySelector('#configurationsTable') as HTMLTableElement;
      this.configurationsTableBody = this.container.querySelector('#configurationsTableBody') as HTMLTableSectionElement;
      this.configurationsEmptyState = this.container.querySelector('#configurationsEmptyState') as HTMLElement;
      this.progressContainer = this.container.querySelector('#configProgressContainer') as HTMLElement;
      this.progressTitle = this.container.querySelector('#configProgressTitle') as HTMLElement;
      this.progressFill = this.container.querySelector('#configProgressFill') as HTMLElement;
      this.progressPercent = this.container.querySelector('#configProgressPercent') as HTMLElement;
      this.progressMessage = this.container.querySelector('#configProgressMessage') as HTMLElement;
      this.cancelBtn = this.container.querySelector('#cancelConfigBtn') as HTMLButtonElement;
      
      // Re-setup cancel button event listener
      if (this.cancelBtn) {
        this.cancelBtn.addEventListener('click', () => {
          eventBus.emit('replication:cancel', {});
        });
      }
    }
  }

  private updateConfigurationsList(): void {
    if (this.configurations.length === 0) {
      this.configurationsTable.style.display = 'none';
      this.configurationsEmptyState.style.display = 'block';
    } else {
      this.configurationsTable.style.display = 'table';
      this.configurationsEmptyState.style.display = 'none';
      
      this.configurationsTableBody.innerHTML = this.configurations.map(config => `
        <tr>
          <td>
            <span style="font-weight: 600; color: #0f172a;">${this.escapeHtml(config.name)}</span>
          </td>
          <td>
            <span>${this.getConnectionName(config.sourceConnectionId)}</span>
          </td>
          <td>
            <span>${this.getConnectionName(config.targetId)}</span>
          </td>
          <td>
            <span>${config.scriptIds.length} script${config.scriptIds.length !== 1 ? 's' : ''}</span>
          </td>
          <td>
            ${config.lastRun ? `<span>${this.formatDate(config.lastRun)}</span>` : '<span style="color: #9ca3af; font-style: italic;">Never</span>'}
          </td>
          <td>
            <div class="table-actions">
              <button class="btn btn-primary" onclick="window.dataReplicatorUI.runConfiguration('${config.id}')" title="Run Configuration">Run</button>
              <button class="btn btn-secondary" onclick="window.dataReplicatorUI.editConfiguration('${config.id}')" title="Edit Configuration">Edit</button>
              <button class="btn btn-danger" onclick="window.dataReplicatorUI.deleteConfiguration('${config.id}')" title="Delete Configuration">Delete</button>
            </div>
          </td>
        </tr>
      `).join('');
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private getConnectionName(connectionId: string): string {
    const connection = this.connections.find(c => c.id === connectionId);
    return connection ? connection.name : 'Unknown Connection';
  }

  /**
   * Load configurations data
   */
  async loadConfigurations(): Promise<void> {
    try {
      // Only show loading if component is initialized
      if (this.isInitialized) {
        this.showLoading('Loading configurations...');
      }
      
      const result = await window.electronAPI.configs.getAll();
      if (!result.success) {
        throw new Error(`Failed to fetch configurations: ${result.error}`);
      }

      const configs = result.data;
      if (Array.isArray(configs)) {
        this.configurations = configs.map(config => ({
          id: config.id,
          name: config.name,
          sourceConnectionId: config.sourceConnectionId,
          targetId: config.targetId,
          createTargetDatabase: config.createTargetDatabase || false,
          scriptIds: config.configScriptIds || [], // Backend uses 'configScriptIds', frontend uses 'scriptIds'
          createdAt: config.createdAt,
          updatedAt: config.updatedAt,
          lastRun: config.lastRun
        }));
        
        // Emit event for other components
        eventBus.emit('configurations:loaded', this.configurations);
        
        // Only render if component is initialized
        if (this.isInitialized) {
          this.render();
        }
      } else {
        throw new Error('Invalid configurations data structure');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to load configurations from storage.json: ${errorMessage}`);
      this.configurations = [];
      
      // Only show error if component is initialized
      if (this.isInitialized) {
        this.showError(`Failed to load configurations: ${errorMessage}`);
      }
    }
  }

  /**
   * Get current configurations
   */
  getConfigurations(): StoredConfiguration[] {
    return this.configurations;
  }

  /**
   * Update configurations data
   */
  updateConfigurations(configurations: StoredConfiguration[]): void {
    this.configurations = configurations;
    this.render();
    eventBus.emit('configurations:updated', configurations);
  }

  /**
   * Update connections data (needed for display)
   */
  updateConnections(connections: SavedConnection[]): void {
    this.connections = connections;
    this.render();
  }

  /**
   * Update scripts data (needed for display)
   */
  updateSqlScripts(_scripts: SavedSqlScript[]): void {
    // Scripts are not stored in this view
    this.render();
  }

  /**
   * Show progress bar for replication
   */
  showProgress(configName: string): void {
    if (this.progressContainer && this.progressTitle) {
      this.progressTitle.textContent = `Running "${configName}"...`;
      this.progressContainer.style.display = 'block';
      this.updateProgress({ progress: 0, message: 'Initializing...' });
    }
  }

  /**
   * Update progress bar
   */
  updateProgress(data: { progress?: number; message?: string }): void {
    if (!this.progressContainer) return;

    if (data.progress !== undefined && this.progressFill && this.progressPercent) {
      const progress = Math.max(0, Math.min(100, data.progress));
      this.progressFill.style.width = `${progress}%`;
      this.progressPercent.textContent = `${Math.round(progress)}%`;
    }

    if (data.message && this.progressMessage) {
      this.progressMessage.textContent = data.message;
    }
  }

  /**
   * Hide progress bar
   */
  hideProgress(): void {
    if (this.progressContainer) {
      this.progressContainer.style.display = 'none';
    }
  }
}
