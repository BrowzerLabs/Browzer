import { Menu, MenuItem, clipboard, shell, dialog, nativeImage, WebContents, BrowserWindow, ContextMenuParams } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import { EventEmitter } from 'events';

const EXTENSION_MAP: Record<string, string> = {
  jpeg: 'jpg', jpg: 'jpg', png: 'png', gif: 'gif', 
  webp: 'webp', 'svg+xml': 'svg', bmp: 'bmp',
};

const DOWNLOAD_CONFIG = { MAX_REDIRECTS: 5, TIMEOUT_MS: 30000 };

export class ContextMenuService extends EventEmitter {
  public destroy(): void {
    this.removeAllListeners();
  }

  public showContextMenu(webContents: WebContents, params: ContextMenuParams): void {
    this.buildContextMenu(webContents, params).popup({
      window: BrowserWindow.fromWebContents(webContents) || undefined,
      x: params.x,
      y: params.y,
    });
  }

  private buildContextMenu(wc: WebContents, params: ContextMenuParams): Menu {
    const menu = new Menu();
    const sections: Array<() => void> = [];

    if (params.misspelledWord) sections.push(() => this.addSpellingItems(menu, wc, params));
    if (params.linkURL) sections.push(() => this.addLinkItems(menu, params));
    if (params.mediaType === 'image' && params.srcURL) sections.push(() => this.addImageItems(menu, params));
    if (params.mediaType === 'video' || params.mediaType === 'audio') sections.push(() => this.addMediaItems(menu, wc, params));
    if (params.isEditable) sections.push(() => this.addEditableItems(menu, wc, params));
    if (params.selectionText && !params.isEditable) sections.push(() => this.addSelectionItems(menu, wc, params));
    sections.push(() => this.addPageItems(menu, wc, params));

    sections.forEach((fn, i) => {
      fn();
      if (i < sections.length - 1) menu.append(new MenuItem({ type: 'separator' }));
    });

    return menu;
  }

  // ==================== Menu Sections ====================

  private addSpellingItems(menu: Menu, wc: WebContents, params: ContextMenuParams): void {
    const suggestions = params.dictionarySuggestions.slice(0, 5);
    
    if (suggestions.length) {
      suggestions.forEach(s => menu.append(new MenuItem({ label: s, click: () => wc.replaceMisspelling(s) })));
    } else {
      menu.append(new MenuItem({ label: 'No spelling suggestions', enabled: false }));
    }

    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(new MenuItem({
      label: 'Add to Dictionary',
      click: () => wc.session.addWordToSpellCheckerDictionary(params.misspelledWord),
    }));
  }

