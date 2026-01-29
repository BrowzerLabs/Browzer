import { TabService } from '../browser';

import { BaseActionService } from './BaseActionService';

import { ToolExecutionResult } from '@/shared/types';

export interface ScrollParams {
  tabId: string;
  direction: 'up' | 'down' | 'left' | 'right';
  amount?: number;
}

export class ScrollService extends BaseActionService {
  constructor(tabService: TabService) {
    super(tabService);
  }

  public async execute(params: ScrollParams): Promise<ToolExecutionResult> {
    const view = this.getView(params.tabId);
    if (!view) {
      return {
        success: false,
        error: 'Tab not found, or debugger not attached.',
      };
    }

    const amount = params.amount ?? 300;
    let deltaX = 0;
    let deltaY = 0;

    switch (params.direction) {
      case 'up':
        deltaY = -amount;
        break;
      case 'down':
        deltaY = amount;
        break;
      case 'left':
        deltaX = -amount;
        break;
      case 'right':
        deltaX = amount;
        break;
    }

    try {
      await view.webContents.executeJavaScript(`
        window.scrollBy({
          left: ${deltaX},
          top: ${deltaY},
          behavior: 'instant'
        });
      `);

      await this.sleep(300);

      return {
        success: true,
        value: `Scrolled ${params.direction} by ${amount}px`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to scroll: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}
