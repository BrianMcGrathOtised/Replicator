import { BaseComponent } from '../common/BaseComponent';
import { SavedConnection, SchemaDifference, DataDifference } from '../common/types';
import { eventBus } from '../common/EventBus';

export class DatabaseCompareView extends BaseComponent {
  private connections: SavedConnection[] = [];
  private lastComparisonResults: any = null;
  
  // Form elements
  private sourceDbSelect!: HTMLSelectElement;
  private targetDbSelect!: HTMLSelectElement;
  private startCompareBtn!: HTMLButtonElement;
  private exportCompareBtn!: HTMLButtonElement;
  
  // Option checkboxes
  private compareSchema!: HTMLInputElement;
  private compareData!: HTMLInputElement;
  private compareIndexes!: HTMLInputElement;
  private compareConstraints!: HTMLInputElement;
  
  // Results elements
  private compareResultsSection!: HTMLElement;
  private totalDifferences!: HTMLElement;
  private schemaDifferences!: HTMLElement;
  private dataDifferences!: HTMLElement;
  
  // Tab elements
  private tabButtons!: NodeListOf<HTMLButtonElement>;
  private tabContents!: NodeListOf<HTMLElement>;
  
  // Table elements
  private schemaDiffTable!: HTMLTableElement;
  private schemaDiffTableBody!: HTMLTableSectionElement;
  private schemaDiffEmptyState!: HTMLElement;
  private dataDiffTable!: HTMLTableElement;
  private dataDiffTableBody!: HTMLTableSectionElement;
  private dataDiffEmptyState!: HTMLElement;
  private summaryReport!: HTMLElement;

  constructor() {
    super('database-compare-view');
  }

  initialize(): void {
    // Get form elements
    this.sourceDbSelect = this.container.querySelector('#sourceDbSelect') as HTMLSelectElement;
    this.targetDbSelect = this.container.querySelector('#targetDbSelect') as HTMLSelectElement;
    this.startCompareBtn = this.container.querySelector('#startCompareBtn') as HTMLButtonElement;
    this.exportCompareBtn = this.container.querySelector('#exportCompareBtn') as HTMLButtonElement;
    
    // Get option checkboxes
    this.compareSchema = this.container.querySelector('#compareSchema') as HTMLInputElement;
    this.compareData = this.container.querySelector('#compareData') as HTMLInputElement;
    this.compareIndexes = this.container.querySelector('#compareIndexes') as HTMLInputElement;
    this.compareConstraints = this.container.querySelector('#compareConstraints') as HTMLInputElement;
    
    // Get results elements
    this.compareResultsSection = this.container.querySelector('#compareResultsSection') as HTMLElement;
    this.totalDifferences = this.container.querySelector('#totalDifferences') as HTMLElement;
    this.schemaDifferences = this.container.querySelector('#schemaDifferences') as HTMLElement;
    this.dataDifferences = this.container.querySelector('#dataDifferences') as HTMLElement;
    
    // Get tab elements
    this.tabButtons = this.container.querySelectorAll('.results-tab-button');
    this.tabContents = this.container.querySelectorAll('.results-tab-content');
    
    // Get table elements
    this.schemaDiffTable = this.container.querySelector('#schemaDiffTable') as HTMLTableElement;
    this.schemaDiffTableBody = this.container.querySelector('#schemaDiffTableBody') as HTMLTableSectionElement;
    this.schemaDiffEmptyState = this.container.querySelector('#schemaDiffEmptyState') as HTMLElement;
    this.dataDiffTable = this.container.querySelector('#dataDiffTable') as HTMLTableElement;
    this.dataDiffTableBody = this.container.querySelector('#dataDiffTableBody') as HTMLTableSectionElement;
    this.dataDiffEmptyState = this.container.querySelector('#dataDiffEmptyState') as HTMLElement;
    this.summaryReport = this.container.querySelector('#summaryReport') as HTMLElement;

    this.setupEventListeners();
    
    // Listen for connections updates
    eventBus.on('connections:loaded', (event) => {
      this.connections = event.data || [];
      this.updateConnectionSelects();
    });

    eventBus.on('connections:updated', (event) => {
      this.connections = event.data || [];
      this.updateConnectionSelects();
    });
  }

  render(): void {
    // Only render if component is initialized
    if (!this.isInitialized) {
      return;
    }
    this.updateConnectionSelects();
  }

  private setupEventListeners(): void {
    // Database selection change handlers
    this.sourceDbSelect.addEventListener('change', () => this.onDatabaseSelectionChange());
    this.targetDbSelect.addEventListener('change', () => this.onDatabaseSelectionChange());
    
    // Button handlers
    this.startCompareBtn.addEventListener('click', () => this.startDatabaseComparison());
    this.exportCompareBtn.addEventListener('click', () => this.exportComparisonResults());
    
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
  }

