import {
  Menu,
  clipboard,
  shell,
  dialog,
  nativeImage,
  WebContents,
  BrowserWindow,
  ContextMenuParams,
  MenuItemConstructorOptions,
} from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import { EventEmitter } from 'events';

import { ContextMenuEvent } from './types';

const EXTENSION_MAP: Record<string, string> = {
  jpeg: 'jpg',
  jpg: 'jpg',
  png: 'png',
  gif: 'gif',
  webp: 'webp',
  'svg+xml': 'svg',
  bmp: 'bmp',
};

const DOWNLOAD_CONFIG = { MAX_REDIRECTS: 5, TIMEOUT_MS: 30000 };

export class ContextMenuService extends EventEmitter {
  private currentParams: ContextMenuParams | null = null;

  public destroy(): void {
    this.removeAllListeners();
  }

  public showContextMenu(
    webContents: WebContents,
    params: ContextMenuParams
  ): void {
    this.currentParams = params;
    this.buildContextMenu(webContents, params).popup({
      window: BrowserWindow.fromWebContents(webContents) || undefined,
      x: params.x,
      y: params.y,
    });
  }

  private emitContextMenuAction(action: string): void {
    if (!this.currentParams) return;

    const attributes: Record<string, string> = {};
    if (this.currentParams.linkURL)
      attributes['href'] = this.currentParams.linkURL;
    if (this.currentParams.srcURL)
      attributes['src'] = this.currentParams.srcURL;
    if (this.currentParams.mediaType)
      attributes['type'] = this.currentParams.mediaType;
    if (this.currentParams.selectionText)
      attributes['text'] = this.currentParams.selectionText;
    if (this.currentParams.isEditable) attributes['editable'] = 'true';
    if (this.currentParams.titleText)
      attributes['title'] = this.currentParams.titleText;

    const event: ContextMenuEvent = {
      type: 'context-menu',
      value: action,
      position: { x: this.currentParams.x, y: this.currentParams.y },
      target: {
        tagName:
          this.currentParams.mediaType === 'image'
            ? 'IMG'
            : this.currentParams.mediaType === 'video'
              ? 'VIDEO'
              : this.currentParams.mediaType === 'audio'
                ? 'AUDIO'
                : this.currentParams.linkURL
                  ? 'A'
                  : this.currentParams.isEditable
                    ? 'INPUT'
                    : undefined,
        attributes,
      },
      timestamp: Date.now(),
    };

    this.emit('context-menu-action', event);
  }

  private buildContextMenu(wc: WebContents, params: ContextMenuParams): Menu {
    const sections: MenuItemConstructorOptions[][] = [];

    if (params.misspelledWord) sections.push(this.addSpellingItems(wc, params));
    if (params.linkURL) sections.push(this.addLinkItems(params));
    if (params.mediaType === 'image' && params.srcURL)
      sections.push(this.addImageItems(params));
    if (params.mediaType === 'video' || params.mediaType === 'audio')
      sections.push(this.addMediaItems(wc, params));
    if (params.isEditable) sections.push(this.addEditableItems(wc, params));
    if (params.selectionText && !params.isEditable)
      sections.push(this.addSelectionItems(wc, params));
    sections.push(this.addPageItems(wc, params));

    const template = sections.flatMap((items, i) =>
      i === sections.length - 1
        ? items
        : [...items, { type: 'separator' as const }]
    );
    return Menu.buildFromTemplate(template);
  }

  // ==================== Menu Sections ====================

  private addSpellingItems(
    wc: WebContents,
    params: ContextMenuParams
  ): MenuItemConstructorOptions[] {
    const suggestions = params.dictionarySuggestions.slice(0, 5);

    const suggestionItems = suggestions.length
      ? suggestions.map((s) => ({
          label: s,
          click: () => {
            wc.replaceMisspelling(s);
            this.emitContextMenuAction(`Replace with "${s}"`);
          },
        }))
      : [{ label: 'No spelling suggestions', enabled: false }];

    return [
      ...suggestionItems,
      { type: 'separator' },
      {
        label: 'Add to Dictionary',
        click: () => {
          wc.session.addWordToSpellCheckerDictionary(params.misspelledWord);
          this.emitContextMenuAction('Add to Dictionary');
        },
      },
    ];
  }

