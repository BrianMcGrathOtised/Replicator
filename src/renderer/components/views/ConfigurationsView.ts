import { BaseComponent } from '../common/BaseComponent';
import { StoredConfiguration, SavedConnection, SavedSqlScript } from '../common/types';
import { eventBus } from '../common/EventBus';

export class ConfigurationsView extends BaseComponent {
  private configurations: StoredConfiguration[] = [];
  private connections: SavedConnection[] = [];
  private configurationsTable!: HTMLTableElement;
  private configurationsTableBody!: HTMLTableSectionElement;
  private configurationsEmptyState!: HTMLElement;

  constructor() {
    super('configurations-view');
  }

  initialize(): void {
    this.configurationsTable = this.container.querySelector('#configurationsTable') as HTMLTableElement;
    this.configurationsTableBody = this.container.querySelector('#configurationsTableBody') as HTMLTableSectionElement;
    this.configurationsEmptyState = this.container.querySelector('#configurationsEmptyState') as HTMLElement;

    if (!this.configurationsTable || !this.configurationsTableBody || !this.configurationsEmptyState) {
      throw new Error('Required DOM elements not found in configurations view');
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

    eventBus.on('scripts:loaded', () => {
      // Scripts loaded - configurations view doesn't need to store them
      this.render();
    });

    eventBus.on('scripts:updated', () => {
      // Scripts updated - configurations view doesn't need to store them
      this.render();
    });
  }

  render(): void {
    this.updateConfigurationsList();
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
          <td>${this.escapeHtml(config.name)}</td>
          <td>${this.getConnectionName(config.sourceConnectionId)}</td>
          <td>${this.getConnectionName(config.targetId)}</td>
          <td>${config.scriptIds.length}</td>
          <td>${config.lastRun ? this.formatDate(config.lastRun) : 'Never'}</td>
          <td>
            <div class="table-actions">
              <button class="btn btn-small btn-primary" onclick="window.dataReplicatorUI.runConfiguration('${config.id}')" title="Run Configuration">Run</button>
              <button class="btn btn-small btn-secondary" onclick="window.dataReplicatorUI.editConfiguration('${config.id}')" title="Edit Configuration">Edit</button>
              <button class="btn btn-small btn-danger" onclick="window.dataReplicatorUI.deleteConfiguration('${config.id}')" title="Delete Configuration">Delete</button>
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
      this.showLoading('Loading configurations...');
      
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
          scriptIds: config.scriptIds || [],
          createdAt: config.createdAt,
          updatedAt: config.updatedAt,
          lastRun: config.lastRun
        }));
        
        // Emit event for other components
        eventBus.emit('configurations:loaded', this.configurations);
        
        this.render();
        console.log(`Loaded ${this.configurations.length} configurations from storage.json`);
      } else {
        throw new Error('Invalid configurations data structure');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to load configurations from storage.json: ${errorMessage}`);
      this.configurations = [];
      this.showError(`Failed to load configurations: ${errorMessage}`);
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
}
