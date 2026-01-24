import { BaseActionService, ExecutionContext } from './BaseActionService';

import { ToolExecutionResult } from '@/shared/types';

export interface ScrollParams {
  direction: 'up' | 'down' | 'left' | 'right';
  amount?: number;
}

export class ScrollService extends BaseActionService {
  constructor(context: ExecutionContext) {
    super(context);
  }

  public async execute(params: ScrollParams): Promise<ToolExecutionResult> {
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
      await this.view.webContents.executeJavaScript(`
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
