import './styles.css';

// App state
interface AppState {
  isConnected: boolean;
  isReplicating: boolean;
  currentJobId: string | null;
  scripts: string[];
}

class DataReplicatorUI {
  private state: AppState = {
    isConnected: false,
    isReplicating: false,
    currentJobId: null,
    scripts: []
  };

  private elements = {
    connectionString: document.getElementById('connectionString') as HTMLTextAreaElement,
    testConnectionBtn: document.getElementById('testConnectionBtn') as HTMLButtonElement,
    targetType: document.getElementById('targetType') as HTMLSelectElement,
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
    loadingOverlay: document.getElementById('loadingOverlay') as HTMLDivElement
  };

  constructor() {
    this.initializeEventListeners();
    this.loadAppInfo();
    this.updateUI();
  }

  private initializeEventListeners(): void {
    // Connection testing
    this.elements.testConnectionBtn.addEventListener('click', () => {
      this.testConnection();
    });

    // Script management
    this.elements.addScriptBtn.addEventListener('click', () => {
      this.addScript();
    });

    // Replication control
    this.elements.startReplicationBtn.addEventListener('click', () => {
      this.startReplication();
    });

    this.elements.cancelReplicationBtn.addEventListener('click', () => {
      this.cancelReplication();
    });

    // Logs
    this.elements.clearLogsBtn.addEventListener('click', () => {
      this.clearLogs();
    });

    // Connection string validation
    this.elements.connectionString.addEventListener('input', () => {
      this.validateForm();
    });
  }

  private async loadAppInfo(): Promise<void> {
    try {
      const appInfo = await window.electronAPI.getAppInfo();
      this.elements.appInfo.textContent = `${appInfo.name} v${appInfo.version}`;
    } catch (error) {
      this.log(`Error loading app info: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  }

  private validateForm(): void {
    const hasConnectionString = this.elements.connectionString.value.trim().length > 0;
    this.elements.startReplicationBtn.disabled = !hasConnectionString || this.state.isReplicating;
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
      
      const result = await window.electronAPI.api.testConnection(connectionString);
      
      if (result.success) {
        this.state.isConnected = true;
        this.log(`Connection successful! Database: ${result.data.serverInfo.databaseName}`, 'success');
        this.log(`Found ${result.data.tables.length} tables`, 'info');
        this.elements.connectionStatus.textContent = 'Connected';
        this.elements.connectionStatus.className = 'status-connected';
      } else {
        this.state.isConnected = false;
        this.log(`Connection failed: ${result.message}`, 'error');
        this.elements.connectionStatus.textContent = 'Connection Failed';
        this.elements.connectionStatus.className = 'status-disconnected';
      }
    } catch (error) {
      this.state.isConnected = false;
      this.log(`Connection error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      this.elements.connectionStatus.textContent = 'Connection Error';
      this.elements.connectionStatus.className = 'status-disconnected';
    } finally {
      this.showLoading(false);
      this.elements.testConnectionBtn.disabled = false;
      this.updateUI();
    }
  }

  private async addScript(): Promise<void> {
    try {
      const scriptPath = await window.electronAPI.selectFile();
      
      if (scriptPath) {
        this.state.scripts.push(scriptPath);
        this.updateScriptList();
        this.log(`Added script: ${scriptPath}`, 'info');
      }
    } catch (error) {
      this.log(`Error adding script: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  }

  private removeScriptInternal(index: number): void {
    const removedScript = this.state.scripts[index];
    this.state.scripts.splice(index, 1);
    this.updateScriptList();
    this.log(`Removed script: ${removedScript}`, 'info');
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
              <button class="script-remove" onclick="app.removeScript(${index})">Remove</button>
            </div>
          `;
        })
        .join('');
    }
  }

  private async startReplication(): Promise<void> {
    const connectionString = this.elements.connectionString.value.trim();
    const targetType = this.elements.targetType.value;

    if (!connectionString) {
      this.log('Please enter a connection string', 'error');
      return;
    }

    this.state.isReplicating = true;
    this.showLoading(true);
    this.updateUI();

    try {
      this.log('Starting database replication...', 'info');
      
      const config = {
        connectionString,
        targetType,
        configScripts: this.state.scripts
      };

      const result = await window.electronAPI.api.startReplication(config);
      
      if (result.success) {
        this.state.currentJobId = result.data.jobId;
        this.log(`Replication started with job ID: ${result.data.jobId}`, 'success');
        this.elements.progressContainer.style.display = 'block';
        this.startProgressMonitoring();
      } else {
        throw new Error(result.message || 'Failed to start replication');
      }
    } catch (error) {
      this.state.isReplicating = false;
      this.log(`Failed to start replication: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      this.updateUI();
    } finally {
      this.showLoading(false);
    }
  }

  private async cancelReplication(): Promise<void> {
    if (!this.state.currentJobId) return;

    try {
      this.log('Cancelling replication...', 'info');
      
      const result = await window.electronAPI.api.cancelReplication(this.state.currentJobId);
      
      if (result.success) {
        this.log('Replication cancelled', 'warning');
      } else {
        this.log(`Failed to cancel replication: ${result.message}`, 'error');
      }
    } catch (error) {
      this.log(`Error cancelling replication: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  }

  private startProgressMonitoring(): void {
    if (!this.state.currentJobId) return;

    const monitorProgress = async () => {
      try {
        const result = await window.electronAPI.api.getReplicationStatus(this.state.currentJobId!);
        
        if (result.success) {
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
        this.log(`Error monitoring progress: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
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

  private clearLogs(): void {
    this.elements.logs.innerHTML = '';
  }

  private showLoading(show: boolean): void {
    this.elements.loadingOverlay.style.display = show ? 'flex' : 'none';
  }

  private updateUI(): void {
    this.validateForm();
    this.elements.cancelReplicationBtn.disabled = !this.state.isReplicating;
  }

  // Expose method for script removal (called from HTML)
  public removeScript(index: number): void {
    this.removeScriptInternal(index);
  }
}

// Initialize the application
const app = new DataReplicatorUI();

// Expose app instance globally for HTML event handlers
(window as any).app = app; 