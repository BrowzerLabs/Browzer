import { WebContentsView } from 'electron';

/**
 * ViewportSnapshotCapture - Capture visual snapshots for Claude vision analysis
 * 
 * Captures screenshots of the viewport with optional scrolling and element targeting.
 * Optimized for Claude's vision capabilities with proper image sizing and base64 encoding.
 * 
 * Based on Anthropic's vision best practices:
 * - Optimal size: 1.15 megapixels (within 1568px dimensions)
 * - Format: JPEG with quality 80-90 for balance
 * - Base64 encoding for direct API usage
 */
export class ViewportSnapshotCapture {
  private view: WebContentsView;
  
  // Image optimization settings based on Claude vision docs
  private readonly JPEG_QUALITY = 85; // Balance between quality and size
  private readonly MAX_DIMENSION = 1568; // Optimal for Claude without resizing
  
  constructor(view: WebContentsView) {
    this.view = view;
  }

  /**
   * Capture viewport snapshot with optional scrolling and element targeting
   */
  public async captureSnapshot(
    scrollTo?: 'current' | 'top' | 'bottom' | number | { element: string; backupSelectors?: string[] }
  ): Promise<{
    success: boolean;
    image?: {
      data: string; // Base64-encoded JPEG
      mediaType: 'image/jpeg';
      width: number;
      height: number;
      sizeBytes: number;
      estimatedTokens: number;
    };
    viewport?: {
      scrollX: number;
      scrollY: number;
      width: number;
      height: number;
    };
    error?: string;
  }> {
    try {
      // Perform scroll if requested
      if (scrollTo && scrollTo !== 'current') {
        await this.performScroll(scrollTo);
        
        // Wait for scroll animations and content to settle
        await this.sleep(2000);
      }

      // Get viewport info before capture
      const viewportInfo = await this.getViewportInfo();

      // Capture the screenshot
      const image = await this.view.webContents.capturePage();
      
      // Get original dimensions
      const originalSize = image.getSize();
      let width = originalSize.width;
      let height = originalSize.height;
      
      // Resize if needed to stay within optimal dimensions
      const needsResize = width > this.MAX_DIMENSION || height > this.MAX_DIMENSION;
      
      if (needsResize) {
        // Calculate new dimensions maintaining aspect ratio
        const aspectRatio = width / height;
        
        if (width > height) {
          width = this.MAX_DIMENSION;
          height = Math.round(width / aspectRatio);
        } else {
          height = this.MAX_DIMENSION;
          width = Math.round(height * aspectRatio);
        }
        
        // Resize the image
        const resized = image.resize({ width, height });
        
        // Convert to JPEG base64
        const jpeg = resized.toJPEG(this.JPEG_QUALITY);
        const base64Data = jpeg.toString('base64');
        const sizeBytes = jpeg.length;
        
        // Estimate tokens: (width * height) / 750
        const estimatedTokens = Math.round((width * height) / 750);
        
        console.log(`📸 Snapshot captured and resized: ${originalSize.width}x${originalSize.height} → ${width}x${height} (${(sizeBytes / 1024).toFixed(1)} KB, ~${estimatedTokens} tokens)`);
        
        return {
          success: true,
          image: {
            data: base64Data,
            mediaType: 'image/jpeg',
            width,
            height,
            sizeBytes,
            estimatedTokens
          },
          viewport: viewportInfo
        };
      } else {
        // No resize needed, use original
        const jpeg = image.toJPEG(this.JPEG_QUALITY);
        const base64Data = jpeg.toString('base64');
        const sizeBytes = jpeg.length;
        const estimatedTokens = Math.round((width * height) / 750);
        
        console.log(`📸 Snapshot captured: ${width}x${height} (${(sizeBytes / 1024).toFixed(1)} KB, ~${estimatedTokens} tokens)`);
        
        return {
          success: true,
          image: {
            data: base64Data,
            mediaType: 'image/jpeg',
            width,
            height,
            sizeBytes,
            estimatedTokens
          },
          viewport: viewportInfo
        };
      }
      
    } catch (error) {
      console.error('Failed to capture snapshot:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Perform smooth scroll to specified position
   */
  private async performScroll(
    scrollTo: 'top' | 'bottom' | number | { element: string; backupSelectors?: string[] }
  ): Promise<void> {
    if (scrollTo === 'top') {
      await this.view.webContents.executeJavaScript(`
        window.scrollTo({ top: 0, behavior: 'smooth' });
      `);
    } else if (scrollTo === 'bottom') {
      await this.view.webContents.executeJavaScript(`
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      `);
    } else if (typeof scrollTo === 'number') {
      await this.view.webContents.executeJavaScript(`
        window.scrollTo({ top: ${scrollTo}, behavior: 'smooth' });
      `);
    } else if (typeof scrollTo === 'object' && scrollTo.element) {
      // Scroll element into view with backup selectors
      const selectors = [scrollTo.element, ...(scrollTo.backupSelectors || [])];
      const script = `
        (function() {
          const selectors = ${JSON.stringify(selectors)};
          
          for (const selector of selectors) {
            try {
              const element = document.querySelector(selector);
              if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return { success: true, usedSelector: selector };
              }
            } catch (e) {
              continue;
            }
          }
          
          return { success: false, error: 'Element not found with any selector' };
        })();
      `;
      
      const result = await this.view.webContents.executeJavaScript(script);
      if (!result.success) {
        throw new Error(result.error || 'Failed to scroll to element');
      }
      
      console.log(`✅ Scrolled to element: ${result.usedSelector}`);
    }
  }

  /**
   * Get current viewport information
   */
  private async getViewportInfo(): Promise<{
    scrollX: number;
    scrollY: number;
    width: number;
    height: number;
  }> {
    return await this.view.webContents.executeJavaScript(`
      ({
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        width: window.innerWidth,
        height: window.innerHeight
      })
    `);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
