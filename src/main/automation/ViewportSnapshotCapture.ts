import { WebContentsView } from 'electron';

export class ViewportSnapshotCapture {
  private readonly JPEG_QUALITY = 70;
  private readonly MAX_DIMENSION = 900;

  constructor(private view: WebContentsView) {}

  public async captureSnapshot(
    scrollTo?:
      | 'current'
      | 'top'
      | 'bottom'
      | number
      | { element: string; backupSelectors?: string[] }
  ): Promise<{
    image?: string;
    error?: string;
  }> {
    try {
      if (scrollTo && scrollTo !== 'current') {
        await this.performScroll(scrollTo);
        await this.sleep(2000);
      }

      const image = await this.view.webContents.capturePage();

      const originalSize = image.getSize();
      let width = originalSize.width;
      let height = originalSize.height;

      const needsResize =
        width > this.MAX_DIMENSION || height > this.MAX_DIMENSION;

      if (needsResize) {
        const aspectRatio = width / height;

        if (width > height) {
          width = this.MAX_DIMENSION;
          height = Math.round(width / aspectRatio);
        } else {
          height = this.MAX_DIMENSION;
          width = Math.round(height * aspectRatio);
        }

        const resized = image.resize({ width, height, quality: 'good' });
        const jpeg = resized.toJPEG(this.JPEG_QUALITY);
        const base64Data = jpeg.toString('base64');

        return {
          image: base64Data,
        };
      } else {
        const jpeg = image.toJPEG(this.JPEG_QUALITY);
        const base64Data = jpeg.toString('base64');

        return {
          image: base64Data,
        };
      }
    } catch (error) {
      console.error('Failed to capture snapshot:', error);
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async performScroll(
    scrollTo:
      | 'top'
      | 'bottom'
      | number
      | { element: string; backupSelectors?: string[] }
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