  private addLinkItems(
    params: ContextMenuParams
  ): MenuItemConstructorOptions[] {
    const { linkURL, linkText } = params;

    if (linkURL.startsWith('mailto:')) {
      const email = linkURL.replace('mailto:', '').split('?')[0];
      return [
        {
          label: 'Copy Email Address',
          click: () => {
            clipboard.writeText(email);
            this.emitContextMenuAction('Copy Email Address');
          },
        },
        {
          label: 'Send Email',
          click: () => {
            shell.openExternal(linkURL);
            this.emitContextMenuAction('Send Email');
          },
        },
      ];
    }

    if (linkURL.startsWith('tel:')) {
      const phone = linkURL.replace('tel:', '');
      return [
        {
          label: 'Copy Phone Number',
          click: () => {
            clipboard.writeText(phone);
            this.emitContextMenuAction('Copy Phone Number');
          },
        },
        {
          label: 'Call',
          click: () => {
            shell.openExternal(linkURL);
            this.emitContextMenuAction('Call');
          },
        },
      ];
    }

    return [
      {
        label: 'Open Link in New Tab',
        click: () => {
          this.emit('open-link-in-new-tab', linkURL);
          this.emitContextMenuAction('Open Link in New Tab');
        },
      },
      {
        label: 'Open Link in New Window',
        click: () => {
          shell.openExternal(linkURL);
          this.emitContextMenuAction('Open Link in New Window');
        },
      },
      { type: 'separator' },
      {
        label: 'Save Link As...',
        click: () => {
          this.saveAs(linkURL, 'download');
          this.emitContextMenuAction('Save Link As...');
        },
      },
      {
        label: 'Copy Link Address',
        click: () => {
          clipboard.writeText(linkURL);
          this.emitContextMenuAction('Copy Link Address');
        },
      },
      ...(linkText
        ? [
            {
              label: 'Copy Link Text',
              click: () => {
                clipboard.writeText(linkText);
                this.emitContextMenuAction('Copy Link Text');
              },
            },
          ]
        : []),
    ];
  }

  private addImageItems(
    params: ContextMenuParams
  ): MenuItemConstructorOptions[] {
    const { srcURL } = params;
    const isBase64 = srcURL.startsWith('data:image/');
    const copyLabel = isBase64 ? 'Copy Image Data URL' : 'Copy Image Address';

    return [
      {
        label: 'Open Image in New Tab',
        click: () => {
          this.emit('open-link-in-new-tab', srcURL);
          this.emitContextMenuAction('Open Image in New Tab');
        },
      },
      {
        label: 'Save Image As...',
        click: () => {
          this.saveImageAs(srcURL);
          this.emitContextMenuAction('Save Image As...');
        },
      },
      {
        label: 'Copy Image',
        click: () => {
          this.copyImageToClipboard(srcURL);
          this.emitContextMenuAction('Copy Image');
        },
      },
      {
        label: copyLabel,
        click: () => {
          clipboard.writeText(srcURL);
          this.emitContextMenuAction(copyLabel);
        },
      },
    ];
  }

  private addMediaItems(
    wc: WebContents,
    params: ContextMenuParams
  ): MenuItemConstructorOptions[] {
    const { srcURL, mediaType } = params;
    const label = mediaType === 'video' ? 'Video' : 'Audio';
    const ext = mediaType === 'video' ? '.mp4' : '.mp3';

    return [
      {
        label: `Open ${label} in New Tab`,
        click: () => {
          this.emit('open-link-in-new-tab', srcURL);
          this.emitContextMenuAction(`Open ${label} in New Tab`);
        },
      },
      {
        label: `Save ${label} As...`,
        click: () => {
          this.saveAs(srcURL, mediaType, ext);
          this.emitContextMenuAction(`Save ${label} As...`);
        },
      },
      {
        label: `Copy ${label} Address`,
        click: () => {
          clipboard.writeText(srcURL);
          this.emitContextMenuAction(`Copy ${label} Address`);
        },
      },
      { type: 'separator' },
      {
        label: 'Play/Pause',
        click: () => {
          this.execMediaAction(
            wc,
            params,
            'element.paused ? element.play() : element.pause()'
          );
          this.emitContextMenuAction('Play/Pause');
        },
      },
      {
        label: 'Mute/Unmute',
        click: () => {
          this.execMediaAction(wc, params, 'element.muted = !element.muted');
          this.emitContextMenuAction('Mute/Unmute');
        },
      },
      ...(mediaType === 'video'
        ? [
            {
              label: 'Toggle Loop',
              click: () => {
                this.execMediaAction(
                  wc,
                  params,
                  'element.loop = !element.loop'
                );
                this.emitContextMenuAction('Toggle Loop');
              },
            },
            {
              label: 'Toggle Controls',
              click: () => {
                this.execMediaAction(
                  wc,
                  params,
                  'element.controls = !element.controls'
                );
                this.emitContextMenuAction('Toggle Controls');
              },
            },
          ]
        : []),
    ];
  }

