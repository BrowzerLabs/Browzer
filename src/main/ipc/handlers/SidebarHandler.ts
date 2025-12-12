import { BaseHandler } from './base';

export class SidebarHandler extends BaseHandler {
  register(): void {
    const { eventEmitter } = this.context;

    this.handle('browser:set-sidebar-state', async (_, visible: boolean) => {
      eventEmitter.emit('sidebar-state-changed', visible);
      return true;
    });
  }
}
