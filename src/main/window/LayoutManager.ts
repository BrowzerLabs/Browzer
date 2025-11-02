import { BaseWindow } from 'electron';

/**
 * LayoutManager - Handles window layout calculations
 * Manages sidebar state and view positioning
 */
export class LayoutManager {
  private sidebarVisible = true;
  private sidebarWidthPercent = 30;

  constructor(
    private baseWindow: BaseWindow
  ) {}

  public setSidebarState(visible: boolean, widthPercent: number): void {
    this.sidebarVisible = visible;
    this.sidebarWidthPercent = widthPercent;
  }

  public getSidebarState(): { visible: boolean; widthPercent: number } {
    return {
      visible: this.sidebarVisible,
      widthPercent: this.sidebarWidthPercent,
    };
  }

  public calculateAgentUIBounds(): { x: number; y: number; width: number; height: number } {
    const bounds = this.baseWindow.getBounds();
    const windowWidth = bounds.width;
    const windowHeight = bounds.height;

    return {
      x: 0,
      y: 0,
      width: windowWidth,
      height: windowHeight,
    };
  }
}
