export abstract class BaseComponent {
  protected container: HTMLElement;
  protected isInitialized: boolean = false;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container with id "${containerId}" not found`);
    }
    this.container = container;
  }

  /**
   * Initialize the component - called once when component is first used
   */
  abstract initialize(): void;

  /**
   * Render the component content
   */
  abstract render(): void;

  /**
   * Show the component
   */
  show(): void {
    if (!this.isInitialized) {
      this.initialize();
      this.isInitialized = true;
    }
    this.render();
    this.container.style.display = 'block';
  }

  /**
   * Hide the component
   */
  hide(): void {
    this.container.style.display = 'none';
  }

  /**
   * Destroy the component and clean up resources
   */
  destroy(): void {
    this.container.innerHTML = '';
    this.isInitialized = false;
  }

  /**
   * Add event listener with automatic cleanup
   */
  protected addEventListener(element: HTMLElement, event: string, handler: EventListener): void {
    element.addEventListener(event, handler);
    // Store reference for cleanup if needed
  }

  /**
   * Create HTML element with optional attributes and content
   */
  protected createElement(tag: string, attributes?: Record<string, string>, content?: string): HTMLElement {
    const element = document.createElement(tag);
    
    if (attributes) {
      Object.entries(attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
      });
    }
    
    if (content) {
      element.innerHTML = content;
    }
    
    return element;
  }

  /**
   * Format date for display
   */
  protected formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString();
  }

  /**
   * Show error state
   */
  protected showError(message: string): void {
    // Ensure component is initialized before trying to access container
    if (!this.isInitialized) {
      console.error(`Component not initialized when trying to show error: ${message}`);
      return;
    }
    
    this.container.innerHTML = `
      <div class="error-state">
        <div class="error-icon">⚠️</div>
        <h3>Error</h3>
        <p>${message}</p>
      </div>
    `;
  }

  /**
   * Show loading state
   */
  protected showLoading(message: string = 'Loading...'): void {
    // Ensure component is initialized before trying to access container
    if (!this.isInitialized) {
      console.warn(`Component not initialized when trying to show loading: ${message}`);
      return;
    }
    
    this.container.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <p>${message}</p>
      </div>
    `;
  }

  /**
   * Show empty state
   */
  protected showEmptyState(icon: string, title: string, description: string, actionButton?: { text: string, onclick: string }): void {
    const buttonHtml = actionButton ? 
      `<button class="btn btn-primary" onclick="${actionButton.onclick}">${actionButton.text}</button>` : '';
    
    this.container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${icon}</div>
        <h3>${title}</h3>
        <p>${description}</p>
        ${buttonHtml}
      </div>
    `;
  }
}
