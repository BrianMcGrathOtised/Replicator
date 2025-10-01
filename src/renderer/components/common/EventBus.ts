import { ComponentEvent, EventHandler } from './types';

/**
 * Simple event bus for component communication
 */
export class EventBus {
  private static instance: EventBus;
  private listeners: Map<string, EventHandler[]> = new Map();

  private constructor() {}

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Subscribe to an event
   */
  on(eventType: string, handler: EventHandler): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)!.push(handler);
  }

  /**
   * Unsubscribe from an event
   */
  off(eventType: string, handler: EventHandler): void {
    const handlers = this.listeners.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Emit an event
   */
  emit(eventType: string, data?: any): void {
    const event: ComponentEvent = { type: eventType, data };
    const handlers = this.listeners.get(eventType);
    if (handlers) {
      handlers.forEach(handler => handler(event));
    }
  }

  /**
   * Clear all listeners for an event type
   */
  clear(eventType?: string): void {
    if (eventType) {
      this.listeners.delete(eventType);
    } else {
      this.listeners.clear();
    }
  }
}

// Export singleton instance
export const eventBus = EventBus.getInstance();
