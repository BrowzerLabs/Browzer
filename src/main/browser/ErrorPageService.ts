import {
  NavigationError,
  NavigationErrorCategory,
  NavigationErrorCode,
  getNavigationErrorInfo,
  shouldIgnoreError,
  isSSLError,
  isNetworkError,
} from '@/shared/types';

export class ErrorPageService {
  public generateErrorPage(error: NavigationError): string {
    const icon = this.getErrorIcon(error.category);
    const accentColor = this.getAccentColor(error.category);
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(error.title)} - Browzer</title>
  <style>
    :root {
      --bg-primary: #0a0a0a;
      --bg-secondary: #141414;
      --bg-tertiary: #1a1a1a;
      --text-primary: #fafafa;
      --text-secondary: #a1a1aa;
      --text-muted: #71717a;
      --border-color: #27272a;
      --accent-color: ${accentColor};
      --accent-hover: ${accentColor}dd;
    }
    
    @media (prefers-color-scheme: light) {
      :root {
        --bg-primary: #ffffff;
        --bg-secondary: #f4f4f5;
        --bg-tertiary: #e4e4e7;
        --text-primary: #18181b;
        --text-secondary: #52525b;
        --text-muted: #71717a;
        --border-color: #e4e4e7;
      }
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      line-height: 1.6;
    }
    
    .error-container {
      max-width: 560px;
      width: 100%;
      text-align: center;
    }
    
    .error-icon {
      width: 80px;
      height: 80px;
      margin: 0 auto 24px;
      color: var(--accent-color);
      opacity: 0.9;
    }
    
    .error-code {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    
    .error-title {
      font-size: 28px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 12px;
    }
    
    .error-description {
      font-size: 16px;
      color: var(--text-secondary);
      margin-bottom: 24px;
    }
    
    .error-url {
      font-size: 13px;
      color: var(--text-muted);
      background: var(--bg-secondary);
      padding: 10px 16px;
      border-radius: 8px;
      margin-bottom: 32px;
      word-break: break-all;
      border: 1px solid var(--border-color);
    }
    
    .suggestions {
      text-align: left;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 20px 24px;
      margin-bottom: 32px;
    }
    
    .suggestions-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 12px;
    }
    
    .suggestions-list {
      list-style: none;
    }
    
    .suggestions-list li {
      font-size: 14px;
      color: var(--text-secondary);
      padding: 6px 0;
      padding-left: 20px;
      position: relative;
    }
    
    .suggestions-list li::before {
      content: '•';
      position: absolute;
      left: 0;
      color: var(--accent-color);
    }
    
