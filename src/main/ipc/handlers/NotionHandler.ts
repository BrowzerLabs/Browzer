import { BaseHandler } from './base';

export class NotionHandler extends BaseHandler {
  register(): void {
    const { notionService } = this.context;

    this.handle('notion:connect', async () => {
      return await notionService.connect();
    });

    this.handle('notion:disconnect', async () => {
      return await notionService.disconnect();
    });

    this.handle('notion:get-connection-state', () => {
      return notionService.getConnectionState();
    });

    this.handle('notion:start-sync', async (_event, forceFullSync: boolean) => {
      return await notionService.startSync(forceFullSync);
    });

    this.handle('notion:get-server-status', async () => {
      return await notionService.getServerConnectionStatus();
    });
  }
}
