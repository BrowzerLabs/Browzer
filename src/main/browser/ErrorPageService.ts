import {
  NavigationError,
  NavigationErrorCategory,
  NavigationErrorCode,
  getNavigationErrorInfo,
  shouldIgnoreError,
  isSSLError,
  isNetworkError,
} from '@/shared/types';

const svgWrapper = (content: string): string => `
  <svg class="error-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  ${content}
  </svg>`;

const ICONS: Record<NavigationErrorCategory, string> = {
  [NavigationErrorCategory.NETWORK]: svgWrapper(`
    <path d="M8.5 16.5a5 5 0 0 1 7 0"/>
    <path d="M2 8.82a15 15 0 0 1 20 0"/>
    <path d="M5 12.859a10 10 0 0 1 14 0"/>
    <line x1="12" x2="12.01" y1="20" y2="20"/>
    <line x1="2" y1="2" x2="22" y2="22" stroke-width="2"/>
  `),
  [NavigationErrorCategory.DNS]: svgWrapper(`
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 16v-4"/>
    <path d="M12 8h.01"/>
  `),
  [NavigationErrorCategory.SSL]: svgWrapper(`
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
    <line x1="9" y1="9" x2="15" y2="15"/>
    <line x1="15" y1="9" x2="9" y2="15"/>
  `),
  [NavigationErrorCategory.TIMEOUT]: svgWrapper(`
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  `),
  [NavigationErrorCategory.BLOCKED]: svgWrapper(`
    <circle cx="12" cy="12" r="10"/>
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
  `),
  [NavigationErrorCategory.HTTP]: svgWrapper(`
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  `),
  [NavigationErrorCategory.CANCELLED]: svgWrapper(`
    <circle cx="12" cy="12" r="10"/>
    <line x1="15" y1="9" x2="9" y2="15"/>
    <line x1="9" y1="9" x2="15" y2="15"/>
  `),
  [NavigationErrorCategory.UNKNOWN]: svgWrapper(`
    <circle cx="12" cy="12" r="10"/>
    <line x1="15" y1="9" x2="9" y2="15"/>
    <line x1="9" y1="9" x2="15" y2="15"/>
  `),
};

const COLORS: Record<NavigationErrorCategory, string> = {
  [NavigationErrorCategory.SSL]: '#ef4444',
  [NavigationErrorCategory.BLOCKED]: '#f97316',
  [NavigationErrorCategory.NETWORK]: '#3b82f6',
  [NavigationErrorCategory.DNS]: '#3b82f6',
  [NavigationErrorCategory.TIMEOUT]: '#eab308',
  [NavigationErrorCategory.HTTP]: '#6366f1',
  [NavigationErrorCategory.CANCELLED]: '#6366f1',
  [NavigationErrorCategory.UNKNOWN]: '#6366f1',
};

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      })[c] ?? c
  );
const truncateUrl = (url: string, max = 80) =>
  url.length <= max ? url : url.slice(0, max - 3) + '...';
const getCodeLabel = (code: NavigationErrorCode) =>
  NavigationErrorCode[code]?.replace(/^ERR_/, '').replace(/_/g, ' ') ??
  `ERROR ${code}`;