  private addLinkItems(menu: Menu, params: ContextMenuParams): void {
    const { linkURL, linkText } = params;

    if (linkURL.startsWith('mailto:')) {
      const email = linkURL.replace('mailto:', '').split('?')[0];
      menu.append(new MenuItem({ label: 'Copy Email Address', click: () => clipboard.writeText(email) }));
      menu.append(new MenuItem({ label: 'Send Email', click: () => shell.openExternal(linkURL) }));
    } else if (linkURL.startsWith('tel:')) {
      const phone = linkURL.replace('tel:', '');
      menu.append(new MenuItem({ label: 'Copy Phone Number', click: () => clipboard.writeText(phone) }));
      menu.append(new MenuItem({ label: 'Call', click: () => shell.openExternal(linkURL) }));
    } else {
      menu.append(new MenuItem({ label: 'Open Link in New Tab', click: () => this.emit('open-link-in-new-tab', linkURL) }));
      menu.append(new MenuItem({ label: 'Open Link in New Window', click: () => shell.openExternal(linkURL) }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ label: 'Save Link As...', click: () => this.saveAs(linkURL, 'download') }));
      menu.append(new MenuItem({ label: 'Copy Link Address', click: () => clipboard.writeText(linkURL) }));
      if (linkText) {
        menu.append(new MenuItem({ label: 'Copy Link Text', click: () => clipboard.writeText(linkText) }));
      }
    }
  }

  private addImageItems(menu: Menu, params: ContextMenuParams): void {
    const { srcURL } = params;
    const isBase64 = srcURL.startsWith('data:image/');

    menu.append(new MenuItem({ label: 'Open Image in New Tab', click: () => this.emit('open-link-in-new-tab', srcURL) }));
    menu.append(new MenuItem({ label: 'Save Image As...', click: () => this.saveImageAs(srcURL) }));
    menu.append(new MenuItem({ label: 'Copy Image', click: () => this.copyImageToClipboard(srcURL) }));
    menu.append(new MenuItem({ label: isBase64 ? 'Copy Image Data URL' : 'Copy Image Address', click: () => clipboard.writeText(srcURL) }));
  }

  private addMediaItems(menu: Menu, wc: WebContents, params: ContextMenuParams): void {
    const { srcURL, mediaType } = params;
    const label = mediaType === 'video' ? 'Video' : 'Audio';
    const ext = mediaType === 'video' ? '.mp4' : '.mp3';

    menu.append(new MenuItem({ label: `Open ${label} in New Tab`, click: () => this.emit('open-link-in-new-tab', srcURL) }));
    menu.append(new MenuItem({ label: `Save ${label} As...`, click: () => this.saveAs(srcURL, mediaType, ext) }));
    menu.append(new MenuItem({ label: `Copy ${label} Address`, click: () => clipboard.writeText(srcURL) }));
    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(new MenuItem({ label: 'Play/Pause', click: () => this.execMediaAction(wc, params, 'element.paused ? element.play() : element.pause()') }));
    menu.append(new MenuItem({ label: 'Mute/Unmute', click: () => this.execMediaAction(wc, params, 'element.muted = !element.muted') }));

    if (mediaType === 'video') {
      menu.append(new MenuItem({ label: 'Toggle Loop', click: () => this.execMediaAction(wc, params, 'element.loop = !element.loop') }));
      menu.append(new MenuItem({ label: 'Toggle Controls', click: () => this.execMediaAction(wc, params, 'element.controls = !element.controls') }));
    }
  }

  private addEditableItems(menu: Menu, wc: WebContents, params: ContextMenuParams): void {
    const { editFlags } = params;
    const items: Array<{ label: string; accel?: string; enabled: boolean; action: () => void }> = [
      { label: 'Undo', accel: 'CmdOrCtrl+Z', enabled: editFlags.canUndo, action: () => wc.undo() },
      { label: 'Redo', accel: 'CmdOrCtrl+Shift+Z', enabled: editFlags.canRedo, action: () => wc.redo() },
    ];

    items.forEach(i => menu.append(new MenuItem({ label: i.label, accelerator: i.accel, enabled: i.enabled, click: i.action })));
    menu.append(new MenuItem({ type: 'separator' }));

    const clipboardItems: typeof items = [
      { label: 'Cut', accel: 'CmdOrCtrl+X', enabled: editFlags.canCut, action: () => wc.cut() },
      { label: 'Copy', accel: 'CmdOrCtrl+C', enabled: editFlags.canCopy, action: () => wc.copy() },
      { label: 'Paste', accel: 'CmdOrCtrl+V', enabled: editFlags.canPaste, action: () => wc.paste() },
      { label: 'Paste and Match Style', accel: 'CmdOrCtrl+Shift+V', enabled: editFlags.canPaste, action: () => wc.pasteAndMatchStyle() },
      { label: 'Delete', enabled: editFlags.canDelete, action: () => wc.delete() },
    ];

    clipboardItems.forEach(i => menu.append(new MenuItem({ label: i.label, accelerator: i.accel, enabled: i.enabled, click: i.action })));
    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(new MenuItem({ label: 'Select All', accelerator: 'CmdOrCtrl+A', enabled: editFlags.canSelectAll, click: () => wc.selectAll() }));
  }

  private addSelectionItems(menu: Menu, wc: WebContents, params: ContextMenuParams): void {
    const text = params.selectionText.trim();
    const displayText = text.length > 50 ? `${text.substring(0, 50)}...` : text;

    menu.append(new MenuItem({ label: 'Copy', accelerator: 'CmdOrCtrl+C', click: () => wc.copy() }));
    menu.append(new MenuItem({
      label: `Search Browzer for "${displayText}"`,
      click: () => this.emit('open-link-in-new-tab', `https://www.google.com/search?q=${encodeURIComponent(text)}`),
    }));
  }

  private addPageItems(menu: Menu, wc: WebContents, params: ContextMenuParams): void {
    menu.append(new MenuItem({ label: 'Back', accelerator: 'Alt+Left', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() }));
    menu.append(new MenuItem({ label: 'Forward', accelerator: 'Alt+Right', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() }));
    menu.append(new MenuItem({ label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => wc.reload() }));
    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(new MenuItem({ label: 'Save As...', accelerator: 'CmdOrCtrl+S', click: () => this.savePageAs(wc) }));
    menu.append(new MenuItem({ label: 'Print...', accelerator: 'CmdOrCtrl+P', click: () => wc.print() }));
    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(new MenuItem({ label: 'Inspect', accelerator: 'CmdOrCtrl+Shift+I', click: () => wc.inspectElement(params.x, params.y) }));
  }

  // ==================== Save Operations ====================

  private async saveAs(url: string, defaultName: string, defaultExt = ''): Promise<void> {
    try {
      let filename = defaultName;
      try {
        filename = path.basename(new URL(url).pathname) || defaultName;
      } catch { /* use default */ }

      if (defaultExt && !path.extname(filename)) filename += defaultExt;

      const { filePath } = await dialog.showSaveDialog({ defaultPath: filename, title: 'Save As' });
      if (filePath) await this.downloadFile(url, filePath);
    } catch (error) {
      console.error('[ContextMenuService] Save failed:', error);
      dialog.showErrorBox('Download Failed', 'Failed to save. Please try again.');
    }
  }

  private async saveImageAs(url: string): Promise<void> {
    if (url.startsWith('data:image/')) {
      await this.saveBase64Image(url);
      return;
    }
    await this.saveAs(url, 'image', '.png');
  }

  private async saveBase64Image(dataUrl: string): Promise<void> {
    try {
      const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (!match) {
        dialog.showErrorBox('Save Failed', 'Invalid image data.');
        return;
      }

      const ext = EXTENSION_MAP[match[1].toLowerCase()] || 'png';
      const { filePath } = await dialog.showSaveDialog({ defaultPath: `image.${ext}`, title: 'Save Image As' });
      
      if (filePath) {
        fs.writeFileSync(filePath, Buffer.from(match[2], 'base64'));
      }
    } catch (error) {
      console.error('[ContextMenuService] Save base64 image failed:', error);
      dialog.showErrorBox('Save Failed', 'Failed to save the image.');
    }
  }

  private async savePageAs(wc: WebContents): Promise<void> {
    try {
      const title = (wc.getTitle() || 'page').replace(/[<>:"/\\|?*]/g, '_');
      const { filePath } = await dialog.showSaveDialog({ defaultPath: `${title}.html`, title: 'Save Page As' });
      
      if (filePath) {
        const html = await wc.executeJavaScript('document.documentElement.outerHTML');
        fs.writeFileSync(filePath, html, 'utf-8');
      }
    } catch (error) {
      console.error('[ContextMenuService] Save page failed:', error);
      dialog.showErrorBox('Save Failed', 'Failed to save the page.');
    }
  }

  // ==================== Image Operations ====================

  private async copyImageToClipboard(url: string): Promise<void> {
    try {
      const image = url.startsWith('data:image/') 
        ? this.base64ToImage(url) 
        : await this.fetchImage(url);

      if (image && !image.isEmpty()) {
        clipboard.writeImage(image);
      } else {
        clipboard.writeText(url);
      }
    } catch {
      clipboard.writeText(url);
    }
  }

  private base64ToImage(dataUrl: string): Electron.NativeImage | null {
    const match = dataUrl.match(/^data:image\/[a-zA-Z0-9+]+;base64,(.+)$/);
    return match ? nativeImage.createFromBuffer(Buffer.from(match[1], 'base64')) : null;
  }

  private fetchImage(url: string): Promise<Electron.NativeImage | null> {
    return new Promise(resolve => {
      const proto = url.startsWith('https') ? https : http;
      proto.get(url, res => {
        const chunks: Buffer[] = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          try { resolve(nativeImage.createFromBuffer(Buffer.concat(chunks))); } 
          catch { resolve(null); }
        });
        res.on('error', () => resolve(null));
      }).on('error', () => resolve(null));
    });
  }

  // ==================== Media Controls ====================

  private execMediaAction(wc: WebContents, params: ContextMenuParams, action: string): void {
    const src = params.srcURL.replace(/'/g, "\\'");
    wc.executeJavaScript(`
      (function() {
        const m = document.querySelector('video[src="${src}"], audio[src="${src}"], video source[src="${src}"], audio source[src="${src}"]');
        const element = m?.tagName === 'SOURCE' ? m.parentElement : m;
        if (element && (element.tagName === 'VIDEO' || element.tagName === 'AUDIO')) { ${action}; }
      })();
    `).catch(e => console.error('[ContextMenuService] Media action failed:', e));
  }

  // ==================== Download ====================

  private downloadFile(url: string, filePath: string, redirects = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      if (redirects > DOWNLOAD_CONFIG.MAX_REDIRECTS) {
        return reject(new Error('Too many redirects'));
      }

      const proto = url.startsWith('https') ? https : http;
      const file = fs.createWriteStream(filePath);
      let opened = false;

      const cleanup = () => { if (opened) fs.unlink(filePath, () => {}); };

      file.on('open', () => { opened = true; });

      const req = proto.get(url, res => {
        const { statusCode, headers } = res;

        if ([301, 302, 307].includes(statusCode!) && headers.location) {
          file.close();
          cleanup();
          const next = headers.location.startsWith('http') ? headers.location : new URL(headers.location, url).href;
          return this.downloadFile(next, filePath, redirects + 1).then(resolve).catch(reject);
        }

        if (!statusCode || statusCode < 200 || statusCode >= 300) {
          file.close();
          cleanup();
          return reject(new Error(`HTTP ${statusCode}`));
        }

        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
        file.on('error', e => { cleanup(); reject(e); });
      });

      req.on('error', e => { file.close(); cleanup(); reject(e); });
      req.setTimeout(DOWNLOAD_CONFIG.TIMEOUT_MS, () => {
        req.destroy();
        file.close();
        cleanup();
        reject(new Error('Download timeout'));
      });
    });
  }
}
