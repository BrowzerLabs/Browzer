import { BaseHandler } from './base';
import type { FindInPageOptions } from 'electron';
import type { FoundInPageResult } from '@/shared/types';

export class FindHandler extends BaseHandler {
  private onFoundInPage?: (tabId: string, result: FoundInPageResult) => void;

  register(): void {
    const { tabService, browserService } = this.context;

    this.handle('browser:find-in-page', async (_, tabId: string, text: string, options: FindInPageOptions) => {
      tabService.startFindInPage(tabId, text, options);
    });

    this.handle('browser:stop-find-in-page', async (_, tabId: string, action: 'clearSelection' | 'keepSelection' | 'activateSelection') => {
      tabService.stopFindInPage(tabId, action);
    });

    const onFoundInPage = (tabId: string, result: FoundInPageResult) => {
      browserService.getRendererWebContents().send('browser:found-in-page', tabId, result);
    };

    if (this.onFoundInPage) {
      tabService.off('found-in-page', this.onFoundInPage);
    }

    this.onFoundInPage = onFoundInPage;
    tabService.on('found-in-page', onFoundInPage);
  }

  cleanup(): void {
    const { tabService } = this.context;

    if (this.onFoundInPage) {
      tabService.off('found-in-page', this.onFoundInPage);
      this.onFoundInPage = undefined;
    }

    super.cleanup();
  }
}

