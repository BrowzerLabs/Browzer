/**
 * Sidebar Module - Main entry point for sidebar functionality
 */

import { SidebarManager } from './SidebarManager';
import { SidebarToggleButton } from './SidebarToggleButton';
import { SidebarLayoutController } from './SidebarLayoutController';

export interface SidebarModuleConfig {
  autoInitialize?: boolean;
  enableKeyboardShortcuts?: boolean;
  enableResponsiveBehavior?: boolean;
}

export class SidebarModule {
  private static instance: SidebarModule;
  private sidebarManager: SidebarManager;
  private toggleButton: SidebarToggleButton;
  private layoutController: SidebarLayoutController;
  private isInitialized = false;

  private constructor(config: SidebarModuleConfig = {}) {
    this.sidebarManager = SidebarManager.getInstance();
    this.toggleButton = new SidebarToggleButton();
    this.layoutController = new SidebarLayoutController();

    if (config.autoInitialize !== false) {
      this.initialize();
    }
  }

  /**
   * Get or create singleton instance
   */
  public static getInstance(config?: SidebarModuleConfig): SidebarModule {
    if (!SidebarModule.instance) {
      SidebarModule.instance = new SidebarModule(config);
    }
    return SidebarModule.instance;
  }

  /**
   * Initialize the sidebar module
   */
  public initialize(): void {
    if (this.isInitialized) {
      console.warn('Sidebar module already initialized');
      return;
    }

    try {
      // Initialize components in order
      this.sidebarManager.initialize();
      this.layoutController.initialize();
      this.insertToggleButton();
      this.loadStylesheet();

      this.isInitialized = true;
      console.log('Sidebar module initialized successfully');

      // Dispatch initialization event
      this.dispatchInitEvent();

    } catch (error) {
      console.error('Failed to initialize sidebar module:', error);
      throw error;
    }
  }

  /**
   * Insert toggle button into toolbar
   */
  private insertToggleButton(): void {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.toggleButton.insertIntoToolbar();
      });
    } else {
      this.toggleButton.insertIntoToolbar();
    }
  }

  /**
   * Load stylesheet
   */
  private loadStylesheet(): void {
    // CSS is now imported via the main styles.css file using @import
    // This method is kept for future extensibility
    console.log('Sidebar styles loaded via main stylesheet');
  }

  /**
   * Dispatch initialization event
   */
  private dispatchInitEvent(): void {
    const event = new CustomEvent('sidebar:initialized', {
      detail: {
        manager: this.sidebarManager,
        toggleButton: this.toggleButton,
        layoutController: this.layoutController
      }
    });
    document.dispatchEvent(event);
  }

  /**
   * Get sidebar manager instance
   */
  public getSidebarManager(): SidebarManager {
    return this.sidebarManager;
  }

  /**
   * Get toggle button instance
   */
  public getToggleButton(): SidebarToggleButton {
    return this.toggleButton;
  }

  /**
   * Get layout controller instance
   */
  public getLayoutController(): SidebarLayoutController {
    return this.layoutController;
  }

  /**
   * Toggle sidebar programmatically
   */
  public toggle(): void {
    this.sidebarManager.toggle();
  }

  /**
   * Show sidebar programmatically
   */
  public show(): void {
    this.sidebarManager.show();
  }

  /**
   * Hide sidebar programmatically
   */
  public hide(): void {
    this.sidebarManager.hide();
  }

  /**
   * Get current sidebar state
   */
  public getState() {
    return this.sidebarManager.getState();
  }

  /**
   * Set sidebar width
   */
  public setWidth(width: number): void {
    this.sidebarManager.setWidth(width);
  }

  /**
   * Subscribe to sidebar state changes
   */
  public subscribe(listener: (state: any) => void): () => void {
    return this.sidebarManager.subscribe(listener);
  }

  /**
   * Get layout metrics
   */
  public getLayoutMetrics() {
    return this.layoutController.getLayoutMetrics();
  }

  /**
   * Pulse the toggle button for attention
   */
  public pulseToggleButton(): void {
    this.toggleButton.pulse();
  }

  /**
   * Check if module is initialized
   */
  public isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Destroy the module and clean up
   */
  public destroy(): void {
    if (!this.isInitialized) return;

    try {
      this.toggleButton.destroy();
      this.layoutController.destroy();
      
      // Remove stylesheet
      const link = document.querySelector('link[href*="sidebar-toggle.css"]');
      if (link && link.parentNode) {
        link.parentNode.removeChild(link);
      }

      this.isInitialized = false;
      SidebarModule.instance = undefined as any;

      console.log('Sidebar module destroyed');
    } catch (error) {
      console.error('Error destroying sidebar module:', error);
    }
  }
}

/**
 * Convenience function to initialize sidebar
 */
export function initializeSidebar(config?: SidebarModuleConfig): SidebarModule {
  return SidebarModule.getInstance(config);
}

/**
 * Export individual components for advanced usage
 */
export { SidebarManager } from './SidebarManager';
export { SidebarToggleButton } from './SidebarToggleButton';
export { SidebarLayoutController } from './SidebarLayoutController';

/**
 * Export types
 */
export type { SidebarState } from './SidebarManager';
