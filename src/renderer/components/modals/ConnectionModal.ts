import { BaseComponent } from '../common/BaseComponent';
import { SavedConnection } from '../common/types';
import { eventBus } from '../common/EventBus';

export class ConnectionModal extends BaseComponent {
  private modal!: HTMLElement;
  private modalTitle!: HTMLElement;
  private form!: HTMLFormElement;
  private closeBtn!: HTMLButtonElement;
  private cancelBtn!: HTMLButtonElement;
  private saveBtn!: HTMLButtonElement;
  private testConnectionBtn!: HTMLButtonElement;
  
  // Form fields
  private connectionName!: HTMLInputElement;
  private serverType!: HTMLSelectElement;
  private server!: HTMLInputElement;
  private database!: HTMLInputElement;
  private username!: HTMLInputElement;
  private password!: HTMLInputElement;
  private port!: HTMLInputElement;
  private connectionDescription!: HTMLTextAreaElement;
  private isTargetDatabase!: HTMLInputElement;
  
  private currentConnection: SavedConnection | null = null;
  private isEditing: boolean = false;

  constructor() {
    super('connectionModal');
  }

  initialize(): void {
    this.modal = this.container;
    this.modalTitle = this.container.querySelector('#connectionModalTitle') as HTMLElement;
    this.form = this.container.querySelector('#connectionForm') as HTMLFormElement;
    this.closeBtn = this.container.querySelector('#connectionModalCloseBtn') as HTMLButtonElement;
    this.cancelBtn = this.container.querySelector('#connectionModalCancelBtn') as HTMLButtonElement;
    this.saveBtn = this.container.querySelector('#connectionModalSaveBtn') as HTMLButtonElement;
    this.testConnectionBtn = this.container.querySelector('#testConnectionBtn') as HTMLButtonElement;
    
    // Form fields
    this.connectionName = this.container.querySelector('#connectionName') as HTMLInputElement;
    this.serverType = this.container.querySelector('#serverType') as HTMLSelectElement;
    this.server = this.container.querySelector('#server') as HTMLInputElement;
    this.database = this.container.querySelector('#database') as HTMLInputElement;
    this.username = this.container.querySelector('#username') as HTMLInputElement;
    this.password = this.container.querySelector('#password') as HTMLInputElement;
    this.port = this.container.querySelector('#port') as HTMLInputElement;
    this.connectionDescription = this.container.querySelector('#connectionDescription') as HTMLTextAreaElement;
    this.isTargetDatabase = this.container.querySelector('#isTargetDatabase') as HTMLInputElement;

    this.setupEventListeners();
  }

  render(): void {
    // Modal rendering is handled by show/hide methods
  }

