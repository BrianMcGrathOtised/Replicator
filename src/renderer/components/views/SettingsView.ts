import { BaseComponent } from '../common/BaseComponent';
import { eventBus } from '../common/EventBus';

export class SettingsView extends BaseComponent {
  // Tab elements
  private tabButtons!: NodeListOf<HTMLButtonElement>;
  private tabContents!: NodeListOf<HTMLElement>;
  
  // Export elements
  private exportConnections!: HTMLInputElement;
  private exportScripts!: HTMLInputElement;
  private exportConfigs!: HTMLInputElement;
  private exportBtn!: HTMLButtonElement;
  
  // Import elements
  private importMode!: HTMLSelectElement;
  private generateNewIds!: HTMLInputElement;
  private importBtn!: HTMLButtonElement;
  
  // App info elements
  private appVersion!: HTMLElement;

  constructor() {
    super('settings-view');
  }

  initialize(): void {
    // Get tab elements
    this.tabButtons = this.container.querySelectorAll('.settings-tab-button');
    this.tabContents = this.container.querySelectorAll('.settings-tab-content');
    
    // Get export elements
    this.exportConnections = this.container.querySelector('#exportConnections') as HTMLInputElement;
    this.exportScripts = this.container.querySelector('#exportScripts') as HTMLInputElement;
    this.exportConfigs = this.container.querySelector('#exportConfigs') as HTMLInputElement;
    this.exportBtn = this.container.querySelector('#exportBtn') as HTMLButtonElement;
    
    // Get import elements
    this.importMode = this.container.querySelector('#importMode') as HTMLSelectElement;
    this.generateNewIds = this.container.querySelector('#generateNewIds') as HTMLInputElement;
    this.importBtn = this.container.querySelector('#importBtn') as HTMLButtonElement;
    
    // Get app info elements
    this.appVersion = this.container.querySelector('#appVersion') as HTMLElement;

    this.setupEventListeners();
    this.loadAppInfo();
  }

  render(): void {
    // Settings view doesn't need dynamic rendering
  }

  private setupEventListeners(): void {
    // Tab handlers
    this.tabButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const target = e.target as HTMLButtonElement;
        const tabName = target.dataset.tab;
        if (tabName) {
          this.switchTab(tabName);
        }
      });
    });
    
    // Export handler
    this.exportBtn.addEventListener('click', () => this.handleExport());
    
    // Import handler
    this.importBtn.addEventListener('click', () => this.handleImport());
  }

  private switchTab(tabName: string): void {
    // Update tab buttons
    this.tabButtons.forEach(button => {
      if (button.dataset.tab === tabName) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    });
    
    // Update tab contents
    this.tabContents.forEach(content => {
      if (content.id === `${tabName}-tab`) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });
  }

  private async handleExport(): Promise<void> {
    try {
      this.exportBtn.disabled = true;
      this.exportBtn.textContent = 'Exporting...';
      
      const exportOptions = {
        includeConnections: this.exportConnections.checked,
        includeScripts: this.exportScripts.checked,
        includeConfigurations: this.exportConfigs.checked
      };
      
      console.log('Export options:', exportOptions);
      
      // Get export data
      const result = await window.electronAPI.config.export(exportOptions);
      
      if (!result.success) {
        throw new Error(`Export failed: ${result.error}`);
      }
      
      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const defaultName = `replicator-config-${timestamp}.json`;
      
      // Save to file
      const filePath = await window.electronAPI.saveConfigFile(defaultName);
      if (filePath) {
        await window.electronAPI.config.saveToFile(filePath, result.data);
        console.log(`Configuration exported to: ${filePath}`);
        alert(`Configuration exported successfully to:\n${filePath}`);
      }
      
    } catch (error) {
      console.error('Export failed:', error);
      alert(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.exportBtn.disabled = false;
      this.exportBtn.textContent = 'Export to File';
    }
  }

  private async handleImport(): Promise<void> {
    try {
      this.importBtn.disabled = true;
      this.importBtn.textContent = 'Importing...';
      
      // Select file to import
      const filePath = await window.electronAPI.selectConfigFile();
      if (!filePath) {
        return; // User cancelled
      }
      
      // Load configuration from file
      const loadResult = await window.electronAPI.config.loadFromFile(filePath);
      if (!loadResult.success) {
        throw new Error(`Failed to load configuration: ${loadResult.error}`);
      }
      
      const configData = loadResult.data;
      
      // Show import preview
      this.showImportPreview(configData);
      
    } catch (error) {
      console.error('Import failed:', error);
      alert(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.importBtn.disabled = false;
      this.importBtn.textContent = 'Import from File';
    }
  }

  private showImportPreview(configData: any): void {
    const importOptions = {
      mode: this.importMode.value,
      generateNewIds: this.generateNewIds.checked
    };
    
    // Emit event to show import preview modal
    eventBus.emit('import:preview', { configData, importOptions });
  }

  private async loadAppInfo(): Promise<void> {
    try {
      const appInfo = await window.electronAPI.getAppInfo();
      this.appVersion.textContent = appInfo.version;
    } catch (error) {
      console.error('Failed to load app info:', error);
      this.appVersion.textContent = 'Unknown';
    }
  }

  /**
   * Confirm and execute import
   */
  async confirmImport(configData: any, importOptions: any): Promise<void> {
    try {
      console.log('Importing configuration with options:', importOptions);
      
      const result = await window.electronAPI.config.import(configData, importOptions);
      
      if (!result.success) {
        throw new Error(`Import failed: ${result.error}`);
      }
      
      console.log('Configuration imported successfully');
      alert('Configuration imported successfully! Please refresh the data to see changes.');
      
      // Emit event to refresh all data
      eventBus.emit('data:refresh');
      
    } catch (error) {
      console.error('Import failed:', error);
      alert(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
