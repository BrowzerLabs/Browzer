/**
 * Screenshot Capture System
 * Captures and optimizes browser screenshots for multimodal LLM input
 */

export interface CapturedScreenshot {
  base64: string;
  mimeType: string;
  width: number;
  height: number;
  timestamp: number;
  fileSize: number;
}

export class ScreenshotCapture {
  private static instance: ScreenshotCapture;
  private webview: any = null;

  private constructor() {}

  static getInstance(): ScreenshotCapture {
    if (!ScreenshotCapture.instance) {
      ScreenshotCapture.instance = new ScreenshotCapture();
    }
    return ScreenshotCapture.instance;
  }

  setWebview(webview: any): void {
    this.webview = webview;
  }

  /**
   * Capture screenshot of current page
   */
  async captureScreenshot(options: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
  } = {}): Promise<CapturedScreenshot> {
    if (!this.webview) {
      throw new Error('Webview not set');
    }

    const {
      maxWidth = 1280,
      maxHeight = 1024,
      quality = 0.8,
    } = options;

    try {
      // Capture screenshot using webview API
      const nativeImage = await this.webview.capturePage();
      
      // Get original dimensions
      const size = nativeImage.getSize();
      
      // Calculate scaled dimensions
      let { width, height } = size;
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.floor(width * ratio);
        height = Math.floor(height * ratio);
      }

      // Resize and compress
      const resized = nativeImage.resize({ width, height, quality: 'best' });
      const jpeg = resized.toJPEG(Math.floor(quality * 100));
      const base64 = jpeg.toString('base64');

      return {
        base64,
        mimeType: 'image/jpeg',
        width,
        height,
        timestamp: Date.now(),
        fileSize: base64.length,
      };
    } catch (error) {
      console.error('[ScreenshotCapture] Failed to capture screenshot:', error);
      throw error;
    }
  }

  /**
   * Capture screenshot with annotations (highlight elements)
   */
  async captureWithAnnotations(
    elementSelectors: string[]
  ): Promise<CapturedScreenshot> {
    if (!this.webview) {
      throw new Error('Webview not set');
    }

    // Inject highlighting script
    await this.webview.executeJavaScript(`
      (function() {
        const selectors = ${JSON.stringify(elementSelectors)};
        selectors.forEach((selector, idx) => {
          const el = document.querySelector(selector);
          if (el) {
            el.style.outline = '3px solid #ff0000';
            el.style.outlineOffset = '2px';
            
            // Add number label
            const label = document.createElement('div');
            label.textContent = String(idx + 1);
            label.style.cssText = 'position:absolute;top:0;left:0;background:#ff0000;color:white;padding:2px 6px;font-size:12px;font-weight:bold;z-index:999999;';
            el.style.position = 'relative';
            el.appendChild(label);
          }
        });
      })();
    `);

    // Wait a bit for rendering
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Capture screenshot
    const screenshot = await this.captureScreenshot();

    // Remove annotations
    await this.webview.executeJavaScript(`
      (function() {
        document.querySelectorAll('[style*="outline: 3px solid"]').forEach(el => {
          el.style.outline = '';
          el.style.outlineOffset = '';
          const label = el.querySelector('div[style*="z-index:999999"]');
          if (label) label.remove();
        });
      })();
    `);

    return screenshot;
  }

  /**
   * Estimate token cost for screenshot
   * Claude: ~1600 tokens per image (1024x1024)
   * GPT-4V: ~765 tokens per image (512x512)
   */
  estimateTokenCost(screenshot: CapturedScreenshot, model: string = 'claude'): number {
    const pixels = screenshot.width * screenshot.height;
    const basePixels = 1024 * 1024;
    
    if (model.includes('claude')) {
      return Math.ceil((pixels / basePixels) * 1600);
    } else if (model.includes('gpt')) {
      return Math.ceil((pixels / (512 * 512)) * 765);
    }
    
    return 1500; // Default estimate
  }
}
