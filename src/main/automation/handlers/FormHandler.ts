/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseHandler } from '../core/BaseHandler';
import { ElementFinder } from '../core/ElementFinder';
import { EffectTracker } from '../core/EffectTracker';
import type { HandlerContext } from '../core/types';
import type { SelectParams, CheckboxParams, SubmitParams, ToolExecutionResult, FoundElement, ElementQueryResult } from '@/shared/types';

/**
 * FormHandler - Handles form-related automation operations
 * 
 * Provides operations for:
 * - Select dropdowns (by value, label, or index)
 * - Checkboxes and radio buttons
 * - Form submission
 * 
 * This handler ensures form interactions work reliably and trigger
 * proper validation and change events.
 */
export class FormHandler extends BaseHandler {
  private elementFinder: ElementFinder;
  private effectTracker: EffectTracker;

  constructor(context: HandlerContext) {
    super(context);
    this.elementFinder = new ElementFinder(context);
    this.effectTracker = new EffectTracker(context);
  }

  /**
   * Execute select dropdown operation
   */
  async executeSelect(params: SelectParams): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      console.log(`[FormHandler] Selecting from dropdown: ${params.selector}`);

      const waitTime = params.waitForElement ?? 1000;
      if (waitTime > 0) await this.sleep(waitTime);

      const selectors = [params.selector, ...(params.backupSelectors || [])];
      const queryResult = await this.elementFinder.findWithCDP(selectors, true);

      if (!queryResult.found || !queryResult.nodeId || !queryResult.element) {
        return this.createErrorResult('select', startTime, {
          code: 'ELEMENT_NOT_FOUND',
          message: `Could not find select element`,
          details: { 
            attemptedSelectors: selectors,
            suggestions: ['Verify the select element selector', 'Check if the dropdown is dynamically loaded']
          }
        });
      }

      // Select the option using JavaScript
      const selectScript = `
        (function() {
          const select = document.querySelector(${JSON.stringify(queryResult.selector)});
          if (!select) return { success: false, error: 'Element not found' };
          
          let optionSelected = false;
          
          ${params.value ? `
            // Select by value
            for (let i = 0; i < select.options.length; i++) {
              if (select.options[i].value === ${JSON.stringify(params.value)}) {
                select.selectedIndex = i;
                optionSelected = true;
                break;
              }
            }
          ` : ''}
          
          ${params.label ? `
            // Select by label
            if (!optionSelected) {
              for (let i = 0; i < select.options.length; i++) {
                if (select.options[i].text === ${JSON.stringify(params.label)}) {
                  select.selectedIndex = i;
                  optionSelected = true;
                  break;
                }
              }
            }
          ` : ''}
          
          ${params.index !== undefined ? `
            // Select by index
            if (!optionSelected && ${params.index} < select.options.length) {
              select.selectedIndex = ${params.index};
              optionSelected = true;
            }
          ` : ''}
          
          if (optionSelected) {
            select.dispatchEvent(new Event('change', { bubbles: true }));
            select.dispatchEvent(new Event('input', { bubbles: true }));
            return { success: true, selectedValue: select.value, selectedText: select.options[select.selectedIndex].text };
          }
          
          return { success: false, error: 'No matching option found' };
        })();
      `;

      const result = await this.view.webContents.executeJavaScript(selectScript);

      if (!result.success) {
        return this.createErrorResult('select', startTime, {
          code: 'EXECUTION_ERROR',
          message: result.error || 'Failed to select option',
          details: {
            suggestions: [
              'Verify the value/label/index matches an available option',
              'Check if the dropdown has loaded all options',
              'Try using a different selection method (value vs label vs index)'
            ]
          }
        });
      }

      console.log(`[FormHandler] ✅ Selected option: ${result.selectedText}`);

