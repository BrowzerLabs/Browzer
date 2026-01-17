import {
  RecordingAction,
  RecordingSession,
  TargetElement,
} from '@/shared/types';
import { escapeXml } from '@/shared/utils';

export class FormatService {
  public static formatRecordedSession(session: RecordingSession): string {
    const actions = session.actions || [];

    let formatted = `<rec name="${escapeXml(session.name)}" desc="${escapeXml(session.description)}" dur="${Math.round(session.duration / 1000)}" start_url="${escapeXml(session.startUrl)}">\n`;

    let previousTimestamp: number | null = null;

    actions.forEach((action: RecordingAction) => {
      const gap =
        previousTimestamp !== null
          ? ((action.timestamp - previousTimestamp) / 1000).toFixed(1)
          : '0.0';

      previousTimestamp = action.timestamp;

      formatted += `  <${action.type}`;

      if (action.type === 'navigate') {
        formatted += ` url="${escapeXml(action.url)}"`;
      }

      if (action.element) {
        formatted += this.formatElementInline(action.element);
      }
      if (action.keys) {
        formatted += ` value="${escapeXml(action.keys.join('+'))}"`;
      }

      formatted += ` tab_id="${action.tabId}" />\n`;
    });

    formatted += `</rec>`;
    return formatted;
  }

  private static formatElementInline(target: TargetElement): string {
    const attrs = target.attributes || {};

    let element = ` role="${escapeXml(target.role)}" name="${escapeXml(target.name)}"`;

    if (target.value) {
      element += ` value="${escapeXml(target.value)}"`;
    }

    const IGNORE_KEYS = [
      'style',
      'spellcheck',
      'autocomplete',
      'enterkeyhint',
      'tabindex',
    ];

    Object.entries(attrs).forEach(([key, value]) => {
      if (IGNORE_KEYS.includes(key)) return;
      if (value === null || value === undefined) return;
      if (typeof value === 'string' && value.trim() === '') return;

      let finalValue = String(value);

      if (key === 'url' || key === 'href') {
        finalValue = this.normalizeGoogleSearchUrl(finalValue);
      }

      element += ` ${escapeXml(key)}="${escapeXml(finalValue)}"`;
    });
    return element;
  }

  private static normalizeGoogleSearchUrl(rawUrl: string): string {
    try {
      const url = new URL(rawUrl);
      if (
        (url.hostname === 'www.google.com' || url.hostname === 'google.com') &&
        url.pathname === '/search'
      ) {
        const q = url.searchParams.get('q');
        if (q) {
          return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
        }
      }
      return rawUrl;
    } catch {
      return rawUrl;
    }
  }
}
