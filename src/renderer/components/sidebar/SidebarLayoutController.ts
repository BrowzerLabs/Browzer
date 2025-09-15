/**
 * Sidebar Layout Controller - Manages layout adjustments when sidebar toggles
 */

import { SidebarManager, SidebarState } from './SidebarManager';

export class SidebarLayoutController {
  private sidebarManager: SidebarManager;
  private unsubscribe?: () => void;
  private resizeObserver?: ResizeObserver;
  private backdrop?: HTMLElement;

  constructor() {
    this.sidebarManager = SidebarManager.getInstance();
    this.initialize();
  }

  /**
   * Initialize the layout controller
   */
  public initialize(): void {
    this.subscribeToStateChanges();
    this.setupResizeObserver();
    this.createMobileBackdrop();
    this.applyInitialLayout();
  }

  /**
   * Subscribe to sidebar state changes
   */
  private subscribeToStateChanges(): void {
    this.unsubscribe = this.sidebarManager.subscribe((state: SidebarState) => {
      this.updateLayout(state);
    });
  }

  /**
   * Update layout based on sidebar state
   */
  private updateLayout(state: SidebarState): void {
    const sidebarElement = this.getSidebarElement();
    const contentContainer = this.getContentContainer();
    const dragbar = this.getDragbar();

    if (!sidebarElement || !contentContainer) {
      console.warn('Required layout elements not found');
      return;
    }

    // Update CSS custom properties
    this.updateCSSProperties(state);

    // Apply classes for animations
    this.applyLayoutClasses(state, sidebarElement, contentContainer, dragbar);

    // Handle mobile-specific behavior
    this.handleMobileLayout(state);

    // Update dragbar functionality
    this.updateDragbarBehavior(state, dragbar);
  }

  /**
   * Update CSS custom properties
   */
  private updateCSSProperties(state: SidebarState): void {
    // CSS custom properties removed in favor of fixed responsive widths
    // This method is kept for future extensibility
  }

  /**
   * Apply CSS classes for layout states
   */
  private applyLayoutClasses(
    state: SidebarState,
    sidebarElement: HTMLElement,
    contentContainer: HTMLElement,
    dragbar: HTMLElement | null
  ): void {
    const visibilityClass = state.isVisible ? 'sidebar-visible' : 'sidebar-hidden';
    const animatingClass = 'sidebar-animating';

    // Update sidebar classes
    sidebarElement.classList.remove('sidebar-visible', 'sidebar-hidden');
    sidebarElement.classList.add(visibilityClass);

    // Update content container classes
    contentContainer.classList.remove('sidebar-visible', 'sidebar-hidden');
    contentContainer.classList.add(visibilityClass);

    // Update dragbar classes
    if (dragbar) {
      dragbar.classList.remove('sidebar-visible', 'sidebar-hidden');
      dragbar.classList.add(visibilityClass);
    }

    // Force layout recalculation for proper width adjustment
    if (!state.isVisible) {
      // When hiding, ensure content takes full width immediately
      contentContainer.style.width = '100%';
      contentContainer.style.marginRight = '0';
      if (dragbar) {
        dragbar.style.display = 'none';
      }
    } else {
      // When showing, let CSS handle the widths using custom properties
      contentContainer.style.width = '';
      contentContainer.style.marginRight = '';
      if (dragbar) {
        dragbar.style.display = 'block';
      }
    }

    // Handle animation state
    if (state.isAnimating) {
      [sidebarElement, contentContainer, dragbar].forEach(el => {
        el?.classList.add(animatingClass);
      });

      // Remove animation class after animation completes
      setTimeout(() => {
        [sidebarElement, contentContainer, dragbar].forEach(el => {
          el?.classList.remove(animatingClass);
        });
      }, this.sidebarManager.getConfig().animationDuration);
    }
  }

