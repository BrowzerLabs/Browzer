/**
 * Sidebar Toggle Button - UI component for toggling sidebar visibility
 */

import { SidebarManager, SidebarState } from './SidebarManager';

export class SidebarToggleButton {
  private element: HTMLButtonElement;
  private sidebarManager: SidebarManager;
  private unsubscribe?: () => void;

  constructor() {
    this.sidebarManager = SidebarManager.getInstance();
    this.element = this.createButton();
    this.setupEventListeners();
    this.subscribeToStateChanges();
  }

  /**
   * Create the toggle button element
   */
  private createButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.id = 'sidebarToggleBtn';
    button.className = 'sidebar-toggle-btn action-btn';
    button.title = 'Toggle Assistant Panel (Ctrl+Shift+S)';
    button.setAttribute('aria-label', 'Toggle Assistant Panel');
    button.setAttribute('aria-expanded', 'true');

    // Create SVG icon
    button.innerHTML = `
      <svg class="sidebar-toggle-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path class="sidebar-panel" d="M2 2h4v12H2a1 1 0 01-1-1V3a1 1 0 011-1z" opacity="0.7"/>
        <path class="sidebar-content" d="M7 2h7a1 1 0 011 1v10a1 1 0 01-1 1H7V2z"/>
        <path class="sidebar-divider" d="M6.5 2v12" stroke="currentColor" stroke-width="1" opacity="0.3"/>
      </svg>
    `;

    return button;
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    this.element.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleToggle();
    });

    // Add hover effects
    this.element.addEventListener('mouseenter', () => {
      this.element.classList.add('hover');
    });

    this.element.addEventListener('mouseleave', () => {
      this.element.classList.remove('hover');
    });

    // Handle focus for keyboard navigation
    this.element.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.handleToggle();
      }
    });
  }

  /**
   * Handle toggle action
   */
  private handleToggle(): void {
    // Add click animation
    this.element.classList.add('clicked');
    setTimeout(() => {
      this.element.classList.remove('clicked');
    }, 150);

    // Toggle sidebar
    this.sidebarManager.toggle();
  }

  /**
   * Subscribe to sidebar state changes
   */
  private subscribeToStateChanges(): void {
    this.unsubscribe = this.sidebarManager.subscribe((state: SidebarState) => {
      this.updateButtonState(state);
    });

    // Apply initial state
    this.updateButtonState(this.sidebarManager.getState());
  }

  /**
   * Update button appearance based on sidebar state
   */
  private updateButtonState(state: SidebarState): void {
    // Update aria-expanded for accessibility
    this.element.setAttribute('aria-expanded', state.isVisible.toString());
    
    // Update title text
    this.element.title = state.isVisible 
      ? 'Hide Assistant Panel (Ctrl+Shift+S)'
      : 'Show Assistant Panel (Ctrl+Shift+S)';

    // Update visual state
    if (state.isVisible) {
      this.element.classList.add('active');
      this.element.classList.remove('inactive');
    } else {
      this.element.classList.add('inactive');
      this.element.classList.remove('active');
    }

    // Handle animation state
    if (state.isAnimating) {
      this.element.classList.add('animating');
    } else {
      this.element.classList.remove('animating');
    }
  }

  /**
   * Insert button into the toolbar
   */
  public insertIntoToolbar(): void {
    const toolbarActions = document.querySelector('.toolbar-actions');
    if (toolbarActions) {
      // Insert as the first button in toolbar actions
      toolbarActions.insertBefore(this.element, toolbarActions.firstChild);
    } else {
      console.warn('Toolbar actions container not found');
    }

    // Also setup the close button in the sidebar header
    this.setupSidebarCloseButton();
  }

  /**
   * Setup the close button in the sidebar header
   */
  private setupSidebarCloseButton(): void {
    const closeButton = document.getElementById('sidebarCloseBtn');
    if (closeButton) {
      closeButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.sidebarManager.hide();
      });

      closeButton.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.sidebarManager.hide();
        }
      });
    }
  }

  /**
   * Get the button element
   */
  public getElement(): HTMLButtonElement {
    return this.element;
  }

  /**
   * Destroy the component and clean up
   */
  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }

  /**
   * Update button icon based on state
   */
  private updateIcon(isVisible: boolean): void {
    const icon = this.element.querySelector('.sidebar-toggle-icon');
    if (icon) {
      if (isVisible) {
        // Show "hide panel" icon - panel with arrow pointing right
        icon.innerHTML = `
          <path class="sidebar-panel" d="M2 2h4v12H2a1 1 0 01-1-1V3a1 1 0 011-1z" opacity="0.7"/>
          <path class="sidebar-content" d="M7 2h7a1 1 0 011 1v10a1 1 0 01-1 1H7V2z"/>
          <path class="sidebar-arrow" d="M9 6l2 2-2 2" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.8"/>
        `;
      } else {
        // Show "show panel" icon - content with arrow pointing left
        icon.innerHTML = `
          <path class="sidebar-content" d="M1 2h13a1 1 0 011 1v10a1 1 0 01-1 1H1V2z"/>
          <path class="sidebar-arrow" d="M13 6l-2 2 2 2" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.8"/>
        `;
      }
    }
  }

  /**
   * Add pulse animation for attention
   */
  public pulse(): void {
    this.element.classList.add('pulse');
    setTimeout(() => {
      this.element.classList.remove('pulse');
    }, 1000);
  }
}