  private addEditableItems(
    wc: WebContents,
    params: ContextMenuParams
  ): MenuItemConstructorOptions[] {
    const { editFlags } = params;
    const items: Array<{
      label: string;
      accel?: string;
      enabled: boolean;
      action: () => void;
    }> = [
      {
        label: 'Undo',
        accel: 'CmdOrCtrl+Z',
        enabled: editFlags.canUndo,
        action: () => {
          wc.undo();
          this.emitContextMenuAction('Undo');
        },
      },
      {
        label: 'Redo',
        accel: 'CmdOrCtrl+Shift+Z',
        enabled: editFlags.canRedo,
        action: () => {
          wc.redo();
          this.emitContextMenuAction('Redo');
        },
      },
    ];

    const clipboardItems: typeof items = [
      {
        label: 'Cut',
        accel: 'CmdOrCtrl+X',
        enabled: editFlags.canCut,
        action: () => {
          wc.cut();
          this.emitContextMenuAction('Cut');
        },
      },
      {
        label: 'Copy',
        accel: 'CmdOrCtrl+C',
        enabled: editFlags.canCopy,
        action: () => {
          wc.copy();
          this.emitContextMenuAction('Copy');
        },
      },
      {
        label: 'Paste',
        accel: 'CmdOrCtrl+V',
        enabled: editFlags.canPaste,
        action: () => {
          wc.paste();
          this.emitContextMenuAction('Paste');
        },
      },
      {
        label: 'Paste and Match Style',
        accel: 'CmdOrCtrl+Shift+V',
        enabled: editFlags.canPaste,
        action: () => {
          wc.pasteAndMatchStyle();
          this.emitContextMenuAction('Paste and Match Style');
        },
      },
      {
        label: 'Delete',
        enabled: editFlags.canDelete,
        action: () => {
          wc.delete();
          this.emitContextMenuAction('Delete');
        },
      },
    ];

    return [
      ...items.map((i) => ({
        label: i.label,
        accelerator: i.accel,
        enabled: i.enabled,
        click: i.action,
      })),
      { type: 'separator' },
      ...clipboardItems.map((i) => ({
        label: i.label,
        accelerator: i.accel,
        enabled: i.enabled,
        click: i.action,
      })),
      { type: 'separator' },
      {
        label: 'Select All',
        accelerator: 'CmdOrCtrl+A',
        enabled: editFlags.canSelectAll,
        click: () => {
          wc.selectAll();
          this.emitContextMenuAction('Select All');
        },
      },
    ];
  }

  private addSelectionItems(
    wc: WebContents,
    params: ContextMenuParams
  ): MenuItemConstructorOptions[] {
    const text = params.selectionText.trim();
    const displayText = text.length > 50 ? `${text.substring(0, 50)}...` : text;

    return [
      {
        label: 'Copy',
        accelerator: 'CmdOrCtrl+C',
        click: () => {
          wc.copy();
          this.emitContextMenuAction('Copy');
        },
      },
      {
        label: `Search Browzer for "${displayText}"`,
        click: () => {
          this.emit(
            'open-link-in-new-tab',
            `https://www.google.com/search?q=${encodeURIComponent(text)}`
          );
          this.emitContextMenuAction(`Search for "${displayText}"`);
        },
      },
    ];
  }

  private addPageItems(
    wc: WebContents,
    params: ContextMenuParams
  ): MenuItemConstructorOptions[] {
    return [
      {
        label: 'Back',
        accelerator: 'Alt+Left',
        enabled: wc.navigationHistory.canGoBack(),
        click: () => {
          wc.navigationHistory.goBack();
          this.emitContextMenuAction('Back');
        },
      },
      {
        label: 'Forward',
        accelerator: 'Alt+Right',
        enabled: wc.navigationHistory.canGoForward(),
        click: () => {
          wc.navigationHistory.goForward();
          this.emitContextMenuAction('Forward');
        },
      },
      {
        label: 'Reload',
        accelerator: 'CmdOrCtrl+R',
        click: () => {
          wc.reload();
          this.emitContextMenuAction('Reload');
        },
      },
      { type: 'separator' },
      {
        label: 'Save As...',
        accelerator: 'CmdOrCtrl+S',
        click: () => {
          this.savePageAs(wc);
          this.emitContextMenuAction('Save As...');
        },
      },
      {
        label: 'Print...',
        accelerator: 'CmdOrCtrl+P',
        click: () => {
          wc.print();
          this.emitContextMenuAction('Print...');
        },
      },
      { type: 'separator' },
      {
        label: 'Inspect',
        accelerator: 'CmdOrCtrl+Shift+I',
        click: () => {
          wc.inspectElement(params.x, params.y);
          this.emitContextMenuAction('Inspect');
        },
      },
    ];
  }