export class ErrorPageService {
  generateErrorPage(error: NavigationError): string {
    const color = COLORS[error.category];
    const isSSL = error.category === NavigationErrorCategory.SSL;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(error.title)} - Browzer</title>
  <style>
    :root{--bg:#0a0a0a;--bg2:#141414;--bg3:#1a1a1a;--text:#fafafa;--text2:#a1a1aa;--muted:#71717a;--border:#27272a;--accent:${color}}
    @media(prefers-color-scheme:light){:root{--bg:#fff;--bg2:#f4f4f5;--bg3:#e4e4e7;--text:#18181b;--text2:#52525b;--border:#e4e4e7}}
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;line-height:1.6}
    .container{max-width:560px;width:100%;text-align:center}
    .error-icon{width:80px;height:80px;margin:0 auto 24px;color:var(--accent);opacity:.9}
    .code{font-size:12px;font-weight:500;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}
    h1{font-size:28px;font-weight:600;margin-bottom:12px}
    .desc{font-size:16px;color:var(--text2);margin-bottom:24px}
    .url{font-size:13px;color:var(--muted);background:var(--bg2);padding:10px 16px;border-radius:8px;margin-bottom:32px;word-break:break-all;border:1px solid var(--border)}
    .suggestions{text-align:left;background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-bottom:32px}
    .suggestions h3{font-size:14px;font-weight:600;margin-bottom:12px}
    .suggestions li{font-size:14px;color:var(--text2);padding:6px 0 6px 20px;position:relative;list-style:none}
    .suggestions li::before{content:'•';position:absolute;left:0;color:var(--accent)}
    .actions{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
    .btn{display:inline-flex;align-items:center;gap:8px;padding:12px 24px;font-size:14px;font-weight:500;border-radius:8px;cursor:pointer;transition:all .2s;border:none}
    .btn-primary{background:var(--accent);color:#fff}
    .btn-primary:hover{opacity:.9;transform:translateY(-1px)}
    .btn-secondary{background:var(--bg2);color:var(--text);border:1px solid var(--border)}
    .btn-secondary:hover{background:var(--bg3)}
    .btn-danger{background:transparent;color:#ef4444;border:1px solid rgba(239,68,68,.5)}
    .btn-danger:hover{background:rgba(239,68,68,.1);border-color:#ef4444}
    .ssl-section{margin-top:32px;padding-top:24px;border-top:1px solid var(--border)}
    .ssl-warn{display:flex;align-items:flex-start;gap:12px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:8px;padding:16px;margin-bottom:16px;text-align:left}
    .ssl-warn svg{color:#ef4444;flex-shrink:0;width:20px;height:20px}
    .ssl-warn strong{color:#ef4444;display:block;margin-bottom:4px}
    .ssl-warn p{font-size:13px;color:var(--text2);margin:0}
    .details{margin-top:24px;font-size:12px;font-family:monospace;color:var(--muted);background:var(--bg2);padding:12px 16px;border-radius:8px;border:1px solid var(--border)}
  </style>
</head>
<body>
  <div class="container">
    ${ICONS[error.category]}
    <div class="code">${getCodeLabel(error.code)}</div>
    <h1>${error.title}</h1>
    <p class="desc">${error.description}</p>
    <div class="url">${escapeHtml(truncateUrl(error.url))}</div>
    ${error.suggestions.length ? `<div class="suggestions"><h3>Try the following:</h3><ul>${error.suggestions.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul></div>` : ''}
    <div class="actions">
      ${error.isRecoverable ? '<button class="btn btn-primary" onclick="location.href=\'browzer-action://retry\'">Try again</button>' : ''}
      <button class="btn btn-secondary" onclick="location.href='browzer-action://home'">Home</button>
    </div>
    ${isSSL ? `<div class="ssl-section"><div class="ssl-warn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><div><strong>Proceed at your own risk</strong><p>Bypassing this security warning may expose your data to attackers.</p></div></div><button class="btn btn-danger" onclick="location.href='browzer-action://bypass-certificate'">Proceed anyway (unsafe)</button></div>` : ''}
    ${error.technicalDetails ? `<div class="details">${escapeHtml(error.technicalDetails)}</div>` : ''}
  </div>
</body>
</html>`;
  }

  createNavigationError(
    errorCode: number,
    errorDescription: string,
    url: string
  ): NavigationError | null {
    return shouldIgnoreError(errorCode)
      ? null
      : getNavigationErrorInfo(errorCode, errorDescription, url);
  }

  shouldShowErrorPage = (code: number) => !shouldIgnoreError(code);
  isSSLError = isSSLError;
  isNetworkError = isNetworkError;
}

export const errorPageService = new ErrorPageService();