  private setupEventListeners(): void {
    // Close button handlers
    this.closeBtn.addEventListener('click', () => this.hide());
    this.cancelBtn.addEventListener('click', () => this.hide());
    
    // Save button handler
    this.saveBtn.addEventListener('click', () => this.handleSave());
    
    // Test connection handler
    this.testConnectionBtn.addEventListener('click', () => this.handleTestConnection());
    
    // Form submission handler
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSave();
    });
    
    // Close modal when clicking outside
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.hide();
      }
    });
    
    // Server type change handler
    this.serverType.addEventListener('change', () => this.onServerTypeChange());
  }

  private onServerTypeChange(): void {
    const isAzure = this.serverType.value === 'azure-sql';
    
    if (isAzure) {
      this.server.placeholder = 'e.g., myserver.database.windows.net';
      this.username.placeholder = 'e.g., user@domain.com';
    } else {
      this.server.placeholder = 'e.g., localhost';
      this.username.placeholder = 'e.g., sa';
    }
  }

  /**
   * Show modal for creating new connection
   */
  showForCreate(): void {
    // Ensure modal is initialized before using
    if (!this.isInitialized) {
      this.show(); // This will initialize the modal
    }
    
    this.isEditing = false;
    this.currentConnection = null;
    this.modalTitle.textContent = 'Add Database Connection';
    this.resetForm();
    this.show();
  }

  /**
   * Show modal for editing existing connection
   */
  showForEdit(connection: SavedConnection): void {
    // Ensure modal is initialized before using
    if (!this.isInitialized) {
      this.show(); // This will initialize the modal
    }
    
    this.isEditing = true;
    this.currentConnection = connection;
    this.modalTitle.textContent = 'Edit Database Connection';
    this.populateForm(connection);
    this.show();
  }

  /**
   * Show modal for creating target connection
   */
  showForTarget(): void {
    // Ensure modal is initialized before using
    if (!this.isInitialized) {
      this.show(); // This will initialize the modal
    }
    
    this.isEditing = false;
    this.currentConnection = null;
    this.modalTitle.textContent = 'Add Target Database Connection';
    this.resetForm();
    
    // Pre-fill with local connection template
    this.server.value = 'localhost';
    this.database.value = 'MyDatabase';
    this.serverType.value = 'sqlserver';
    this.isTargetDatabase.checked = true;
    
    this.show();
  }

  show(): void {
    // Ensure component is initialized first
    if (!this.isInitialized) {
      this.initialize();
      this.isInitialized = true;
    }
    
    this.modal.style.display = 'flex';
    this.connectionName.focus();
  }

  hide(): void {
    this.modal.style.display = 'none';
    this.resetForm();
  }

  private resetForm(): void {
    this.form.reset();
    this.onServerTypeChange(); // Update placeholders
  }

  private populateForm(connection: SavedConnection): void {
    this.connectionName.value = connection.name;
    this.database.value = connection.databaseName;
    this.connectionDescription.value = connection.description || '';
    this.isTargetDatabase.checked = connection.isTargetDatabase;
    this.serverType.value = connection.isAzure ? 'azure-sql' : 'sqlserver';
    
    // Note: We don't populate server, username, password, port as they need to be fetched from the backend
    this.onServerTypeChange();
  }

  private async handleTestConnection(): Promise<void> {
    if (!this.validateForm()) {
      return;
    }
    
    this.testConnectionBtn.disabled = true;
    this.testConnectionBtn.textContent = 'Testing...';
    
    try {
      const connectionString = this.buildConnectionString();
      const result = await window.electronAPI.replication.testConnection(connectionString);
      
      if (result.success) {
        alert('Connection test successful!');
      } else {
        alert(`Connection test failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      alert(`Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.testConnectionBtn.disabled = false;
      this.testConnectionBtn.textContent = 'Test Connection';
    }
  }

  private async handleSave(): Promise<void> {
    if (!this.validateForm()) {
      return;
    }
    
    this.saveBtn.disabled = true;
    this.saveBtn.textContent = 'Saving...';
    
    try {
      const connectionData = {
        name: this.connectionName.value.trim(),
        serverType: this.serverType.value,
        server: this.server.value.trim(),
        database: this.database.value.trim(),
        username: this.username.value.trim(),
        password: this.password.value,
        port: this.port.value ? parseInt(this.port.value) : undefined,
        description: this.connectionDescription.value.trim() || undefined,
        isTargetDatabase: this.isTargetDatabase.checked
      };
      
      let result;
      if (this.isEditing && this.currentConnection) {
        result = await window.electronAPI.connections.update(this.currentConnection.id, connectionData);
      } else {
        result = await window.electronAPI.connections.create(connectionData);
      }
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      console.log(`Connection ${this.isEditing ? 'updated' : 'created'} successfully`);
      
      // Emit event to refresh connections
      eventBus.emit('connections:refresh');
      
      this.hide();
      
    } catch (error) {
      console.error(`Failed to ${this.isEditing ? 'update' : 'create'} connection:`, error);
      alert(`Failed to ${this.isEditing ? 'update' : 'create'} connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.saveBtn.disabled = false;
      this.saveBtn.textContent = this.isEditing ? 'Update Connection' : 'Save Connection';
    }
  }

  private validateForm(): boolean {
    const requiredFields = [
      { field: this.connectionName, name: 'Connection Name' },
      { field: this.server, name: 'Server' },
      { field: this.database, name: 'Database' },
      { field: this.username, name: 'Username' },
      { field: this.password, name: 'Password' }
    ];
    
    for (const { field, name } of requiredFields) {
      if (!field.value.trim()) {
        alert(`${name} is required`);
        field.focus();
        return false;
      }
    }
    
    // Validate port if provided
    if (this.port.value) {
      const portNum = parseInt(this.port.value);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        alert('Port must be a number between 1 and 65535');
        this.port.focus();
        return false;
      }
    }
    
    return true;
  }

  private buildConnectionString(): string {
    const isAzure = this.serverType.value === 'azure-sql';
    const server = this.server.value.trim();
    const database = this.database.value.trim();
    const username = this.username.value.trim();
    const password = this.password.value;
    const port = this.port.value ? parseInt(this.port.value) : (isAzure ? 1433 : 1433);
    
    if (isAzure) {
      return `Server=tcp:${server},${port};Database=${database};User ID=${username};Password=${password};Encrypt=true;TrustServerCertificate=false;Connection Timeout=30;`;
    } else {
      return `Server=${server},${port};Database=${database};User ID=${username};Password=${password};Integrated Security=false;TrustServerCertificate=true;Connection Timeout=30;`;
    }
  }
}
