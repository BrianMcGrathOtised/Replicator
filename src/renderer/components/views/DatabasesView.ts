import { BaseComponent } from '../common/BaseComponent';
import { SavedConnection } from '../common/types';
import { eventBus } from '../common/EventBus';

export class DatabasesView extends BaseComponent {
  private connections: SavedConnection[] = [];
  private connectionsTable!: HTMLTableElement;
  private connectionsTableBody!: HTMLTableSectionElement;
  private connectionsEmptyState!: HTMLElement;

  constructor() {
    super('databases-view');
  }

  initialize(): void {
    this.connectionsTable = this.container.querySelector('#connectionsTable') as HTMLTableElement;
    this.connectionsTableBody = this.container.querySelector('#connectionsTableBody') as HTMLTableSectionElement;
    this.connectionsEmptyState = this.container.querySelector('#connectionsEmptyState') as HTMLElement;

    if (!this.connectionsTable || !this.connectionsTableBody || !this.connectionsEmptyState) {
      throw new Error('Required DOM elements not found in databases view');
    }

    // Listen for data updates
    eventBus.on('connections:updated', (event) => {
      this.connections = event.data || [];
      this.render();
    });

    eventBus.on('connections:loaded', (event) => {
      this.connections = event.data || [];
      this.render();
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
    
    this.updateConnectionsList();
  }

  private restoreOriginalContent(): void {
    // Check if we need to restore the original content structure
    const table = this.container.querySelector('#connectionsTable');
    if (!table) {
      // The container was replaced by loading/error state, restore original structure to match index.html
      this.container.innerHTML = `
        <div class="view-content">
          <div class="table-container">
            <table class="data-table" id="connectionsTable" style="display: none;">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Database</th>
                  <th>Server Type</th>
                  <th>Target DB</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="connectionsTableBody">
              </tbody>
            </table>
            <div class="empty-state" id="connectionsEmptyState">
              <div class="empty-icon">🗄️</div>
              <h3>No Database Connections</h3>
              <p>Create your first database connection to get started with replication.</p>
              <button class="btn btn-primary" onclick="dataReplicatorUI.showConnectionModal()">Add Connection</button>
            </div>
          </div>
        </div>
      `;
      
      // Re-initialize the DOM element references
      this.connectionsTable = this.container.querySelector('#connectionsTable') as HTMLTableElement;
      this.connectionsTableBody = this.container.querySelector('#connectionsTableBody') as HTMLTableSectionElement;
      this.connectionsEmptyState = this.container.querySelector('#connectionsEmptyState') as HTMLElement;
    }
  }

  private updateConnectionsList(): void {
    if (this.connections.length === 0) {
      this.connectionsTable.style.display = 'none';
      this.connectionsEmptyState.style.display = 'block';
    } else {
      this.connectionsTable.style.display = 'table';
      this.connectionsEmptyState.style.display = 'none';
      
      this.connectionsTableBody.innerHTML = this.connections.map(conn => `
        <tr>
          <td>
            <div style="display: flex; flex-direction: column;">
              <span style="font-weight: 600; color: #0f172a;">${this.escapeHtml(conn.name)}</span>
              ${conn.description ? `<small style="color: #64748b; margin-top: 0.25rem;">${this.escapeHtml(conn.description)}</small>` : ''}
            </div>
          </td>
          <td>${this.escapeHtml(conn.databaseName)}</td>
          <td>
            <div class="server-type">
              <span class="server-icon">${conn.isAzure ? '☁️' : '🖥️'}</span>
              <span>${conn.isAzure ? 'Azure SQL' : 'SQL Server'}</span>
            </div>
          </td>
          <td>
            ${conn.isTargetDatabase ? 
              '<span class="status-badge target">Target</span>' : 
              '<span class="status-badge source">Source</span>'
            }
          </td>
          <td>
            <div style="display: flex; flex-direction: column;">
              <span>${this.formatDate(conn.createdAt)}</span>
              <small style="color: #64748b; margin-top: 0.25rem;">
                ${this.getRelativeTime(new Date(conn.createdAt))}
              </small>
            </div>
          </td>
          <td>
            <div class="table-actions">
              <button class="btn btn-secondary" onclick="window.dataReplicatorUI.editConnection('${conn.id}')">Edit</button>
              <button class="btn btn-danger" onclick="window.dataReplicatorUI.deleteConnection('${conn.id}')">Delete</button>
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

  private getRelativeTime(date: Date): string {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) {
      return 'Just now';
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    } else if (diffInSeconds < 2592000) {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days} day${days !== 1 ? 's' : ''} ago`;
    } else {
      const months = Math.floor(diffInSeconds / 2592000);
      return `${months} month${months !== 1 ? 's' : ''} ago`;
    }
  }

  /**
   * Load connections data
   */
  async loadConnections(): Promise<void> {
    try {
      // Only show loading if component is initialized
      if (this.isInitialized) {
        this.showLoading('Loading connections...');
      }
      
      const result = await window.electronAPI.connections.getAll();
      if (!result.success) {
        throw new Error(`Failed to fetch connections: ${result.error}`);
      }

      const connections = result.data;
      if (Array.isArray(connections)) {
        this.connections = connections.map(conn => ({
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
        
        // Emit event for other components
        eventBus.emit('connections:loaded', this.connections);
        
        // Only render if component is initialized
        if (this.isInitialized) {
          this.render();
        }
        console.log(`Loaded ${this.connections.length} connections from storage.json`);
      } else {
        throw new Error('Invalid connections data structure');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to load connections from storage.json: ${errorMessage}`);
      this.connections = [];
      
      // Only show error if component is initialized
      if (this.isInitialized) {
        this.showError(`Failed to load connections: ${errorMessage}`);
      }
    }
  }

  /**
   * Get current connections
   */
  getConnections(): SavedConnection[] {
    return this.connections;
  }

  /**
   * Update connections data
   */
  updateConnections(connections: SavedConnection[]): void {
    this.connections = connections;
    this.render();
    eventBus.emit('connections:updated', connections);
  }
}