  private onDatabaseSelectionChange(): void {
    const sourceSelected = this.sourceDbSelect.value !== '';
    const targetSelected = this.targetDbSelect.value !== '';
    this.startCompareBtn.disabled = !(sourceSelected && targetSelected);
  }

  private updateConnectionSelects(): void {
    // Clear existing options
    this.sourceDbSelect.innerHTML = '<option value="">Select source database...</option>';
    this.targetDbSelect.innerHTML = '<option value="">Select target database...</option>';
    
    // Add connection options
    this.connections.forEach(conn => {
      const option = document.createElement('option');
      option.value = conn.id;
      option.textContent = `${conn.name} (${conn.databaseName})`;
      
      this.sourceDbSelect.appendChild(option.cloneNode(true));
      this.targetDbSelect.appendChild(option);
    });
    
    this.onDatabaseSelectionChange();
  }

  private async startDatabaseComparison(): Promise<void> {
    const sourceConnId = this.sourceDbSelect.value;
    const targetConnId = this.targetDbSelect.value;
    
    if (!sourceConnId || !targetConnId) {
      alert('Please select both source and target databases');
      return;
    }
    
    const sourceConn = this.connections.find(c => c.id === sourceConnId);
    const targetConn = this.connections.find(c => c.id === targetConnId);
    
    if (!sourceConn || !targetConn) {
      alert('Selected connections not found');
      return;
    }
    
    this.startCompareBtn.disabled = true;
    this.startCompareBtn.textContent = 'Comparing...';
    
    try {
      await this.performDatabaseComparison(sourceConn, targetConn);
    } catch (error) {
      console.error('Database comparison failed:', error);
      alert(`Comparison failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.startCompareBtn.disabled = false;
      this.startCompareBtn.textContent = 'Start Comparison';
    }
  }

  private async performDatabaseComparison(sourceConn: SavedConnection, targetConn: SavedConnection): Promise<void> {
    const compareOptions = {
      schema: this.compareSchema?.checked || false,
      data: this.compareData?.checked || false,
      indexes: this.compareIndexes?.checked || false,
      constraints: this.compareConstraints?.checked || false
    };
    
    console.log(`Comparing ${sourceConn.name} (${sourceConn.databaseName}) with ${targetConn.name} (${targetConn.databaseName})`);
    console.log(`Comparison options:`, compareOptions);
    
    try {
      // Perform real schema comparison if schema option is selected
      let schemaResults = null;
      if (compareOptions.schema) {
        console.log('Performing schema comparison...');
        const schemaComparisonResult = await window.electronAPI.schema.compare(sourceConn.id, targetConn.id);
        
        if (!schemaComparisonResult.success) {
          throw new Error(`Schema comparison failed: ${schemaComparisonResult.error}`);
        }
        
        schemaResults = schemaComparisonResult.data;
        console.log(`Schema comparison completed: ${schemaResults.totalDifferences} differences found`);
      }
      
      // Perform real data comparison if data option is selected
      let dataResults: any = null;
      if (compareOptions.data) {
        console.log('Performing data comparison...');
        const dataComparisonResult = await window.electronAPI.data.compare(sourceConn.id, targetConn.id);
        
        if (!dataComparisonResult.success) {
          throw new Error(`Data comparison failed: ${dataComparisonResult.error}`);
        }
        
        dataResults = dataComparisonResult.data;
        console.log(`Data comparison completed: ${dataResults?.differences?.length || 0} table differences found`);
      }
      
      // Store results and update UI
      this.lastComparisonResults = {
        sourceDatabase: `${sourceConn.name} (${sourceConn.databaseName})`,
        targetDatabase: `${targetConn.name} (${targetConn.databaseName})`,
        comparedAt: new Date().toISOString(),
        schemaDetails: schemaResults?.differences || [],
        dataDetails: dataResults?.differences || [],
        schemaDifferences: schemaResults?.totalDifferences || 0,
        dataDifferences: dataResults?.differences?.length || 0,
        totalDifferences: (schemaResults?.totalDifferences || 0) + (dataResults?.differences?.length || 0)
      };
      
      this.displayComparisonResults();
      
    } catch (error) {
      throw error;
    }
  }

  private displayComparisonResults(): void {
    if (!this.lastComparisonResults) return;
    
    const results = this.lastComparisonResults;
    
    // Update summary with safe toString() calls
    this.totalDifferences.textContent = (results.totalDifferences || 0).toString();
    this.schemaDifferences.textContent = (results.schemaDifferences || 0).toString();
    this.dataDifferences.textContent = (results.dataDifferences || 0).toString();
    
    // Show results section
    this.compareResultsSection.style.display = 'block';
    this.exportCompareBtn.disabled = false;
    
    // Update schema differences tab
    this.updateSchemaDifferencesTab(results.schemaDetails);
    
    // Update data differences tab
    this.updateDataDifferencesTab(results.dataDetails);
    
    // Update summary tab
    this.updateSummaryTab(results);
  }

  private updateSchemaDifferencesTab(schemaDetails: SchemaDifference[]): void {
    if (schemaDetails.length === 0) {
      this.schemaDiffTable.style.display = 'none';
      this.schemaDiffEmptyState.style.display = 'block';
    } else {
      this.schemaDiffTable.style.display = 'table';
      this.schemaDiffEmptyState.style.display = 'none';
      
      this.schemaDiffTableBody.innerHTML = schemaDetails.map(diff => `
        <tr>
          <td><span class="diff-type-badge ${this.getDiffTypeBadgeClass(diff.type)}">${this.escapeHtml(diff.type)}</span></td>
          <td><span class="object-name">${this.escapeHtml(diff.objectName)}</span></td>
          <td>${this.escapeHtml(diff.difference)}</td>
          <td><span class="value-display">${this.escapeHtml(diff.sourceValue)}</span></td>
          <td><span class="value-display">${this.escapeHtml(diff.targetValue)}</span></td>
        </tr>
      `).join('');
    }
  }

  private updateDataDifferencesTab(dataDetails: DataDifference[]): void {
    if (!dataDetails || dataDetails.length === 0) {
      this.dataDiffTable.style.display = 'none';
      this.dataDiffEmptyState.style.display = 'block';
    } else {
      this.dataDiffTable.style.display = 'table';
      this.dataDiffEmptyState.style.display = 'none';
      
      this.dataDiffTableBody.innerHTML = dataDetails.map(diff => `
        <tr>
          <td><span class="table-name">${this.escapeHtml(`${diff.schemaName}.${diff.tableName}`)}</span></td>
          <td><span class="diff-type-badge data">${this.escapeHtml(diff.differenceType)}</span></td>
          <td><span class="count-badge source">${diff.sourceRowCount.toLocaleString()}</span></td>
          <td><span class="count-badge target">${diff.targetRowCount.toLocaleString()}</span></td>
          <td><span class="count-badge difference">${diff.difference.toLocaleString()}</span></td>
          <td>${this.escapeHtml(diff.description)}</td>
        </tr>
      `).join('');
    }
  }

  private updateSummaryTab(results: any): void {
    const summaryHtml = `
      <div class="summary-content">
        <h4>Comparison Summary</h4>
        <div class="summary-meta">
          <p><strong>Source Database:</strong> ${this.escapeHtml(results.sourceDatabase)}</p>
          <p><strong>Target Database:</strong> ${this.escapeHtml(results.targetDatabase)}</p>
          <p><strong>Compared At:</strong> ${this.formatDate(results.comparedAt)}</p>
          <p><strong>Total Differences:</strong> ${results.totalDifferences}</p>
        </div>
        
        <div class="summary-breakdown">
          <h5>Breakdown:</h5>
          <ul>
            <li>Schema Differences: ${results.schemaDifferences}</li>
            <li>Data Differences: ${results.dataDifferences}</li>
          </ul>
        </div>
        
        ${results.schemaDetails.length > 0 ? `
          <div class="summary-details">
            <h5>Schema Issues Found:</h5>
            <ul>
              ${results.schemaDetails.slice(0, 5).map((diff: any) => `
                <li>${this.escapeHtml(diff.type)}: ${this.escapeHtml(diff.objectName)} - ${this.escapeHtml(diff.difference)}</li>
              `).join('')}
              ${results.schemaDetails.length > 5 ? `<li>... and ${results.schemaDetails.length - 5} more</li>` : ''}
            </ul>
          </div>
        ` : ''}
        
        ${results.dataDetails.length > 0 ? `
          <div class="summary-details">
            <h5>Data Issues Found:</h5>
            <ul>
              ${results.dataDetails.slice(0, 5).map((diff: any) => `
                <li>${this.escapeHtml(`${diff.schemaName}.${diff.tableName}`)}: ${this.escapeHtml(diff.description)}</li>
              `).join('')}
              ${results.dataDetails.length > 5 ? `<li>... and ${results.dataDetails.length - 5} more</li>` : ''}
            </ul>
          </div>
        ` : ''}
      </div>
    `;
    
    this.summaryReport.innerHTML = summaryHtml;
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

  private getDiffTypeBadgeClass(type: string): string {
    const lowerType = type.toLowerCase();
    if (lowerType.includes('missing') || lowerType.includes('table')) return 'table-missing';
    if (lowerType.includes('column') || lowerType.includes('type')) return 'column-type';
    if (lowerType.includes('index')) return 'index-missing';
    if (lowerType.includes('constraint')) return 'constraint';
    return 'data';
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private async exportComparisonResults(): Promise<void> {
    if (!this.lastComparisonResults) {
      alert('No comparison results to export');
      return;
    }
    
    try {
      this.exportCompareBtn.disabled = true;
      this.exportCompareBtn.textContent = 'Exporting...';
      
      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const defaultName = `database-comparison-${timestamp}.html`;
      
      // Show save dialog
      const filePath = await window.electronAPI.saveConfigFile(defaultName);
      if (filePath) {
        // Generate HTML report
        const htmlReport = this.generateComparisonReport();
        
        // Save comparison results as HTML file
        await window.electronAPI.writeFile(filePath, htmlReport);
        console.log(`Comparison results exported to: ${filePath}`);
        alert(`Comparison results exported successfully to:\n${filePath}`);
      }
      
    } catch (error) {
      console.error('Export failed:', error);
      alert(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.exportCompareBtn.disabled = false;
      this.exportCompareBtn.textContent = 'Export Results';
    }
  }

  private generateComparisonReport(): string {
    const results = this.lastComparisonResults;
    if (!results) {
      throw new Error('No comparison results available');
    }
    
    const timestamp = new Date().toLocaleString();
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Database Comparison Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          .diff-type { background: #ffebee; color: #c62828; padding: 2px 6px; border-radius: 3px; }
          code { background: #f5f5f5; padding: 2px 4px; border-radius: 3px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Database Comparison Report</h1>
          <p>Generated: ${timestamp}</p>
          <p><strong>Source Database:</strong> ${this.escapeHtml(results.sourceDatabase)}</p>
          <p><strong>Target Database:</strong> ${this.escapeHtml(results.targetDatabase)}</p>
          <p><strong>Compared At:</strong> ${this.formatDate(results.comparedAt)}</p>
        </div>
        
        <div class="summary">
          <h2>Summary</h2>
          <p><strong>Total Differences:</strong> ${results.totalDifferences}</p>
          <p><strong>Schema Differences:</strong> ${results.schemaDifferences}</p>
          <p><strong>Data Differences:</strong> ${results.dataDifferences}</p>
        </div>
    `;
    
    // Always include schema differences if they exist
    if (results.schemaDetails && results.schemaDetails.length > 0) {
      html += `
        <h2>Schema Differences</h2>
        <table>
          <thead>
            <tr><th>Type</th><th>Object Name</th><th>Difference</th><th>Source Value</th><th>Target Value</th></tr>
          </thead>
          <tbody>
            ${results.schemaDetails.map((diff: any) => `
              <tr>
                <td><span class="diff-type">${this.escapeHtml(diff.type)}</span></td>
                <td><code>${this.escapeHtml(diff.objectName)}</code></td>
                <td>${this.escapeHtml(diff.difference)}</td>
                <td><code>${this.escapeHtml(diff.sourceValue)}</code></td>
                <td><code>${this.escapeHtml(diff.targetValue)}</code></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
    
    // Always include data differences if they exist
    if (results.dataDetails && results.dataDetails.length > 0) {
      html += `
        <h2>Data Differences (Row Count Analysis)</h2>
        <table>
          <thead>
            <tr><th>Table</th><th>Difference Type</th><th>Source Rows</th><th>Target Rows</th><th>Difference</th><th>Description</th></tr>
          </thead>
          <tbody>
            ${results.dataDetails.map((diff: any) => `
              <tr>
                <td><strong>${this.escapeHtml(`${diff.schemaName}.${diff.tableName}`)}</strong></td>
                <td><span class="diff-type">${this.escapeHtml(diff.differenceType)}</span></td>
                <td>${diff.sourceRowCount.toLocaleString()}</td>
                <td>${diff.targetRowCount.toLocaleString()}</td>
                <td>${diff.difference.toLocaleString()}</td>
                <td>${this.escapeHtml(diff.description)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
    
    html += `
      </body>
      </html>
    `;
    
    return html;
  }

  /**
   * Update connections data
   */
  updateConnections(connections: SavedConnection[]): void {
    this.connections = connections;
    
    // Only update selects if component is initialized
    if (this.isInitialized) {
      this.updateConnectionSelects();
    }
  }
}
