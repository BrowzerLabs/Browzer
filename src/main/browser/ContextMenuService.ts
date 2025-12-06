import { Menu, MenuItem, clipboard, shell, dialog, nativeImage, WebContents, BrowserWindow, ContextMenuParams } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import { EventEmitter } from 'events';

export class ContextMenuService extends EventEmitter {
  constructor() {
    super();
  }

  public showContextMenu(webContents: WebContents, params: ContextMenuParams): void {
    const menu = this.buildContextMenu(webContents, params);
    menu.popup({
      window: BrowserWindow.fromWebContents(webContents) || undefined,
      x: params.x,
      y: params.y,
    });
  }

  private buildContextMenu(webContents: WebContents, params: ContextMenuParams): Menu {
    const menu = new Menu();

    if (params.misspelledWord) {
      this.addSpellingSuggestions(menu, webContents, params);
      menu.append(new MenuItem({ type: 'separator' }));
    }

    if (params.linkURL) {
      this.addLinkMenuItems(menu, webContents, params);
      menu.append(new MenuItem({ type: 'separator' }));
    }

    if (params.mediaType === 'image' && params.srcURL) {
      this.addImageMenuItems(menu, webContents, params);
      menu.append(new MenuItem({ type: 'separator' }));
    }

    if (params.mediaType === 'video' || params.mediaType === 'audio') {
      this.addMediaMenuItems(menu, webContents, params);
      menu.append(new MenuItem({ type: 'separator' }));
    }

    if (params.isEditable) {
      this.addEditableMenuItems(menu, webContents, params);
      menu.append(new MenuItem({ type: 'separator' }));
    }

    if (params.selectionText && !params.isEditable) {
      this.addSelectionMenuItems(menu, webContents, params);
      menu.append(new MenuItem({ type: 'separator' }));
    }

    this.addPageMenuItems(menu, webContents, params);

    return menu;
  }

  private addSpellingSuggestions(menu: Menu, webContents: WebContents, params: ContextMenuParams): void {
    if (params.dictionarySuggestions.length > 0) {
      params.dictionarySuggestions.slice(0, 5).forEach(suggestion => {
        menu.append(new MenuItem({
          label: suggestion,
          click: () => webContents.replaceMisspelling(suggestion),
        }));
      });
    } else {
      menu.append(new MenuItem({
        label: 'No spelling suggestions',
        enabled: false,
      }));
    }

    menu.append(new MenuItem({ type: 'separator' }));

    menu.append(new MenuItem({
      label: 'Add to Dictionary',
      click: () => webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
    }));
  }

  private addLinkMenuItems(menu: Menu, webContents: WebContents, params: ContextMenuParams): void {
    const isEmailLink = params.linkURL.startsWith('mailto:');
    const isTelLink = params.linkURL.startsWith('tel:');

    if (isEmailLink) {
      const email = params.linkURL.replace('mailto:', '').split('?')[0];
      
      menu.append(new MenuItem({
        label: 'Copy Email Address',
        click: () => clipboard.writeText(email),
      }));

      menu.append(new MenuItem({
        label: 'Send Email',
        click: () => shell.openExternal(params.linkURL),
      }));
    } else if (isTelLink) {
      const phone = params.linkURL.replace('tel:', '');
      
      menu.append(new MenuItem({
        label: 'Copy Phone Number',
        click: () => clipboard.writeText(phone),
      }));

      menu.append(new MenuItem({
        label: 'Call',
        click: () => shell.openExternal(params.linkURL),
      }));
    } else {
      menu.append(new MenuItem({
        label: 'Open Link in New Tab',
        click: () => this.emit('open-link-in-new-tab', params.linkURL),
      }));

      menu.append(new MenuItem({
        label: 'Open Link in New Window',
        click: () => shell.openExternal(params.linkURL),
      }));

      menu.append(new MenuItem({ type: 'separator' }));

      menu.append(new MenuItem({
        label: 'Save Link As...',
        click: () => this.saveLinkAs(params.linkURL),
      }));

      menu.append(new MenuItem({
        label: 'Copy Link Address',
        click: () => clipboard.writeText(params.linkURL),
      }));

      if (params.linkText) {
        menu.append(new MenuItem({
          label: 'Copy Link Text',
          click: () => clipboard.writeText(params.linkText),
        }));
      }
    }
  }

