import { Debugger, WebContentsView } from 'electron';
import { ToolExecutionResult, AutomationError } from '@/shared/types';
import { HandlerContext } from './BaseHandler';

export interface ClickParams {
  nodeId?: number;
  role?: string;
  text?: string;
  url?: string;
  describedby?: string;
  hasPopup?: string;
  invalid?: string;
  disabled?: string;
  checked?: string;
  selected?: string;
  expanded?: string;
  controls?: string;
}

export class ClickHandler {
  private view: WebContentsView;
  private tabId: string;
  private cdp: Debugger;

  constructor(context: HandlerContext) {
    this.view = context.view;
    this.tabId = context.tabId;
    this.cdp = this.view.webContents.debugger;
  }

  public async execute(
    params: ClickParams
  ): Promise<ToolExecutionResult> {
    try {
      if (params.nodeId) {
        await this.performClick(params.nodeId);
        return { success: true }
      }

      if (params.role && params.text) {
        const result = await this.clickByRoleAndText(
          params.role,
          params.text,
          params
        );
        if (result.success) return result;
      }

      if (params.role && params.url) {
        const result = await this.clickByRoleAndUrl(params.role, params.url);
        if (result.success) return result;
      }

      if (params.text) {
        const result = await this.clickByText(params.text, params.role);
        if (result.success) return result;
      }

      return this.createErrorResult({
        code: 'ELEMENT_NOT_FOUND',
        message: `Could not find element with provided parameters`,
      });
    } catch (error) {
      console.error('[ClickHandler] Error:', error);
      return this.createErrorResult({
        code: 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown click error',
      });
    }
  }

