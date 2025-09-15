/**
 * Sidebar Manager - Handles all sidebar-related state and operations
 */

export interface SidebarState {
  isVisible: boolean;
  width: number;
  isAnimating: boolean;
  lastToggleTime: number;
}

export class SidebarManager {
  private static instance: SidebarManager;
  private state: SidebarState;
  private listeners: Array<(state: SidebarState) => void> = [];
  private storageKey = 'browzer-sidebar-state';
  
  // Default configuration
  private readonly config = {
    defaultWidth: 350,
    minWidth: 300,
    maxWidth: 600,
    animationDuration: 300,
    debounceTime: 100
  };

  private constructor() {
    this.state = this.loadStateFromStorage();
    this.bindKeyboardShortcuts();
  }

  public static getInstance(): SidebarManager {
    if (!SidebarManager.instance) {
      SidebarManager.instance = new SidebarManager();
    }
    return SidebarManager.instance;
  }

  /**
   * Get current sidebar state
   */
  public getState(): SidebarState {
    return { ...this.state };
  }

  /**
   * Toggle sidebar visibility
   */
  public toggle(): void {
    const now = Date.now();
    
    // Debounce rapid toggles
    if (now - this.state.lastToggleTime < this.config.debounceTime) {
      return;
    }

    this.setState({
      isVisible: !this.state.isVisible,
      isAnimating: true,
      lastToggleTime: now
    });

    // Reset animation state after animation completes
    setTimeout(() => {
      this.setState({ isAnimating: false });
    }, this.config.animationDuration);
  }

  /**
   * Show sidebar
   */
  public show(): void {
    if (!this.state.isVisible) {
      this.toggle();
    }
  }

  /**
   * Hide sidebar
   */
  public hide(): void {
    if (this.state.isVisible) {
      this.toggle();
    }
  }

  /**
   * Set sidebar width
   */
  public setWidth(width: number): void {
    const clampedWidth = Math.max(
      this.config.minWidth,
      Math.min(this.config.maxWidth, width)
    );
    
    this.setState({ width: clampedWidth });
  }

  /**
   * Subscribe to state changes
   */
  public subscribe(listener: (state: SidebarState) => void): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Update state and notify listeners
   */
  private setState(updates: Partial<SidebarState>): void {
    this.state = { ...this.state, ...updates };
    this.saveStateToStorage();
    this.notifyListeners();
  }

  /**
   * Notify all listeners of state changes
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.getState());
      } catch (error) {
        console.error('Error in sidebar state listener:', error);
      }
    });
  }

  /**
   * Load state from localStorage
   */
  private loadStateFromStorage(): SidebarState {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          isVisible: parsed.isVisible ?? true,
          width: parsed.width ?? this.config.defaultWidth,
          isAnimating: false,
          lastToggleTime: 0
        };
      }
    } catch (error) {
      console.warn('Failed to load sidebar state from storage:', error);
    }

    // Return default state
    return {
      isVisible: true,
      width: this.config.defaultWidth,
      isAnimating: false,
      lastToggleTime: 0
    };
  }

  /**
   * Save state to localStorage
   */
  private saveStateToStorage(): void {
    try {
      const stateToSave = {
        isVisible: this.state.isVisible,
        width: this.state.width
      };
      localStorage.setItem(this.storageKey, JSON.stringify(stateToSave));
    } catch (error) {
      console.warn('Failed to save sidebar state to storage:', error);
    }
  }

  /**
   * Bind keyboard shortcuts
   */
  private bindKeyboardShortcuts(): void {
    document.addEventListener('keydown', (event) => {
      // Ctrl/Cmd + Shift + S to toggle sidebar
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'S') {
        event.preventDefault();
        this.toggle();
      }
    });
  }

  /**
   * Get configuration values
   */
  public getConfig() {
    return { ...this.config };
  }

  /**
   * Initialize sidebar on page load
   */
  public initialize(): void {
    // Apply initial state
    this.applyStateToDOM();
    
    // Set up resize observer for responsive behavior
    this.setupResponsiveHandler();
  }

  /**
   * Apply current state to DOM elements
   */
  private applyStateToDOM(): void {
    const sidebarElement = document.querySelector('.agent-container') as HTMLElement;
    const contentContainer = document.querySelector('.content-container') as HTMLElement;
    const dragbar = document.querySelector('#dragbar') as HTMLElement;

    if (!sidebarElement || !contentContainer) {
      console.warn('Sidebar DOM elements not found');
      return;
    }

    if (this.state.isVisible) {
      sidebarElement.style.display = 'flex';
      sidebarElement.style.width = `${this.state.width}px`;
      if (dragbar) dragbar.style.display = 'block';
    } else {
      sidebarElement.style.display = 'none';
      if (dragbar) dragbar.style.display = 'none';
    }

    // Update CSS custom properties for smooth transitions
    document.documentElement.style.setProperty('--sidebar-width', `${this.state.width}px`);
    document.documentElement.style.setProperty('--sidebar-visible', this.state.isVisible ? '1' : '0');
  }

  /**
   * Setup responsive behavior
   */
  private setupResponsiveHandler(): void {
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    
    const handleResize = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) {
        // On mobile, auto-hide sidebar if it's taking too much space
        const viewportWidth = window.innerWidth;
        if (this.state.width > viewportWidth * 0.6) {
          this.hide();
        }
      }
    };

    mediaQuery.addListener(handleResize);
    handleResize(mediaQuery);
  }
}