  private addImageMenuItems(menu: Menu, webContents: WebContents, params: ContextMenuParams): void {
    const isBase64Image = this.isBase64DataUrl(params.srcURL);

    menu.append(new MenuItem({
      label: 'Open Image in New Tab',
      click: () => this.emit('open-link-in-new-tab', params.srcURL),
    }));

    menu.append(new MenuItem({
      label: 'Save Image As...',
      click: () => this.saveImageAs(params.srcURL),
    }));

    menu.append(new MenuItem({
      label: 'Copy Image',
      click: () => this.copyImageToClipboard(params.srcURL),
    }));

    menu.append(new MenuItem({
      label: isBase64Image ? 'Copy Image Data URL' : 'Copy Image Address',
      click: () => clipboard.writeText(params.srcURL),
    }));
  }

  private addMediaMenuItems(menu: Menu, webContents: WebContents, params: ContextMenuParams): void {
    const mediaLabel = params.mediaType === 'video' ? 'Video' : 'Audio';

    menu.append(new MenuItem({
      label: `Open ${mediaLabel} in New Tab`,
      click: () => this.emit('open-link-in-new-tab', params.srcURL),
    }));

    menu.append(new MenuItem({
      label: `Save ${mediaLabel} As...`,
      click: () => this.saveMediaAs(params.srcURL, params.mediaType),
    }));

    menu.append(new MenuItem({
      label: `Copy ${mediaLabel} Address`,
      click: () => clipboard.writeText(params.srcURL),
    }));

    menu.append(new MenuItem({ type: 'separator' }));

    menu.append(new MenuItem({
      label: 'Play/Pause',
      click: () => this.toggleMediaPlayback(webContents, params),
    }));

    menu.append(new MenuItem({
      label: 'Mute/Unmute',
      click: () => this.toggleMediaMute(webContents, params),
    }));

    if (params.mediaType === 'video') {
      menu.append(new MenuItem({
        label: 'Toggle Loop',
        click: () => this.toggleMediaLoop(webContents, params),
      }));

      menu.append(new MenuItem({
        label: 'Toggle Controls',
        click: () => this.toggleMediaControls(webContents, params),
      }));
    }
  }

  private addEditableMenuItems(menu: Menu, webContents: WebContents, params: ContextMenuParams): void {
    menu.append(new MenuItem({
      label: 'Undo',
      accelerator: 'CmdOrCtrl+Z',
      enabled: params.editFlags.canUndo,
      click: () => webContents.undo(),
    }));

    menu.append(new MenuItem({
      label: 'Redo',
      accelerator: 'CmdOrCtrl+Shift+Z',
      enabled: params.editFlags.canRedo,
      click: () => webContents.redo(),
    }));

    menu.append(new MenuItem({ type: 'separator' }));

    menu.append(new MenuItem({
      label: 'Cut',
      accelerator: 'CmdOrCtrl+X',
      enabled: params.editFlags.canCut,
      click: () => webContents.cut(),
    }));

    menu.append(new MenuItem({
      label: 'Copy',
      accelerator: 'CmdOrCtrl+C',
      enabled: params.editFlags.canCopy,
      click: () => webContents.copy(),
    }));

    menu.append(new MenuItem({
      label: 'Paste',
      accelerator: 'CmdOrCtrl+V',
      enabled: params.editFlags.canPaste,
      click: () => webContents.paste(),
    }));

    menu.append(new MenuItem({
      label: 'Paste and Match Style',
      accelerator: 'CmdOrCtrl+Shift+V',
      enabled: params.editFlags.canPaste,
      click: () => webContents.pasteAndMatchStyle(),
    }));

    menu.append(new MenuItem({
      label: 'Delete',
      enabled: params.editFlags.canDelete,
      click: () => webContents.delete(),
    }));

    menu.append(new MenuItem({ type: 'separator' }));

    menu.append(new MenuItem({
      label: 'Select All',
      accelerator: 'CmdOrCtrl+A',
      enabled: params.editFlags.canSelectAll,
      click: () => webContents.selectAll(),
    }));
  }

