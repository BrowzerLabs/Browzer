import { BaseHandler } from './base';

export class DownloadHandler extends BaseHandler {
  register(): void {
    const { browserService } = this.context;
    const downloadService = browserService.getDownloadService();

    this.handle('download:get-all', async () => {
      return downloadService.getDownloads();
    });

    this.handle('download:pause', async (_, id: string) => {
      return downloadService.pauseDownload(id);
    });

    this.handle('download:resume', async (_, id: string) => {
      return downloadService.resumeDownload(id);
    });

    this.handle('download:cancel', async (_, id: string) => {
      return downloadService.cancelDownload(id);
    });

    this.handle('download:retry', async (_, id: string) => {
      return downloadService.retryDownload(id);
    });

    this.handle('download:remove', async (_, id: string) => {
      return downloadService.removeDownload(id);
    });

    this.handle('download:open', async (_, id: string) => {
      return downloadService.openDownload(id);
    });

    this.handle('download:show-in-folder', async (_, id: string) => {
      return downloadService.showInFolder(id);
    });
  }
}
