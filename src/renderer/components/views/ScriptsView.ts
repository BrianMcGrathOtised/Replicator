import { BaseComponent } from '../common/BaseComponent';
import { SavedSqlScript } from '../common/types';
import { eventBus } from '../common/EventBus';

export class ScriptsView extends BaseComponent {
  private sqlScripts: SavedSqlScript[] = [];
  private scriptsTable!: HTMLTableElement;
  private scriptsTableBody!: HTMLTableSectionElement;
  private scriptsEmptyState!: HTMLElement;

  constructor() {
    super('scripts-view');
  }

  initialize(): void {
    this.scriptsTable = this.container.querySelector('#scriptsTable') as HTMLTableElement;
    this.scriptsTableBody = this.container.querySelector('#scriptsTableBody') as HTMLTableSectionElement;
    this.scriptsEmptyState = this.container.querySelector('#scriptsEmptyState') as HTMLElement;

    if (!this.scriptsTable || !this.scriptsTableBody || !this.scriptsEmptyState) {
      throw new Error('Required DOM elements not found in scripts view');
    }

    // Listen for data updates
    eventBus.on('scripts:updated', (event) => {
      this.sqlScripts = event.data || [];
      this.render();
    });

    eventBus.on('scripts:loaded', (event) => {
      this.sqlScripts = event.data || [];
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
    
    this.updateScriptsList();
  }

  private restoreOriginalContent(): void {
    // Check if we need to restore the original content structure
    const table = this.container.querySelector('#scriptsTable');
    if (!table) {
      // The container was replaced by loading/error state, restore original structure to match index.html
      this.container.innerHTML = `
        <div class="view-content">
          <div class="table-container">
            <table class="data-table" id="scriptsTable" style="display: none;">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Length</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="scriptsTableBody">
              </tbody>
            </table>
            <div class="empty-state" id="scriptsEmptyState">
              <div class="empty-icon">📝</div>
              <h3>No SQL Scripts</h3>
              <p>Create your first SQL script to run after replication.</p>
            </div>
          </div>
        </div>
      `;
      
      // Re-initialize the DOM element references
      this.scriptsTable = this.container.querySelector('#scriptsTable') as HTMLTableElement;
      this.scriptsTableBody = this.container.querySelector('#scriptsTableBody') as HTMLTableSectionElement;
      this.scriptsEmptyState = this.container.querySelector('#scriptsEmptyState') as HTMLElement;
    }
  }

  private updateScriptsList(): void {
    if (this.sqlScripts.length === 0) {
      this.scriptsTable.style.display = 'none';
      this.scriptsEmptyState.style.display = 'block';
    } else {
      this.scriptsTable.style.display = 'table';
      this.scriptsEmptyState.style.display = 'none';
      
      this.scriptsTableBody.innerHTML = this.sqlScripts.map(script => `
        <tr>
          <td>
            <div style="display: flex; flex-direction: column;">
              <span style="font-weight: 600; color: #0f172a;">${this.escapeHtml(script.name)}</span>
              ${script.description ? `<small style="color: #64748b; margin-top: 0.25rem;">${this.escapeHtml(script.description)}</small>` : ''}
            </div>
          </td>
          <td>
            ${script.description ? this.escapeHtml(script.description) : '<span style="color: #9ca3af; font-style: italic;">No description</span>'}
          </td>
          <td>
            <div style="display: flex; flex-direction: column;">
              <span>${script.content.length.toLocaleString()} characters</span>
              <small style="color: #64748b; margin-top: 0.25rem;">
                ${Math.ceil(script.content.length / 100)} lines (approx.)
              </small>
            </div>
          </td>
          <td>
            <div style="display: flex; flex-direction: column;">
              <span>${this.formatDate(script.createdAt)}</span>
              <small style="color: #64748b; margin-top: 0.25rem;">
                ${this.getRelativeTime(new Date(script.createdAt))}
              </small>
            </div>
          </td>
          <td>
            <div class="table-actions">
              <button class="btn btn-secondary" onclick="window.dataReplicatorUI.editScript('${script.id}')">Edit</button>
              <button class="btn btn-danger" onclick="window.dataReplicatorUI.deleteScript('${script.id}')">Delete</button>
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
   * Load SQL scripts data
   */
  async loadSqlScripts(): Promise<void> {
    try {
      // Only show loading if component is initialized
      if (this.isInitialized) {
        this.showLoading('Loading scripts...');
      }
      
      const result = await window.electronAPI.scripts.getAll();
      if (!result.success) {
        throw new Error(`Failed to fetch scripts: ${result.error}`);
      }

      const scripts = result.data;
      if (Array.isArray(scripts)) {
        this.sqlScripts = scripts.map(script => ({
          id: script.id,
          name: script.name,
          content: script.content,
          description: script.description || '',
          createdAt: script.createdAt,
          updatedAt: script.updatedAt
        }));
        
        // Emit event for other components
        eventBus.emit('scripts:loaded', this.sqlScripts);
        
        // Only render if component is initialized
        if (this.isInitialized) {
          this.render();
        }
        console.log(`Loaded ${this.sqlScripts.length} SQL scripts from storage.json`);
      } else {
        throw new Error('Invalid scripts data structure');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to load scripts from storage.json: ${errorMessage}`);
      this.sqlScripts = [];
      
      // Only show error if component is initialized
      if (this.isInitialized) {
        this.showError(`Failed to load scripts: ${errorMessage}`);
      }
    }
  }

  /**
   * Get current scripts
   */
  getSqlScripts(): SavedSqlScript[] {
    return this.sqlScripts;
  }

  /**
   * Update scripts data
   */
  updateSqlScripts(scripts: SavedSqlScript[]): void {
    this.sqlScripts = scripts;
    this.render();
    eventBus.emit('scripts:updated', scripts);
  }
}