  private async clickByRoleAndText(
    role: string,
    text: string,
    additionalParams: ClickParams
  ): Promise<ToolExecutionResult> {
    try {
      const { root } = await this.cdp.sendCommand('DOM.getDocument', {
        depth: -1,
        pierce: true,
      });

      const selector = this.buildSelectorFromRole(role);
      const { nodeIds } = await this.cdp.sendCommand('DOM.querySelectorAll', {
        nodeId: root.nodeId,
        selector,
      });

      for (const nodeId of nodeIds) {
        const match = await this.matchesTextAndAttributes(
          nodeId,
          text,
          additionalParams
        );

        if (match) {
          await this.performClick(nodeId);
          return {
            success: true,
            tabId: this.tabId,
          };
        }
      }

      return this.createErrorResult({
        code: 'ELEMENT_NOT_FOUND',
        message: `No ${role} element found with text "${text}"`,
      });
    } catch (error) {
      return this.createErrorResult({
        code: 'CLICK_FAILED',
        message: `Failed to click by role and text: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private async clickByRoleAndUrl(
    role: string,
    url: string
  ): Promise<ToolExecutionResult> {
    try {
      const { root } = await this.cdp.sendCommand('DOM.getDocument', {
        depth: -1,
        pierce: true,
      });

      const selector = this.buildSelectorFromRole(role);
      const { nodeIds } = await this.cdp.sendCommand('DOM.querySelectorAll', {
        nodeId: root.nodeId,
        selector,
      });

      for (const nodeId of nodeIds) {
        const { node } = await this.cdp.sendCommand('DOM.describeNode', {
          nodeId,
        });

        if (node.attributes) {
          const attrs = this.parseAttributes(node.attributes);
          const href = attrs['href'];

          if (
            href &&
            (href === url || href.includes(url) || url.includes(href))
          ) {
            await this.performClick(nodeId);
            return {
              success: true,
              tabId: this.tabId,
            };
          }
        }
      }

      return this.createErrorResult({
        code: 'ELEMENT_NOT_FOUND',
        message: `No ${role} element found with URL "${url}"`,
      });
    } catch (error) {
      console.error(
        '[ClickHandler] clickByRoleAndUrl error:',
        error
      );
      return this.createErrorResult({
        code: 'CLICK_FAILED',
        message: `Failed to click by role and URL: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private async clickByText(
    text: string,
    role?: string
  ): Promise<ToolExecutionResult> {
    try {
      const { root } = await this.cdp.sendCommand('DOM.getDocument', {
        depth: -1,
        pierce: true,
      });

      const selector = role
        ? this.buildSelectorFromRole(role)
        : 'button, a, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="option"]';

      const { nodeIds } = await this.cdp.sendCommand('DOM.querySelectorAll', {
        nodeId: root.nodeId,
        selector,
      });

      for (const nodeId of nodeIds) {
        const elementText = await this.getElementText(nodeId);

        if (elementText && this.textMatches(elementText, text)) {
          await this.performClick(nodeId);
          return {
            success: true,
            tabId: this.tabId,
          };
        }
      }

      return this.createErrorResult({
        code: 'ELEMENT_NOT_FOUND',
        message: `No element found with text "${text}"`,
      });
    } catch (error) {
      return this.createErrorResult({
        code: 'CLICK_FAILED',
        message: `Failed to click by text: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private async performClick(
    nodeId: number
  ): Promise<void> {
    const { model } = await this.cdp.sendCommand('DOM.getBoxModel', { nodeId });

    if (!model || !model.content || model.content.length < 8) {
      throw new Error('Element not visible or has no box model');
    }

    const [x1, y1, x2, y2, x3, y3, x4, y4] = model.content;
    const centerX = (x1 + x2 + x3 + x4) / 4;
    const centerY = (y1 + y2 + y3 + y4) / 4;

    await this.cdp.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: centerX,
      y: centerY,
      button: 'none',
      clickCount: 0,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    await this.cdp.sendCommand('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: centerX,
      y: centerY,
      button: 'left',
      clickCount: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    await this.cdp.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: centerX,
      y: centerY,
      button: 'left',
      clickCount: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  private async matchesTextAndAttributes(
    nodeId: number,
    text: string,
    additionalParams: ClickParams
  ): Promise<boolean> {
    try {
      const elementText = await this.getElementText(nodeId);

      if (!elementText || !this.textMatches(elementText, text)) {
        return false;
      }

      if (Object.keys(additionalParams).length > 2) {
        const { node } = await this.cdp.sendCommand('DOM.describeNode', {
          nodeId,
        });

        if (node.attributes) {
          const attrs = this.parseAttributes(node.attributes);

          if (additionalParams.url && attrs['href']) {
            const href = attrs['href'];
            if (
              !href.includes(additionalParams.url) &&
              !additionalParams.url.includes(href)
            ) {
              return false;
            }
          }

          if (
            additionalParams.describedby &&
            attrs['aria-describedby'] !== additionalParams.describedby
          ) {
            return false;
          }

          if (
            additionalParams.hasPopup &&
            attrs['aria-haspopup'] !== additionalParams.hasPopup
          ) {
            return false;
          }

          if (
            additionalParams.controls &&
            attrs['aria-controls'] !== additionalParams.controls
          ) {
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  private async getElementText(
    nodeId: number
  ): Promise<string | null> {
    try {
      const { object } = await this.cdp.sendCommand('DOM.resolveNode', { nodeId });

      if (!object || !object.objectId) {
        return null;
      }

      const textResult = await this.cdp.sendCommand('Runtime.callFunctionOn', {
        objectId: object.objectId,
        functionDeclaration: `
          function() {
            let text = (this.innerText || '').trim();
            if (!text) text = (this.textContent || '').trim();
            if (!text) text = this.getAttribute('aria-label') || '';
            if (!text) text = this.title || '';
            if (!text) text = this.getAttribute('placeholder') || '';
            if (!text && this.value) text = this.value;
            return text;
          }
        `,
        returnByValue: true,
      });

      await this.cdp.sendCommand('Runtime.releaseObject', {
        objectId: object.objectId,
      });

      if (textResult.result && textResult.result.value) {
        return String(textResult.result.value).trim();
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  private textMatches(elementText: string, searchText: string): boolean {
    const normalizedElement = elementText.toLowerCase().trim();
    const normalizedSearch = searchText.toLowerCase().trim();

    if (normalizedElement === normalizedSearch) {
      return true;
    }

    if (normalizedElement.includes(normalizedSearch)) {
      return true;
    }

    if (normalizedSearch.includes(normalizedElement)) {
      return true;
    }

    const elementWords = normalizedElement.split(/\s+/);
    const searchWords = normalizedSearch.split(/\s+/);

    if (searchWords.every((word) => elementWords.includes(word))) {
      return true;
    }

    return false;
  }

  private buildSelectorFromRole(role: string): string {
    const roleMap: Record<string, string> = {
      button: 'button, [role="button"]',
      link: 'a, [role="link"]',
      textbox:
        'input[type="text"], input:not([type]), textarea, [role="textbox"]',
      searchbox: 'input[type="search"], [role="searchbox"]',
      combobox: 'select, [role="combobox"]',
      checkbox: 'input[type="checkbox"], [role="checkbox"]',
      radio: 'input[type="radio"], [role="radio"]',
      tab: '[role="tab"]',
      menuitem: '[role="menuitem"]',
      menu: '[role="menu"]',
      menubar: '[role="menubar"]',
      heading: 'h1, h2, h3, h4, h5, h6, [role="heading"]',
      listbox: '[role="listbox"]',
      option: 'option, [role="option"]',
      navigation: 'nav, [role="navigation"]',
      banner: '[role="banner"]',
      complementary: '[role="complementary"]',
      contentinfo: '[role="contentinfo"]',
      main: 'main, [role="main"]',
      form: 'form, [role="form"]',
      search: '[role="search"]',
      region: '[role="region"]',
      article: 'article, [role="article"]',
      section: 'section, [role="section"]',
      img: 'img, [role="img"]',
      image: 'img, [role="image"]',
      dialog: '[role="dialog"]',
      alertdialog: '[role="alertdialog"]',
      alert: '[role="alert"]',
      status: '[role="status"]',
      progressbar: '[role="progressbar"]',
      slider: '[role="slider"]',
      spinbutton: '[role="spinbutton"]',
      switch: '[role="switch"]',
      toolbar: '[role="toolbar"]',
      tooltip: '[role="tooltip"]',
      tree: '[role="tree"]',
      treeitem: '[role="treeitem"]',
      tablist: '[role="tablist"]',
      tabpanel: '[role="tabpanel"]',
      separator: '[role="separator"]',
      group: '[role="group"]',
      list: 'ul, ol, [role="list"]',
      listitem: 'li, [role="listitem"]',
      row: '[role="row"]',
      gridcell: '[role="gridcell"]',
      cell: 'td, [role="cell"]',
      columnheader: 'th, [role="columnheader"]',
      rowheader: '[role="rowheader"]',
      table: 'table, [role="table"]',
      grid: '[role="grid"]',
    };

    return roleMap[role.toLowerCase()] || `[role="${role}"]`;
  }

  private parseAttributes(attributes: string[]): Record<string, string> {
    const attrs: Record<string, string> = {};
    for (let i = 0; i < attributes.length; i += 2) {
      const key = attributes[i];
      const value = attributes[i + 1];
      if (key && value !== undefined) {
        attrs[key] = value;
      }
    }
    return attrs;
  }

  private createErrorResult(error: AutomationError): ToolExecutionResult {
    return {
      success: false,
      error,
      tabId: this.tabId,
    };
  }
}
