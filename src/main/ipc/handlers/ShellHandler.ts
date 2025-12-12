import { shell } from 'electron';
import { BaseHandler } from './base';

export class ShellHandler extends BaseHandler {
  register(): void {
    this.handle('shell:open-external', async (_, url: string) => {
      await shell.openExternal(url);
    });
  }
}
