import { WebContentsView } from 'electron';
import path from 'node:path';
import {
  ErrorPageData,
  createErrorPageData,
  shouldShowErrorPage,
} from '@/shared/errorPages';

export class ErrorPageService {
  private tabErrors: Map<string, ErrorPageData> = new Map();
  private failedUrls: Map<string, string> = new Map();

  public handleNavigationError(
    tabId: string,
    errorCode: number,
    errorDescription: string,
    validatedURL: string,
    isMainFrame: boolean
  ): ErrorPageData | null {
    if (!isMainFrame) {
      console.log(`[ErrorPageService] Ignoring subframe error for ${validatedURL}`);
      return null;
    }

    if (!shouldShowErrorPage(errorCode)) {
      console.log(`[ErrorPageService] Skipping error page for code ${errorCode} (${errorDescription})`);
      return null;
    }

    console.log(`[ErrorPageService] Handling error ${errorCode} (${errorDescription}) for ${validatedURL}`);

    const errorData = createErrorPageData(errorCode, validatedURL);
    
    this.tabErrors.set(tabId, errorData);
    this.failedUrls.set(tabId, validatedURL);

    return errorData;
  }

  public generateErrorPageURL(errorData: ErrorPageData): string {
    const encodedData = Buffer.from(JSON.stringify(errorData)).toString('base64');
    
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      return `${MAIN_WINDOW_VITE_DEV_SERVER_URL}#/error?data=${encodedData}`;
    }
    
    return `file://${path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)}#/error?data=${encodedData}`;
  }

  public loadErrorPage(view: WebContentsView, errorData: ErrorPageData): void {
    const errorPageURL = this.generateErrorPageURL(errorData);
    
    console.log(`[ErrorPageService] Loading error page for ${errorData.errorName}`);
    
    view.webContents.loadURL(errorPageURL);
  }

  public getFailedURL(tabId: string): string | null {
    return this.failedUrls.get(tabId) || null;
  }

  public clearError(tabId: string): void {
    this.tabErrors.delete(tabId);
    this.failedUrls.delete(tabId);
  }

  public hasError(tabId: string): boolean {
    return this.tabErrors.has(tabId);
  }

  public isErrorPage(url: string): boolean {
    return url.includes('#/error?data=') || url.includes('browzer://error');
  }

  public getRetryURL(tabId: string): string | null {
    return this.failedUrls.get(tabId) || null;
  }

  public cleanup(tabId: string): void {
    this.tabErrors.delete(tabId);
    this.failedUrls.delete(tabId);
  }
}