  // ==================== Save Operations ====================

  private async saveAs(
    url: string,
    defaultName: string,
    defaultExt = ''
  ): Promise<void> {
    try {
      let filename = defaultName;
      try {
        filename = path.basename(new URL(url).pathname) || defaultName;
      } catch {
        /* use default */
      }

      if (defaultExt && !path.extname(filename)) filename += defaultExt;

      const { filePath } = await dialog.showSaveDialog({
        defaultPath: filename,
        title: 'Save As',
      });
      if (filePath) await this.downloadFile(url, filePath);
    } catch (error) {
      console.error('[ContextMenuService] Save failed:', error);
      dialog.showErrorBox(
        'Download Failed',
        'Failed to save. Please try again.'
      );
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
      const { filePath } = await dialog.showSaveDialog({
        defaultPath: `image.${ext}`,
        title: 'Save Image As',
      });

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
      const { filePath } = await dialog.showSaveDialog({
        defaultPath: `${title}.html`,
        title: 'Save Page As',
      });

      if (filePath) {
        const html = await wc.executeJavaScript(
          'document.documentElement.outerHTML'
        );
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
    return match
      ? nativeImage.createFromBuffer(Buffer.from(match[1], 'base64'))
      : null;
  }

  private fetchImage(url: string): Promise<Electron.NativeImage | null> {
    return new Promise((resolve) => {
      const proto = url.startsWith('https') ? https : http;
      proto
        .get(url, (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            try {
              resolve(nativeImage.createFromBuffer(Buffer.concat(chunks)));
            } catch {
              resolve(null);
            }
          });
          res.on('error', () => resolve(null));
        })
        .on('error', () => resolve(null));
    });
  }

  // ==================== Media Controls ====================

  private execMediaAction(
    wc: WebContents,
    params: ContextMenuParams,
    action: string
  ): void {
    const src = params.srcURL.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    wc.executeJavaScript(
      `
      (function() {
        const m = document.querySelector('video[src="${src}"], audio[src="${src}"], video source[src="${src}"], audio source[src="${src}"]');
        const element = m?.tagName === 'SOURCE' ? m.parentElement : m;
        if (element && (element.tagName === 'VIDEO' || element.tagName === 'AUDIO')) { ${action}; }
      })();
    `
    ).catch((e) =>
      console.error('[ContextMenuService] Media action failed:', e)
    );
  }

  // ==================== Download ====================

  private downloadFile(
    url: string,
    filePath: string,
    redirects = 0
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (redirects > DOWNLOAD_CONFIG.MAX_REDIRECTS) {
        return reject(new Error('Too many redirects'));
      }

      const proto = url.startsWith('https') ? https : http;
      const file = fs.createWriteStream(filePath);
      let opened = false;

      const cleanup = () => {
        if (opened) {
          fs.unlink(filePath, () => {
            // Best-effort cleanup; ignore unlink errors
          });
        }
      };

      file.on('open', () => {
        opened = true;
      });

      const req = proto.get(url, (res) => {
        const { statusCode, headers } = res;

        if ([301, 302, 307].includes(statusCode!) && headers.location) {
          file.close();
          cleanup();
          const next = headers.location.startsWith('http')
            ? headers.location
            : new URL(headers.location, url).href;
          return this.downloadFile(next, filePath, redirects + 1)
            .then(resolve)
            .catch(reject);
        }

        if (!statusCode || statusCode < 200 || statusCode >= 300) {
          file.close();
          cleanup();
          return reject(new Error(`HTTP ${statusCode}`));
        }

        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
        file.on('error', (e) => {
          cleanup();
          reject(e);
        });
      });

      req.on('error', (e) => {
        file.close();
        cleanup();
        reject(e);
      });
      req.setTimeout(DOWNLOAD_CONFIG.TIMEOUT_MS, () => {
        req.destroy();
        file.close();
        cleanup();
        reject(new Error('Download timeout'));
      });
    });
  }
}