  private addSelectionMenuItems(menu: Menu, webContents: WebContents, params: ContextMenuParams): void {
    menu.append(new MenuItem({
      label: 'Copy',
      accelerator: 'CmdOrCtrl+C',
      click: () => webContents.copy(),
    }));

    // Search with default search engine
    const searchText = params.selectionText.trim().substring(0, 50);
    const displayText = searchText.length < params.selectionText.trim().length 
      ? `${searchText}...` 
      : searchText;

    menu.append(new MenuItem({
      label: `Search Browzer for "${displayText}"`,
      click: () => {
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(params.selectionText.trim())}`;
        this.emit('open-link-in-new-tab', searchUrl);
      },
    }));
  }

  private addPageMenuItems(menu: Menu, webContents: WebContents, params: ContextMenuParams): void {
    menu.append(new MenuItem({
      label: 'Back',
      accelerator: 'Alt+Left',
      enabled: webContents.navigationHistory.canGoBack(),
      click: () => webContents.navigationHistory.goBack(),
    }));

    menu.append(new MenuItem({
      label: 'Forward',
      accelerator: 'Alt+Right',
      enabled: webContents.navigationHistory.canGoForward(),
      click: () => webContents.navigationHistory.goForward(),
    }));

    menu.append(new MenuItem({
      label: 'Reload',
      accelerator: 'CmdOrCtrl+R',
      click: () => webContents.reload(),
    }));

    menu.append(new MenuItem({ type: 'separator' }));

    menu.append(new MenuItem({
      label: 'Save As...',
      accelerator: 'CmdOrCtrl+S',
      click: () => this.savePageAs(webContents),
    }));

    menu.append(new MenuItem({
      label: 'Print...',
      accelerator: 'CmdOrCtrl+P',
      click: () => webContents.print(),
    }));

    menu.append(new MenuItem({ type: 'separator' }));

    menu.append(new MenuItem({
      label: 'Inspect',
      accelerator: 'CmdOrCtrl+Shift+I',
      click: () => webContents.inspectElement(params.x, params.y),
    }));
  }

  private async saveLinkAs(url: string): Promise<void> {
    try {
      const urlObj = new URL(url);
      const filename = path.basename(urlObj.pathname) || 'download';
      
      const { filePath } = await dialog.showSaveDialog({
        defaultPath: filename,
        title: 'Save Link As',
      });

      if (filePath) {
        await this.downloadFile(url, filePath);
      }
    } catch (error) {
      console.error('[ContextMenuService] Failed to save link:', error);
      dialog.showErrorBox('Download Failed', 'Failed to save the link. Please try again.');
    }
  }

  private async saveImageAs(url: string): Promise<void> {
    try {
      if (this.isBase64DataUrl(url)) {
        await this.saveBase64ImageAs(url);
        return;
      }

      const urlObj = new URL(url);
      let filename = path.basename(urlObj.pathname) || 'image';
      
      if (!path.extname(filename)) {
        filename += '.png';
      }
      
      const { filePath } = await dialog.showSaveDialog({
        defaultPath: filename,
        title: 'Save Image As',
      });

      if (filePath) {
        await this.downloadFile(url, filePath);
      }
    } catch (error) {
      console.error('[ContextMenuService] Failed to save image:', error);
      dialog.showErrorBox('Download Failed', 'Failed to save the image. Please try again.');
    }
  }

  private async copyImageToClipboard(srcURL: string): Promise<void> {
    try {
      if (this.isBase64DataUrl(srcURL)) {
        const image = this.base64ToNativeImage(srcURL);
        if (image && !image.isEmpty()) {
          clipboard.writeImage(image);
          return;
        }
      }

      const image = await this.fetchImageAsNativeImage(srcURL);
      if (image && !image.isEmpty()) {
        clipboard.writeImage(image);
      } else {
        clipboard.writeText(srcURL);
      }
    } catch (error) {
      console.error('[ContextMenuService] Failed to copy image:', error);
      clipboard.writeText(srcURL);
    }
  }

  private async saveMediaAs(url: string, mediaType: string): Promise<void> {
    try {
      const urlObj = new URL(url);
      let filename = path.basename(urlObj.pathname) || (mediaType === 'video' ? 'video' : 'audio');
      
      if (!path.extname(filename)) {
        filename += mediaType === 'video' ? '.mp4' : '.mp3';
      }
      
      const { filePath } = await dialog.showSaveDialog({
        defaultPath: filename,
        title: `Save ${mediaType === 'video' ? 'Video' : 'Audio'} As`,
      });

      if (filePath) {
        await this.downloadFile(url, filePath);
      }
    } catch (error) {
      console.error('[ContextMenuService] Failed to save media:', error);
      dialog.showErrorBox('Download Failed', 'Failed to save the media file. Please try again.');
    }
  }

  private async savePageAs(webContents: WebContents): Promise<void> {
    try {
      const pageTitle = webContents.getTitle() || 'page';
      const sanitizedTitle = pageTitle.replace(/[<>:"/\\|?*]/g, '_');
      
      const { filePath } = await dialog.showSaveDialog({
        defaultPath: `${sanitizedTitle}.html`,
        title: 'Save Page As',
      });

      if (filePath) {
        const html = await webContents.executeJavaScript('document.documentElement.outerHTML');
        fs.writeFileSync(filePath, html, 'utf-8');
      }
    } catch (error) {
      console.error('[ContextMenuService] Failed to save page:', error);
      dialog.showErrorBox('Save Failed', 'Failed to save the page. Please try again.');
    }
  }

  private isBase64DataUrl(url: string): boolean {
    return url.startsWith('data:image/');
  }

  private base64ToNativeImage(dataUrl: string): Electron.NativeImage | null {
    try {
      const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (!matches) {
        return null;
      }

      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, 'base64');
      return nativeImage.createFromBuffer(buffer);
    } catch (error) {
      console.error('[ContextMenuService] Failed to convert base64 to image:', error);
      return null;
    }
  }

  private async saveBase64ImageAs(dataUrl: string): Promise<void> {
    try {
      const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (!matches) {
        dialog.showErrorBox('Save Failed', 'Invalid image data.');
        return;
      }

      const mimeType = matches[1];
      const base64Data = matches[2];
      
      const extensionMap: Record<string, string> = {
        'jpeg': 'jpg',
        'jpg': 'jpg',
        'png': 'png',
        'gif': 'gif',
        'webp': 'webp',
        'svg+xml': 'svg',
        'bmp': 'bmp',
      };
      const extension = extensionMap[mimeType.toLowerCase()] || 'png';
      
      const { filePath } = await dialog.showSaveDialog({
        defaultPath: `image.${extension}`,
        title: 'Save Image As',
      });

      if (filePath) {
        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(filePath, buffer);
      }
    } catch (error) {
      console.error('[ContextMenuService] Failed to save base64 image:', error);
      dialog.showErrorBox('Save Failed', 'Failed to save the image. Please try again.');
    }
  }

  private fetchImageAsNativeImage(url: string): Promise<Electron.NativeImage | null> {
    return new Promise((resolve) => {
      if (this.isBase64DataUrl(url)) {
        resolve(this.base64ToNativeImage(url));
        return;
      }

      const protocol = url.startsWith('https') ? https : http;
      
      protocol.get(url, (response) => {
        const chunks: Buffer[] = [];
        
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          try {
            const buffer = Buffer.concat(chunks);
            const image = nativeImage.createFromBuffer(buffer);
            resolve(image);
          } catch {
            resolve(null);
          }
        });
        response.on('error', () => resolve(null));
      }).on('error', () => resolve(null));
    });
  }

  private downloadFile(url: string, filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      const file = fs.createWriteStream(filePath);
      
      protocol.get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            file.close();
            fs.unlinkSync(filePath);
            this.downloadFile(redirectUrl, filePath).then(resolve).catch(reject);
            return;
          }
        }
        
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          resolve();
        });
        
        file.on('error', (err) => {
          fs.unlinkSync(filePath);
          reject(err);
        });
      }).on('error', (err) => {
        fs.unlinkSync(filePath);
        reject(err);
      });
    });
  }

  private toggleMediaPlayback(webContents: WebContents, params: ContextMenuParams): void {
    webContents.executeJavaScript(`
      (function() {
        const media = document.elementFromPoint(${params.x}, ${params.y});
        if (media && (media.tagName === 'VIDEO' || media.tagName === 'AUDIO')) {
          if (media.paused) {
            media.play();
          } else {
            media.pause();
          }
        }
      })();
    `).catch(err => console.error('[ContextMenuService] Failed to toggle playback:', err));
  }

  private toggleMediaMute(webContents: WebContents, params: ContextMenuParams): void {
    webContents.executeJavaScript(`
      (function() {
        const media = document.elementFromPoint(${params.x}, ${params.y});
        if (media && (media.tagName === 'VIDEO' || media.tagName === 'AUDIO')) {
          media.muted = !media.muted;
        }
      })();
    `).catch(err => console.error('[ContextMenuService] Failed to toggle mute:', err));
  }

  private toggleMediaLoop(webContents: WebContents, params: ContextMenuParams): void {
    webContents.executeJavaScript(`
      (function() {
        const media = document.elementFromPoint(${params.x}, ${params.y});
        if (media && media.tagName === 'VIDEO') {
          media.loop = !media.loop;
        }
      })();
    `).catch(err => console.error('[ContextMenuService] Failed to toggle loop:', err));
  }

  private toggleMediaControls(webContents: WebContents, params: ContextMenuParams): void {
    webContents.executeJavaScript(`
      (function() {
        const media = document.elementFromPoint(${params.x}, ${params.y});
        if (media && media.tagName === 'VIDEO') {
          media.controls = !media.controls;
        }
      })();
    `).catch(err => console.error('[ContextMenuService] Failed to toggle controls:', err));
  }
}