    .actions {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    }
    
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
      font-size: 14px;
      font-weight: 500;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      text-decoration: none;
      border: none;
    }
    
    .btn-primary {
      background: var(--accent-color);
      color: white;
    }
    
    .btn-primary:hover {
      background: var(--accent-hover);
      transform: translateY(-1px);
    }
    
    .btn-secondary {
      background: var(--bg-secondary);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
    }
    
    .btn-secondary:hover {
      background: var(--bg-tertiary);
    }
    
    .btn svg {
      width: 16px;
      height: 16px;
    }
    
    .technical-details {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid var(--border-color);
    }
    
    .details-toggle {
      font-size: 13px;
      color: var(--text-muted);
      background: none;
      border: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    
    .details-toggle:hover {
      color: var(--text-secondary);
    }
    
    .details-content {
      display: none;
      margin-top: 12px;
      font-size: 12px;
      font-family: 'SF Mono', Monaco, 'Courier New', monospace;
      color: var(--text-muted);
      background: var(--bg-secondary);
      padding: 12px 16px;
      border-radius: 8px;
      text-align: left;
      border: 1px solid var(--border-color);
    }
    
    .details-content.show {
      display: block;
    }
    
    ${error.category === NavigationErrorCategory.SSL ? this.getSSLWarningStyles() : ''}
    
    .ssl-bypass-section {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid var(--border-color);
    }
    
    .ssl-bypass-warning {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
      text-align: left;
    }
    
    .ssl-bypass-warning svg {
      color: #ef4444;
      flex-shrink: 0;
      margin-top: 2px;
    }
    
    .ssl-bypass-warning strong {
      color: #ef4444;
      display: block;
      margin-bottom: 4px;
    }
    
    .ssl-bypass-warning p {
      font-size: 13px;
      color: var(--text-secondary);
      margin: 0;
    }
    
    .btn-danger {
      background: transparent;
      color: #ef4444;
      border: 1px solid rgba(239, 68, 68, 0.5);
    }
    
    .btn-danger:hover {
      background: rgba(239, 68, 68, 0.1);
      border-color: #ef4444;
    }
  </style>
</head>
<body>
  <div class="error-container">
    ${icon}
    
    <div class="error-code">${this.getErrorCodeLabel(error.code)}</div>
    <h1 class="error-title">${error.title}</h1>
    <p class="error-description">${error.description}</p>
    
    <div class="error-url">${this.escapeHtml(this.truncateUrl(error.url))}</div>
    
    ${error.suggestions.length > 0 ? `
    <div class="suggestions">
      <div class="suggestions-title">Try the following:</div>
      <ul class="suggestions-list">
        ${error.suggestions.map(s => `<li>${this.escapeHtml(s)}</li>`).join('')}
      </ul>
    </div>
    ` : ''}
    
    <div class="actions">
      ${error.isRecoverable ? `
      <button class="btn btn-primary" onclick="retry()">
        Try again
      </button>
      ` : ''}
      
      <button class="btn btn-secondary" onclick="goHome()">
        Home
      </button>
    </div>
    
    ${error.category === NavigationErrorCategory.SSL ? `
    <div class="ssl-bypass-section">
      <div class="ssl-bypass-warning">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <div>
          <strong>Proceed at your own risk</strong>
          <p>Bypassing this security warning may expose your data to attackers. Only proceed if you trust this site.</p>
        </div>
      </div>
      <button class="btn btn-danger" onclick="bypassCertificate()">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
        </svg>
        Proceed anyway (unsafe)
      </button>
    </div>
    ` : ''}
    
    ${error.technicalDetails ? `
     <div class="details-content" id="details">
        ${this.escapeHtml(error.technicalDetails)}
    </div>
    ` : ''}
  </div>
  
  <script>
    const failedUrl = ${JSON.stringify(error.url)};
    
    function retry() {
      window.location.href = failedUrl;
    }
    
    function goHome() {
      window.location.href = 'browzer://home';
    }
    
    function bypassCertificate() {
      window.location.href = 'browzer://bypass-certificate';
    }
  </script>
</body>
</html>`;
  }

  public createNavigationError(
    errorCode: number,
    errorDescription: string,
    validatedURL: string
  ): NavigationError | null {
    if (shouldIgnoreError(errorCode)) {
      return null;
    }

    return getNavigationErrorInfo(errorCode, errorDescription, validatedURL);
  }

  public shouldShowErrorPage(errorCode: number): boolean {
    return !shouldIgnoreError(errorCode);
  }

  public isSSLError(errorCode: number): boolean {
    return isSSLError(errorCode);
  }

  /**
   * Check if error is network related
   */
  public isNetworkError(errorCode: number): boolean {
    return isNetworkError(errorCode);
  }

  private getErrorIcon(category: NavigationErrorCategory): string {
    switch (category) {
      case NavigationErrorCategory.NETWORK:
        return `<svg class="error-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8.5 16.5a5 5 0 0 1 7 0"/>
          <path d="M2 8.82a15 15 0 0 1 20 0"/>
          <path d="M5 12.859a10 10 0 0 1 14 0"/>
          <line x1="12" x2="12.01" y1="20" y2="20"/>
          <line x1="2" y1="2" x2="22" y2="22" stroke-width="2"/>
        </svg>`;
      
      case NavigationErrorCategory.DNS:
        return `<svg class="error-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 16v-4"/>
          <path d="M12 8h.01"/>
        </svg>`;
      
      case NavigationErrorCategory.SSL:
        return `<svg class="error-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
        </svg>`;
      
      case NavigationErrorCategory.TIMEOUT:
        return `<svg class="error-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>`;
      
      case NavigationErrorCategory.BLOCKED:
        return `<svg class="error-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
        </svg>`;
      
      case NavigationErrorCategory.HTTP:
        return `<svg class="error-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>`;
      
      default:
        return `<svg class="error-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>`;
    }
  }

  private getAccentColor(category: NavigationErrorCategory): string {
    switch (category) {
      case NavigationErrorCategory.SSL:
        return '#ef4444'; // Red for security issues
      case NavigationErrorCategory.BLOCKED:
        return '#f97316'; // Orange for blocked
      case NavigationErrorCategory.NETWORK:
      case NavigationErrorCategory.DNS:
        return '#3b82f6'; // Blue for connectivity
      case NavigationErrorCategory.TIMEOUT:
        return '#eab308'; // Yellow for timeout
      default:
        return '#6366f1'; // Indigo for general errors
    }
  }

  private getErrorCodeLabel(code: NavigationErrorCode): string {
    const codeName = NavigationErrorCode[code];
    if (codeName) {
      return codeName.replace(/^ERR_/, '').replace(/_/g, ' ');
    }
    return `ERROR ${code}`;
  }

  private getSSLWarningStyles(): string {
    return `
    .ssl-warning {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      text-align: left;
    }
    
    .ssl-warning-icon {
      color: #ef4444;
      flex-shrink: 0;
    }
    
    .ssl-warning-text {
      font-size: 13px;
      color: var(--text-secondary);
    }
    
    .ssl-warning-title {
      font-weight: 600;
      color: #ef4444;
      margin-bottom: 4px;
    }
    `;
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  private truncateUrl(url: string, maxLength = 80): string {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength - 3) + '...';
  }
}

export const errorPageService = new ErrorPageService();
