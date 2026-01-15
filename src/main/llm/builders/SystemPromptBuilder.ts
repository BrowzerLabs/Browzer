import {
  RecordingAction,
  RecordingSession,
  TargetElement,
} from '@/shared/types';
import { escapeXml } from '@/shared/utils';

export class SystemPromptBuilder {
  public static buildIntermediatePlanContinuationPrompt(params: {
    userGoal: string;
    currentUrl: string;
  }): string {
    const { userGoal, currentUrl } = params;

    return `**INTERMEDIATE PLAN COMPLETED SUCCESSFULLY**
**Original Goal:**
${userGoal}

**Current State:**
- Current URL: ${currentUrl}

**Your Task:**
You have successfully executed your intermediate plan. Now:

1. **Analyze the extracted context/snapshot** (the latest tool_result)
   - Review the current page elements, attributes, and structure
   - Identify the correct elements to interact with

2. **Generate the NEXT plan** to continue toward the goal:
   - This can be another INTERMEDIATE plan (only if dynamic analysis needed in further step(s))
   - Or a FINAL plan (if you can now complete the remaining tasks from the current state)
   - Use the extracted context to choose accurate selectors
   - Start from the CURRENT state (don't repeat completed steps)

3. **Decide plan type:**
   - INTERMEDIATE: ONLY if you need to execute some steps and analyze again
   - FINAL: If you can now complete all remaining steps to achieve the goal
`;
  }

  public static buildErrorRecoveryPrompt(params: {
    errorInfo: {
      message: string;
      code: string;
    };
  }): string {
    const { errorInfo } = params;

    return `**AUTOMATION ERROR ENCOUNTERED**
- Message: ${errorInfo.message}
${errorInfo.code ? `- Code: ${errorInfo.code}` : ''}

**Your Task:**
1. Analyze what went wrong and why.
2. Generate a NEW complete automation plan that:
   - Starts from the CURRENT state (don't repeat successful steps)
   - Completes the remaining work to achieve the goal
   - Focus on what remains to achieve the goal.`;
  }

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

      if(action.type === 'navigate') {
        formatted += ` url="${escapeXml(action.url)}"`;
      }

      if (action.element) {
        formatted += this.formatElementInline(action.element);
      }
      if (action.keys) {
        formatted += ` value="${escapeXml(action.keys.join('+'))}"`;
      }

      formatted += ` tab_id="${action.tabId}" gap=${gap} />\n`;
    });

    formatted += `</rec>`;
    return formatted;
  }

  private static formatElementInline(target: TargetElement): string {
    const attrs = target.attributes || {};

    let element = ` role="${escapeXml(target.role)}" text="${escapeXml(target.text)}"`;

    if (target.value) {
      element += ` value="${escapeXml(target.value)}"`;
    }
    if (target.href) {
      element += ` href="${escapeXml(target.href)}"`;
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
      if (key.startsWith('_') || key.startsWith('js')) return;
      if (value === null || value === undefined) return;
      if (typeof value === 'string' && value.trim() === '') return;
      if (typeof value === 'string' && value.startsWith('data:image/')) return;

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
