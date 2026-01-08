import {
  ElementTarget,
  RecordedAction,
  RecordingSession,
} from '@/shared/types';

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

    let formatted = `<rec name="${this.escapeXml(session.name)}" desc="${this.escapeXml(session.description)}" dur="${Math.round(session.duration / 1000)}" start_url="${this.escapeXml(session.url || session.tabs?.[0]?.url || '')}">
<actions>\n`;

    let previousTimestamp: number | null = null;

    actions.forEach((action: RecordedAction, index: number) => {
      const gap =
        previousTimestamp !== null
          ? ((action.timestamp - previousTimestamp) / 1000).toFixed(1)
          : '0.0';

      previousTimestamp = action.timestamp;

      formatted += `  <action id="${index + 1}" type="${action.type}" url="${this.escapeXml(action.tabUrl || '')}" gap="${gap}">\n`;

      if (action.target) {
        formatted += this.formatElementInline(action.target);
      }

      const shouldOutputValue =
        action.value !== undefined &&
        action.value !== null &&
        (action.type === 'keypress' ||
          action.type === 'context-menu' ||
          !action.target?.value);

      if (shouldOutputValue) {
        formatted += `    <input_value>${this.escapeXml(String(action.value))}</input_value>\n`;
      }

      // commented as click position of element during recording is not reliable in automation.
      // if (action.position) {
      //   formatted += `    <click_pos x="${action.position.x}" y="${action.position.y}" />\n`;
      // }

      formatted += `  </action>\n`;
    });

    formatted += `</actions>\n</rec>`;
    return formatted;
  }

  private static formatElementInline(target: ElementTarget): string {
    const attrs = target.attributes || {};

    let element = `    <${this.escapeXml(target.tagName).toLowerCase()} `;

    if (target.boundingBox !== undefined) {
      const bb = target.boundingBox;
      element += ` x="${bb.x}" y="${bb.y}" width="${bb.width}" height="${bb.height}"`;
    }

    if (target.value !== undefined) {
      element += ` value="${this.escapeXml(target.value)}"`;
    }

    if (target.text) {
      element += ` text="${this.escapeXml(target.text.slice(0, 120))}"`;
    }

    if (target.elementIndex !== undefined) {
      element += ` elementIndex="${target.elementIndex}"`;
    }

    if (target.isDisabled) {
      element += ` disabled="true"`;
    }
    element += `\n`;

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

      element += `      ${this.escapeXml(key)}="${this.escapeXml(finalValue)}"\n`;
    });

    element += `    />\n`;
    return element;
  }

  private static escapeXml(str: string): string {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
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