      await this.sleep(300);
      const effects = await this.effectTracker.capturePostActionEffects();

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        toolName: 'select',
        executionTime,
        element: this.createFoundElement(queryResult),
        effects,
        value: result.selectedValue,
        timestamp: Date.now(),
        tabId: this.tabId,
        url: this.getUrl()
      };

    } catch (error) {
      return this.createErrorResult('select', startTime, {
        code: 'EXECUTION_ERROR',
        message: `Select execution failed`,
        details: {
          lastError: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  /**
   * Execute checkbox/radio operation
   */
  async executeCheckbox(params: CheckboxParams): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      console.log(`[FormHandler] Setting checkbox ${params.checked ? 'checked' : 'unchecked'}: ${params.selector}`);

      const waitTime = params.waitForElement ?? 1000;
      if (waitTime > 0) await this.sleep(waitTime);

      const selectors = [params.selector, ...(params.backupSelectors || [])];
      const queryResult = await this.elementFinder.findWithCDP(selectors, true);

      if (!queryResult.found || !queryResult.nodeId || !queryResult.element) {
        return this.createErrorResult('checkbox', startTime, {
          code: 'ELEMENT_NOT_FOUND',
          message: `Could not find checkbox element`,
          details: { 
            attemptedSelectors: selectors,
            suggestions: ['Verify the checkbox selector', 'Check if the checkbox is visible']
          }
        });
      }

      // Set checkbox state
      const checkboxScript = `
        (function() {
          const checkbox = document.querySelector(${JSON.stringify(queryResult.selector)});
          if (!checkbox) return { success: false, error: 'Element not found' };
          
          if (checkbox.checked !== ${params.checked}) {
            checkbox.checked = ${params.checked};
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            checkbox.dispatchEvent(new Event('click', { bubbles: true }));
            checkbox.dispatchEvent(new Event('input', { bubbles: true }));
          }
          
          return { success: true, checked: checkbox.checked };
        })();
      `;

      const result = await this.view.webContents.executeJavaScript(checkboxScript);

      if (!result.success) {
        return this.createErrorResult('checkbox', startTime, {
          code: 'EXECUTION_ERROR',
          message: result.error || 'Failed to set checkbox state',
          details: {
            suggestions: ['Verify the element is a checkbox or radio button']
          }
        });
      }

      console.log(`[FormHandler] ✅ Checkbox set to: ${result.checked}`);

      await this.sleep(300);
      const effects = await this.effectTracker.capturePostActionEffects();

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        toolName: 'checkbox',
        executionTime,
        element: this.createFoundElement(queryResult),
        effects,
        value: result.checked,
        timestamp: Date.now(),
        tabId: this.tabId,
        url: this.getUrl()
      };

    } catch (error) {
      return this.createErrorResult('checkbox', startTime, {
        code: 'EXECUTION_ERROR',
        message: `Checkbox execution failed`,
        details: {
          lastError: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  /**
   * Execute form submit operation
   */
  async executeSubmit(params: SubmitParams, clickHandler: any): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      console.log(`[FormHandler] Submitting form`);

      await this.effectTracker.capturePreActionState();

      if (params.submitButtonSelector) {
        // Click submit button instead
        console.log(`[FormHandler] Clicking submit button: ${params.submitButtonSelector}`);
        return await clickHandler.execute({
          selector: params.submitButtonSelector,
          waitForElement: 1000
        });
      } else {
        // Submit form directly
        const submitScript = `
          (function() {
            const form = ${params.formSelector ? `document.querySelector(${JSON.stringify(params.formSelector)})` : 'document.querySelector("form")'};
            if (!form) return { success: false, error: 'Form not found' };
            
            // Try to submit the form
            if (typeof form.requestSubmit === 'function') {
              form.requestSubmit(); // Modern method that triggers validation
            } else {
              form.submit(); // Fallback
            }
            
            return { success: true };
          })();
        `;

        const result = await this.view.webContents.executeJavaScript(submitScript);

        if (!result.success) {
          return this.createErrorResult('submit', startTime, {
            code: 'ELEMENT_NOT_FOUND',
            message: result.error || 'Form not found',
            details: {
              suggestions: [
                'Verify a form element exists on the page',
                'Try specifying a formSelector parameter',
                'Consider using the submitButtonSelector to click the submit button instead'
              ]
            }
          });
        }

        console.log(`[FormHandler] ✅ Form submitted`);

        await this.sleep(500);
        const effects = await this.effectTracker.capturePostActionEffects();

        const executionTime = Date.now() - startTime;

        return {
          success: true,
          toolName: 'submit',
          executionTime,
          effects,
          timestamp: Date.now(),
          tabId: this.tabId,
          url: this.getUrl()
        };
      }

    } catch (error) {
      return this.createErrorResult('submit', startTime, {
        code: 'EXECUTION_ERROR',
        message: `Form submit failed`,
        details: {
          lastError: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  /**
   * Helper to create FoundElement from ElementQueryResult
   */
  private createFoundElement(queryResult: ElementQueryResult): FoundElement {
    return {
      selector: queryResult.selector,
      selectorType: queryResult.selectorType,
      tagName: queryResult.element.tagName,
      text: queryResult.element.text,
      attributes: queryResult.element.attributes,
      boundingBox: queryResult.element.boundingBox,
      isVisible: queryResult.element.isVisible,
      isEnabled: queryResult.element.isEnabled
    };
  }
}
