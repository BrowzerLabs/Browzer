import { BaseActionService, ExecutionContext } from './BaseActionService';
import { ToolExecutionResult } from '@/shared/types';

export class SnapshotService extends BaseActionService {
  private readonly JPEG_QUALITY = 70;
  private readonly MAX_DIMENSION = 900;

  constructor(context: ExecutionContext) {
    super(context);
  }

  public async execute(
    params: {
      scrollTo?: 'current' | 'top' | 'bottom';
      y?: number;
    } = {}
  ): Promise<ToolExecutionResult> {
    try {
      await this.waitForNetworkIdle({
        timeout: 3000,
        idleTime: 500,
        maxInflightRequests: 0,
      });

      if (params.scrollTo && params.scrollTo !== 'current') {
        params.scrollTo === 'top'
          ? await this.view.webContents.executeJavaScript(`
        window.scrollTo({ top: 0, behavior: 'instant' });
        `)
          : await this.view.webContents.executeJavaScript(`
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
        `);
      }
      if (params.y !== undefined) {
        await this.view.webContents.executeJavaScript(`
          window.scrollTo({ top: ${params.y}, behavior: 'instant' });
        `);
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
