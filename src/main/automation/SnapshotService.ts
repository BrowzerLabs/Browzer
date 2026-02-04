import { BaseActionService } from './BaseActionService';

import { TabService } from '@/main/browser/TabService';
import { ToolExecutionResult } from '@/shared/types';

export class SnapshotService extends BaseActionService {
  private readonly JPEG_QUALITY = 80;
  private readonly MAX_DIMENSION = 1024;

  constructor(tabService: TabService) {
    super(tabService);
  }

  public async execute(params: {
    tabId: string;
    scrollTo?: 'current' | 'top' | 'bottom';
    y?: number;
  }): Promise<ToolExecutionResult> {
    try {
      const view = this.getView(params.tabId);
      const cdp = this.getCDP(params.tabId);
      if (!view || !cdp) {
        return {
          success: false,
          error: 'Tab not found, or debugger not attached',
        };
      }
      await this.waitForNetworkIdle(cdp, {
        timeout: 3000,
        idleTime: 500,
        maxInflightRequests: 0,
      });

      if (params.scrollTo && params.scrollTo !== 'current') {
        params.scrollTo === 'top'
          ? await view.webContents.executeJavaScript(`
        window.scrollTo({ top: 0, behavior: 'instant' });
        `)
          : await view.webContents.executeJavaScript(`
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
        `);
      }
      if (params.y !== undefined) {
        await view.webContents.executeJavaScript(`
          window.scrollTo({ top: ${params.y}, behavior: 'instant' });
        `);
      }

      const image = await view.webContents.capturePage();

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
          success: true,
          value: base64Data,
        };
      } else {
        const jpeg = image.toJPEG(this.JPEG_QUALITY);
        const base64Data = jpeg.toString('base64');

        return {
          success: true,
          value: base64Data,
        };
      }
    } catch (error) {
      console.error('Failed to capture snapshot:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