  /**
   * Handle mobile-specific layout behavior
   */
  private handleMobileLayout(state: SidebarState): void {
    const isMobile = window.innerWidth <= 900;
    const contentContainer = this.getContentContainer();

    if (isMobile) {
      this.handleMobileBackdrop(state.isVisible);
      this.preventBodyScroll(state.isVisible);
      
      // On mobile, content always takes full width
      if (contentContainer) {
        contentContainer.style.width = '100%';
        contentContainer.style.marginRight = '0';
      }
    } else {
      this.handleMobileBackdrop(false);
      this.preventBodyScroll(false);
    }
  }

  /**
   * Handle mobile backdrop
   */
  private handleMobileBackdrop(show: boolean): void {
    if (!this.backdrop) return;

    if (show) {
      this.backdrop.classList.add('visible');
    } else {
      this.backdrop.classList.remove('visible');
    }
  }

  /**
   * Prevent body scroll on mobile when sidebar is open
   */
  private preventBodyScroll(prevent: boolean): void {
    if (prevent) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }

  /**
   * Update dragbar behavior
   */
  private updateDragbarBehavior(state: SidebarState, dragbar: HTMLElement | null): void {
    if (!dragbar) return;

    if (state.isVisible && window.innerWidth > 900) {
      this.enableDragbar(dragbar);
    } else {
      this.disableDragbar(dragbar);
    }
  }

  /**
   * Enable dragbar functionality
   */
  private enableDragbar(dragbar: HTMLElement): void {
    dragbar.style.pointerEvents = 'auto';
    dragbar.style.cursor = 'ew-resize';
  }

  /**
   * Disable dragbar functionality
   */
  private disableDragbar(dragbar: HTMLElement): void {
    dragbar.style.pointerEvents = 'none';
    dragbar.style.cursor = 'default';
  }

  /**
   * Setup resize observer for responsive behavior
   */
  private setupResizeObserver(): void {
    if (!window.ResizeObserver) return;

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        this.handleWindowResize(entry.contentRect.width);
      }
    });

    this.resizeObserver.observe(document.body);
  }

  /**
   * Handle window resize
   */
  private handleWindowResize(width: number): void {
    const state = this.sidebarManager.getState();
    
    // Auto-hide sidebar on very small screens if it's taking too much space
    if (width <= 600 && state.isVisible && state.width > width * 0.8) {
      this.sidebarManager.hide();
    }
    
    // Re-apply layout for responsive changes
    this.updateLayout(state);
  }

  /**
   * Create mobile backdrop element
   */
  private createMobileBackdrop(): void {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'sidebar-backdrop';
    this.backdrop.setAttribute('aria-hidden', 'true');
    
    // Close sidebar when backdrop is clicked
    this.backdrop.addEventListener('click', () => {
      this.sidebarManager.hide();
    });

    // Insert backdrop into body
    document.body.appendChild(this.backdrop);
  }

  /**
   * Apply initial layout state
   */
  private applyInitialLayout(): void {
    const state = this.sidebarManager.getState();
    this.updateLayout(state);
  }

  /**
   * Get sidebar element
   */
  private getSidebarElement(): HTMLElement | null {
    return document.querySelector('.agent-container');
  }

  /**
   * Get content container element
   */
  private getContentContainer(): HTMLElement | null {
    return document.querySelector('.content-container');
  }

  /**
   * Get dragbar element
   */
  private getDragbar(): HTMLElement | null {
    return document.querySelector('#dragbar');
  }

  /**
   * Handle sidebar width changes via dragbar
   */
  public handleDragResize(newWidth: number): void {
    this.sidebarManager.setWidth(newWidth);
  }

  /**
   * Get current layout metrics
   */
  public getLayoutMetrics() {
    const state = this.sidebarManager.getState();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };

    return {
      sidebar: {
        width: state.width,
        isVisible: state.isVisible,
        isAnimating: state.isAnimating
      },
      viewport,
      isMobile: viewport.width <= 900,
      contentWidth: state.isVisible 
        ? viewport.width - state.width - 4 // -4 for dragbar
        : viewport.width
    };
  }

  /**
   * Cleanup and destroy
   */
  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    if (this.backdrop && this.backdrop.parentNode) {
      this.backdrop.parentNode.removeChild(this.backdrop);
    }

    // Reset body styles
    document.body.style.overflow = '';
  }
}
